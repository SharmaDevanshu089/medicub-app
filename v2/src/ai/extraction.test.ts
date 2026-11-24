import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  LLMExtractionAdapter,
  extractConsultationContext,
} from './extraction'
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT } from './prompt'
import type { ExtractionContext } from './adapter'

const testCtx: ExtractionContext = {
  patientName: 'Ramesh Kumar',
  patientAge: 62,
  patientConditions: ['Hypertension', 'Type 2 Diabetes'],
  currentMeds: ['Amlong 5', 'Glycomet 500'],
  doctorName: 'Meera Iyer',
  doctorSpecialty: 'Cardiology',
}

describe('Clinical Extraction - Prompt Builder', () => {
  it('buildExtractionUserPrompt formats patient & doctor context and raw transcript', () => {
    const transcript = 'Doctor: How are you feeling? Patient: Having morning dizziness.'
    const prompt = buildExtractionUserPrompt(transcript, testCtx)

    expect(prompt).toContain('Ramesh Kumar (62 y/o)')
    expect(prompt).toContain('Hypertension, Type 2 Diabetes')
    expect(prompt).toContain('Amlong 5, Glycomet 500')
    expect(prompt).toContain('Dr. Meera Iyer (Cardiology)')
    expect(prompt).toContain(transcript)
    expect(prompt).toContain('chiefComplaint')
    expect(prompt).toContain('patientSummary')
  })

  it('handles empty conditions and medications gracefully in prompt', () => {
    const minimalCtx: ExtractionContext = {
      patientName: 'Priya Sharma',
      patientConditions: [],
      currentMeds: [],
      doctorName: 'Arjun Rao',
      doctorSpecialty: 'General Practice',
    }
    const prompt = buildExtractionUserPrompt('Routine visit', minimalCtx)
    expect(prompt).toContain('Priya Sharma')
    expect(prompt).toContain('None recorded')
  })

  it('verifies EXTRACTION_SYSTEM_PROMPT contains medical safety guardrails', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('STRICT CLINICAL RULES')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Extract only facts stated')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('plain-language summary')
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Never invent or speculate')
  })
})

describe('LLMExtractionAdapter - API & Fallbacks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls LLM endpoint when apiKey is configured and returns parsed summary', async () => {
    const mockSummary = {
      chiefComplaint: 'Post-prandial hyperglycemia',
      symptoms: [{ description: 'Fatigue after meals', duration: '1 week', severity: 'mild' }],
      observations: ['Fasting glucose 140 mg/dL'],
      medicationsDiscussed: [{ name: 'Glycomet 500', action: 'adjusted' }],
      plan: ['Increase Glycomet to 850mg twice daily with meals'],
      followUp: '2 weeks with FBS report',
      patientSummary: 'Dr. Meera increased your diabetes medicine dose to manage your sugar levels better.',
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockSummary) } }],
      }),
    })

    const adapter = new LLMExtractionAdapter({ apiKey: 'ai-secret-key-123' })
    const summary = await adapter.extractConsultation('dialogue', testCtx)

    expect(summary.chiefComplaint).toBe('Post-prandial hyperglycemia')
    expect(summary.symptoms).toHaveLength(1)
    expect(summary.medicationsDiscussed[0]?.name).toBe('Glycomet 500')
    expect(summary.patientSummary).toContain('Dr. Meera')
  })

  it('falls back to deterministic clinical heuristic when LLM returns invalid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Invalid Non-JSON Content' } }],
      }),
    })

    const adapter = new LLMExtractionAdapter({ apiKey: 'ai-secret-key-123' })
    const transcript = 'Patient: I have had bad morning dizziness for 4 days after taking Amlong. Doctor: Reduce to 2.5mg.'
    const summary = await adapter.extractConsultation(transcript, testCtx)

    expect(summary).toBeDefined()
    expect(summary.chiefComplaint).toContain('dizziness')
    expect(summary.symptoms.some((s) => s.duration === '4 days')).toBe(true)
  })

  it('falls back to heuristic extraction when fetch network error occurs', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection timed out'))

    const adapter = new LLMExtractionAdapter({ apiKey: 'ai-secret-key-123' })
    const transcript = 'Patient has persistent headache for 5 days. Blood pressure 142/90.'
    const summary = await adapter.extractConsultation(transcript, testCtx)

    expect(summary).toBeDefined()
    expect(summary.chiefComplaint).toContain('headache')
  })
})

