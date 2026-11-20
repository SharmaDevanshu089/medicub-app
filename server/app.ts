// Medicub API: sessions, role-filtered state, validated actions, hash-chained audit, structured logs.
// Runs as a long-lived Node server locally (SQLite) and as a Vercel Function in the cloud (Vercel Blob).
// Every write is a transaction: reload if someone else changed the data, apply, save only if unchanged, else retry.
import { randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { runAction, type AuditEvent } from '../src/core/actions'
import { AppError, STATUS, invalid } from '../src/core/errors'
import { actorName, type Session } from '../src/core/session'
import { obj, oneOf, optStr, str } from '../src/core/validate'
import { viewFor } from '../src/core/view'
import { askMyDocVerify, COUNCILS, digilockerVerifyIdentity, nmcLookup } from '../src/services/verification'
import { makeEntry, verifyChain } from '../src/store/audit'
import { DEMO_LOGINS, seed } from '../src/store/seed'
import type { Doctor, State } from '../src/store/types'
import { makeLogger } from './log'
import type { Persist, Snapshot } from './persist'

export interface ServerOptions {
  persist: Persist
  adminKey?: string
  /** Extra allowed CORS origins. Same-origin web apps and the Android app's WebView origin are allowed by default. */
  origins?: string[]
  quiet?: boolean
}

const DEPARTMENTS = ['Radiology', 'Pathology', 'Cardiology', 'Diabetology', 'Nursing', 'Physiotherapy', 'Nephrology']
const SPECIALTIES = ['General Medicine', 'Cardiology', 'Diabetology', 'Nephrology', 'Pulmonology', 'Orthopaedics', 'Paediatrics']
const MAX_BODY = 1_500_000
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'capacitor://localhost', 'https://localhost', 'http://localhost']
const FRESH_MS = 1000 // how long a read may reuse what this instance last loaded

