// What each signed-in role is allowed to see in v2. The server sends only this, never the full state.
import type { State } from '../store/types'
import { hasAccess, type Session } from './session'

export function viewFor(s: State, se: Session, now: number): State {
  const none: Pick<State, 'checkIns' | 'meds' | 'rxs' | 'reminders' | 'doseLog' | 'flags' | 'reports' | 'notes' | 'stock' | 'shares' | 'consents' | 'inbox' | 'vitals' | 'declined' | 'audit'> = {
    checkIns: [], meds: [], rxs: [], reminders: [], doseLog: {}, flags: [], reports: [], notes: [], stock: [], shares: [], consents: [], inbox: [], vitals: {}, declined: [], audit: [],
  }
  const doctors = s.doctors.map(({ idDocument: _id, ...d }) => d)
  const base: State = {
    ...s,
    ...none,
    doctors,
    patients: [],
    doctorId: null,
    phoneLocation: { label: 'Hidden', lat: 0, lng: 0 },
    clinicCodes: [],
    escalationAcks: {},
    dispensed: [],
    consultations: [],
    consultationCards: [],
  }

  const pick = (ids: Set<string>) => ({
    patients: s.patients.filter((p) => ids.has(p.id)),
    meds: s.meds.filter((m) => ids.has(m.patientId)),
    rxs: s.rxs.filter((r) => ids.has(r.patientId)),
    reminders: s.reminders.filter((r) => ids.has(r.patientId)),
    doseLog: Object.fromEntries(Object.entries(s.doseLog).filter(([k]) => s.reminders.some((r) => ids.has(r.patientId) && k.startsWith(`${r.id}@`)))),
    reports: s.reports.filter((r) => ids.has(r.patientId)),
    notes: s.notes.filter((n) => ids.has(n.patientId)),
    vitals: Object.fromEntries(Object.entries(s.vitals).filter(([k]) => ids.has(k))),
    audit: s.audit.filter((e) => e.subject && ids.has(e.subject)),
    escalationAcks: Object.fromEntries(Object.entries(s.escalationAcks ?? {}).filter(([k]) => s.reminders.some((r) => ids.has(r.patientId) && k.startsWith(`${r.id}@`)))),
    dispensed: (s.dispensed ?? []).filter((d) => ids.has(d.patientId)),
    consultationCards: (s.consultationCards ?? []).filter((c) => ids.has(c.patientId)),
  })

  switch (se.role) {
    case 'admin':
      return s
    case 'patient': {
      const ids = new Set([se.patientId])
      return {
        ...base, ...pick(ids),
        flags: s.flags.filter((f) => f.patientId === se.patientId),
        consents: s.consents.filter((c) => c.patientId === se.patientId),
        shares: s.shares.filter((x) => x.patientId === se.patientId),
        checkIns: s.checkIns.filter((c) => c.patientId === se.patientId),
        declined: s.declined.filter((d) => d.startsWith(`${se.patientId}:`)),
        stock: s.stock,
        phoneLocation: s.phoneLocation,
        consultations: (s.consultations ?? []).filter((c) => c.patientId === se.patientId),
      }
    }
    case 'doctor': {
      const access = new Set(s.patients.filter((p) => hasAccess(s, se.doctorId, p.id, now)).map((p) => p.id))
      const ownedFlags = s.flags.filter((f) => f.ownerId === se.doctorId)
      const named = new Set([...access, ...ownedFlags.map((f) => f.patientId), ...s.checkIns.filter((c) => c.doctorId === se.doctorId).map((c) => c.patientId)])
      return {
        ...base, ...pick(access),
        patients: s.patients.filter((p) => named.has(p.id)),
        doctorId: se.doctorId,
        flags: s.flags.filter((f) => access.has(f.patientId) || f.ownerId === se.doctorId),
        consents: s.consents.filter((c) => c.doctorId === se.doctorId),
        checkIns: s.checkIns.filter((c) => c.doctorId === se.doctorId),
        inbox: s.inbox.filter((m) => m.toId === se.doctorId),
        consultations: (s.consultations ?? []).filter((c) => access.has(c.patientId) || c.doctorId === se.doctorId),
      }
    }
    case 'caregiver': {
      const p = s.patients.find((x) => x.id === se.patientId)
      const cg = p?.caregivers?.find((x) => x.id === se.caregiverId)
      if (!p || !cg) return base
      const slim = { id: p.id, name: p.name, age: p.age, sex: p.sex, conditions: [], currentDoctorId: null, caregivers: p.caregivers }
      if (!cg.enabled) return { ...base, patients: [slim] }
      const ids = new Set([p.id])
      const picked = pick(ids)
      return { ...base, patients: [slim], reminders: picked.reminders, doseLog: picked.doseLog, escalationAcks: picked.escalationAcks }
    }
    case 'pharmacy':
      return { ...base, stock: s.stock, flags: s.flags.filter((f) => !!f.request) }
    case 'department': {
      const ids = new Set(s.patients.map((p) => p.id))
      return { ...base, ...pick(ids) }
    }
  }
}
