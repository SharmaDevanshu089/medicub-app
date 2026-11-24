// Every state change in Medicub, as pure functions: (state, payload, context) → new state + audit events.
// The server is the only caller. Each action checks the caller's role and access, validates its input,
// and enforces the safety rules (no auto-close, HIGH/CRITICAL block signing, verified doctors only).
import { CATALOG } from '../engine/catalog'
import { blocksSigning, checkSubstitution, normalise, runChecks, type Finding, type MedInput } from '../engine/rules'
import { cheaperEquivalents, matchStripText } from '../engine/care'
import { insideFence } from '../lib/geo'
import { buildSummary } from '../lib/summary'
export const PHARMACIST = 'Priya Nair, D.Pharm'
export const PHARMACY = 'Jan Aushadhi Kendra, Indiranagar'
import type { ConsultationCard, ConsultationSession, ConsultationSummary, DecisionKind, Doctor, DoctorId, DoseAction, Flag, PatientId, Report, ReportKind, State, StockItem, SubRequest } from '../store/types'
import { AppError, conflict, forbidden, invalid, notFound } from './errors'
import { actorName, hasAccess, type Role, type Session } from './session'
import { arr, DAY, HHMM, num, obj, oneOf, optStr, str, type Obj } from './validate'

export interface AuditEvent {
  actor: string
  action: string
  detail: string
  subject?: PatientId
}
export interface Ctx {
  now: number
  uid: () => string
  session: Session
}
export interface ActionResult {
  state: State
  events: AuditEvent[]
  value?: unknown
}
type Run = (s: State, p: Obj, c: Ctx) => ActionResult
interface ActionDef {
  roles: Role[]
  run: Run
}

const HOUR = 3_600_000
const CONSENT_MS = 8 * HOUR
const QR_MS = 4 * 60_000 // a desk QR stays valid 4 min; the page rotates it every 3 min
// CLINICIAN-REVIEW: response windows per severity are placeholders.
const RESPONSE_MS: Record<Finding['severity'], number> = { CRITICAL: HOUR, HIGH: 24 * HOUR, MODERATE: 72 * HOUR, LOW: 7 * 24 * HOUR }

// ---------- lookups that throw friendly errors ----------

const patientOf = (s: State, id: string) => s.patients.find((p) => p.id === id) ?? (() => { throw notFound('Patient') })()
const doctorOf = (s: State, id: string) => s.doctors.find((d) => d.id === id) ?? (() => { throw notFound('Doctor') })()
const pName = (s: State, id: PatientId) => s.patients.find((p) => p.id === id)?.name ?? id
const dName = (s: State, id: DoctorId | null) => s.doctors.find((d) => d.id === id)?.name ?? 'no doctor'

function me<R extends Session['role']>(c: Ctx, role: R): Extract<Session, { role: R }> {
  if (c.session.role !== role) throw forbidden()
  return c.session as Extract<Session, { role: R }>
}

/** Doctor caller with access to this patient (current doctor or live consent). */
function doctorWithAccess(s: State, c: Ctx, patientId: string): Doctor {
  const d = me(c, 'doctor')
  patientOf(s, patientId)
  if (!hasAccess(s, d.doctorId, patientId, c.now)) throw forbidden('You no longer have access to this record. Ask the patient to share it again.')
  return doctorOf(s, d.doctorId)
}

function verifiedDoctorHere(s: State, c: Ctx, doctorId: string): Doctor {
  const d = doctorOf(s, doctorId)
  if (!d.verified) throw forbidden('This doctor is not verified.')
  if (!insideFence(s.phoneLocation, d.clinic)) throw conflict(`You need to be at ${d.clinic.name} to do this.`)
  void c
  return d
}

function brandItems(p: Obj): { brand: string; dosesPerDay: number }[] {
  return arr(p, 'items', { min: 1, max: 10 }).map((x, i) => {
    const o = obj(x, `items[${i}]`)
    const brand = str(o, 'brand', { max: 60 })
    if (!normalise(brand)) throw invalid(`Unknown medicine: ${brand}.`)
    return { brand: normalise(brand)?.brand ?? brand, dosesPerDay: num(o, 'dosesPerDay', { min: 1, max: 4, int: true }) }
  })
}

/** Rule findings that involve at least one of the proposed items, against the patient's active medicines. */
function findingsFor(s: State, patientId: PatientId, items: { brand: string; dosesPerDay: number }[], who: string): Finding[] {
  const input: MedInput[] = [
    ...s.meds.filter((m) => m.patientId === patientId).map((m) => ({ brand: m.brand, dosesPerDay: m.dosesPerDay, source: dName(s, m.prescriberId) })),
    ...items.map((i) => ({ ...i, source: `draft — ${who}` })),
  ]
  const proposed = new Set(items.map((i) => i.brand))
  return runChecks(input).filter((f) => f.brands.some((b) => proposed.has(b)))
}

