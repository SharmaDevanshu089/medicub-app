import { describe, expect, it } from 'vitest'
import { getInitialState } from '../store/initial-state'
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
const pharmacy: Session = { role: 'pharmacy', pharmacyId: 'pharmacy-1' }
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
    let s = getInitialState(T)
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
    const s = getInitialState(T)
    expect(code(() => run(s, 'doctor.signRx', { patientId: 'p1', items: [{ brand: 'Nope 5', dosesPerDay: 1 }] }, meera))).toBe('INVALID')
    expect(code(() => run(s, 'doctor.signRx', { patientId: 'p3', items: [{ brand: 'Atorva 10', dosesPerDay: 1 }] }, meera))).toBe('FORBIDDEN')
    expect(code(() => run(s, 'doctor.signRx', telmaAM, ramesh))).toBe('FORBIDDEN')
  })
})

describe('consent', () => {
  it('NFC consent works near the clinic and revoking ends access', () => {
    let s = getInitialState(T)
    // Remove pre-existing initial consent c2 for arjun so we test fresh grant and revoke
    s = { ...s, consents: s.consents.filter((c) => !(c.patientId === 'p1' && c.doctorId === 'arjun')) }
    const arjunClinic = s.doctors.find((d) => d.id === 'arjun')?.clinic
    s = run(s, 'patient.setLocation', { label: 'Near clinic', lat: arjunClinic?.lat, lng: arjunClinic?.lng }, ramesh).state
    s = run(s, 'patient.grantConsent', { doctorId: 'arjun' }, ramesh).state
    expect(viewFor(s, arjun, T).patients.map((p) => p.id)).toContain('p1')
    const id = s.consents.find((c) => c.patientId === 'p1' && c.doctorId === 'arjun' && !c.revoked)?.id
    expect(id).toBeDefined()
    s = run(s, 'patient.revokeConsent', { id }, ramesh).state
    expect(viewFor(s, arjun, T).reports.some((r) => r.patientId === 'p1')).toBe(false)
  })
})

describe('pharmacy', () => {
  it('blocked substitution goes to prescriber; equivalent can be attested', () => {
    let s = getInitialState(T)
    expect(run(s, 'pharmacy.scan', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: '8900000000028' }, pharmacy).value).toMatchObject({ verdict: 'BLOCKED' })
    expect(code(() => run(s, 'pharmacy.attest', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Telma-AM 40/5' }, pharmacy))).toBe('CONFLICT')
    expect(code(() => run(s, 'pharmacy.attest', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Stamlo 5' }, pharmacy))).toBe('CONFLICT') // patient not agreed
    expect(run(s, 'pharmacy.attest', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Stamlo 5', patientAgreed: true }, pharmacy).events[0]?.action).toBe('SUBSTITUTION_ATTESTED')
    s = run(s, 'pharmacy.escalate', { rxCode: 'RX-1001', prescribed: 'Amlong 5', scanned: 'Telma-AM 40/5' }, pharmacy).state
    expect(s.flags[0]?.request?.rxCode).toBe('RX-1001')
    expect(s.flags[0]?.ownerId).toBe('meera')
  })

  it('pharmacy view never contains medical history', () => {
    const v = viewFor(getInitialState(T), pharmacy, T)
    expect(v.reports).toEqual([])
    expect(v.notes).toEqual([])
    expect(v.patients).toEqual([])
    expect(v.stock.length).toBeGreaterThan(0)
  })
})

describe('clinic QR check-in (initiates consultation consent)', () => {
  it('pushes access to the doctor and records check-in event', () => {
    let s = getInitialState(T)
    const r = run(s, 'doctor.issueQr', {}, arjun)
    s = r.state
    const { code: qrCode } = r.value as { code: string; expiresAt: number }
    expect(run(s, 'patient.lookupDoctorQr', { code: qrCode }, ramesh).value).toMatchObject({ doctorId: 'arjun' })
    expect(viewFor(s, ramesh, T).clinicCodes).toEqual([]) // codes not leaked to patient

    // Scan the clinic QR on the doctor's desk
    s = run(s, 'patient.scanDoctorQr', { code: `https://medicub.vercel.app/patient?scan=${qrCode}` }, ramesh).state
    expect(viewFor(s, arjun, T).patients.map((p) => p.id)).toContain('p1')
    expect(s.checkIns.at(-1)?.kind).toBe('qr')
    expect(s.checkIns.at(-1)?.doctorId).toBe('arjun')
  })
})