describe('LLMExtractionAdapter - Deterministic Clinical Heuristic Parser', () => {
  it('accurately parses morning dizziness, pedal edema, Amlong reduction, and Lasix addition', async () => {
    const transcript = `
      Patient: Doctor, since last 4 days I am getting morning dizziness and lightheadedness. Also swelling in both feet.
      Doctor: Blood pressure is 134/84. Let us reduce Amlong to 2.5 mg once daily, and add Lasix 20 for 5 days. Come back in 7 days.
    `
    const summary = await extractConsultationContext(transcript, 'Ramesh Kumar', 'Dr Meera Iyer')

    expect(summary.chiefComplaint).toContain('dizziness')
    const dizziness = summary.symptoms.find((s) => s.description.toLowerCase().includes('dizziness'))
    expect(dizziness?.duration).toBe('4 days')
    expect(dizziness?.severity).toBe('moderate')

    const edema = summary.symptoms.find((s) => s.description.toLowerCase().includes('edema') || s.description.toLowerCase().includes('swelling'))
    expect(edema).toBeDefined()

    expect(summary.medicationsDiscussed.some((m) => m.name.includes('Amlong') && m.action === 'adjusted')).toBe(true)
    expect(summary.medicationsDiscussed.some((m) => m.name.includes('Lasix') && m.action === 'prescribed')).toBe(true)

    expect(summary.observations.some((o) => o.includes('134/84'))).toBe(true)
    expect(summary.followUp).toBe('1 week (7 days)')
    expect(summary.patientSummary).toContain('Dr. Dr Meera Iyer')
  })

  it('accurately parses severe headache (5 days), chest discomfort (2 weeks), and Telma-AM adjustment', async () => {
    const transcript = `
      Patient: Doctor, severe headache since 5 days and mild chest tightness for 2 weeks.
      Doctor: Blood pressure is elevated at 142/90. Increase your Telma to Telma-AM 40/5 and take Pantocid 40 before breakfast. Follow up in 2 weeks.
    `
    const summary = await extractConsultationContext(transcript, 'Lakshmi Ammal', 'Dr Arjun Rao')

    const headache = summary.symptoms.find((s) => s.description.toLowerCase().includes('headache'))
    expect(headache?.duration).toBe('5 days')
    expect(headache?.severity).toBe('severe')

    const chest = summary.symptoms.find((s) => s.description.toLowerCase().includes('tightness') || s.description.toLowerCase().includes('chest'))
    expect(chest?.duration).toBe('2 weeks')

    expect(summary.medicationsDiscussed.some((m) => m.name.includes('Telma-AM'))).toBe(true)
    expect(summary.medicationsDiscussed.some((m) => m.name.includes('Pantocid'))).toBe(true)
    expect(summary.followUp).toBe('2 weeks')
  })

  it('accurately parses fatigue (10 days) and Ecosprin 75 prescription', async () => {
    const transcript = `
      Patient: Feeling unusual fatigue and tired for 10 days.
      Doctor: Heart sounds normal. I am prescribing Ecosprin 75 once daily post-dinner. Routine follow-up in 2-4 weeks.
    `
    const summary = await extractConsultationContext(transcript, 'Imran Shaikh', 'Dr Meera Iyer')

    const fatigue = summary.symptoms.find((s) => s.description.toLowerCase().includes('fatigue'))
    expect(fatigue?.duration).toBe('10 days')

    expect(summary.medicationsDiscussed.some((m) => m.name.includes('Ecosprin 75') && m.action === 'prescribed')).toBe(true)
    expect(summary.plan.some((p) => p.includes('Ecosprin 75'))).toBe(true)
  })

  it('handles brief or unspecific transcripts gracefully without crashing', async () => {
    const transcript = 'Doctor: Everything looks good on your routine checkup. Patient: Thank you doctor.'
    const summary = await extractConsultationContext(transcript, 'Patient X', 'Dr Meera Iyer')

    expect(summary.chiefComplaint).toBe('Routine follow-up / symptoms discussed during visit')
    expect(summary.symptoms.length).toBeGreaterThan(0)
    expect(summary.observations.length).toBeGreaterThan(0)
    expect(summary.patientSummary).toBeTruthy()
  })
})
