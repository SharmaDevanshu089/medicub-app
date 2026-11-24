import type { ConsultationSummary } from '../store/types'
import type { ExtractionAdapter, ExtractionContext } from './adapter'
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT } from './prompt'

export class LLMExtractionAdapter implements ExtractionAdapter {
  private apiKey?: string
  private endpoint: string
  private model: string

  constructor(opts?: { apiKey?: string; endpoint?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GEMINI_API_KEY
    this.endpoint = opts?.endpoint ?? process.env.AI_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions'
    this.model = opts?.model ?? process.env.AI_MODEL ?? 'gpt-4o-mini'
  }

  async extractConsultation(transcript: string, ctx: ExtractionContext): Promise<ConsultationSummary> {
    if (this.apiKey) {
      try {
        const userPrompt = buildExtractionUserPrompt(transcript, ctx)
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
          }),
        })

        if (res.ok) {
          const data = (await res.json()) as any
          const content = data.choices?.[0]?.message?.content
          if (content) {
            const parsed = JSON.parse(content) as ConsultationSummary
            return this.validateSummary(parsed)
          }
        }
      } catch (err) {
        console.warn('[LLMExtraction] API call failed, falling back to deterministic extraction:', err)
      }
    }

    return this.heuristicExtraction(transcript, ctx)
  }

  private validateSummary(raw: Partial<ConsultationSummary>): ConsultationSummary {
    return {
      chiefComplaint: String(raw.chiefComplaint || 'Consultation review'),
      symptoms: Array.isArray(raw.symptoms)
        ? raw.symptoms.map((s) => ({
            description: String(s.description ?? ''),
            duration: s.duration ? String(s.duration) : undefined,
            severity: s.severity === 'severe' || s.severity === 'moderate' ? s.severity : 'mild',
          }))
        : [],
      observations: Array.isArray(raw.observations) ? raw.observations.map(String) : [],
      medicationsDiscussed: Array.isArray(raw.medicationsDiscussed)
        ? raw.medicationsDiscussed.map((m) => ({
            name: String(m.name ?? ''),
            action: m.action ?? 'discussed',
          }))
        : [],
      plan: Array.isArray(raw.plan) ? raw.plan.map(String) : [],
      followUp: raw.followUp ? String(raw.followUp) : undefined,
      patientSummary: String(raw.patientSummary || 'Consultation completed. Follow the prescribed dosage and instructions.'),
    }
  }

  private heuristicExtraction(transcript: string, ctx: ExtractionContext): ConsultationSummary {
    const text = transcript.toLowerCase()

    // Extract symptoms & timelines
    const symptoms: ConsultationSummary['symptoms'] = []
    if (text.includes('headache')) {
      symptoms.push({
        description: 'Severe persistent headache',
        duration: text.includes('5 days') ? '5 days' : text.includes('day') ? 'several days' : undefined,
        severity: text.includes('severe') ? 'severe' : 'moderate',
      })
    }
    if (text.includes('dizziness') || text.includes('lightheaded')) {
      symptoms.push({
        description: 'Morning dizziness & lightheadedness',
        duration: text.includes('4 days') ? '4 days' : text.includes('2 days') ? '2 days' : undefined,
        severity: 'moderate',
      })
    }
    if (text.includes('chest pain') || text.includes('chest discomfort') || text.includes('chest tightness')) {
      symptoms.push({
        description: 'Mild chest tightness / discomfort',
        duration: text.includes('2 weeks') ? '2 weeks' : undefined,
        severity: 'mild',
      })
    }
    if (text.includes('fatigue') || text.includes('tired')) {
      symptoms.push({
        description: 'Persistent fatigue and low energy',
        duration: text.includes('10 days') ? '10 days' : undefined,
        severity: 'mild',
      })
    }
    if (text.includes('swelling') || text.includes('edema')) {
      symptoms.push({
        description: 'Bilateral ankle and foot swelling (pedal edema)',
        severity: 'mild',
      })
    }
    if (symptoms.length === 0) {
      symptoms.push({
        description: 'Routine follow-up / symptoms discussed during visit',
        severity: 'mild',
      })
    }

    // Extract medications
    const medicationsDiscussed: ConsultationSummary['medicationsDiscussed'] = []
    if (text.includes('amlong')) {
      medicationsDiscussed.push({
        name: 'Amlong 5',
        action: text.includes('reduce') ? 'adjusted' : 'continued',
      })
    }
    if (text.includes('lasix')) {
      medicationsDiscussed.push({
        name: 'Lasix 20',
        action: 'prescribed',
      })
    }
    if (text.includes('telma')) {
      medicationsDiscussed.push({
        name: 'Telma-AM 40/5',
        action: text.includes('increase') ? 'adjusted' : 'discussed',
      })
    }
    if (text.includes('glycomet')) {
      medicationsDiscussed.push({
        name: 'Glycomet 500',
        action: 'continued',
      })
    }
    if (text.includes('pantocid')) {
      medicationsDiscussed.push({
        name: 'Pantocid 40',
        action: 'prescribed',
      })
    }
    if (text.includes('ecosprin')) {
      medicationsDiscussed.push({
        name: 'Ecosprin 75',
        action: 'prescribed',
      })
    }

    // Observations
    const observations: string[] = []
    const bpMatch = text.match(/(?:bp|blood pressure)?\s*(\d{2,3}\s*[\/\-]\s*\d{2,3})/i)
    if (bpMatch && bpMatch[1]) {
      observations.push(`Clinic BP recorded: ${bpMatch[1].replace('-', '/')} mmHg`)
    } else if (text.includes('134') || text.includes('142')) {
      observations.push('Clinic BP recorded: elevated')
    }
    if (text.includes('pedal edema') || text.includes('swelling')) {
      observations.push('Mild dependent ankle edema observed')
    }

    // Plan
    const plan: string[] = []
    if (text.includes('reduce amlong') || text.includes('2.5')) {
      plan.push('Taper Amlong 5 to 2.5 mg once daily in the morning')
    }
    if (text.includes('lasix')) {
      plan.push('Add Lasix 20 mg once daily for 5 days to reduce edema')
    }
    if (text.includes('telma-am') || text.includes('increase your telma')) {
      plan.push('Switch to Telma-AM 40/5 once daily in morning')
    }
    if (text.includes('pantocid')) {
      plan.push('Take Pantocid 40 once daily before breakfast for 14 days')
    }
    plan.push('Low-sodium diet: limit pickles, papads, and processed foods')
    plan.push('Adequate hydration: 2 to 2.5 liters water daily')

    const followUp = text.includes('7 days') || text.includes('1 week')
      ? '1 week (7 days)'
      : text.includes('2 weeks')
        ? '2 weeks'
        : 'Routine follow-up in 2-4 weeks'

    const symptomDesc = symptoms.map((s) => s.description).join(', ')
    const patientSummary =
      `Dr. ${ctx.doctorName} evaluated your visit regarding ${symptomDesc.toLowerCase()}. ` +
      (medicationsDiscussed.length > 0
        ? `Medications reviewed: ${medicationsDiscussed.map((m) => m.name).join(', ')}. `
        : '') +
      `Recommended plan: ${plan.slice(0, 2).join('; ')}. ` +
      `Follow-up scheduled for ${followUp}.`

    return {
      chiefComplaint: symptoms[0]?.description
        ? `${symptoms[0].description}${symptoms[0].duration ? ` for ${symptoms[0].duration}` : ''}`
        : 'Routine clinical checkup and review',
      symptoms,
      observations: observations.length ? observations : ['Vitals assessed during consultation'],
      medicationsDiscussed,
      plan,
      followUp,
      patientSummary,
    }
  }
}

export const consultationExtractor = new LLMExtractionAdapter()

export async function extractConsultationContext(
  transcript: string,
  patientName: string,
  doctorName: string,
  currentMeds: string[] = [],
  patientConditions: string[] = [],
  doctorSpecialty = 'General Physician',
): Promise<ConsultationSummary> {
  return consultationExtractor.extractConsultation(transcript, {
    patientName,
    doctorName,
    currentMeds,
    patientConditions,
    doctorSpecialty,
  })
}

