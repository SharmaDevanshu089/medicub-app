// Synthetic seed data. Not real patients or doctors.
import { dayKey, timeOn } from '../lib/dates'
import type { CheckResult } from '../services/verification'
import type { DoseEntry, Doctor, Patient, State } from './types'

/** The patient whose phone and watch the demo shows. */
export const PHONE_PATIENT = 'p1'

export const PHARMACY = 'Demo Pharmacy, MG Road'
export const PHARMACIST = 'Pharmacist K. Das (Demo Pharmacy)'
export const HOME = { label: 'Home', lat: 12.9784, lng: 77.6408 }

/** Demo sign-in values (synthetic). Real deployments use OTP / SSO — see REPORT.md. */
export const DEMO_LOGINS = {
  patients: [{ phone: '+919845000001', patientId: 'p1' }],
  caregivers: [
    { phone: '+919845000002', patientId: 'p1', caregiverId: 'cg-sunita' },
    { phone: '+919845000003', patientId: 'p1', caregiverId: 'cg-asha' },
  ],
  pharmacy: { code: 'PH-DEMO-01', pin: '4321' },
  adminKey: 'medicub-admin-demo',
}

/** Clinic presets offered during onboarding (synthetic coordinates, Bengaluru). */
export const CLINIC_PRESETS = [
  { name: 'Sunrise Family Clinic, HSR Layout', lat: 12.9116, lng: 77.6474 },
  { name: 'Lakeside Clinic, Whitefield', lat: 12.9698, lng: 77.75 },
]

const DAY = 86_400_000
const HOUR = 3_600_000

const seededChecks = (t: number): CheckResult[] => [
  { source: 'DigiLocker', status: 'pass', detail: 'Seeded demo account', mock: true },
  { source: 'NMC registry', status: 'pass', detail: `Seeded demo account (${new Date(t).getFullYear()})`, mock: true },
  { source: 'AskMyDoc', status: 'pass', detail: 'Seeded demo account', mock: true },
]

