import { describe, expect, it } from 'vitest'
import { seed } from '../store/seed'
import type { State } from '../store/types'
import { runAction, type Ctx } from './actions'
import { AppError } from './errors'
import type { Session } from './session'
import { viewFor } from './view'

const T = Date.UTC(2026, 10, 20, 4, 0)
let n = 0
const ctx = (session: Session): Ctx => ({ now: T, uid: () => `id${++n}`, session })
const meera: Session = { role: 'doctor', doctorId: 'meera' }
const arjun: Session = { role: 'doctor', doctorId: 'arjun' }
const ramesh: Session = { role: 'patient', patientId: 'p1' }
const pharmacy: Session = { role: 'pharmacy', pharmacyId: 'PH-DEMO-01' }
const run = (s: State, name: string, p: unknown, se: Session) => runAction(name, s, p, ctx(se))
const code = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return e instanceof AppError ? e.code : 'THROWN'
  }
  return 'OK'
}
const telmaAM = { patientId: 'p1', items: [{ brand: 'Telma-AM 40/5', dosesPerDay: 1 }] }

describe('prescribing safety', () => {
  it('server refuses to sign while a HIGH duplicate is undecided, then allows it after a decision', () => {
    let s = seed(T)
    expect(code(() => run(s, 'doctor.signRx', telmaAM, meera))).toBe('CONFLICT')
    s = run(s, 'doctor.checkDraft', telmaAM, meera).state
    const flag = s.flags.find((f) => f.ruleId === 'R-DUP-001')
    expect(flag?.status).toBe('open')
    expect(flag?.ownerId).toBe('meera')
    // only the owner can decide, and a reason is mandatory
    expect(code(() => run(s, 'doctor.decideFlag', { id: flag?.id, kind: 'intentional', reason: 'ok fine' }, arjun))).toBe('FORBIDDEN')
    expect(code(() => run(s, 'doctor.decideFlag', { id: flag?.id, kind: 'intentional', reason: '' }, meera))).toBe('INVALID')
    expect(code(() => run(s, 'doctor.decideFlag', { id: flag?.id, kind: 'approved', reason: 'not allowed kind' }, meera))).toBe('INVALID')
    s = run(s, 'doctor.decideFlag', { id: flag?.id, kind: 'change-planned', reason: 'Switching to Telma-AM' }, meera).state
    const r = run(s, 'doctor.signRx', telmaAM, meera)
    expect(r.value).toBe('RX-1005')
    expect(r.events[0]?.action).toBe('RX_SIGNED')
  })

  it('rejects unknown medicines and doctors without access', () => {
    const s = seed(T)
    expect(code(() => run(s, 'doctor.signRx', { patientId: 'p1', items: [{ brand: 'Nope 5', dosesPerDay: 1 }] }, meera))).toBe('INVALID')
    expect(code(() => run(s, 'doctor.signRx', { patientId: 'p3', items: [{ brand: 'Atorva 10', dosesPerDay: 1 }] }, meera))).toBe('FORBIDDEN')
    expect(code(() => run(s, 'doctor.signRx', telmaAM, ramesh))).toBe('FORBIDDEN')
  })
})

describe('consent', () => {
  it('NFC consent only works at the doctor’s clinic, and revoking ends access', () => {
    let s = seed(T)
    expect(code(() => run(s, 'patient.grantConsent', { doctorId: 'arjun' }, ramesh))).toBe('CONFLICT') // at home
    const arjunClinic = s.doctors.find((d) => d.id === 'arjun')?.clinic
    s = run(s, 'patient.setLocation', { label: 'Near clinic', lat: arjunClinic?.lat, lng: arjunClinic?.lng }, ramesh).state
    s = run(s, 'patient.grantConsent', { doctorId: 'arjun' }, ramesh).state
    expect(viewFor(s, arjun, T).patients.map((p) => p.id)).toContain('p1')
    const id = s.consents[0]?.id
    s = run(s, 'patient.revokeConsent', { id }, ramesh).state
    expect(viewFor(s, arjun, T).reports.some((r) => r.patientId === 'p1')).toBe(false)
  })
})

