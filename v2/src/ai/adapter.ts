import type { ConsultationSummary } from '../store/types'

export interface STTAdapter {
  transcribe(
    audioBuffer: Buffer,
    format?: 'webm' | 'wav' | 'mp4',
    languageHint?: string,
  ): Promise<{ text: string; language?: string; durationSeconds?: number }>
}

export interface ExtractionContext {
  patientName: string
  patientAge?: number
  patientConditions: string[]
  currentMeds: string[]
  doctorName: string
  doctorSpecialty: string
}

export interface ExtractionAdapter {
  extractConsultation(transcript: string, context: ExtractionContext): Promise<ConsultationSummary>
}
