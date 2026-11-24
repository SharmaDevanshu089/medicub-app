import { describe, expect, it } from 'vitest'
import { getInitialState } from '../store/initial-state'
import type { State } from '../store/types'
import { runAction, type Ctx } from './actions'
import { AppError } from './errors'
import type { Session } from './session'
import { viewFor } from './view'
import { transcribeAudio, wisprSTT, WISPR_MEDICAL_DICTIONARY } from '../ai/wispr'
import { extractConsultationContext } from '../ai/extraction'

const NOW = Date.UTC(2026, 10, 24, 10, 0, 0)
let counter = 0
const ctx = (session: Session, time = NOW): Ctx => ({
  now: time,
  uid: () => `test-${++counter}`,
  session,
})

const drMeera: Session = { role: 'doctor', doctorId: 'meera' }
const drArjun: Session = { role: 'doctor', doctorId: 'arjun' }
const patientP1: Session = { role: 'patient', patientId: 'p1' }
const patientP2: Session = { role: 'patient', patientId: 'p2' }
const pharmacy: Session = { role: 'pharmacy', pharmacyId: 'pharmacy-1' }

const run = (s: State, name: string, payload: unknown, session: Session, time = NOW) =>
  runAction(name, s, payload, ctx(session, time))

const errorCode = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'UNKNOWN_ERROR'
  }
  return 'OK'
}

describe('Consultation Scribe - Actions & Lifecycle', () => {
  it('patient starts a consultation session with a clinic doctor', () => {
    const s = getInitialState(NOW)
    const res = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1)
    
    expect(res.value).toEqual(expect.objectContaining({ sessionId: expect.any(String) }))
    expect(res.events[0]?.action).toBe('CONSULTATION_STARTED')
    expect(res.events[0]?.subject).toBe('p1')

    const session = res.state.consultations.find((c) => c.patientId === 'p1')
    expect(session).toBeDefined()
    expect(session?.status).toBe('recording')
    expect(session?.doctorId).toBe('meera')
    expect(session?.startedBy).toBe('patient')
    expect(session?.durationMs).toBe(0)
  })

  it('starting an already active consultation returns the existing session (idempotent)', () => {
    const s = getInitialState(NOW)
    const first = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1)
    const sessionId = (first.value as { sessionId: string }).sessionId

    const second = run(first.state, 'consultation.start', { doctorId: 'meera' }, patientP1)
    expect((second.value as { sessionId: string }).sessionId).toBe(sessionId)
    expect(second.state.consultations.length).toBe(first.state.consultations.length)
  })

  it('doctor with access can start a consultation, while unauthorized doctor is rejected', () => {
    let s = getInitialState(NOW)
    // Dr Meera has access to p1 in initial state
    const okRes = run(s, 'consultation.start', { patientId: 'p1' }, drMeera)
    expect(okRes.events[0]?.action).toBe('CONSULTATION_STARTED')

    // Dr Meera does not have consent or current doctor access for p3
    expect(errorCode(() => run(s, 'consultation.start', { patientId: 'p3' }, drMeera))).toBe('FORBIDDEN')
  })

  it('can pause, resume, and track cumulative duration', () => {
    const s = getInitialState(NOW)
    // Start at T=0
    const started = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1, NOW)
    const sessionId = (started.value as { sessionId: string }).sessionId

    // Pause after 60 seconds (T+60s)
    const paused = run(started.state, 'consultation.pause', { sessionId }, patientP1, NOW + 60_000)
    expect(paused.events[0]?.action).toBe('CONSULTATION_PAUSED')
    let currentSession = paused.state.consultations.find((c) => c.id === sessionId)
    expect(currentSession?.status).toBe('paused')
    expect(currentSession?.durationMs).toBe(60_000)
    expect(currentSession?.pausedAt).toBe(NOW + 60_000)

    // Resume after 30 seconds of pause (T+90s)
    const resumed = run(paused.state, 'consultation.pause', { sessionId }, patientP1, NOW + 90_000)
    expect(resumed.events[0]?.action).toBe('CONSULTATION_RESUMED')
    currentSession = resumed.state.consultations.find((c) => c.id === sessionId)
    expect(currentSession?.status).toBe('recording')
    expect(currentSession?.pausedAt).toBeUndefined()
    expect(currentSession?.durationMs).toBe(60_000)

    // Different patient cannot pause/resume another patient's consultation
    expect(errorCode(() => run(resumed.state, 'consultation.pause', { sessionId }, patientP2))).toBe('FORBIDDEN')
  })

  it('stopping moves session to processing state', () => {
    const s = getInitialState(NOW)
    const started = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1, NOW)
    const sessionId = (started.value as { sessionId: string }).sessionId

    const stopped = run(started.state, 'consultation.stop', { sessionId }, patientP1, NOW + 120_000)
    expect(stopped.events[0]?.action).toBe('CONSULTATION_STOPPED')
    const currentSession = stopped.state.consultations.find((c) => c.id === sessionId)
    expect(currentSession?.status).toBe('processing')
    expect(currentSession?.endedAt).toBe(NOW + 120_000)
    expect(currentSession?.durationMs).toBe(120_000)
  })

  it('completing generates structured ConsultationCard in patient history', () => {
    const s = getInitialState(NOW)
    const started = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1, NOW)
    const sessionId = (started.value as { sessionId: string }).sessionId
    const stopped = run(started.state, 'consultation.stop', { sessionId }, patientP1, NOW + 180_000)

    const transcript = 'Patient presents with mild chest discomfort and fatigue for 2 weeks. BP 138/86.'
    const summary = {
      chiefComplaint: 'Mild chest discomfort and fatigue',
      symptoms: [
        { description: 'Mild chest tightness', duration: '2 weeks', severity: 'mild' as const },
        { description: 'General fatigue', duration: '10 days', severity: 'mild' as const },
      ],
      observations: ['BP 138/86 mmHg', 'Normal heart sounds S1/S2'],
      medicationsDiscussed: [
        { name: 'Telma 40', action: 'continued' as const },
        { name: 'Ecosprin 75', action: 'started' as const },
      ],
      plan: ['Continue Telma 40 once daily in morning', 'Add Ecosprin 75 once daily post-dinner', 'Fasting lipid profile next week'],
      followUp: '2 weeks with lipid profile reports',
      patientSummary: 'You discussed mild chest discomfort and tiredness over the past two weeks. Your doctor added Ecosprin 75 to your daily regimen and advised a fasting lipid profile test.',
    }

    const completed = run(stopped.state, 'consultation.complete', { sessionId, transcript, summary }, drMeera, NOW + 185_000)
    expect(completed.events[0]?.action).toBe('CONSULTATION_CARD_CREATED')

    // Session is completed
    const session = completed.state.consultations.find((c) => c.id === sessionId)
    expect(session?.status).toBe('completed')

    // ConsultationCard is stored
    const card = completed.state.consultationCards.find((c) => c.sessionId === sessionId)
    expect(card).toBeDefined()
    expect(card?.patientId).toBe('p1')
    expect(card?.doctorId).toBe('meera')
    expect(card?.summary.chiefComplaint).toBe('Mild chest discomfort and fatigue')
    expect(card?.summary.symptoms).toHaveLength(2)
    expect(card?.summary.medicationsDiscussed).toHaveLength(2)
    expect(card?.summary.plan).toHaveLength(3)
    expect(card?.summary.patientSummary).toContain('Ecosprin 75')
    expect(card?.transcript).toBe(transcript)
  })
})