describe('pharmacy', () => {
  it('blocked substitution goes to the prescriber; equivalent can be attested but blocked cannot', () => {
    let s = seed(T)
    expect(run(s, 'pharmacy.scan', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: '8900000000028' }, pharmacy).value).toMatchObject({ verdict: 'BLOCKED' })
    expect(code(() => run(s, 'pharmacy.attest', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Telma-AM 40/5' }, pharmacy))).toBe('CONFLICT')
    expect(run(s, 'pharmacy.attest', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Stamlo 5' }, pharmacy).events[0]?.action).toBe('SUBSTITUTION_ATTESTED')
    s = run(s, 'pharmacy.escalate', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Telma-AM 40/5' }, pharmacy).state
    expect(s.flags[0]?.request?.rxCode).toBe('RX-1001')
    expect(s.flags[0]?.ownerId).toBe('meera')
    expect(code(() => run(s, 'pharmacy.escalate', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Telma-AM 40/5' }, pharmacy))).toBe('CONFLICT') // no duplicates
  })

  it('pharmacy view never contains medical history', () => {
    const v = viewFor(seed(T), pharmacy, T)
    expect(v.reports).toEqual([])
    expect(v.notes).toEqual([])
    expect(v.patients).toEqual([])
    expect(v.stock.length).toBeGreaterThan(0)
  })

  it('validates CSV rows', () => {
    const s = seed(T)
    expect(code(() => run(s, 'pharmacy.importStock', { rows: [{ name: 'X', batch: 'B', expiry: '2027-13', qty: 1 }] }, pharmacy))).toBe('INVALID')
    expect(run(s, 'pharmacy.importStock', { rows: [{ name: 'Telma 40', batch: 'TL9', expiry: '2027-09-30', qty: 5 }] }, pharmacy).state.stock.some((x) => x.batch === 'TL9')).toBe(true)
  })
})

describe('views', () => {
  it('a patient sees only their own record; a doctor only patients they can access', () => {
    const s = seed(T)
    const pv = viewFor(s, ramesh, T)
    expect(new Set(pv.reports.map((r) => r.patientId))).toEqual(new Set(['p1']))
    expect(pv.inbox).toEqual([])
    const dv = viewFor(s, arjun, T)
    expect(dv.patients.map((p) => p.id)).toEqual(['p3'])
  })
})

describe('presenter notifications', () => {
  const admin: Session = { role: 'admin' }
  it('sends to all patients, shows only to patients, records who read it', () => {
    let s = seed(T)
    const r = run(s, 'admin.announce', { title: 'Clinic closed Sunday', body: 'Dr Meera is away.', level: 'important', audience: 'all' }, admin)
    s = r.state
    expect(viewFor(s, ramesh, T).announcements?.[0]?.title).toBe('Clinic closed Sunday')
    expect(viewFor(s, pharmacy, T).announcements).toEqual([])
    expect(code(() => run(s, 'admin.announce', { title: 'x', body: 'y', level: 'info', audience: 'all' }, ramesh))).toBe('FORBIDDEN')
    s = run(s, 'patient.ackAnnouncement', { id: r.value }, ramesh).state
    expect(s.announcements?.[0]?.seenBy).toEqual(['p1'])
    expect(run(s, 'patient.ackAnnouncement', { id: r.value }, ramesh).events).toEqual([]) // second tap is a no-op
  })
  it('targets one patient', () => {
    const s = run(seed(T), 'admin.announce', { title: 'Hi Lakshmi', body: 'Your report is ready.', level: 'info', audience: 'p2' }, admin).state
    expect(viewFor(s, ramesh, T).announcements).toEqual([])
    expect(code(() => run(seed(T), 'admin.announce', { title: 'Hi', body: 'There', level: 'info', audience: 'nobody' }, admin))).toBe('NOT_FOUND')
  })
})

describe('clinic QR (patient scans the code on the doctor’s desk)', () => {
  it('pushes access to that doctor; expired and unknown codes are refused', () => {
    let s = seed(T)
    const r = run(s, 'doctor.issueQr', {}, arjun)
    s = r.state
    const { code } = r.value as { code: string; expiresAt: number }
    expect(run(s, 'patient.lookupDoctorQr', { code }, ramesh).value).toMatchObject({ doctorId: 'arjun' })
    expect(viewFor(s, ramesh, T).clinicCodes).toEqual([]) // codes are never sent to patients
    // the full link inside the QR works as well as the bare code
    s = run(s, 'patient.scanDoctorQr', { code: `https://medicub.vercel.app/patient?scan=${code}` }, ramesh).state
    expect(viewFor(s, arjun, T).patients.map((p) => p.id)).toContain('p1')
    expect(s.checkIns.at(-1)?.kind).toBe('qr')
    const later = { now: T + 5 * 60_000, uid: () => 'z', session: ramesh }
    expect((() => { try { runAction('patient.scanDoctorQr', s, { code }, later); return 'OK' } catch (e) { return (e as AppError).code } })()).toBe('CONFLICT') // expired
    expect((() => { try { run(s, 'patient.scanDoctorQr', { code: 'NOPE' }, ramesh); return 'OK' } catch (e) { return (e as AppError).code } })()).toBe('NOT_FOUND')
  })
})

describe('logs page grouping', () => {
  it('puts audit actions into the right group', async () => {
    const { categoryOf } = await import('../screens/Logs')
    expect(categoryOf('LOGIN_FAILED')).toBe('access')
    expect(categoryOf('CONSENT_GRANTED')).toBe('access')
    expect(categoryOf('RX_SIGNED')).toBe('clinical')
    expect(categoryOf('SUBSTITUTION_ATTESTED')).toBe('pharmacy')
    expect(categoryOf('NOTIFICATION_SENT')).toBe('system')
  })
})
