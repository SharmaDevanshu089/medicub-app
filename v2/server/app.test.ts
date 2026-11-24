// End-to-end integration tests for v2 HTTP server, auth, and Consultation Scribe API.
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createApp } from './app'
import { memoryPersist } from './persist'
import type { ConsultationCard, State } from '../src/store/types'

let app: ReturnType<typeof createApp>
let server: Server
let baseUrl = ''

beforeAll(async () => {
  app = createApp({ persist: memoryPersist(), quiet: true, adminKey: 'medicub-test-admin' })
  server = createServer((req, res) => void app.handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(baseUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, any>
  return { status: res.status, json }
}

const login = async (payload: unknown) => {
  const res = await api('/api/login', payload)
  return res.json.token as string
}

describe('v2 Server — Auth & Consultation Scribe End-to-End API', () => {
  it('rejects unauthenticated requests to protected endpoints', async () => {
    const unauth = await api('/api/state')
    expect(unauth.status).toBe(401)
  })

  it('signs in doctor, patient, pharmacy, and admin', async () => {
    const doctorToken = await login({ role: 'doctor', doctorId: 'meera' })
    expect(doctorToken).toBeTruthy()

    const patientToken = await login({ role: 'patient', phone: '+91 98450 00001' })
    expect(patientToken).toBeTruthy()

    const pharmacyToken = await login({ role: 'pharmacy', code: 'PH-01', pin: '1234' })
    expect(pharmacyToken).toBeTruthy()

    const adminToken = await login({ role: 'admin', key: 'medicub-test-admin' })
    expect(adminToken).toBeTruthy()
  })

  it('runs complete Consultation Scribe flow from QR scan to AI extraction and permanent card', async () => {
    const doctorToken = await login({ role: 'doctor', doctorId: 'meera' })
    const patientToken = await login({ role: 'patient', phone: '+91 98450 00001' })
    const adminToken = await login({ role: 'admin', key: 'medicub-test-admin' })
    const pharmacyToken = await login({ role: 'pharmacy', code: 'PH-01', pin: '1234' })

    // 1. Doctor issues rotating clinic desk QR code
    const qrRes = await api('/api/action/doctor.issueQr', {}, doctorToken)
    expect(qrRes.status).toBe(200)
    const qrCode = qrRes.json.value.code
    expect(qrCode).toBeTruthy()

    // 2. Patient arrives at clinic and scans doctor desk QR
    const scanRes = await api('/api/action/patient.scanDoctorQr', { code: qrCode }, patientToken)
    expect(scanRes.status).toBe(200)

    // 3. Patient starts consultation recording session
    const startRes = await api('/api/action/consultation.start', { doctorId: 'meera' }, patientToken)
    expect(startRes.status).toBe(200)
    const sessionId = startRes.json.value.sessionId
    expect(sessionId).toBeTruthy()

    // 4. Stream audio chunks to server
    const mockAudioChunk = Buffer.from('mock webm opus clinical conversation chunk').toString('base64')
    const uploadRes = await api(
      '/api/consultation/upload-chunk',
      { sessionId, chunk: mockAudioChunk, index: 0 },
      patientToken,
    )
    expect(uploadRes.status).toBe(200)
    expect(uploadRes.json.received).toBe(true)
    expect(uploadRes.json.chunkCount).toBe(1)

    // 5. Patient pauses & resumes recording session
    const pauseRes = await api('/api/action/consultation.pause', { sessionId }, patientToken)
    expect(pauseRes.status).toBe(200)
    expect(pauseRes.json.value.status).toBe('paused')

    const resumeRes = await api('/api/action/consultation.pause', { sessionId }, patientToken)
    expect(resumeRes.status).toBe(200)
    expect(resumeRes.json.value.status).toBe('recording')

    // 6. Stop recording session (moves to processing status)
    const stopRes = await api('/api/action/consultation.stop', { sessionId }, patientToken)
    expect(stopRes.status).toBe(200)
    expect(stopRes.json.value.status).toBe('processing')

    // 7. Process audio with Wispr Flow STT + Clinical LLM Extractor
    const processRes = await api('/api/consultation/process', { sessionId }, patientToken)
    expect(processRes.status).toBe(200)
    expect(processRes.json.cardId).toBeTruthy()
    expect(processRes.json.transcript).toContain('Doctor')
    expect(processRes.json.summary).toBeDefined()
    expect(processRes.json.summary.chiefComplaint).toBeTruthy()
    expect(processRes.json.summary.patientSummary).toBeTruthy()

    // 8. Patient views their state: ConsultationCard is in patient record
    const patientStateRes = await api('/api/state', undefined, patientToken)
    expect(patientStateRes.status).toBe(200)
    const patientState = patientStateRes.json.state as State
    const card = patientState.consultationCards.find((c: ConsultationCard) => c.sessionId === sessionId)
    expect(card).toBeDefined()
    expect(card?.doctorId).toBe('meera')
    expect(card?.patientId).toBe('p1')
    expect(card?.summary.chiefComplaint).toBeTruthy()

    // 9. Doctor views their state: doctor can see consultation card for consented patient
    const doctorStateRes = await api('/api/state', undefined, doctorToken)
    expect(doctorStateRes.status).toBe(200)
    const doctorState = doctorStateRes.json.state as State
    const doctorCard = doctorState.consultationCards.find((c: ConsultationCard) => c.sessionId === sessionId)
    expect(doctorCard).toBeDefined()

    // 10. Privacy check: Pharmacy views state and NEVER sees consultation cards
    const pharmacyStateRes = await api('/api/state', undefined, pharmacyToken)
    expect(pharmacyStateRes.status).toBe(200)
    const pharmacyState = pharmacyStateRes.json.state as State
    expect(pharmacyState.consultationCards).toEqual([])
    expect(pharmacyState.consultations).toEqual([])

    // 11. Audit chain check: cryptographic SHA-256 hash chain is fully intact
    const verifyRes = await api('/api/audit/verify', undefined, adminToken)
    expect(verifyRes.status).toBe(200)
    expect(verifyRes.json.ok).toBe(true)
    expect(verifyRes.json.brokenAt).toBeNull()
  })
})