describe('Consultation Scribe - View Scoping & Privacy', () => {
  it('patient sees their own consultation cards and sessions', () => {
    let s = getInitialState(NOW)
    const started = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1, NOW)
    const sessionId = (started.value as { sessionId: string }).sessionId
    const stopped = run(started.state, 'consultation.stop', { sessionId }, patientP1, NOW + 100_000)
    const completed = run(stopped.state, 'consultation.complete', {
      sessionId,
      transcript: 'Routine follow-up conversation.',
      summary: {
        chiefComplaint: 'Routine blood pressure review',
        symptoms: [],
        observations: ['BP 124/80'],
        medicationsDiscussed: [{ name: 'Telma 40', action: 'continued' as const }],
        plan: ['Maintain current dosage'],
        patientSummary: 'Blood pressure is well controlled.',
      },
    }, drMeera, NOW + 105_000).state

    const patientView = viewFor(completed, patientP1, NOW)
    expect(patientView.consultations.some((c) => c.id === sessionId)).toBe(true)
    expect(patientView.consultationCards.some((c) => c.sessionId === sessionId)).toBe(true)

    // Patient 2 does not see patient 1's consultation
    const patient2View = viewFor(completed, patientP2, NOW)
    expect(patient2View.consultations.some((c) => c.id === sessionId)).toBe(false)
    expect(patient2View.consultationCards.some((c) => c.sessionId === sessionId)).toBe(false)
  })

  it('consented doctor sees consultation cards; non-consented doctor does not', () => {
    let s = getInitialState(NOW)
    const started = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1, NOW)
    const sessionId = (started.value as { sessionId: string }).sessionId
    const stopped = run(started.state, 'consultation.stop', { sessionId }, patientP1, NOW + 100_000)
    const completed = run(stopped.state, 'consultation.complete', {
      sessionId,
      transcript: 'Clinical review notes.',
      summary: {
        chiefComplaint: 'Follow-up consultation',
        symptoms: [],
        observations: [],
        medicationsDiscussed: [],
        plan: ['Routine care'],
        patientSummary: 'All clear.',
      },
    }, drMeera, NOW + 105_000).state

    // Dr Meera has consent for p1
    const meeraView = viewFor(completed, drMeera, NOW)
    expect(meeraView.consultationCards.some((c) => c.sessionId === sessionId)).toBe(true)

    // Doctor without consent cannot see consultation cards
    const withoutConsent = {
      ...completed,
      consents: completed.consents.filter((c) => c.doctorId !== 'arjun'),
    }
    const arjunView = viewFor(withoutConsent, drArjun, NOW)
    expect(arjunView.consultationCards.some((c) => c.sessionId === sessionId)).toBe(false)
  })

  it('pharmacy and caregiver never see consultation cards (ambient recordings/clinical notes stay confidential)', () => {
    let s = getInitialState(NOW)
    const started = run(s, 'consultation.start', { doctorId: 'meera' }, patientP1, NOW)
    const sessionId = (started.value as { sessionId: string }).sessionId
    const stopped = run(started.state, 'consultation.stop', { sessionId }, patientP1, NOW + 100_000)
    const completed = run(stopped.state, 'consultation.complete', {
      sessionId,
      transcript: 'Private doctor patient dialog.',
      summary: {
        chiefComplaint: 'Confidential clinical discussion',
        symptoms: [],
        observations: [],
        medicationsDiscussed: [],
        plan: ['Confidential plan'],
        patientSummary: 'Confidential summary',
      },
    }, drMeera, NOW + 105_000).state

    const cgSession: Session = { role: 'caregiver', caregiverId: 'cg-arun', patientId: 'p1' }
    const caregiverView = viewFor(completed, cgSession, NOW)
    expect(caregiverView.consultationCards).toEqual([])
    expect(caregiverView.consultations).toEqual([])

    const pharmacyView = viewFor(completed, pharmacy, NOW)
    expect(pharmacyView.consultationCards).toEqual([])
    expect(pharmacyView.consultations).toEqual([])
  })
})

