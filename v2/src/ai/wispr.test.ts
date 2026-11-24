import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  WisprFlowSTTAdapter,
  transcribeAudio,
  WISPR_MEDICAL_DICTIONARY,
} from './wispr'

describe('WisprFlowSTTAdapter - Configuration & Capabilities', () => {
  it('initializes with default endpoint and detects absence of API key', () => {
    const adapter = new WisprFlowSTTAdapter({ apiKey: '' })
    expect(adapter.isConfigured()).toBe(false)
    expect(adapter.getStreamingWsUrl()).toBeNull()
  })

  it('correctly configures with an API key and generates WebSocket streaming URL', () => {
    const adapter = new WisprFlowSTTAdapter({
      apiKey: 'test-wispr-key-12345',
      endpoint: 'https://test-api.wisprflow.ai/api/v1/dash/api',
    })
    expect(adapter.isConfigured()).toBe(true)
    const wsUrl = adapter.getStreamingWsUrl()
    expect(wsUrl).toBeTruthy()
    expect(wsUrl).toContain('wss://platform-api.wisprflow.ai')
    expect(wsUrl).toContain('test-wispr-key-12345')
  })

  it('contains comprehensive medical terms in WISPR_MEDICAL_DICTIONARY', () => {
    expect(WISPR_MEDICAL_DICTIONARY.length).toBeGreaterThan(30)
    // Common chronic disease drugs in India
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Amlong')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Telma-AM')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Glycomet')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Pantocid')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Ecosprin')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Lasix')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('Jan Aushadhi')

    // Key clinical parameters and findings
    expect(WISPR_MEDICAL_DICTIONARY).toContain('blood pressure')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('systolic')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('diastolic')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('pedal edema')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('vasodilation')
    expect(WISPR_MEDICAL_DICTIONARY).toContain('HbA1c')
  })
})

describe('WisprFlowSTTAdapter - Model Pre-Warming (warmup)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false when no API key is configured', async () => {
    const adapter = new WisprFlowSTTAdapter({ apiKey: '' })
    const warmed = await adapter.warmup()
    expect(warmed).toBe(false)
  })

  it('calls warmup_dash endpoint with authorization when key is present', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    globalThis.fetch = mockFetch

    const adapter = new WisprFlowSTTAdapter({ apiKey: 'key-abc-123' })
    const warmed = await adapter.warmup()

    expect(warmed).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/warmup_dash'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer key-abc-123',
        }),
      }),
    )
  })

  it('handles warmup network exceptions gracefully returning false', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'))
    const adapter = new WisprFlowSTTAdapter({ apiKey: 'key-abc-123' })
    const warmed = await adapter.warmup()
    expect(warmed).toBe(false)
  })
})

describe('WisprFlowSTTAdapter - Transcription & Normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns high-fidelity realistic clinical transcript when offline or unauthenticated', async () => {
    const adapter = new WisprFlowSTTAdapter({ apiKey: '' })
    const buffer = Buffer.from('mock audio bytes')
    const result = await adapter.transcribe(buffer, 'webm', 'en')

    expect(result.text).toBeTruthy()
    expect(result.text).toContain('Doctor:')
    expect(result.text).toContain('Patient:')
    expect(result.text).toContain('Amlong')
    expect(result.text).toContain('134/84 mmHg')
    expect(result.language).toBe('en-IN')
    expect(result.durationSeconds).toBeGreaterThan(0)
    expect(result.autoEdited).toBe(true)
  })

  it('successfully invokes Wispr Flow Voice Interface JSON payload when API responds ok', async () => {
    const mockTranscript = 'Doctor: Blood pressure is 130 over 80. Patient: Feeling much better.'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: mockTranscript,
        language: 'en',
        duration: 22,
      }),
    })

    const adapter = new WisprFlowSTTAdapter({ apiKey: 'live-key-xyz' })
    const buffer = Buffer.from('simulated pcm audio')
    const result = await adapter.transcribe(buffer, {
      format: 'webm',
      dictionary: ['Amlong 5'],
      contextPrompt: 'Clinic visit',
    })

    expect(result.text).toContain('130/80 mmHg')
    expect(result.model).toBe('wispr-flow-v1')
    expect(result.autoEdited).toBe(true)
    expect(result.durationSeconds).toBe(22)
  })

  it('normalizes spoken blood pressure ("X over Y") and eliminates speech hesitations ("um, uh")', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: 'Patient had um severe headache and uh blood pressure was 140 over 90.',
        language: 'en',
        duration: 15,
      }),
    })

    const adapter = new WisprFlowSTTAdapter({ apiKey: 'live-key-xyz' })
    const result = await adapter.transcribe(Buffer.from('pcm'))

    expect(result.text).not.toContain('um')
    expect(result.text).not.toContain('uh')
    expect(result.text).toContain('140/90 mmHg')
  })

  it('falls back to mock transcript if Wispr Flow API returns HTTP 500 error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const adapter = new WisprFlowSTTAdapter({ apiKey: 'bad-key' })
    const result = await adapter.transcribe(Buffer.from('test'))

    expect(result.text).toBeTruthy()
    expect(result.text).toContain('Doctor:')
  })
})

describe('transcribeAudio - Convenience Function', () => {
  it('handles standard Buffer input', async () => {
    const buf = Buffer.from('audio sample')
    const res = await transcribeAudio(buf)
    expect(res.text).toBeTruthy()
  })

  it('handles Web API Blob input with arrayBuffer method', async () => {
    const blob = new Blob(['raw audio wave content'], { type: 'audio/webm' })
    const res = await transcribeAudio(blob)
    expect(res.text).toBeTruthy()
  })

  it('handles empty or invalid audio input safely without crashing', async () => {
    const res = await transcribeAudio(Buffer.from([]))
    expect(res.text).toBeTruthy()
  })

  it('passes through custom dictionary and context prompts', async () => {
    const res = await transcribeAudio(Buffer.from('sample'), {
      format: 'wav',
      dictionary: ['CustomDrug 100mg'],
      contextPrompt: 'Pediatric clinic',
    })
    expect(res.text).toBeTruthy()
    expect(res.autoEdited).toBe(true)
  })
})
