// End-to-end against a real HTTP server with an in-memory database.
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createApp } from './app'
import { memoryPersist } from './persist'

let app: ReturnType<typeof createApp>
let server: Server
let base = ''

beforeAll(async () => {
  app = createApp({ persist: memoryPersist(), quiet: true })
  server = createServer((req, res) => void app.handler(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

async function call(path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}
const login = async (b: unknown) => (await call('/api/login', b)).json.token as string

describe('server', () => {
  it('rejects unauthenticated and bad logins, and audits the failure', async () => {
    expect((await call('/api/state')).status).toBe(401)
    expect((await call('/api/login', { role: 'pharmacy', code: 'PH-DEMO-01', pin: '0000' })).status).toBe(401)
    const admin = await login({ role: 'admin', key: 'medicub-admin-demo' })
    const s = ((await call('/api/state', undefined, admin)).json as { state: { audit: { action: string }[] } }).state
    expect(s.audit.some((e) => e.action === 'LOGIN_FAILED')).toBe(true)
  })

  it('runs the core demo flow with a verifiable audit chain', async () => {
    const doctor = await login({ role: 'doctor', doctorId: 'meera' })
    const items = [{ brand: 'Telma-AM 40/5', dosesPerDay: 1 }]
    const blocked = await call('/api/action/doctor.signRx', { patientId: 'p1', items }, doctor)
    expect(blocked.status).toBe(409)
    expect((blocked.json.error as { message: string }).message).toMatch(/Signing blocked/)
    await call('/api/action/doctor.checkDraft', { patientId: 'p1', items }, doctor)
    const view = ((await call('/api/state', undefined, doctor)).json as { state: { flags: { id: string; ruleId: string }[] } }).state
    const flag = view.flags.find((f) => f.ruleId === 'R-DUP-001')
    expect(flag).toBeTruthy()
    expect((await call('/api/action/doctor.decideFlag', { id: flag?.id, kind: 'intentional', reason: 'Planned combination' }, doctor)).status).toBe(200)
    const signed = await call('/api/action/doctor.signRx', { patientId: 'p1', items }, doctor)
    expect(signed.json.value).toMatch(/^RX-/)

    const patient = await login({ role: 'patient', phone: '+91 98450 00001' })
    const pv = ((await call('/api/state', undefined, patient)).json as { state: { flags: unknown[] } }).state
    expect(pv.flags.length).toBe(1)

    const admin = await login({ role: 'admin', key: 'medicub-admin-demo' })
    expect((await call('/api/audit/verify', undefined, admin)).json.ok).toBe(true)
    await call('/api/action/admin.tamper', {}, admin)
    expect((await call('/api/audit/verify', undefined, admin)).json.ok).toBe(false)
  })

  it('returns friendly validation errors with a request id', async () => {
    const pharmacy = await login({ role: 'pharmacy', code: 'PH-DEMO-01', pin: '4321' })
    const r = await call('/api/action/pharmacy.importStock', { rows: [{ name: 'X' }] }, pharmacy)
    expect(r.status).toBe(400)
    expect(r.json.error).toMatchObject({ code: 'INVALID' })
    expect((r.json.error as { requestId: string }).requestId).toBeTruthy()
    expect((await call('/api/action/doctor.signRx', {}, pharmacy)).status).toBe(403)
  })
})

describe('two instances sharing one store (like Vercel)', () => {
  it('never loses a write made by the other instance', async () => {
    const store = memoryPersist()
    const a = createApp({ persist: store, quiet: true })
    const b = createApp({ persist: store, quiet: true })
    const run = async (inst: ReturnType<typeof createApp>, path: string, body?: unknown, token?: string) => {
      const srv = createServer((req, res) => void inst.handler(req, res))
      await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
      const res = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
      const json = (await res.json()) as Record<string, unknown>
      await new Promise<void>((r) => srv.close(() => r()))
      return json
    }
    const pharmacy = (await run(a, '/api/login', { role: 'pharmacy', code: 'PH-DEMO-01', pin: '4321' })).token as string
    // token issued on A is accepted on B; both write; both writes survive
    await run(b, '/api/action/pharmacy.importStock', { rows: [{ name: 'Telma 40', batch: 'B-1', expiry: '2027-01-01', qty: 1 }] }, pharmacy)
    await run(a, '/api/action/pharmacy.importStock', { rows: [{ name: 'Telma 40', batch: 'A-1', expiry: '2027-01-01', qty: 1 }] }, pharmacy)
    // reads may be up to 1 s stale per instance; what is stored must contain both writes
    const stored = (await store.load()).snap
    expect(stored?.state.stock.map((x) => x.batch)).toEqual(expect.arrayContaining(['A-1', 'B-1']))
  })
})