export function createApp(opts: ServerOptions) {
  const persist = opts.persist
  const log = makeLogger({ quiet: opts.quiet })
  const adminKey = opts.adminKey ?? DEMO_LOGINS.adminKey
  const origins = new Set([...DEFAULT_ORIGINS, ...(opts.origins ?? [])])
  const uid = () => randomUUID().replace(/-/g, '').slice(0, 10)

  // ---------- data ----------
  let cur: Snapshot | null = null
  let version: string | null = null
  let loadedAt = 0
  const S = (): State => (cur as Snapshot).state
  const now = () => Date.now() + (cur?.state.clockOffsetMs ?? 0)

  /** Brings this instance up to date with storage. On first ever boot, creates the seed database. */
  async function refresh(force = false) {
    if (!force && cur && Date.now() - loadedAt < FRESH_MS) return
    // The cheap "changed?" check can be answered from a cache, so writes (force) always read the stored copy.
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
      const fresh: Snapshot = { state: { ...seed(t), audit: [] }, sessions: {} }
      const first = await makeEntry(undefined, 'System', 'SYSTEM_START', `Database created with seed data (synthetic) on ${persist.name}`, t)
      fresh.state.audit = [first]
      const v = await persist.save(fresh, null)
      if (v === null) return refresh(true) // another instance seeded first
      cur = fresh
      version = v
      log('info', 'store.seeded', { persist: persist.name })
    }
    loadedAt = Date.now()
  }

  let chain: Promise<unknown> = Promise.resolve()
  /** Writes from this instance run one at a time; storage version checks cover other instances. */
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

  /** Reload → apply → save-if-unchanged, retrying on conflicts. `fn` must be pure apart from its return value. */
  function transact<T>(fn: (snap: Snapshot) => Promise<{ next: Snapshot; value: T }>): Promise<T> {
    return serial(async () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        // Instances that collided back off by a random, growing delay so they stop retrying in lockstep.
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

  /** Audit-only events (logins, failures, denied access). */
  const record = (events: AuditEvent[]) => transact(async (b) => ({ next: { ...b, state: await withAudit(b.state, events, now()) }, value: undefined }))

  function apply(name: string, payload: unknown, session: Session, token: string): Promise<unknown> {
    return transact(async (b) => {
      const ctx = { now: now(), uid, session }
      const res = runAction(name, b.state, payload, ctx)
      const audit = name === 'demo.reset' ? [] : name === 'admin.tamper' ? res.state.audit : b.state.audit
      const mine = b.sessions[token]
      const sessions = name === 'demo.reset' ? (mine ? { [token]: mine } : {}) : b.sessions // a reset signs everyone else out
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
      await refresh(true) // signed in on another instance a moment ago?
      session = cur?.sessions[token]
    }
    if (!session || !stillValid(session)) throw new AppError('UNAUTHENTICATED', 'Your session has ended. Please sign in again.')
    return { token, session }
  }
  const newToken = () => randomBytes(24).toString('base64url')

  // ---------- rate limits (per instance) ----------
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
      const d = s.doctors.find((x) => x.verified && (email ? x.email === email : x.id === doctorId))
      if (d) { session = { role, doctorId: d.id }; who = d.name } else who = email ?? doctorId ?? 'unknown'
    } else if (role === 'patient') {
      const phone = str(b, 'phone', { max: 20 }).replace(/[^\d+]/g, '')
      const p = DEMO_LOGINS.patients.find((x) => x.phone === phone || x.phone.endsWith(phone.replace(/^\+?91/, '')))
      if (p) { session = { role, patientId: p.patientId }; who = s.patients.find((x) => x.id === p.patientId)?.name ?? p.patientId } else who = `phone ••${phone.slice(-4)}`
    } else if (role === 'caregiver') {
      const phone = str(b, 'phone', { max: 20 }).replace(/[^\d+]/g, '')
      const c = DEMO_LOGINS.caregivers.find((x) => x.phone === phone || x.phone.endsWith(phone.replace(/^\+?91/, '')))
      if (c) { session = { role, caregiverId: c.caregiverId, patientId: c.patientId }; who = c.caregiverId } else who = `phone ••${phone.slice(-4)}`
    } else if (role === 'pharmacy') {
      const code = str(b, 'code', { max: 20 }).toUpperCase()
      const pin = str(b, 'pin', { max: 12 })
      if (code === DEMO_LOGINS.pharmacy.code && pin === DEMO_LOGINS.pharmacy.pin) session = { role, pharmacyId: code }
      who = code
    } else if (role === 'department') {
      const name = str(b, 'name', { min: 2, max: 80 })
      const department = oneOf(b, 'department', DEPARTMENTS)
      session = { role, name, department }
    } else if (str(b, 'key', { max: 100 }) === adminKey) session = { role: 'admin' }

    if (!session) {
      log('warn', 'auth.login_failed', { role, ip })
      await record([{ actor: who, action: 'LOGIN_FAILED', detail: `Failed ${role} sign-in` }])
      throw new AppError('UNAUTHENTICATED', role === 'doctor' ? 'No verified doctor with those details.' : role === 'pharmacy' ? 'Wrong pharmacy code or PIN.' : role === 'patient' || role === 'caregiver' ? 'No Medicub account for that phone number.' : 'Wrong admin key.')
    }
    const se = session
    const token = newToken()
    await transact(async (b2) => ({
      next: { sessions: { ...b2.sessions, [token]: se }, state: await withAudit(b2.state, [{ actor: actorName(b2.state, se), action: 'LOGIN', detail: `Signed in (${role})`, ...(se.role === 'patient' ? { subject: se.patientId } : {}) }], now()) },
      value: undefined,
    }))
    log('info', 'auth.login', { role, ip })
    return { token, session: se, name: actorName(S(), se) }
  }

  // ---------- doctor onboarding (verification runs here, never trusted from the client) ----------
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
    log(verified ? 'info' : 'warn', 'onboard.verification', { regNo, results: checks.map((c) => `${c.source}:${c.status}`) })
    if (!verified) {
      await record([{ actor: name, action: 'ONBOARDING_FAILED', detail: `Verification failed: ${checks.filter((c) => c.status === 'fail').map((c) => c.source).join(', ')}` }])
      return { verified: false, checks }
    }
    const id = `doc-${uid()}`
    const token = newToken()
    const session: Session = { role: 'doctor', doctorId: id }
    const d: Doctor = {
      id, name: /^dr\.?\s/i.test(name) ? name.replace(/^dr\.?\s+/i, 'Dr ') : `Dr ${name}`, specialty, email, nmcRegNo: regNo, council,
      clinic: { name: clinicName, lat, lng }, ...(idFileName ? { idDocument: { fileName: idFileName, sizeKb: 0 } } : {}), checks, verified: true,
    }
    await transact(async (b2) => {
      if (b2.state.doctors.some((x) => x.email === email)) throw new AppError('CONFLICT', 'An account with this email already exists.')
      const state = await withAudit({ ...b2.state, doctors: [...b2.state.doctors, d] }, [{ actor: d.name, action: 'DOCTOR_ONBOARDED', detail: `${specialty}, ${regNo} (${council}); clinic ${clinicName}; checks: ${checks.map((c) => `${c.source} ${c.status}`).join(', ')} [mock adapters]` }], now())
      return { next: { state, sessions: { ...b2.sessions, [token]: session } }, value: undefined }
    })
    return { verified: true, checks, token, session, name: d.name }
  }

  // ---------- http plumbing ----------
  function cors(req: IncomingMessage, res: ServerResponse) {
    const o = req.headers.origin
    if (o && origins.has(o)) {
      res.setHeader('Access-Control-Allow-Origin', o)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    }
  }
  function send(res: ServerResponse, status: number, body: unknown) {
    if (res.headersSent) return
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(JSON.stringify(body))
  }
  async function readBody(req: IncomingMessage): Promise<unknown> {
    const pre = (req as IncomingMessage & { body?: unknown }).body // some hosts pre-parse JSON
    if (pre !== undefined && typeof pre !== 'string' && !Buffer.isBuffer(pre)) return pre
    const chunks: Buffer[] = []
    let size = 0
    if (typeof pre === 'string' || Buffer.isBuffer(pre)) chunks.push(Buffer.from(pre))
    else
      for await (const c of req) {
        size += (c as Buffer).length
        if (size > MAX_BODY) throw invalid('Request is too large.')
        chunks.push(c as Buffer)
      }
    const raw = Buffer.concat(chunks)
    if (raw.length > MAX_BODY) throw invalid('Request is too large.')
    if (!raw.length) return {}
    try {
      return JSON.parse(raw.toString('utf8'))
    } catch {
      throw invalid('Request body is not valid JSON.')
    }
  }

  async function handler(req: IncomingMessage, res: ServerResponse) {
    const started = Date.now()
    const reqId = uid()
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0]?.trim() ?? 'unknown'
    const url = new URL(req.url ?? '/', 'http://local')
    const path = url.pathname
    let role = '-'
    cors(req, res)
    res.setHeader('X-Request-Id', reqId)
    try {
      if (req.method === 'OPTIONS') return void (res.writeHead(204), res.end())
      await refresh()

      if (req.method === 'GET' && path === '/api/health') return send(res, 200, { ok: true, storage: persist.name, uptimeS: Math.round(process.uptime()), rev: S().rev, auditEntries: S().audit.length })
      if (req.method === 'POST' && path === '/api/login') return send(res, 200, await login(await readBody(req), ip))
      if (req.method === 'POST' && path === '/api/onboard') return send(res, 200, await onboard(await readBody(req), ip))
      if (req.method === 'POST' && path === '/api/client-log') {
        limit(`clientlog:${ip}`, 120)
        const b = obj(await readBody(req))
        const level = b.level === 'error' ? 'error' : b.level === 'warn' ? 'warn' : 'info'
        log(level, 'client.' + (optStr(b, 'event', { max: 60 }) ?? 'log'), { app: optStr(b, 'app', { max: 30 }), message: optStr(b, 'message', { max: 2000 }), stack: optStr(b, 'stack', { max: 4000 }), url: optStr(b, 'url', { max: 300 }), ip })
        return send(res, 200, { ok: true })
      }

      const { token, session } = await sessionOf(req)
      role = session.role

      if (req.method === 'GET' && path === '/api/me') return send(res, 200, { session, name: actorName(S(), session) })
      if (req.method === 'GET' && path === '/api/state') {
        // Clients poll with the rev they hold; unchanged data costs one tiny response.
        const since = Number(url.searchParams.get('rev'))
        if (url.searchParams.has('rev') && since === S().rev) return send(res, 200, { rev: since, unchanged: true })
        return send(res, 200, { rev: S().rev, state: viewFor(S(), session, now()) })
      }
      if (req.method === 'POST' && path === '/api/logout') {
        await transact(async (b) => {
          const { [token]: _gone, ...sessions } = b.sessions
          return { next: { sessions, state: await withAudit(b.state, [{ actor: actorName(b.state, session), action: 'LOGOUT', detail: `Signed out (${session.role})` }], now()) }, value: undefined }
        })
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && path.startsWith('/api/action/')) {
        const name = decodeURIComponent(path.slice('/api/action/'.length))
        limit(`action:${token}`, 300)
        const value = await apply(name, await readBody(req), session, token)
        log('info', 'action.ok', { reqId, action: name, role, ms: Date.now() - started })
        return send(res, 200, { ok: true, value: value ?? null })
      }
      if (req.method === 'GET' && path === '/api/audit/verify') {
        if (session.role !== 'admin') throw new AppError('FORBIDDEN', 'Admins only.')
        const stored = (await persist.load()).snap // verify what is actually stored, not this instance's copy
        const entries = stored?.state.audit ?? []
        const broken = await verifyChain(entries)
        log(broken ? 'warn' : 'info', 'audit.verify', { broken, entries: entries.length })
        return send(res, 200, { ok: broken === null, brokenAt: broken, entries: entries.length })
      }
      if (req.method === 'GET' && path === '/api/logs') {
        if (session.role !== 'admin') throw new AppError('FORBIDDEN', 'Admins only.')
        return send(res, 200, log.recent(Math.min(500, Number(url.searchParams.get('limit')) || 100)))
      }
      throw new AppError('NOT_FOUND', 'No such endpoint.')
    } catch (e) {
      const known = e instanceof AppError
      const code = known ? e.code : 'INTERNAL'
      const message = known ? e.message : 'Something went wrong on our side. It has been logged.'
      log(known && code !== 'INTERNAL' ? 'warn' : 'error', 'request.failed', { reqId, method: req.method, path, role, code, message: known ? message : String(e), stack: known ? undefined : (e as Error)?.stack })
      // Denied attempts on records are audit-worthy, not just log noise.
      if (code === 'FORBIDDEN' && role !== '-') {
        try {
          const { session } = await sessionOf(req)
          await record([{ actor: actorName(S(), session), action: 'ACCESS_DENIED', detail: `${req.method} ${path}: ${message}` }])
        } catch { /* best effort */ }
      }
      send(res, STATUS[code], { error: { code, message, requestId: reqId } })
    } finally {
      log('debug', 'http', { reqId, method: req.method, path, role, status: res.statusCode, ms: Date.now() - started })
    }
  }

  return { handler, log, getState: () => cur?.state ?? null, close: () => chain }
}
