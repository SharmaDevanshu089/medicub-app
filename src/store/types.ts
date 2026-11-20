import type { Finding } from '../engine/rules'
import type { LatLng } from '../lib/geo'
import type { CheckResult } from '../services/verification'
import type { AuditEntry } from './audit'

export type DoctorId = string
export type PatientId = string

export interface Clinic extends LatLng {
  name: string
}

export interface Doctor {
  id: DoctorId
  name: string
  specialty: string
  email: string
  nmcRegNo: string
  council: string
  clinic: Clinic
  idDocument?: { fileName: string; sizeKb: number }
  checks: CheckResult[]
  verified: boolean // true only when every check passed
}

/** One patient has at most one current doctor; a doctor has many patients. */
export interface Patient {
  id: PatientId
  name: string
  age: number
  sex: 'M' | 'F'
  conditions: { name: string; since: string }[]
  caregiver?: string
  currentDoctorId: DoctorId | null
}

export type ReportKind = 'X-ray' | 'Lab' | 'ECG' | 'Scan' | 'Discharge' | 'Other'

export interface Report {
  id: string
  patientId: PatientId
  kind: ReportKind
  title: string
  department: string
  author: string
  takenAt: number
  summary: string
  values?: { name: string; value: string; unit: string }[]
  image?: string // data: URL, or 'placeholder' for synthetic X-ray art
}

export interface Note {
  id: string
  patientId: PatientId
  department: string
  author: string
  at: number
  text: string
}

export interface Med {
  id: string
  patientId: PatientId
  brand: string
  prescriberId: DoctorId
  dosesPerDay: number
  rxCode: string
  startedAt: number
}

export interface Rx {
  code: string
  patientId: PatientId
  doctorId: DoctorId
  items: { brand: string; dosesPerDay: number }[]
  signedAt: number
}

export interface Reminder {
  id: string
  patientId: PatientId
  brand: string
  time: string // HH:MM, local
  instructions: string
  createdBy: string
}

export type DoseAction = 'taken' | 'skipped' | 'snoozed'
export interface DoseEntry {
  action: DoseAction
  at: number
  until?: number
}

export type DecisionKind = 'intentional' | 'change-planned' | 'dismissed' | 'approved' | 'rejected'

export interface Decision {
  kind: DecisionKind
  reason: string
  by: string
  at: number
}

export interface SubRequest {
  prescribed: string
  scanned: string
  rxCode: string
  pharmacy: string
}

export interface Flag extends Finding {
  id: string
  patientId: PatientId
  status: 'open' | 'resolved'
  ownerId: DoctorId
  raisedBy: string
  createdAt: number
  deadline: number
  decision?: Decision
  request?: SubRequest
}

export interface StockItem {
  name: string
  batch: string
  expiry: string // YYYY-MM-DD
  qty: number
}

export interface Share {
  code: string
  patientId: PatientId
  createdAt: number
  expiresAt: number
}

export interface Consent {
  id: string
  patientId: PatientId
  doctorId: DoctorId
  grantedAt: number
  expiresAt: number
  revoked: boolean
}

export interface InboxMessage {
  id: string
  toId: DoctorId
  from: string
  at: number
  title: string
  lines: { text: string; source: string }[]
}

export interface Vitals {
  pulse: { at: number; bpm: number }[]
  sleep: { at: number; hours: number }[]
  bp: { at: number; sys: number; dia: number }[]
}

/** A notification the presenter sends to patient apps; `seenBy` holds patient ids that tapped "Got it". */
export interface Announcement {
  id: string
  title: string
  body: string
  level: 'info' | 'important'
  audience: 'all' | PatientId
  at: number
  by: string
  seenBy: PatientId[]
}

/** One QR code on a doctor's desk. Short-lived so a photo of it can't be reused later. */
export interface ClinicCode {
  code: string
  doctorId: DoctorId
  expiresAt: number
}

export interface QueuedEscalation {
  id: string
  finding: Finding
  patientId: PatientId
  ownerId: DoctorId
  request: SubRequest
  at: number
}

export interface CheckIn {
  patientId: PatientId
  doctorId: DoctorId
  at: number
  kind: 'arrival' | 'joined' | 'nfc' | 'qr'
}

export interface PhoneLocation extends LatLng {
  label: string
}

export interface State {
  rev: number
  clockOffsetMs: number
  doctorId: DoctorId | null
  doctors: Doctor[]
  patients: Patient[]
  phoneLocation: PhoneLocation
  declined: string[] // `${patientId}:${doctorId}` geofence prompts the patient said "Not now" to
  checkIns: CheckIn[]
  meds: Med[]
  rxs: Rx[]
  reminders: Reminder[]
  doseLog: Record<string, DoseEntry>
  flags: Flag[]
  reports: Report[]
  notes: Note[]
  stock: StockItem[]
  shares: Share[]
  consents: Consent[]
  inbox: InboxMessage[]
  vitals: Record<PatientId, Vitals>
  /** Presenter broadcasts. Optional: snapshots saved before this field existed don't have it. */
  announcements?: Announcement[]
  /** Rotating codes shown as a QR on a doctor's desk. Optional for older snapshots. */
  clinicCodes?: ClinicCode[]
  audit: AuditEntry[]
}