/** Persists a finding as a flag routed to a named owner. Never duplicates a key already flagged for that patient. */
function raiseFlag(s: State, c: Ctx, f: Finding, patientId: PatientId, ownerId: DoctorId, raisedBy: string, request?: SubRequest): { state: State; event?: AuditEvent; flag?: Flag } {
  if (s.flags.some((x) => x.patientId === patientId && x.key === f.key && (x.status === 'open' || !request))) return { state: s }
  const flag: Flag = { ...f, id: c.uid(), patientId, status: 'open', ownerId, raisedBy, createdAt: c.now, deadline: c.now + RESPONSE_MS[f.severity], request }
  return {
    state: { ...s, flags: [flag, ...s.flags] },
    flag,
    event: { actor: raisedBy, action: 'FLAG_RAISED', detail: `${f.ruleId} ${f.severity}: ${f.title} → owner ${dName(s, ownerId)}`, subject: patientId },
  }
}

const one = (state: State, e: AuditEvent, value?: unknown): ActionResult => ({ state, events: [e], value })

// ---------- the actions ----------

export const ACTIONS: Record<string, ActionDef> = {
  // ----- consultation scribe -----
  'consultation.start': {
    roles: ['patient', 'doctor'],
    run: (s, p, c) => {
      let patientId: string
      let doctorId: string

      if (c.session.role === 'patient') {
        patientId = c.session.patientId
        doctorId = str(p, 'doctorId', { max: 40 })
        doctorOf(s, doctorId)
      } else if (c.session.role === 'doctor') {
        doctorId = c.session.doctorId
        patientId = str(p, 'patientId', { max: 40 })
        patientOf(s, patientId)
        if (!hasAccess(s, doctorId, patientId, c.now)) {
          throw forbidden('Access to this patient record is required.')
        }
      } else {
        throw forbidden()
      }

      // Check if there is already an active (recording or paused) consultation session
      const existing = (s.consultations ?? []).find(
        (x) => x.patientId === patientId && x.doctorId === doctorId && (x.status === 'recording' || x.status === 'paused')
      )
      if (existing) {
        return { state: s, events: [], value: { sessionId: existing.id } }
      }

      const session: ConsultationSession = {
        id: c.uid(),
        patientId,
        doctorId,
        status: 'recording',
        startedAt: c.now,
        startedBy: c.session.role === 'patient' ? 'patient' : 'doctor',
        durationMs: 0,
      }

      const nextState: State = {
        ...s,
        consultations: [session, ...(s.consultations ?? [])],
      }

      return one(
        nextState,
        {
          actor: actorName(s, c.session),
          action: 'CONSULTATION_STARTED',
          detail: `Consultation audio recording started by ${c.session.role} (${pName(s, patientId)} with Dr. ${dName(s, doctorId)})`,
          subject: patientId,
        },
        { sessionId: session.id }
      )
    },
  },

  'consultation.pause': {
    roles: ['patient', 'doctor'],
    run: (s, p, c) => {
      const sessionId = str(p, 'sessionId', { max: 40 })
      const session = (s.consultations ?? []).find((x) => x.id === sessionId)
      if (!session) throw notFound('Consultation session')

      if (c.session.role === 'patient' && session.patientId !== c.session.patientId) throw forbidden()
      if (c.session.role === 'doctor' && session.doctorId !== c.session.doctorId) throw forbidden()

      const isRecording = session.status === 'recording'
      const newStatus = isRecording ? 'paused' : 'recording'
      const updatedDuration = isRecording
        ? session.durationMs + Math.max(0, c.now - (session.pausedAt ?? session.startedAt))
        : session.durationMs

      const updated: ConsultationSession = {
        ...session,
        status: newStatus,
        pausedAt: isRecording ? c.now : undefined,
        durationMs: updatedDuration,
      }

      const nextState: State = {
        ...s,
        consultations: (s.consultations ?? []).map((x) => (x.id === sessionId ? updated : x)),
      }

      return one(
        nextState,
        {
          actor: actorName(s, c.session),
          action: isRecording ? 'CONSULTATION_PAUSED' : 'CONSULTATION_RESUMED',
          detail: `Consultation audio recording ${isRecording ? 'paused' : 'resumed'}`,
          subject: session.patientId,
        },
        { status: newStatus }
      )
    },
  },

  'consultation.stop': {
    roles: ['patient', 'doctor'],
    run: (s, p, c) => {
      const sessionId = str(p, 'sessionId', { max: 40 })
      const session = (s.consultations ?? []).find((x) => x.id === sessionId)
      if (!session) throw notFound('Consultation session')

      if (c.session.role === 'patient' && session.patientId !== c.session.patientId) throw forbidden()
      if (c.session.role === 'doctor' && session.doctorId !== c.session.doctorId) throw forbidden()

      const updated: ConsultationSession = {
        ...session,
        status: 'processing',
        endedAt: c.now,
        durationMs: session.durationMs + (session.status === 'recording' ? Math.max(0, c.now - (session.pausedAt ?? session.startedAt)) : 0),
      }

      const nextState: State = {
        ...s,
        consultations: (s.consultations ?? []).map((x) => (x.id === sessionId ? updated : x)),
      }

      return one(
        nextState,
        {
          actor: actorName(s, c.session),
          action: 'CONSULTATION_STOPPED',
          detail: `Consultation audio recording ended; queued for AI transcription & extraction`,
          subject: session.patientId,
        },
        { status: 'processing', sessionId }
      )
    },
  },

  'consultation.complete': {
    roles: ['admin', 'doctor', 'patient'],
    run: (s, p, c) => {
      const sessionId = str(p, 'sessionId', { max: 40 })
      const transcript = str(p, 'transcript', { max: 50_000 })
      const summaryObj = obj(p.summary, 'summary')
      const chiefComplaint = str(summaryObj, 'chiefComplaint', { max: 200 })
      const patientSummary = str(summaryObj, 'patientSummary', { max: 1000 })

      const session = (s.consultations ?? []).find((x) => x.id === sessionId)
      if (!session) throw notFound('Consultation session')

      if (c.session.role === 'patient' && session.patientId !== c.session.patientId) throw forbidden()
      if (c.session.role === 'doctor' && session.doctorId !== c.session.doctorId) throw forbidden()

      const doctor = doctorOf(s, session.doctorId)
      const patient = patientOf(s, session.patientId)

      const summary: ConsultationSummary = {
        chiefComplaint,
        symptoms: Array.isArray(summaryObj.symptoms)
          ? (summaryObj.symptoms as any[]).map((sym) => ({
              description: String(sym.description ?? ''),
              duration: sym.duration ? String(sym.duration) : undefined,
              severity: sym.severity,
            }))
          : [],
        observations: Array.isArray(summaryObj.observations) ? (summaryObj.observations as string[]).map(String) : [],
        medicationsDiscussed: Array.isArray(summaryObj.medicationsDiscussed)
          ? (summaryObj.medicationsDiscussed as any[]).map((med) => ({
              name: String(med.name ?? ''),
              action: med.action ?? 'discussed',
            }))
          : [],
        plan: Array.isArray(summaryObj.plan) ? (summaryObj.plan as string[]).map(String) : [],
        followUp: summaryObj.followUp ? String(summaryObj.followUp) : undefined,
        patientSummary,
      }

      const card: ConsultationCard = {
        id: c.uid(),
        sessionId,
        patientId: session.patientId,
        doctorId: session.doctorId,
        consultedAt: session.startedAt,
        transcript,
        summary,
        doctorName: doctor.name,
        doctorSpecialty: doctor.specialty,
      }

      const updatedSession: ConsultationSession = {
        ...session,
        status: 'completed',
        endedAt: session.endedAt ?? c.now,
      }

      const nextState: State = {
        ...s,
        consultations: (s.consultations ?? []).map((x) => (x.id === sessionId ? updatedSession : x)),
        consultationCards: [card, ...(s.consultationCards ?? [])],
      }

      return one(
        nextState,
        {
          actor: actorName(s, c.session),
          action: 'CONSULTATION_CARD_CREATED',
          detail: `Consultation Card created for ${patient.name} by Dr. ${doctor.name}: ${chiefComplaint}`,
          subject: session.patientId,
        },
        { cardId: card.id }
      )
    },
  },

  // ----- patient -----
  'patient.setLocation': {
    roles: ['patient'],
    run: (s, p, c) => {
      const label = str(p, 'label', { max: 120 })
      const lat = num(p, 'lat', { min: -90, max: 90 })
      const lng = num(p, 'lng', { min: -180, max: 180 })
      const pid = me(c, 'patient').patientId
      return one({ ...s, phoneLocation: { label, lat, lng } }, { actor: actorName(s, c.session), action: 'LOCATION_UPDATED', detail: `Phone location: ${label} (simulated GPS)`, subject: pid })
    },
  },
  'patient.checkIn': {
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const d = verifiedDoctorHere(s, c, str(p, 'doctorId'))
      if (patientOf(s, pid).currentDoctorId !== d.id) throw conflict('You can only check in with your own doctor.')
      return one({ ...s, checkIns: [...s.checkIns, { patientId: pid, doctorId: d.id, at: c.now, kind: 'arrival' }] }, { actor: actorName(s, c.session), action: 'CHECK_IN', detail: `Arrived at ${d.clinic.name} (geofence)`, subject: pid })
    },
  },
  'patient.acceptDoctor': {
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const d = verifiedDoctorHere(s, c, str(p, 'doctorId'))
      const prev = patientOf(s, pid).currentDoctorId
      if (prev === d.id) throw conflict(`${d.name} is already your doctor.`)
      return one(
        { ...s, patients: s.patients.map((x) => (x.id === pid ? { ...x, currentDoctorId: d.id } : x)), checkIns: [...s.checkIns, { patientId: pid, doctorId: d.id, at: c.now, kind: 'joined' }] },
        { actor: actorName(s, c.session), action: 'DOCTOR_ACCEPTED', detail: `${d.name} is now the current doctor (was ${dName(s, prev)}). Full history shared.`, subject: pid },
      )
    },
  },
  'patient.declineDoctor': {
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const d = doctorOf(s, str(p, 'doctorId'))
      return one({ ...s, declined: [...new Set([...s.declined, `${pid}:${d.id}`])] }, { actor: actorName(s, c.session), action: 'DOCTOR_DECLINED', detail: `Not now: ${d.name}`, subject: pid })
    },
  },
  'patient.grantConsent': {
    // NFC: the tag only identifies the doctor; the patient confirms on their own phone. No health data moves over NFC.
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const d = verifiedDoctorHere(s, c, str(p, 'doctorId'))
      return one(
        {
          ...s,
          consents: [...s.consents, { id: c.uid(), patientId: pid, doctorId: d.id, grantedAt: c.now, expiresAt: c.now + CONSENT_MS, revoked: false }],
          checkIns: [...s.checkIns, { patientId: pid, doctorId: d.id, at: c.now, kind: 'nfc' }],
        },
        { actor: actorName(s, c.session), action: 'CONSENT_GRANTED', detail: `${d.name} may view the full record for 8 h (NFC tag tap)`, subject: pid },
      )
    },
  },
  'patient.lookupDoctorQr': {
    // Read-only: tells the patient whose QR they scanned before they agree to share.
    roles: ['patient'],
    run: (s, p, c) => {
      const d = clinicCodeDoctor(s, str(p, 'code', { max: 200 }), c.now)
      return { state: s, events: [], value: { doctorId: d.id, name: d.name, specialty: d.specialty, clinic: d.clinic.name, checks: d.checks } }
    },
  },
  'patient.scanDoctorQr': {
    // The patient scanned the QR on the doctor's desk and confirmed: access is pushed to that doctor.
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const d = clinicCodeDoctor(s, str(p, 'code', { max: 200 }), c.now)
      return one(
        {
          ...s,
          consents: [...s.consents, { id: c.uid(), patientId: pid, doctorId: d.id, grantedAt: c.now, expiresAt: c.now + CONSENT_MS, revoked: false }],
          checkIns: [...s.checkIns, { patientId: pid, doctorId: d.id, at: c.now, kind: 'qr' }],
        },
        { actor: actorName(s, c.session), action: 'CONSENT_GRANTED', detail: `${d.name} may view the full record for 8 h (scanned the clinic QR)`, subject: pid },
        d.id,
      )
    },
  },
  'patient.createShare': {
    roles: ['patient'],
    run: (s, _p, c) => {
      const pid = me(c, 'patient').patientId
      const code = `SH-${c.uid().toUpperCase()}`
      return one({ ...s, shares: [...s.shares.filter((x) => x.expiresAt > c.now), { code, patientId: pid, createdAt: c.now, expiresAt: c.now + 5 * 60_000 }] }, { actor: actorName(s, c.session), action: 'SHARE_CREATED', detail: `QR ${code} valid 5 minutes, single use`, subject: pid }, code)
    },
  },
  'patient.revokeConsent': {
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const id = str(p, 'id')
      const k = s.consents.find((x) => x.id === id && x.patientId === pid) ?? (() => { throw notFound('Sharing permission') })()
      if (k.revoked) throw conflict('Already stopped.')
      return one({ ...s, consents: s.consents.map((x) => (x.id === id ? { ...x, revoked: true } : x)) }, { actor: actorName(s, c.session), action: 'CONSENT_REVOKED', detail: `Access revoked for ${dName(s, k.doctorId)}`, subject: pid })
    },
  },
  'patient.setCaregiverAlerts': {
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const id = str(p, 'caregiverId', { max: 40 })
      const enabled = p.enabled === true
      const cg = patientOf(s, pid).caregivers?.find((x) => x.id === id) ?? (() => { throw notFound('Caregiver') })()
      return one(
        { ...s, patients: s.patients.map((x) => (x.id === pid ? { ...x, caregivers: x.caregivers?.map((y) => (y.id === id ? { ...y, enabled } : y)) } : x)) },
        { actor: actorName(s, c.session), action: enabled ? 'CAREGIVER_ALERTS_ON' : 'CAREGIVER_ALERTS_PAUSED', detail: `${cg.name} (${cg.label}) ${enabled ? 'will' : 'will no longer'} be told about missed doses`, subject: pid },
      )
    },
  },
  'patient.stripCheck': {
    // The server re-runs the match on the text read from the photo; the phone's own verdict isn't trusted.
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const text = str(p, 'text', { min: 1, max: 4000 })
      const mine = [...new Set(s.meds.filter((m) => m.patientId === pid).map((m) => m.brand))]
      const r = matchStripText(text, mine)
      const what = r.product ? r.product.brand : 'unreadable'
      const detail = { match: `matches ${r.mine}`, 'same-medicine': `same medicine as ${r.mine}`, 'not-on-list': 'NOT one of the patient\'s medicines', unreadable: 'could not be read' }[r.verdict]
      return one(s, { actor: actorName(s, c.session), action: 'STRIP_CHECK', detail: `Photo of a strip: ${what} — ${detail}${r.by ? ` (by ${r.by})` : ''}`, subject: pid }, r)
    },
  },
  'caregiver.confirmTaken': {
    roles: ['caregiver'],
    run: (s, p, c) => {
      const { cg, pid, r, dayKey } = caregiverDose(s, p, c)
      return one(
        { ...s, doseLog: { ...s.doseLog, [`${r.id}@${dayKey}`]: { action: 'taken', at: c.now, by: cg.name } } },
        { actor: actorName(s, c.session), action: 'DOSE_TAKEN', detail: `${r.brand} (${r.time}) on ${dayKey} — confirmed by ${cg.name}, ${cg.label.toLowerCase()}`, subject: pid },
      )
    },
  },
  'caregiver.acknowledge': {
    roles: ['caregiver'],
    run: (s, p, c) => {
      const { cg, pid, r, dayKey } = caregiverDose(s, p, c)
      const note = optStr(p, 'note', { max: 200 }) ?? 'Handling it'
      const key = `${r.id}@${dayKey}`
      if (s.escalationAcks?.[key]) throw conflict(`${s.escalationAcks[key]?.by} is already handling this.`)
      return one(
        { ...s, escalationAcks: { ...(s.escalationAcks ?? {}), [key]: { by: cg.name, at: c.now, note } } },
        { actor: actorName(s, c.session), action: 'ESCALATION_ACKNOWLEDGED', detail: `${r.brand} (${r.time}) on ${dayKey}: "${note}"`, subject: pid },
      )
    },
  },
  'patient.logDose': {
    roles: ['patient'],
    run: (s, p, c) => {
      const pid = me(c, 'patient').patientId
      const r = s.reminders.find((x) => x.id === str(p, 'reminderId') && x.patientId === pid) ?? (() => { throw notFound('Reminder') })()
      const dayKey = str(p, 'dayKey', { pattern: DAY })
      const action = oneOf<DoseAction>(p, 'action', ['taken', 'skipped', 'snoozed'])
      return one(
        { ...s, doseLog: { ...s.doseLog, [`${r.id}@${dayKey}`]: { action, at: c.now, until: action === 'snoozed' ? c.now + 10 * 60_000 : undefined } } },
        { actor: actorName(s, c.session), action: `DOSE_${action.toUpperCase()}`, detail: `${r.brand} (${r.time}) on ${dayKey}`, subject: pid },
      )
    },
  },

  // ----- doctor -----
  'doctor.scanQr': {
    roles: ['doctor'],
    run: (s, _p, c) => {
      const d = doctorOf(s, me(c, 'doctor').doctorId)
      const share = [...s.shares].reverse().find((x) => x.expiresAt > c.now)
      if (!share) throw notFound('A live patient QR')
      return one(
        { ...s, shares: s.shares.filter((x) => x.code !== share.code), consents: [...s.consents, { id: c.uid(), patientId: share.patientId, doctorId: d.id, grantedAt: c.now, expiresAt: c.now + CONSENT_MS, revoked: false }] },
        { actor: d.name, action: 'CONSENT_GRANTED', detail: `Scanned patient QR ${share.code}; access 8 h`, subject: share.patientId },
        share.patientId,
      )
    },
  },
  'doctor.issueQr': {
    // The desk QR page asks for a fresh code every few minutes; old codes stop working shortly after.
    roles: ['doctor'],
    run: (s, _p, c) => {
      const d = doctorOf(s, me(c, 'doctor').doctorId)
      const code = c.uid().replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase()
      const expiresAt = c.now + QR_MS
      const keep = (s.clinicCodes ?? []).filter((x) => x.expiresAt > c.now && x.doctorId !== d.id) // one live code per doctor (+ grace below)
      const prev = (s.clinicCodes ?? []).filter((x) => x.doctorId === d.id && x.expiresAt > c.now).slice(-1) // the one still on screen while it swaps
      return { state: { ...s, clinicCodes: [...keep, ...prev, { code, doctorId: d.id, expiresAt }] }, events: [], value: { code, expiresAt } }
    },
  },
  'doctor.viewRecord': {
    roles: ['doctor'],
    run: (s, p, c) => {
      const pid = str(p, 'patientId')
      const d = doctorWithAccess(s, c, pid)
      return one(s, { actor: d.name, action: 'RECORD_VIEWED', detail: `Opened ${pName(s, pid)}'s record`, subject: pid })
    },
  },
  'doctor.checkDraft': {
    roles: ['doctor'],
    run: (s, p, c) => {
      const pid = str(p, 'patientId')
      const d = doctorWithAccess(s, c, pid)
      const items = brandItems(p)
      let state = s
      const events: AuditEvent[] = []
      for (const f of findingsFor(s, pid, items, d.name)) {
        const r = raiseFlag(state, c, f, pid, d.id, d.name)
        state = r.state
        if (r.event) events.push(r.event)
      }
      return { state, events }
    },
  },
  'doctor.decideFlag': {
    roles: ['doctor'],
    run: (s, p, c) => {
      const d = doctorOf(s, me(c, 'doctor').doctorId)
      const f = s.flags.find((x) => x.id === str(p, 'id')) ?? (() => { throw notFound('Flag') })()
      if (f.ownerId !== d.id) throw forbidden(`Only the flag owner (${dName(s, f.ownerId)}) can decide this flag.`)
      if (f.status !== 'open') throw conflict('This flag already has a decision.')
      const allowed: DecisionKind[] = f.request ? ['approved', 'rejected'] : ['intentional', 'change-planned', 'dismissed']
      const kind = oneOf(p, 'kind', allowed)
      const reason = str(p, 'reason', { min: 3, max: 1000 })
      return one(
        { ...s, flags: s.flags.map((x) => (x.id === f.id ? { ...x, status: 'resolved', decision: { kind, reason, by: d.name, at: c.now } } : x)) },
        { actor: d.name, action: 'FLAG_DECISION', detail: `${f.ruleId} “${f.title}”: ${kind} — ${reason}`, subject: f.patientId },
      )
    },
  },
  'doctor.signRx': {
    roles: ['doctor'],
    run: (s, p, c) => {
      const pid = str(p, 'patientId')
      const d = doctorWithAccess(s, c, pid)
      const items = brandItems(p)
      // Safety rule enforced here, not just in the UI: undecided HIGH/CRITICAL findings block signing.
      const blocking = findingsFor(s, pid, items, d.name).filter((f) => blocksSigning(f.severity) && !s.flags.some((x) => x.patientId === pid && x.key === f.key && x.status === 'resolved'))
      if (blocking.length) throw conflict(`Signing blocked: ${blocking.map((f) => `${f.ruleId} ${f.title}`).join('; ')} needs a recorded decision and reason.`)
      const code = `RX-${1000 + s.rxs.length + 1}`
      return one(
        {
          ...s,
          rxs: [...s.rxs, { code, patientId: pid, doctorId: d.id, items, signedAt: c.now }],
          meds: [...s.meds, ...items.map((i) => ({ id: c.uid(), patientId: pid, brand: i.brand, prescriberId: d.id, dosesPerDay: i.dosesPerDay, rxCode: code, startedAt: c.now }))],
        },
        { actor: d.name, action: 'RX_SIGNED', detail: `${code}: ${items.map((i) => `${i.brand} ×${i.dosesPerDay}/day`).join(', ')}`, subject: pid },
        code,
      )
    },
  },
  'doctor.addReminder': {
    roles: ['doctor'],
    run: (s, p, c) => {
      const pid = str(p, 'patientId')
      const d = doctorWithAccess(s, c, pid)
      const brand = str(p, 'brand', { max: 60 })
      if (!s.meds.some((m) => m.patientId === pid && m.brand === brand)) throw invalid(`${brand} is not one of this patient's active medicines.`)
      const time = str(p, 'time', { pattern: HHMM })
      const instructions = optStr(p, 'instructions', { max: 120 }) ?? 'As prescribed'
      return one({ ...s, reminders: [...s.reminders, { id: c.uid(), patientId: pid, brand, time, instructions, createdBy: d.name }] }, { actor: d.name, action: 'REMINDER_ADDED', detail: `${brand} at ${time} — ${instructions}`, subject: pid })
    },
  },
  'doctor.addNote': {
    roles: ['doctor'],
    run: (s, p, c) => {
      const pid = str(p, 'patientId')
      const d = doctorWithAccess(s, c, pid)
      const text = str(p, 'text', { min: 3, max: 2000 })
      return one({ ...s, notes: [{ id: c.uid(), patientId: pid, department: d.specialty, author: d.name, at: c.now, text }, ...s.notes] }, { actor: d.name, action: 'NOTE_ADDED', detail: `(${d.specialty}) ${text.slice(0, 80)}`, subject: pid })
    },
  },
  'doctor.secondOpinion': {
    roles: ['doctor'],
    run: (s, p, c) => {
      const pid = str(p, 'patientId')
      const d = doctorWithAccess(s, c, pid)
      const to = doctorOf(s, str(p, 'toId'))
      if (to.id === d.id) throw invalid('Pick a colleague, not yourself.')
      const question = str(p, 'question', { min: 3, max: 500 })
      const lines = [...buildSummary(s, pid), { text: `Question: ${question}`, source: `${d.name} (typed)` }]
      return one(
        { ...s, inbox: [{ id: c.uid(), toId: to.id, from: d.name, at: c.now, title: `Second opinion request — ${pName(s, pid)}`, lines }, ...s.inbox] },
        { actor: d.name, action: 'SECOND_OPINION_SENT', detail: `Case summary (${lines.length} lines) sent to ${to.name}'s inbox`, subject: pid },
      )
    },
  },

  // ----- department (and doctors) adding records -----
  'records.addReport': {
    roles: ['department', 'doctor'],
    run: (s, p, c) => {
      const pid = str(p, 'patientId')
      patientOf(s, pid)
      if (c.session.role === 'doctor') doctorWithAccess(s, c, pid)
      const author = actorName(s, c.session)
      const department = c.session.role === 'department' ? c.session.department : doctorOf(s, c.session.role === 'doctor' ? c.session.doctorId : '').specialty
      const kind = oneOf<ReportKind>(p, 'kind', ['X-ray', 'Lab', 'ECG', 'Scan', 'Discharge', 'Other'])
      const image = optStr(p, 'image', { max: 700_000 })
      if (image && image !== 'placeholder' && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(image)) throw invalid('Images must be PNG, JPEG, WebP or GIF.')
      const values = p.values === undefined ? [] : arr(p, 'values', { max: 30 }).map((x, i) => {
        const o = obj(x, `values[${i}]`)
        return { name: str(o, 'name', { max: 60 }), value: str(o, 'value', { max: 20 }), unit: optStr(o, 'unit', { max: 20 }) ?? '' }
      })
      const r: Report = {
        id: c.uid(), patientId: pid, kind, title: str(p, 'title', { max: 120 }), department, author,
        takenAt: num(p, 'takenAt', { min: 0, max: c.now + 24 * HOUR }), summary: str(p, 'summary', { min: 3, max: 4000 }),
        ...(values.length ? { values } : {}), ...(image ? { image } : kind === 'X-ray' ? { image: 'placeholder' } : {}),
      }
      return one({ ...s, reports: [r, ...s.reports] }, { actor: author, action: 'REPORT_ADDED', detail: `${kind} “${r.title}” (${department})${r.image && r.image !== 'placeholder' ? ' + image' : ''}`, subject: pid })
    },
  },
  'records.addNote': {
    roles: ['department'],
    run: (s, p, c) => {
      const se = me(c, 'department')
      const pid = str(p, 'patientId')
      patientOf(s, pid)
      const text = str(p, 'text', { min: 3, max: 2000 })
      const author = actorName(s, c.session)
      return one({ ...s, notes: [{ id: c.uid(), patientId: pid, department: se.department, author, at: c.now, text }, ...s.notes] }, { actor: author, action: 'NOTE_ADDED', detail: `(${se.department}) ${text.slice(0, 80)}`, subject: pid })
    },
  },

  // ----- pharmacy -----
  'pharmacy.redeem': {
    roles: ['pharmacy'],
    run: (s, p) => {
      const code = str(p, 'code', { max: 20 }).toUpperCase()
      const rx = s.rxs.find((r) => r.code === code) ?? (() => { throw notFound(`Prescription ${code}`) })()
      const value = {
        code: rx.code, signedAt: rx.signedAt, patientName: pName(s, rx.patientId), doctorName: dName(s, rx.doctorId),
        items: rx.items.map((i) => ({
          ...i,
          mrp: normalise(i.brand)?.mrp ?? null,
          inStock: s.stock.some((x) => x.name === i.brand && x.qty > 0),
          cheaper: cheaperEquivalents(i.brand).map((c) => ({ brand: c.product.brand, mrp: c.product.mrp, savePct: c.savePct, savePerStrip: c.savePerStrip, janAushadhi: !!c.product.janAushadhi, inStock: s.stock.some((x) => x.name === c.product.brand && x.qty > 0) })),
        })),
      }
      return one(s, { actor: PHARMACIST, action: 'RX_REDEEMED', detail: `${rx.code} opened at the counter`, subject: rx.patientId }, value)
    },
  },
  'pharmacy.scan': {
    roles: ['pharmacy'],
    run: (s, p) => {
      const { rx, prescribed, scanned } = scanInput(s, p)
      const r = checkSubstitution(prescribed, scanned)
      return one(s, { actor: PHARMACIST, action: 'SCAN_CHECKED', detail: `${rx.code}: ${scanned.brand} vs ${prescribed.brand} → ${r.verdict}`, subject: rx.patientId }, r)
    },
  },
  'pharmacy.attest': {
    roles: ['pharmacy'],
    run: (s, p, c) => {
      const { rx, prescribed, scanned } = scanInput(s, p)
      const r = checkSubstitution(prescribed, scanned)
      if (r.verdict === 'BLOCKED') throw conflict('Blocked substitutions cannot be attested. Send it to the prescriber.')
      // A different brand (even an identical, cheaper one) is the patient's choice: the pharmacist must confirm they agreed.
      if (r.verdict === 'EQUIVALENT' && p.patientAgreed !== true) throw conflict('Ask the patient first: a different brand needs their agreement.')
      const offline = p.offlineAt !== undefined ? ` (done offline, synced)` : ''
      const save = Math.max(0, prescribed.mrp - scanned.mrp)
      const savedText = save > 0 ? ` — patient saves Rs ${save} per strip (demo prices)` : ''
      const d = { patientId: rx.patientId, rxCode: rx.code, prescribed: prescribed.brand, dispensed: scanned.brand, at: c.now, savePerStrip: save }
      return one({ ...s, dispensed: [d, ...(s.dispensed ?? [])].slice(0, 500) }, { actor: PHARMACIST, action: r.verdict === 'EXACT' ? 'DISPENSED' : 'SUBSTITUTION_ATTESTED', detail: `${rx.code}: dispensed ${scanned.brand} for ${prescribed.brand}${r.verdict === 'EQUIVALENT' ? ' — pharmacist attested equivalence, patient agreed' : ''}${savedText}${offline}`, subject: rx.patientId })
    },
  },
  'pharmacy.escalate': {
    roles: ['pharmacy'],
    run: (s, p, c) => {
      const { rx, prescribed, scanned } = scanInput(s, p)
      const r = checkSubstitution(prescribed, scanned)
      if (r.verdict !== 'BLOCKED' || !r.finding) throw conflict('Only blocked substitutions are sent to the prescriber.')
      const res = raiseFlag(s, c, r.finding, rx.patientId, rx.doctorId, PHARMACIST, { prescribed: prescribed.brand, scanned: scanned.brand, rxCode: rx.code, pharmacy: PHARMACY })
      if (!res.event) throw conflict('Already sent to the prescriber and still open.')
      const queued = typeof p.offlineAt === 'number' ? ` (queued offline, synced on reconnect)` : ''
      return { state: res.state, events: [{ ...res.event, detail: res.event.detail + queued }] }
    },
  },
  'pharmacy.importStock': {
    roles: ['pharmacy'],
    run: (s, p) => {
      const rows: StockItem[] = arr(p, 'rows', { min: 1, max: 500 }).map((x, i) => {
        const o = obj(x, `rows[${i}]`)
        return { name: str(o, 'name', { max: 60 }), batch: str(o, 'batch', { max: 30 }), expiry: str(o, 'expiry', { pattern: DAY }), qty: num(o, 'qty', { min: 0, max: 1_000_000, int: true }) }
      })
      const stock = [...s.stock]
      for (const r of rows) {
        const i = stock.findIndex((x) => x.name === r.name && x.batch === r.batch)
        if (i >= 0) stock[i] = r
        else stock.push(r)
      }
      return one({ ...s, stock }, { actor: PHARMACIST, action: 'STOCK_IMPORTED', detail: `${rows.length} row(s) from CSV` })
    },
  },
  'pharmacy.connectivity': {
    roles: ['pharmacy'],
    run: (s, p) => {
      const online = p.online === true
      const queued = p.queued === undefined ? 0 : num(p, 'queued', { min: 0, max: 10_000, int: true })
      return one(s, { actor: PHARMACIST, action: online ? 'PHARMACY_ONLINE' : 'PHARMACY_OFFLINE', detail: online ? `Back online; syncing ${queued} queued item(s)` : 'Offline mode: checks run locally, escalations queue on the device' })
    },
  },
}

