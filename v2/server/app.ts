// Medicub v2 API: sessions, role-filtered state, validated actions, consultation scribe, hash-chained audit, structured logs.
import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { runAction, type AuditEvent } from '../src/core/actions'
import { AppError, STATUS, invalid } from '../src/core/errors'
import { actorName, type Session } from '../src/core/session'
import { obj, oneOf, optStr, str } from '../src/core/validate'
import { viewFor } from '../src/core/view'
import { askMyDocVerify, COUNCILS, digilockerVerifyIdentity, nmcLookup } from '../src/services/verification'
import { makeEntry, verifyChain } from '../src/store/audit'
import { getInitialState } from '../src/store/initial-state'
import type { Doctor, State } from '../src/store/types'
import { consultationExtractor } from '../src/ai/extraction'
import { wisprSTT, WISPR_MEDICAL_DICTIONARY } from '../src/ai/wispr'
import { makeLogger } from './log'
import type { Persist, Snapshot } from './persist'

export interface ServerOptions {
  persist: Persist
  adminKey?: string
  origins?: string[]
  quiet?: boolean
  /** Optional directory containing built frontend assets (e.g. v2/dist) to serve on non-API GET routes. */
  staticDir?: string
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const DEPARTMENTS = ['Radiology', 'Pathology', 'Cardiology', 'Diabetology', 'Nursing', 'Physiotherapy', 'Nephrology']
const SPECIALTIES = ['General Medicine', 'Cardiology', 'Diabetology', 'Nephrology', 'Pulmonology', 'Orthopaedics', 'Paediatrics']
const MAX_BODY = 10_000_000 // 10MB to accommodate audio chunks
const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:8788',
  'http://127.0.0.1:8788',
  'http://localhost:5173',
  'http://localhost:4173',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]
const FRESH_MS = 1000

