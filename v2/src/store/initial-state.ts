import { dayKey, timeOn } from '../lib/dates'
import type { CheckResult } from '../services/verification'
import type { DoseEntry, Doctor, Patient, State } from './types'

export const CLINIC_HOME = { label: 'Home', lat: 12.9784, lng: 77.6408 }
export const HOME = CLINIC_HOME
export const PHARMACY = 'Jan Aushadhi Kendra, Indiranagar'
export const PHARMACIST = 'Priya Nair, D.Pharm'
export const CLINIC_PRESETS = [
  { name: 'Sunrise Family Clinic, HSR Layout', lat: 12.9116, lng: 77.6474 },
  { name: 'Lakeside Clinic, Whitefield', lat: 12.9698, lng: 77.75 },
]

const DAY = 86_400_000
const HOUR = 3_600_000

const MISSED: Record<string, number[]> = { r1: [3, 4, 10], r2: [4], r3: [2, 9, 10] }
const SKIPPED: Record<string, number[]> = { r3: [7] }
const TIMES: Record<string, string> = { r1: '08:00', r2: '08:30', r3: '20:30' }
const BP_14: [number, number][] = [
  [128, 82], [130, 83], [127, 81], [131, 84], [144, 90], [146, 91], [132, 84], [129, 82], [128, 81], [130, 83], [143, 89], [145, 90], [131, 84], [133, 85],
]

function doseHistory(now: number): Record<string, DoseEntry> {
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

const verifiedChecks = (t: number): CheckResult[] => [
  { source: 'DigiLocker', status: 'pass', detail: 'Identity verified', mock: true },
  { source: 'NMC registry', status: 'pass', detail: `Active registration (${new Date(t).getFullYear()})`, mock: true },
  { source: 'AskMyDoc', status: 'pass', detail: 'Registry credentials verified', mock: true },
]

export function getInitialState(now = Date.now()): State {
  const doctors: Doctor[] = [
    {
      id: 'meera',
      name: 'Dr Meera Iyer',
      specialty: 'Cardiology',
      email: 'meera@medicub.in',
      nmcRegNo: 'KMC-2009-31415',
      council: 'Karnataka Medical Council',
      clinic: { name: 'Heart Care Clinic, Indiranagar', lat: 12.9719, lng: 77.6412 },
      checks: verifiedChecks(now),
      verified: true,
    },
    {
      id: 'arjun',
      name: 'Dr Arjun Rao',
      specialty: 'Diabetology',
      email: 'arjun@medicub.in',
      nmcRegNo: 'KMC-2011-27182',
      council: 'Karnataka Medical Council',
      clinic: { name: 'Diabetes Care Centre, Koramangala', lat: 12.9352, lng: 77.6245 },
      checks: verifiedChecks(now),
      verified: true,
    },
  ]

  const patients: Patient[] = [
    {
      id: 'p1',
      name: 'Ramesh Kumar',
      age: 62,
      sex: 'M',
      conditions: [
        { name: 'Type 2 diabetes', since: '2016' },
        { name: 'Hypertension', since: '2019' },
      ],
      caregiver: 'Sunita (daughter)',
      currentDoctorId: 'meera',
      caregivers: [
        { id: 'cg-sunita', name: 'Sunita Kumar', relation: 'family', label: 'Daughter', phone: '+91 98450 00002', enabled: true },
        { id: 'cg-asha', name: 'Anita Devi', relation: 'asha', label: 'ASHA worker, Indiranagar', phone: '+91 98450 00003', enabled: true },
      ],
    },
    {
      id: 'p2',
      name: 'Lakshmi Menon',
      age: 54,
      sex: 'F',
      conditions: [{ name: 'Hypertension', since: '2021' }],
      currentDoctorId: 'meera',
    },
    {
      id: 'p3',
      name: 'Imran Shaikh',
      age: 47,
      sex: 'M',
      conditions: [{ name: 'Type 2 diabetes', since: '2020' }],
      currentDoctorId: 'arjun',
    },
  ]

  return {
    rev: 0,
    clockOffsetMs: 0,
    doctorId: null,
    doctors,
    patients,
    phoneLocation: CLINIC_HOME,
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
      {
        id: 'rep-1',
        patientId: 'p1',
        kind: 'ECG',
        title: '12-lead ECG (Normal sinus rhythm)',
        department: 'Cardiology',
        author: 'Dr Meera Iyer',
        takenAt: now - 30 * DAY,
        summary: 'Heart rate 72 bpm, normal axis, no ST-T segment elevation.',
      },
      {
        id: 'rep-2',
        patientId: 'p1',
        kind: 'Lab',
        title: 'HbA1c & Fasting Blood Glucose',
        department: 'Pathology',
        author: 'Dr Arjun Rao',
        takenAt: now - 45 * DAY,
        summary: 'HbA1c 7.1%, Fasting Blood Sugar 132 mg/dL.',
        values: [
          { name: 'HbA1c', value: '7.1', unit: '%' },
          { name: 'Fasting Blood Sugar', value: '132', unit: 'mg/dL' },
        ],
      },
    ],
    notes: [
      {
        id: 'note-1',
        patientId: 'p1',
        department: 'Cardiology',
        author: 'Dr Meera Iyer',
        at: now - 30 * DAY,
        text: 'Patient doing well on Amlong 5. Advised to report any swelling or dizziness.',
      },
    ],
    stock: [
      { name: 'Amlong 5', batch: 'AM-2401', expiry: '2027-08-31', qty: 250 },
      { name: 'Glycomet 500', batch: 'GL-2409', expiry: '2027-11-30', qty: 400 },
      { name: 'Telma 40', batch: 'TL-2403', expiry: '2027-06-30', qty: 180 },
      { name: 'Telma-AM 40/5', batch: 'TAM-2405', expiry: '2027-09-30', qty: 120 },
      { name: 'Jan Aushadhi Amlodipine 5', batch: 'JA-AML-01', expiry: '2028-01-31', qty: 500 },
      { name: 'Jan Aushadhi Metformin 500', batch: 'JA-MET-02', expiry: '2028-03-31', qty: 600 },
      { name: 'Lasix 20', batch: 'LX-2408', expiry: '2027-10-31', qty: 150 },
    ],
    shares: [],
    consents: [
      { id: 'c1', patientId: 'p1', doctorId: 'meera', grantedAt: now - 30 * DAY, expiresAt: now + 365 * DAY, revoked: false },
      { id: 'c2', patientId: 'p1', doctorId: 'arjun', grantedAt: now - 60 * DAY, expiresAt: now + 365 * DAY, revoked: false },
    ],
    inbox: [],
    vitals: {
      p1: {
        pulse: [{ at: now - HOUR, bpm: 72 }, { at: now - 2 * HOUR, bpm: 75 }],
        sleep: [{ at: now - DAY, hours: 7.2 }],
        bp: [
          ...BP_14.map((v, i) => ({ at: timeOn(now - (14 - i) * DAY, '07:30'), sys: v[0], dia: v[1] })),
          { at: now - 2 * HOUR, sys: 148, dia: 92 },
        ],
      },
      p2: { pulse: [], sleep: [], bp: [] },
      p3: { pulse: [], sleep: [], bp: [] },
    },
    clinicCodes: [],
    escalationAcks: {},
    dispensed: [],
    consultations: [],
    consultationCards: [],
    audit: [],
  }
}
