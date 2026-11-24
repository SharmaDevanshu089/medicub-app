import type { ExtractionContext } from './adapter'

export const EXTRACTION_SYSTEM_PROMPT = `
You are a clinical consultation scribe AI for Medicub, an Indian healthcare medication safety platform.
Your task is to analyze a raw transcript of a doctor-patient conversation and extract an accurate, structured clinical consultation note.

STRICT CLINICAL RULES:
1. Extract only facts stated by the patient or doctor. Never invent or speculate on unmentioned diagnoses.
2. Accurately capture symptom timelines and durations as described by the patient (e.g. "for 4 days", "since last Thursday", "worse in mornings").
3. Identify all medications discussed, noting whether they are new, adjusted, continued, stopped, or just discussed. Check against the patient's known current medications when possible.
4. Output both a professional clinical note for doctors AND a warm, simple, jargon-free plain-language summary for the patient (in English or Hinglish if the conversation used Hindi words).
5. The plain-language summary MUST advise the patient clearly on what was agreed without prescribing or giving unilateral medical advice.
`

export function buildExtractionUserPrompt(transcript: string, ctx: ExtractionContext): string {
  return `
Patient Context:
- Name: ${ctx.patientName} ${ctx.patientAge ? `(${ctx.patientAge} y/o)` : ''}
- Known Conditions: ${ctx.patientConditions.length ? ctx.patientConditions.join(', ') : 'None recorded'}
- Active Medications: ${ctx.currentMeds.length ? ctx.currentMeds.join(', ') : 'None recorded'}
- Consulting Doctor: Dr. ${ctx.doctorName} (${ctx.doctorSpecialty})

Raw Consultation Audio Transcript:
"""
${transcript}
"""

Respond with a valid JSON object matching this schema:
{
  "chiefComplaint": "string (one concise sentence describing the primary reason for visit)",
  "symptoms": [
    {
      "description": "string (symptom in patient's words where possible)",
      "duration": "string or null (e.g. '4 days', 'past 2 weeks')",
      "severity": "mild | moderate | severe"
    }
  ],
  "observations": ["string (key physical findings or clinical observations mentioned)"],
  "medicationsDiscussed": [
    {
      "name": "string (brand or generic medicine name)",
      "action": "prescribed | adjusted | stopped | continued | discussed"
    }
  ],
  "plan": ["string (actions, lab tests ordered, diet/lifestyle instructions, dosage changes)"],
  "followUp": "string or null (e.g. '1 week', 'after lipid panel test')",
  "patientSummary": "string (2-3 sentences in reassuring, plain language explaining what the doctor said and next steps)"
}
`
}