export function seed(now = Date.now()): State {
  const days = [6, 5, 4, 3, 2, 1, 0].map((d) => now - d * DAY)
  const doctors: Doctor[] = [
    { id: 'meera', name: 'Dr Meera Iyer', specialty: 'Cardiology', email: 'meera@demo.medicub', nmcRegNo: 'KMC-2009-31415', council: 'Karnataka Medical Council', clinic: { name: 'Heart Care Clinic, Indiranagar', lat: 12.9719, lng: 77.6412 }, checks: seededChecks(now), verified: true },
    { id: 'arjun', name: 'Dr Arjun Rao', specialty: 'Diabetology', email: 'arjun@demo.medicub', nmcRegNo: 'KMC-2011-27182', council: 'Karnataka Medical Council', clinic: { name: 'Diabetes Care Centre, Koramangala', lat: 12.9352, lng: 77.6245 }, checks: seededChecks(now), verified: true },
  ]
  const patients: Patient[] = [
    { id: 'p1', name: 'Ramesh Kumar', age: 62, sex: 'M', conditions: [{ name: 'Type 2 diabetes', since: '2016' }, { name: 'Hypertension', since: '2019' }], caregiver: 'Sunita (daughter)', currentDoctorId: 'meera',
      caregivers: [
        { id: 'cg-sunita', name: 'Sunita Kumar', relation: 'family', label: 'Daughter', phone: '+91 98450 00002', enabled: true },
        { id: 'cg-asha', name: 'Anita Devi', relation: 'asha', label: 'ASHA worker, Indiranagar', phone: '+91 98450 00003', enabled: true },
      ] },
    { id: 'p2', name: 'Lakshmi Menon', age: 54, sex: 'F', conditions: [{ name: 'Hypertension', since: '2021' }], currentDoctorId: 'meera' },
    { id: 'p3', name: 'Imran Shaikh', age: 47, sex: 'M', conditions: [{ name: 'Type 2 diabetes', since: '2020' }], currentDoctorId: 'arjun' },
  ]
  return {
    rev: 0,
    clockOffsetMs: 0,
    doctorId: null,
    doctors,
    patients,
    phoneLocation: HOME,
    declined: [],
    checkIns: [],
    meds: [
      { id: 'm1', patientId: 'p1', brand: 'Amlong 5', prescriberId: 'meera', dosesPerDay: 1, rxCode: 'RX-1001', startedAt: now - 90 * DAY },
      { id: 'm2', patientId: 'p1', brand: 'Glycomet 500', prescriberId: 'arjun', dosesPerDay: 2, rxCode: 'RX-1002', startedAt: now - 200 * DAY },
      { id: 'm3', patientId: 'p2', brand: 'Telma 40', prescriberId: 'meera', dosesPerDay: 1, rxCode: 'RX-1003', startedAt: now - 300 * DAY },
      { id: 'm4', patientId: 'p3', brand: 'Glycomet 500', prescriberId: 'arjun', dosesPerDay: 2, rxCode: 'RX-1004', startedAt: now - 150 * DAY },
    ],
    rxs: [
      { code: 'RX-1001', patientId: 'p1', doctorId: 'meera', items: [{ brand: 'Amlong 5', dosesPerDay: 1 }], signedAt: now - 90 * DAY },
      { code: 'RX-1002', patientId: 'p1', doctorId: 'arjun', items: [{ brand: 'Glycomet 500', dosesPerDay: 2 }], signedAt: now - 200 * DAY },
      { code: 'RX-1003', patientId: 'p2', doctorId: 'meera', items: [{ brand: 'Telma 40', dosesPerDay: 1 }], signedAt: now - 300 * DAY },
      { code: 'RX-1004', patientId: 'p3', doctorId: 'arjun', items: [{ brand: 'Glycomet 500', dosesPerDay: 2 }], signedAt: now - 150 * DAY },
    ],
    reminders: [
      { id: 'r1', patientId: 'p1', brand: 'Amlong 5', time: '08:00', instructions: 'Morning dose', createdBy: 'Dr Meera Iyer' },
      { id: 'r2', patientId: 'p1', brand: 'Glycomet 500', time: '08:30', instructions: 'Morning dose', createdBy: 'Dr Arjun Rao' },
      { id: 'r3', patientId: 'p1', brand: 'Glycomet 500', time: '20:30', instructions: 'Night dose', createdBy: 'Dr Arjun Rao' },
    ],
    doseLog: doseHistory(now),
    flags: [],
    reports: [
      { id: 'rep1', patientId: 'p1', kind: 'X-ray', title: 'Chest X-ray (PA view)', department: 'Radiology', author: 'Dr S. Pillai (Radiology)', takenAt: now - 40 * DAY - 3 * HOUR, summary: 'Radiologist report (synthetic): no acute findings noted.', image: 'placeholder' },
      { id: 'rep2', patientId: 'p1', kind: 'Lab', title: 'Diabetes panel', department: 'Pathology', author: 'City Lab (Pathology)', takenAt: now - 30 * DAY - 5 * HOUR, summary: 'Values as reported by the lab (synthetic).', values: [{ name: 'HbA1c', value: '7.4', unit: '%' }, { name: 'Fasting plasma glucose', value: '142', unit: 'mg/dL' }] },
      { id: 'rep3', patientId: 'p1', kind: 'Lab', title: 'Kidney function', department: 'Pathology', author: 'City Lab (Pathology)', takenAt: now - 30 * DAY - 5 * HOUR, summary: 'Values as reported by the lab (synthetic).', values: [{ name: 'Serum creatinine', value: '1.0', unit: 'mg/dL' }] },
      { id: 'rep4', patientId: 'p1', kind: 'ECG', title: '12-lead ECG', department: 'Cardiology', author: 'Dr Meera Iyer', takenAt: now - 90 * DAY - 2 * HOUR, summary: 'Cardiologist note (synthetic): sinus rhythm.' },
      { id: 'rep5', patientId: 'p2', kind: 'Lab', title: 'Lipid profile', department: 'Pathology', author: 'City Lab (Pathology)', takenAt: now - 20 * DAY, summary: 'Values as reported by the lab (synthetic).', values: [{ name: 'LDL cholesterol', value: '118', unit: 'mg/dL' }] },
    ],
    notes: [
      { id: 'n1', patientId: 'p1', department: 'Diabetology', author: 'Dr Arjun Rao', at: now - 29 * DAY, text: 'Reviewed lab results with patient. Continue current plan; recheck in 3 months. (synthetic)' },
      { id: 'n2', patientId: 'p1', department: 'Nursing', author: 'Nurse R. Thomas', at: now - 10 * DAY, text: 'Clinic BP by cuff 138/86 mmHg, seated. (synthetic)' },
    ],
    stock: [
      { name: 'Amlong 5', batch: 'AM2309', expiry: '2027-05-31', qty: 0 },
      { name: 'Stamlo 5', batch: 'ST2411', expiry: '2027-08-31', qty: 120 },
      { name: 'Glycomet 500', batch: 'GM2402', expiry: '2026-12-28', qty: 300 },
      { name: 'Telma 40', batch: 'TL2405', expiry: '2027-03-31', qty: 60 },
      { name: 'Atorva 10', batch: 'AT2401', expiry: '2027-01-10', qty: 90 },
      { name: 'Jan Aushadhi Amlodipine 5', batch: 'JA-AM-24', expiry: '2027-10-31', qty: 200 },
      { name: 'Jan Aushadhi Metformin 500', batch: 'JA-MF-24', expiry: '2027-09-30', qty: 400 },
      { name: 'Jan Aushadhi Telmisartan 40', batch: 'JA-TL-24', expiry: '2027-08-31', qty: 150 },
    ],
    shares: [],
    consents: [],
    inbox: [],
    vitals: {
      p1: {
        pulse: days.map((at, i) => ({ at, bpm: [76, 79, 74, 81, 77, 83, 78][i] ?? 78 })),
        sleep: days.map((at, i) => ({ at, hours: [6.5, 7, 5.8, 6.2, 7.4, 6.9, 6.1][i] ?? 7 })),
        // Daily morning estimates for the adherence view; higher readings follow the missed Amlong days (synthetic).
        bp: [...BP_14.map((v, i) => ({ at: timeOn(now - (14 - i) * DAY, '07:30'), sys: v[0], dia: v[1] })), { at: now - 2 * HOUR, sys: 148, dia: 92 }],
      },
    },
    audit: [],
  }
}

