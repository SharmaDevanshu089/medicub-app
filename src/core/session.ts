import { PHARMACIST } from '../store/seed'
import type { DoctorId, PatientId, State } from '../store/types'

export type Role = 'doctor' | 'patient' | 'pharmacy' | 'department' | 'caregiver' | 'admin'

export type Session =
  | { role: 'doctor'; doctorId: DoctorId }
  | { role: 'patient'; patientId: PatientId }
  | { role: 'pharmacy'; pharmacyId: string }
  | { role: 'department'; name: string; department: string }
  | { role: 'caregiver'; caregiverId: string; patientId: PatientId }
  | { role: 'admin' }

/** Who an audit entry says did something. */
export function actorName(s: State, se: Session): string {
  switch (se.role) {
    case 'doctor':
      return s.doctors.find((d) => d.id === se.doctorId)?.name ?? 'Unknown doctor'
    case 'patient':
      return `Patient ${s.patients.find((p) => p.id === se.patientId)?.name ?? se.patientId}`
    case 'pharmacy':
      return PHARMACIST
    case 'department':
      return `${se.name} (${se.department})`
    case 'caregiver': {
      const c = s.patients.find((p) => p.id === se.patientId)?.caregivers?.find((x) => x.id === se.caregiverId)
      return c ? `${c.name} (${c.label})` : 'Caregiver'
    }
    case 'admin':
      return 'Admin'
  }
}

/** Current doctor always has access; anyone else needs a live, unrevoked consent. */
export const hasAccess = (s: State, doctorId: DoctorId, patientId: PatientId, t: number) =>
  s.patients.some((p) => p.id === patientId && p.currentDoctorId === doctorId) ||
  s.consents.some((c) => c.patientId === patientId && c.doctorId === doctorId && !c.revoked && c.expiresAt > t)
