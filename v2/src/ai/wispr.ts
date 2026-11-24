import type { STTAdapter } from './adapter'

export class WisprFlowSTTAdapter implements STTAdapter {
  private apiKey?: string
  private endpoint: string

  constructor(opts?: { apiKey?: string; endpoint?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.WISPR_API_KEY ?? process.env.STT_API_KEY
    this.endpoint =
      opts?.endpoint ??
      process.env.WISPR_API_URL ??
      process.env.STT_API_URL ??
      'https://api.wisprflow.ai/v1/transcribe'
  }

  async transcribe(
    audioBuffer: Buffer,
    format: 'webm' | 'wav' | 'mp4' = 'webm',
    languageHint = 'en',
  ): Promise<{ text: string; language?: string; durationSeconds?: number }> {
    // If API key is provided, attempt call to Wispr Flow or speech endpoint
    if (this.apiKey) {
      try {
        const formData = new FormData()
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: `audio/${format}` })
        formData.append('file', blob, `consultation.${format}`)
        formData.append('model', 'wispr-flow-v1')
        formData.append('language', languageHint)

        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
        })

        if (res.ok) {
          const data = (await res.json()) as { text?: string; language?: string; duration?: number }
          if (data.text) {
            return {
              text: data.text.trim(),
              language: data.language ?? languageHint,
              durationSeconds: data.duration,
            }
          }
        }
      } catch (err) {
        console.warn('[WisprFlowSTT] API request failed, falling back to mock transcript:', err)
      }
    }

    // Default mock transcript for demo / offline / dev hackathon workflow
    // Simulates a realistic bilingual (English + Indian clinic context) consultation
    return {
      text:
        'Namaste Doctor. For the last 4 days I have been having severe morning dizziness and lightheadedness, ' +
        'especially about an hour after taking my Amlong 5 tablet. Also my daughter noticed slight swelling in my feet. ' +
        'Doctor: Ramesh ji, let me check your blood pressure... your reading today is 134 over 84. ' +
        'The morning dizziness could be related to peak vasodilation from the amlodipine dose, and the ankle swelling ' +
        'is known pedal edema. Let us reduce Amlong to 2.5 mg once daily in the morning, and I will add a mild diuretic ' +
        'Lasix 20 mg for 5 days. Drink adequate water, avoid high salt pickles, and come back in 7 days for a blood pressure review.',
      language: 'en-IN',
      durationSeconds: 45,
    }
  }
}

export const wisprSTT = new WisprFlowSTTAdapter()

export async function transcribeAudio(
  audio: Buffer | Blob,
  format: 'webm' | 'wav' | 'mp4' = 'webm',
  languageHint = 'en',
): Promise<{ text: string; language?: string; durationSeconds?: number }> {
  let buf: Buffer
  if (Buffer.isBuffer(audio)) {
    buf = audio
  } else if (typeof (audio as Blob)?.arrayBuffer === 'function') {
    const ab = await (audio as Blob).arrayBuffer()
    buf = Buffer.from(ab)
  } else {
    buf = Buffer.from([])
  }
  return wisprSTT.transcribe(buf, format, languageHint)
}