// ---------- synthetic adherence history for Ramesh (last 14 days) ----------
// [days ago] → which doses were missed or skipped. Everything else was taken 5–35 min after the reminder.
const MISSED: Record<string, number[]> = { r1: [3, 4, 10], r2: [4], r3: [2, 9, 10] }
const SKIPPED: Record<string, number[]> = { r3: [7] }
const TIMES: Record<string, string> = { r1: '08:00', r2: '08:30', r3: '20:30' }
// Oldest → newest (14 days ago … yesterday): [systolic, diastolic] wearable estimates.
const BP_14: [number, number][] = [
  [128, 82], [130, 83], [127, 81], [131, 84], [144, 90], [146, 91], [132, 84], [129, 82], [128, 81], [130, 83], [143, 89], [145, 90], [131, 84], [133, 85],
]

function doseHistory(now: number): Record<string, DoseEntry> {
  const DAY = 86_400_000
  const log: Record<string, DoseEntry> = {}
  for (let ago = 14; ago >= 1; ago--) {
    const t = now - ago * DAY
    for (const id of ['r1', 'r2', 'r3']) {
      if (MISSED[id]?.includes(ago)) continue
      const at = timeOn(t, TIMES[id] ?? '08:00') + ((ago * 7 + id.length * 11) % 30 + 5) * 60_000
      log[`${id}@${dayKey(t)}`] = { action: SKIPPED[id]?.includes(ago) ? 'skipped' : 'taken', at }
    }
  }
  return log
}