describe('Wispr Flow & Clinical Extraction Layer', () => {
  it('Wispr Flow adapter includes curated medical dictionary and auto-edits', () => {
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Amlong')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Telma-AM')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('blood pressure')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('pedal edema')
    expect(WISPR_MEDICAL_DICTIONARY.length).toBeGreaterThan(30)
    expect(typeof wisprSTT.isConfigured()).toBe('boolean')
  })

  it('transcribeAudio returns auto-edited medical transcript with options', async () => {
    const audioBlob = new Blob(['mock audio data'], { type: 'audio/webm' })
    const result = await transcribeAudio(audioBlob, {
      format: 'webm',
      languageHint: 'en',
      dictionary: ['Amlong 5', 'pedal edema'],
      contextPrompt: 'Consultation with Ramesh Kumar',
    })

    expect(result).toBeDefined()
    expect(result.text).toBeTruthy()
    expect(typeof result.durationSeconds).toBe('number')
    expect(result.text).toContain('Doctor')
    expect(result.autoEdited).toBe(true)
  })

  it('extractConsultationContext accurately parses symptoms, timelines, medications, and plain summary', async () => {
    const transcript = `
      Doctor: Good morning Ramesh. How are you feeling today?
      Patient: Doctor, since last 5 days I have had a severe headache and persistent fatigue.
      Doctor: Any dizziness or chest pain?
      Patient: No chest pain, but mild dizziness for 2 days when standing up quickly.
      Doctor: Your blood pressure is 142/90. We should increase your Telma 40 to Telma-AM 40/5 once daily in the morning, and start Pantocid 40 before breakfast for 14 days.
      Patient: Sure doctor.
      Doctor: Let's do a follow-up in 2 weeks with a renal function test.
    `

    const extraction = await extractConsultationContext(transcript, 'Ramesh Kumar', 'Dr Meera Iyer')

    expect(extraction.chiefComplaint).toBeTruthy()
    expect(extraction.symptoms.length).toBeGreaterThan(0)
    // Check symptoms extracted timeline
    const headache = extraction.symptoms.find((s) => s.description.toLowerCase().includes('headache'))
    expect(headache).toBeDefined()

    // Check medications detected
    const meds = extraction.medicationsDiscussed.map((m) => m.name.toLowerCase())
    expect(meds.some((m) => m.includes('telma'))).toBe(true)

    // Check plan and follow-up
    expect(extraction.plan.length).toBeGreaterThan(0)
    expect(extraction.followUp).toBeTruthy()

    // Plain language patient summary
    expect(extraction.patientSummary).toBeTruthy()
    expect(extraction.patientSummary.length).toBeGreaterThan(20)
  })
})