export function createApp(opts: ServerOptions) {
  const persist = opts.persist
  const staticRoot = opts.staticDir ? path.resolve(opts.staticDir) : null
  const log = makeLogger({ quiet: opts.quiet })
  const adminKey = opts.adminKey ?? 'medicub-v2-admin'
  const origins = new Set([...DEFAULT_ORIGINS, ...(opts.origins ?? [])])
  const uid = () => randomUUID().replace(/-/g, '').slice(0, 10)

  // In-memory audio chunk buffer for active consultation sessions
  const audioBuffers = new Map<string, { chunks: Buffer[]; lastAt: number }>()

  // Cleanup stale audio buffers every 10 minutes
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60_000
    for (const [k, v] of audioBuffers.entries()) {
      if (v.lastAt < cutoff) audioBuffers.delete(k)
    }
  }, 10 * 60_000).unref?.()

  // ---------- data ----------
  let cur: Snapshot | null = null
  let version: string | null = null
  let loadedAt = 0
  const S = (): State => (cur as Snapshot).state
  const now = () => Date.now() + (cur?.state.clockOffsetMs ?? 0)

  async function refresh(force = false) {
    if (!force && cur && Date.now() - loadedAt < FRESH_MS) return
    if (!force && cur && !(await persist.changed(version))) {
      loadedAt = Date.now()
      return
    }
    const r = await persist.load()
    if (r.snap) {
      cur = r.snap
      version = r.version
    } else {
      const t = Date.now()
      const fresh: Snapshot = { state: { ...getInitialState(t), audit: [] }, sessions: {} }
      const first = await makeEntry(undefined, 'System', 'SYSTEM_START', `Database created with clean initial state on ${persist.name}`, t)
      fresh.state.audit = [first]
      const v = await persist.save(fresh, null)
      if (v === null) return refresh(true)
      cur = fresh
      version = v
      log('info', 'store.seeded', { persist: persist.name })
    }
    loadedAt = Date.now()
  }

  let chain: Promise<unknown> = Promise.resolve()
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = chain.then(fn)
    chain = p.catch(() => undefined)
    return p
  }

  async function withAudit(s: State, events: AuditEvent[], ts: number): Promise<State> {
    let audit = s.audit
    for (const e of events) audit = [...audit, await makeEntry(audit.at(-1), e.actor, e.action, e.detail, ts, e.subject)]
    return { ...s, audit }
  }

  function transact<T>(fn: (snap: Snapshot) => Promise<{ next: Snapshot; value: T }>): Promise<T> {
    return serial(async () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        if (attempt > 1) await new Promise((r) => setTimeout(r, Math.random() * Math.min(1500, 100 * 2 ** attempt)))
        await refresh(true)
        const base = cur as Snapshot
        const { next, value } = await fn(base)
        const out: Snapshot = { ...next, state: { ...next.state, rev: base.state.rev + 1 } }
        const v = await persist.save(out, version)
        if (v !== null) {
          cur = out
          version = v
          loadedAt = Date.now()
          return value
        }
        log('warn', 'store.write_conflict', { attempt })
      }
      throw new AppError('CONFLICT', 'The record was busy. Please try again.')
    })
  }

  const record = (events: AuditEvent[]) => transact(async (b) => ({ next: { ...b, state: await withAudit(b.state, events, now()) }, value: undefined }))

  function apply(name: string, payload: unknown, session: Session, _token: string): Promise<unknown> {
    return transact(async (b) => {
      const ctx = { now: now(), uid, session }
      const res = runAction(name, b.state, payload, ctx)
      const audit = b.state.audit
      const sessions = b.sessions
      const state = await withAudit({ ...res.state, audit }, res.events, ctx.now)
      return { next: { state, sessions }, value: res.value }
    })
  }

  // ---------- sessions ----------
  const stillValid = (se: Session) =>
    se.role === 'doctor' ? S().doctors.some((d) => d.id === se.doctorId && d.verified) : se.role === 'patient' ? S().patients.some((p) => p.id === se.patientId) : true

  async function sessionOf(req: IncomingMessage): Promise<{ token: string; session: Session }> {
    const h = req.headers.authorization ?? ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : ''
    if (!token) throw new AppError('UNAUTHENTICATED', 'Please sign in.')
    let session = cur?.sessions[token]
    if (!session) {
      await refresh(true)
      session = cur?.sessions[token]
    }
    if (!session || !stillValid(session)) throw new AppError('UNAUTHENTICATED', 'Your session has ended. Please sign in again.')
    return { token, session }
  }
  const newToken = () => randomBytes(24).toString('base64url')

  // ---------- rate limits ----------
  const hits = new Map<string, { n: number; at: number }>()
  function limit(key: string, max: number) {
    const t = Date.now()
    const h = hits.get(key)
    if (!h || t - h.at > 60_000) return void hits.set(key, { n: 1, at: t })
    if (++h.n > max) throw new AppError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.')
  }

  // ---------- login ----------
  async function login(body: unknown, ip: string) {
    limit(`login:${ip}`, 30)
    const b = obj(body)
    const role = oneOf(b, 'role', ['doctor', 'patient', 'pharmacy', 'department', 'caregiver', 'admin'] as const)
    const s = S()
    let session: Session | null = null
    let who = 'Unknown'

    if (role === 'doctor') {
      const email = optStr(b, 'email', { max: 120 })?.toLowerCase()
      const doctorId = optStr(b, 'doctorId', { max: 40 })
      const d = s.doctors.find((x) => x.verified && (email ? x.email.toLowerCase() === email || x.id === email : x.id === doctorId))
      if (d) {
        session = { role, doctorId: d.id }
        who = d.name
      } else who = email ?? doctorId ?? 'unknown'
    } else if (role === 'patient') {
      const phone = str(b, 'phone', { max: 20 }).replace(/[^\d+]/g, '')
      const clean = phone.replace(/^\+?91/, '')
      const p = s.patients.find((x) => x.id === 'p1' || x.id === phone || phone.endsWith('9845000001') || clean === '9845000001')
      if (p) {
        session = { role, patientId: p.id }
        who = p.name
      } else who = `phone ••${phone.slice(-4)}`
    } else if (role === 'caregiver') {
      const phone = str(b, 'phone', { max: 20 }).replace(/[^\d+]/g, '')
      if (phone.endsWith('9845000002')) {
        session = { role, caregiverId: 'cg-sunita', patientId: 'p1' }
        who = 'Sunita Kumar'
      } else if (phone.endsWith('9845000003')) {
        session = { role, caregiverId: 'cg-asha', patientId: 'p1' }
        who = 'Anita Devi'
      } else who = `phone ••${phone.slice(-4)}`
    } else if (role === 'pharmacy') {
      const code = str(b, 'code', { max: 20 }).toUpperCase()
      const pin = str(b, 'pin', { max: 12 })
      if ((code === 'PH-DEMO-01' || code === 'PH-01') && (pin === '4321' || pin === '1234')) {
        session = { role, pharmacyId: code }
      }
      who = code
    } else if (role === 'department') {
      const name = str(b, 'name', { min: 2, max: 80 })
      const department = oneOf(b, 'department', DEPARTMENTS)
      session = { role, name, department }
    } else if (str(b, 'key', { max: 100 }) === adminKey) {
      session = { role: 'admin' }
    }

    if (!session) {
      log('warn', 'auth.login_failed', { role, ip })
      await record([{ actor: who, action: 'LOGIN_FAILED', detail: `Failed ${role} sign-in` }])
      throw new AppError(
        'UNAUTHENTICATED',
        role === 'doctor'
          ? 'No verified doctor with those details.'
          : role === 'pharmacy'
            ? 'Wrong pharmacy code or PIN.'
            : role === 'patient' || role === 'caregiver'
              ? 'No Medicub account for that phone number.'
              : 'Wrong admin key.',
      )
    }

    const se = session
    const token = newToken()
    await transact(async (b2) => ({
      next: {
        sessions: { ...b2.sessions, [token]: se },
        state: await withAudit(
          b2.state,
          [{ actor: actorName(b2.state, se), action: 'LOGIN', detail: `Signed in (${role})`, ...(se.role === 'patient' ? { subject: se.patientId } : {}) }],
          now(),
        ),
      },
      value: undefined,
    }))
    log('info', 'auth.login', { role, ip })
    return { token, session: se, name: actorName(S(), se) }
  }

  // ---------- doctor onboarding ----------
  async function onboard(body: unknown, ip: string) {
    limit(`onboard:${ip}`, 10)
    const b = obj(body)
    const name = str(b, 'name', { min: 3, max: 80 })
    const email = str(b, 'email', { max: 120, pattern: /^\S+@\S+\.\S+$/ }).toLowerCase()
    const specialty = oneOf(b, 'specialty', SPECIALTIES)
    const council = oneOf(b, 'council', COUNCILS)
    const regNo = str(b, 'regNo', { max: 30 })
    const clinic = obj(b.clinic, 'clinic')
    const clinicName = str(clinic, 'name', { max: 120 })
    const lat = Number(clinic.lat)
    const lng = Number(clinic.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw invalid('Clinic location is not valid.')
    const idFileName = optStr(b, 'idFileName', { max: 200 })
    if (S().doctors.some((d) => d.email === email)) throw new AppError('CONFLICT', 'An account with this email already exists.')

    const dl = await digilockerVerifyIdentity({ typedName: name, idFileName })
    const nmc = await nmcLookup(regNo, council, dl.nameOnId ?? '')
    const amd = await askMyDocVerify(regNo, dl.nameOnId ?? '')
    const checks = [dl, nmc, amd].map(({ source, status, detail, mock }) => ({ source, status, detail, mock }))
    const verified = checks.every((c) => c.status === 'pass')

    if (!verified) {
      await record([{ actor: name, action: 'ONBOARDING_FAILED', detail: `Verification failed: ${checks.filter((c) => c.status === 'fail').map((c) => c.source).join(', ')}` }])
      return { verified: false, checks }
    }
    const id = `doc-${uid()}`
    const token = newToken()
    const session: Session = { role: 'doctor', doctorId: id }
    const d: Doctor = {
      id,
      name: /^dr\.?\s/i.test(name) ? name.replace(/^dr\.?\s+/i, 'Dr ') : `Dr ${name}`,
      specialty,
      email,
      nmcRegNo: regNo,
      council,
      clinic: { name: clinicName, lat, lng },
      ...(idFileName ? { idDocument: { fileName: idFileName, sizeKb: 0 } } : {}),
      checks,
      verified: true,
    }
    await transact(async (b2) => ({
      next: {
        sessions: { ...b2.sessions, [token]: session },
        state: await withAudit(
          { ...b2.state, doctors: [...b2.state.doctors, d] },
          [{ actor: d.name, action: 'DOCTOR_ONBOARDED', detail: `Verified & registered: ${d.specialty}, ${regNo}` }],
          now(),
        ),
      },
      value: undefined,
    }))
    log('info', 'onboard.success', { doctorId: id, regNo })
    return { verified: true, checks, token, session, name: d.name }
  }

  // ---------- request router ----------
  async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin ?? ''
    const cors = origins.has(origin) ? origin : origins.has('*') ? '*' : ''
    const head: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      ...(cors ? { 'Access-Control-Allow-Origin': cors, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' } : {}),
    }

    const send = (status: number, data: unknown) => {
      res.writeHead(status, head)
      res.end(JSON.stringify(data))
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, head)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown'

    try {
      await refresh()

      if (req.method === 'GET' && url.pathname === '/api/health') {
        send(200, { ok: true, storage: persist.name, uptimeS: Math.round(process.uptime()), rev: S().rev, auditEntries: S().audit.length })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/login') {
        const body = await readJson(req)
        send(200, await login(body, ip))
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/onboard') {
        const body = await readJson(req)
        send(200, await onboard(body, ip))
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/logout') {
        const { token } = await sessionOf(req)
        await transact(async (b) => {
          const { [token]: _drop, ...sessions } = b.sessions
          return { next: { ...b, sessions }, value: undefined }
        })
        send(200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/me') {
        const { session } = await sessionOf(req)
        send(200, { session, name: actorName(S(), session) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        const { session } = await sessionOf(req)
        const clientRev = url.searchParams.get('rev')
        const currentRev = S().rev
        if (clientRev !== null && Number(clientRev) === currentRev) {
          send(200, { rev: currentRev, unchanged: true })
          return
        }
        send(200, { rev: currentRev, state: viewFor(S(), session, now()) })
        return
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/action/')) {
        const name = decodeURIComponent(url.pathname.slice('/api/action/'.length))
        const { session, token } = await sessionOf(req)
        limit(`act:${token}`, 300)
        const body = await readJson(req).catch(() => ({}))
        if (name === 'consultation.start') {
          log('info', 'consultation.warmup', { wisprConfigured: wisprSTT.isConfigured() })
          void wisprSTT.warmup().catch((err) => {
            log('warn', 'wispr.warmup_failed', { message: (err as Error)?.message ?? String(err) })
            return false
          })
        }
        const value = await apply(name, body, session, token)
        log('info', 'action.ok', { action: name, role: session.role })
        send(200, { value })
        return
      }

      // ===== CONSULTATION SCRIBE API =====

      if (req.method === 'POST' && url.pathname === '/api/consultation/upload-chunk') {
        await sessionOf(req)
        const body = (await readJson(req)) as { sessionId?: string; chunk?: string; index?: number }
        const sessionId = str(body, 'sessionId')
        const chunkB64 = str(body, 'chunk')
        const chunkBuf = Buffer.from(chunkB64, 'base64')

        let entry = audioBuffers.get(sessionId)
        if (!entry) {
          entry = { chunks: [], lastAt: Date.now() }
          audioBuffers.set(sessionId, entry)
        }
        entry.chunks.push(chunkBuf)
        entry.lastAt = Date.now()
        log('info', 'consultation.chunk_received', { sessionId, chunkCount: entry.chunks.length, bytes: chunkBuf.length })

        send(200, { received: true, chunkCount: entry.chunks.length })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/consultation/process') {
        const { session, token } = await sessionOf(req)
        const body = (await readJson(req)) as { sessionId?: string }
        const sessionId = str(body, 'sessionId')

        const s = S()
        const consultation = (s.consultations ?? []).find((x) => x.id === sessionId)
        if (!consultation) throw new AppError('NOT_FOUND', 'Consultation session not found.')

        // Gather buffered audio chunks
        const entry = audioBuffers.get(sessionId)
        const combinedAudio = entry && entry.chunks.length ? Buffer.concat(entry.chunks) : Buffer.from([])
        log('info', 'consultation.processing_start', {
          sessionId,
          audioBytes: combinedAudio.length,
          wisprConfigured: wisprSTT.isConfigured(),
          llmConfigured: consultationExtractor.isConfigured(),
        })

        // 1. Prepare patient & doctor context for Wispr Flow Voice Interface & LLM extraction
        const patient = s.patients.find((p) => p.id === consultation.patientId)
        const doctor = s.doctors.find((d) => d.id === consultation.doctorId)
        const activeMeds = s.meds.filter((m) => m.patientId === consultation.patientId).map((m) => m.brand)

        const ctx = {
          patientName: patient?.name ?? 'Patient',
          patientAge: patient?.age,
          patientConditions: patient?.conditions.map((c) => c.name) ?? [],
          currentMeds: activeMeds,
          doctorName: doctor?.name ?? 'Consulting Doctor',
          doctorSpecialty: doctor?.specialty ?? 'General Practice',
        }

        // 2. Transcribe with Wispr Flow Voice Interface using medical dictionary
        const sttResult = await wisprSTT.transcribe(combinedAudio, {
          format: 'webm',
          languageHint: 'en',
          dictionary: [...WISPR_MEDICAL_DICTIONARY, ...activeMeds],
          contextPrompt: `Clinical consultation with Dr. ${ctx.doctorName} (${ctx.doctorSpecialty}) for ${ctx.patientName}. Current medications: ${activeMeds.join(', ') || 'none'}.`,
        })

        // 3. Extract clinical consultation summary
        const summary = await consultationExtractor.extractConsultation(sttResult.text, ctx)

        // 4. Complete consultation action
        const result = (await apply(
          'consultation.complete',
          { sessionId, transcript: sttResult.text, summary },
          session,
          token,
        )) as { cardId: string }

        log('info', 'consultation.completed', {
          sessionId,
          cardId: result.cardId,
          model: sttResult.model ?? 'unknown',
          chiefComplaint: summary.chiefComplaint,
        })

        // Clean up audio buffer
        audioBuffers.delete(sessionId)

        send(200, {
          cardId: result.cardId,
          transcript: sttResult.text,
          summary,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/wispr/status') {
        const wisprConfigured = wisprSTT.isConfigured()
        const llmConfigured = consultationExtractor.isConfigured()
        const modeMessage = wisprConfigured
          ? `Wispr Flow Voice Interface active (${WISPR_MEDICAL_DICTIONARY.length}+ medical terms)`
          : 'Wispr Flow / AI API key not set — running in built-in offline clinical fallback mode'
        send(200, {
          configured: wisprConfigured,
          wisprConfigured,
          llmConfigured,
          modeMessage,
          streamingSupported: Boolean(wisprSTT.getStreamingWsUrl()),
          dictionaryCount: WISPR_MEDICAL_DICTIONARY.length,
          dictionary: WISPR_MEDICAL_DICTIONARY.slice(0, 25),
          features: [
            'auto_edits',
            'medical_dictionary_context',
            'bilingual_en_hi_detection',
            'model_prewarming',
            'diarized_speakers',
          ],
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/wispr/test') {
        const body = (await readJson(req).catch(() => ({}))) as { audio?: string; format?: 'webm' | 'wav' }
        const audioBuf = body.audio ? Buffer.from(body.audio, 'base64') : Buffer.from([])
        const result = await wisprSTT.transcribe(audioBuf, { format: body.format ?? 'webm' })
        send(200, result)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/audit/verify') {
        const { session } = await sessionOf(req)
        if (session.role !== 'admin') throw new AppError('FORBIDDEN', 'Admin access required.')
        const entries = S().audit
        const brokenAt = await verifyChain(entries)
        send(200, { ok: brokenAt === null, brokenAt, entries: entries.length })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/logs') {
        const { session } = await sessionOf(req)
        if (session.role !== 'admin') throw new AppError('FORBIDDEN', 'Admin access required.')
        const limitN = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100)))
        send(200, log.recent(limitN))
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/client-log') {
        const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>
        log(body.level === 'warn' ? 'warn' : 'error', `client.${String(body.event ?? 'log')}`, body)
        send(204, null)
        return
      }

      // Serve built web app & static assets on non-API GET/HEAD routes when staticDir is configured
      if ((req.method === 'GET' || req.method === 'HEAD') && !url.pathname.startsWith('/api/') && staticRoot) {
        const reqPath = decodeURIComponent(url.pathname)
        const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '')
        const candidate = path.resolve(staticRoot, rel)
        let targetFile: string | null = null

        if (candidate.startsWith(staticRoot + path.sep) || candidate === staticRoot) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            targetFile = candidate
          }
        }
        if (!targetFile) {
          const fallback = path.join(staticRoot, 'index.html')
          if (fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
            targetFile = fallback
          }
        }

        if (targetFile) {
          const ext = path.extname(targetFile).toLowerCase()
          const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
          const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
          })
          if (req.method === 'HEAD') {
            res.end()
          } else {
            fs.createReadStream(targetFile).pipe(res)
          }
          return
        }
      }

      if (!staticRoot && !url.pathname.startsWith('/api/')) {
        log('warn', 'http.static_missing', {
          method: req.method ?? 'GET',
          path: url.pathname,
          message: 'Frontend bundle (v2/dist) not found; run npm run v2:build or set MEDICUB_STATIC_DIR.',
        })
      }

      log('warn', 'http.not_found', { method: req.method ?? 'GET', path: url.pathname })
      send(404, { error: { code: 'NOT_FOUND', message: `Not found: ${req.method ?? 'GET'} ${url.pathname}` } })
    } catch (err) {
      const e = err instanceof AppError ? err : new AppError('INTERNAL', `Internal server error: ${(err as Error)?.message ?? String(err)}`)
      const status = STATUS[e.code] ?? 500
      if (status >= 500) {
        log('error', 'server.error', {
          method: req.method ?? 'GET',
          path: url.pathname,
          status,
          code: e.code,
          message: (err as Error)?.message ?? String(err),
          stack: (err as Error)?.stack,
        })
      } else {
        log('warn', 'http.client_error', {
          method: req.method ?? 'GET',
          path: url.pathname,
          status,
          code: e.code,
          message: e.message,
        })
      }
      send(status, { error: { code: e.code, message: e.message, method: req.method ?? 'GET', path: url.pathname } })
    }
  }

  function readJson(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > MAX_BODY) reject(new AppError('INVALID', 'Request body too large.'))
      })
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {})
        } catch {
          reject(new AppError('INVALID', 'Malformed JSON.'))
        }
      })
      req.on('error', reject)
    })
  }

  return { handler, log, close: () => Promise.resolve(persist.close?.()) }
}
