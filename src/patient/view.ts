// Derived, read-only view of the store for the patient's own phone and watch.
import { insideFence } from '../lib/geo'
import { doseStatus, nextDose, type DoseStatus } from '../lib/time'
import { PHONE_PATIENT } from '../store/seed'
import type { Doctor, Reminder, State } from '../store/types'

export interface DoseRow {
  r: Reminder
  status: DoseStatus
}

export function patientView(s: State, t: number) {
  const me = s.patients.find((p) => p.id === PHONE_PATIENT)
  const reminders = s.reminders.filter((r) => r.patientId === PHONE_PATIENT).sort((a, b) => a.time.localeCompare(b.time))
  const rows: DoseRow[] = reminders.map((r) => ({ r, status: doseStatus(r, t, s.doseLog) }))
  const due = rows.filter((x) => x.status === 'due')
  const next = nextDose(reminders, t, s.doseLog)
  const flags = s.flags.filter((f) => f.patientId === PHONE_PATIENT)
  const near = s.doctors.filter((d) => d.verified && insideFence(s.phoneLocation, d.clinic))
  const currentDoctor = s.doctors.find((d) => d.id === me?.currentDoctorId)
  const atCurrent: Doctor | undefined = near.find((d) => d.id === me?.currentDoctorId)
  const candidate: Doctor | undefined = near.find((d) => d.id !== me?.currentDoctorId && !s.declined.includes(`${PHONE_PATIENT}:${d.id}`))
  // The doctor whose desk tag you would tap: whoever's clinic you are standing in.
  const tagDoctor: Doctor | undefined = atCurrent ?? near[0]
  const consents = s.consents.filter((c) => c.patientId === PHONE_PATIENT && !c.revoked && c.expiresAt > t)
  return { me, rows, due, next, flags, near, currentDoctor, atCurrent, candidate, tagDoctor, consents }
}

/** "8:00 am" from "08:00". */
export function hhmm12(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export const initials = (name: string) => name.replace(/^Dr\s+/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