/** The verified doctor behind a live clinic QR code. */
function clinicCodeDoctor(s: State, raw: string, now: number): Doctor {
  const code = raw.trim().toUpperCase().replace(/^.*[?&]SCAN=/, '') // accepts the raw code or the full QR link
  const hit = (s.clinicCodes ?? []).find((x) => x.code === code)
  if (!hit) throw new AppError('NOT_FOUND', "This QR code isn't recognised. Scan the one on your doctor's screen now.")
  if (hit.expiresAt <= now) throw conflict('That QR code has expired. Scan the one on the screen now.')
  const d = doctorOf(s, hit.doctorId)
  if (!d.verified) throw forbidden('This doctor is not verified.')
  return d
}

/** The caregiver's linked patient, still consented, and one of that patient's doses. */
function caregiverDose(s: State, p: Obj, c: Ctx) {
  const se = me(c, 'caregiver')
  const cg = patientOf(s, se.patientId).caregivers?.find((x) => x.id === se.caregiverId)
  if (!cg) throw forbidden()
  if (!cg.enabled) throw forbidden(`${pName(s, se.patientId)} has paused sharing doses with you.`)
  const r = s.reminders.find((x) => x.id === str(p, 'reminderId', { max: 40 }) && x.patientId === se.patientId) ?? (() => { throw notFound('Dose') })()
  return { cg, pid: se.patientId, r, dayKey: str(p, 'dayKey', { pattern: DAY }) }
}

function scanInput(s: State, p: Obj) {
  const code = str(p, 'rxCode', { max: 20 }).toUpperCase()
  const rx = s.rxs.find((r) => r.code === code) ?? (() => { throw notFound(`Prescription ${code}`) })()
  const prescribed = normalise(str(p, 'prescribed', { max: 60 })) ?? (() => { throw invalid('Unknown prescribed medicine.') })()
  if (!rx.items.some((i) => i.brand === prescribed.brand)) throw invalid(`${prescribed.brand} is not on ${rx.code}.`)
  const scanned = normalise(str(p, 'scanned', { max: 60 })) ?? (() => { throw notFound('That barcode/product') })()
  return { rx, prescribed, scanned }
}

/** Run one action with role check. Throws AppError on any failure; never returns a half-applied state. */
export function runAction(name: string, s: State, payload: unknown, c: Ctx): ActionResult {
  const def = ACTIONS[name]
  if (!def) throw notFound(`Action ${name}`)
  if (!def.roles.includes(c.session.role)) throw forbidden()
  return def.run(s, payload === undefined ? {} : obj(payload, 'payload'), c)
}

export const KNOWN_BRANDS = CATALOG.map((p) => p.brand)
