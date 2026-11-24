import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ConsultationCardView } from './ConsultationCardView'
import { RecordingBar } from './RecordingBar'
import type { ConsultationCard } from '../store/types'

// Mock useRecorder hook for deterministic RecordingBar component states
vi.mock('./useRecorder', () => ({
  useRecorder: vi.fn(),
}))

import { useRecorder } from './useRecorder'

const mockCard: ConsultationCard = {
  id: 'card-view-101',
  sessionId: 'sess-view-101',
  patientId: 'p1',
  doctorId: 'meera',
  consultedAt: 1700000000000,
  transcript: 'Doctor: Blood pressure is 134/84 mmHg. Patient: Feeling dizzy.',
  doctorName: 'Dr Meera Iyer',
  doctorSpecialty: 'Cardiology',
  summary: {
    chiefComplaint: 'Post-medication morning dizziness',
    symptoms: [
      { description: 'Morning lightheadedness', duration: '4 days', severity: 'moderate' },
      { description: 'Ankle swelling', duration: '2 days', severity: 'mild' },
    ],
    observations: ['BP 134/84 mmHg', 'Regular sinus rhythm'],
    medicationsDiscussed: [
      { name: 'Amlong 5', action: 'adjusted' },
      { name: 'Lasix 20', action: 'prescribed' },
    ],
    plan: [
      'Reduce Amlong to 2.5 mg once daily',
      'Add Lasix 20 mg once daily for 5 days',
      'Low sodium diet',
    ],
    followUp: '7 days for blood pressure check',
    patientSummary: 'Dr. Meera reduced your blood pressure pill dose and added a mild water pill for 5 days.',
  },
}

describe('ConsultationCardView - UI Component Rendering', () => {
  it('renders doctor details, chief complaint, and Wispr Flow header badge', () => {
    const html = renderToString(<ConsultationCardView card={mockCard} />)

    expect(html).toContain('Dr Meera Iyer')
    expect(html).toContain('Cardiology')
    expect(html).toContain('Wispr Flow Scribe')
    expect(html).toContain('Post-medication morning dizziness')
  })

  it('renders structured symptom tags with duration and severity ratings', () => {
    const html = renderToString(<ConsultationCardView card={mockCard} />)

    expect(html).toContain('Morning lightheadedness')
    expect(html).toContain('4 days')
    expect(html).toContain('moderate')

    expect(html).toContain('Ankle swelling')
    expect(html).toContain('2 days')
    expect(html).toContain('mild')
  })

  it('renders discussed medications with prescriptive action tags', () => {
    const html = renderToString(<ConsultationCardView card={mockCard} />)

    expect(html).toContain('Amlong 5')
    expect(html).toContain('adjusted')
    expect(html).toContain('Lasix 20')
    expect(html).toContain('prescribed')
  })

  it('renders agreed treatment plan and follow-up timeline', () => {
    const html = renderToString(<ConsultationCardView card={mockCard} />)

    expect(html).toContain('Reduce Amlong to 2.5 mg once daily')
    expect(html).toContain('Add Lasix 20 mg once daily for 5 days')
    expect(html).toContain('7 days for blood pressure check')
  })

  it('renders plain-language patient summary section', () => {
    const html = renderToString(<ConsultationCardView card={mockCard} />)

    expect(html).toContain('Plain-Language Visit Summary')
    expect(html).toContain(mockCard.summary.patientSummary)
  })
})

describe('RecordingBar - UI Component Rendering', () => {
  it('renders active listening state with Wispr Flow STT badge and timer', () => {
    vi.mocked(useRecorder).mockReturnValue({
      status: 'recording',
      elapsedMs: 65000,
      audioLevel: 0.5,
      error: null,
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    })

    const html = renderToString(
      <RecordingBar
        sessionId="sess-1"
        patientName="Ramesh Kumar"
        doctorName="Dr Meera Iyer"
        role="patient"
      />,
    )

    expect(html).toContain('01:05')
    expect(html).toContain('Listening')
    expect(html).toContain('Wispr Flow STT')
    expect(html).toContain('With Dr Meera Iyer')
  })

  it('renders paused state with resume button', () => {
    vi.mocked(useRecorder).mockReturnValue({
      status: 'paused',
      elapsedMs: 30000,
      audioLevel: 0,
      error: null,
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    })

    const html = renderToString(
      <RecordingBar
        sessionId="sess-1"
        patientName="Ramesh Kumar"
        doctorName="Dr Meera Iyer"
        role="doctor"
      />,
    )

    expect(html).toContain('00:30')
    expect(html).toContain('Paused')
    expect(html).toContain('Resume')
    expect(html).toContain('With Ramesh Kumar')
  })

  it('renders processing state with Wispr Flow transcribing indicator', () => {
    vi.mocked(useRecorder).mockReturnValue({
      status: 'processing',
      elapsedMs: 120000,
      audioLevel: 0,
      error: null,
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    })

    const html = renderToString(
      <RecordingBar
        sessionId="sess-1"
        patientName="Ramesh Kumar"
        doctorName="Dr Meera Iyer"
        role="patient"
      />,
    )

    expect(html).toContain('02:00')
    expect(html).toContain('Wispr Flow Transcribing…')
  })

  it('renders completed card compiled state with dismiss button', () => {
    vi.mocked(useRecorder).mockReturnValue({
      status: 'completed',
      elapsedMs: 125000,
      audioLevel: 0,
      error: null,
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    })

    const html = renderToString(
      <RecordingBar
        sessionId="sess-1"
        patientName="Ramesh Kumar"
        doctorName="Dr Meera Iyer"
        role="patient"
        onClose={vi.fn()}
      />,
    )

    expect(html).toContain('Consultation Card Compiled')
    expect(html).toContain('Dismiss')
  })
})
