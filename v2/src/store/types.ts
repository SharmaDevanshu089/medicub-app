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
  verified: boolean
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
  caregivers?: Caregiver[]
}

/** Escalation ladder contact. `enabled` is the patient's consent; they can pause it any time. */
export interface Caregiver {
  id: string
  name: string
  relation: 'family' | 'asha'
  label: string
  phone: string
  enabled: boolean
}

export interface Dispensed {
  patientId: PatientId
  rxCode: string
  prescribed: string
  dispensed: string
  at: number
  savePerStrip: number
}

export interface EscalationAck {
  by: string
  at: number
  note: string
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
  image?: string
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
  by?: string
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

/** One QR code on a doctor's desk. Short-lived so a photo of it can't be reused later. */
export interface ClinicCode {
  code: string
  doctorId: DoctorId
  expiresAt: number
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

// ==================== CONSULTATION SCRIBE ====================

export type ConsultationStatus = 'recording' | 'paused' | 'processing' | 'completed' | 'failed'

/** A live or past consultation recording session */
export interface ConsultationSession {
  id: string
  patientId: PatientId
  doctorId: DoctorId
  status: ConsultationStatus
  startedAt: number
  pausedAt?: number
  endedAt?: number
  startedBy: 'patient' | 'doctor'
  durationMs: number
}

/** Structured clinical consultation summary extracted by AI */
export interface ConsultationSummary {
  chiefComplaint: string
  symptoms: {
    description: string
    duration?: string
    severity?: 'mild' | 'moderate' | 'severe'
  }[]
  observations: string[]
  medicationsDiscussed: {
    name: string
    action: 'prescribed' | 'adjusted' | 'stopped' | 'continued' | 'discussed'
  }[]
  plan: string[]
  followUp?: string
  patientSummary: string
}

/** The immutable visit record compiled from consultation recording */
export interface ConsultationCard {
  id: string
  sessionId: string
  patientId: PatientId
  doctorId: DoctorId
  consultedAt: number
  transcript: string
  summary: ConsultationSummary
  doctorName: string
  doctorSpecialty: string
}

export interface State {
  rev: number
  clockOffsetMs: number
  doctorId: DoctorId | null
  doctors: Doctor[]
  patients: Patient[]
  phoneLocation: PhoneLocation
  declined: string[]
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
  clinicCodes?: ClinicCode[]
  escalationAcks?: Record<string, EscalationAck>
  dispensed?: Dispensed[]
  consultations: ConsultationSession[]
  consultationCards: ConsultationCard[]
  audit: AuditEntry[]
}
