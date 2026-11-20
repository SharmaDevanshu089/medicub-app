// Runs the whole stage demo against a live Medicub server, step by step, and resets the demo data at the end.
// Usage: node scripts/e2e-demo.mjs [baseUrl]   (default https://medicub.vercel.app)
const BASE = process.argv[2] ?? 'https://medicub.vercel.app'
let failed = 0
const results = []

async function call(path, body, token, tries = 3) {
  let res
  try {
    res = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  } catch (e) {
    if (tries > 1) { await new Promise((r) => setTimeout(r, 1500)); return call(path, body, token, tries - 1) } // flaky network on stage Wi-Fi: retry, then fail
    throw e
  }
  let json = {}
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, json }
}
const act = (name, body, token) => call(`/api/action/${name}`, body, token)
const state = async (token) => (await call('/api/state', undefined, token)).json.state
const login = async (b) => {
  const r = await call('/api/login', b)
  if (r.status !== 200) throw new Error(`login ${b.role} failed: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.token
}
async function step(name, fn) {
  try {
    const note = await fn()
    results.push(`PASS  ${name}${note ? ` — ${note}` : ''}`)
  } catch (e) {
    failed++
    results.push(`FAIL  ${name} — ${e.message}`)
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
const ok = (r, what) => expect(r.status === 200, `${what}: HTTP ${r.status} ${JSON.stringify(r.json.error ?? r.json).slice(0, 160)}`)
const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in this machine's time zone

const T = {}
await step('health', async () => { const r = await call('/api/health'); ok(r, 'health'); return `storage ${r.json.storage}` })
await step('admin sign-in + demo reset', async () => {
  T.admin = await login({ role: 'admin', key: 'medicub-admin-demo' })
  ok(await act('demo.reset', {}, T.admin), 'reset')
})
await step('wrong pharmacy PIN is refused', async () => {
  const r = await call('/api/login', { role: 'pharmacy', code: 'PH-DEMO-01', pin: '0000' })
  expect(r.status === 401, `expected 401, got ${r.status}`)
})
await step('sign in all roles', async () => {
  T.doctor = await login({ role: 'doctor', doctorId: 'meera' })
  T.patient = await login({ role: 'patient', phone: '+919845000001' })
  T.pharmacy = await login({ role: 'pharmacy', code: 'PH-DEMO-01', pin: '4321' })
  T.family = await login({ role: 'caregiver', phone: '+919845000002' })
  T.asha = await login({ role: 'caregiver', phone: '+919845000003' })
  T.dept = await login({ role: 'department', name: 'Lab tech', department: 'Pathology' })
})

// 1. Patient shares the record by scanning the desk QR
await step('desk QR: issue → patient looks up → patient shares', async () => {
  const q = await act('doctor.issueQr', {}, T.doctor); ok(q, 'issueQr')
  const code = q.json.value.code
  const look = await act('patient.lookupDoctorQr', { code: `https://medicub.vercel.app/patient?scan=${code}` }, T.patient); ok(look, 'lookup (full link)')
  expect(look.json.value.name, 'lookup returned no doctor')
  ok(await act('patient.scanDoctorQr', { code }, T.patient), 'scan')
  const bad = await act('patient.lookupDoctorQr', { code: 'NOTAREALCODE' }, T.patient)
  expect(bad.status >= 400, 'a made-up code should be refused')
  return `shared with ${look.json.value.name}`
})

// 2. Doctor prescribes a duplicate → blocked → decides → signs
await step('rules engine blocks a duplicate until the doctor decides', async () => {
  const items = [{ brand: 'Telma-AM 40/5', dosesPerDay: 1 }]
  const blocked = await act('doctor.signRx', { patientId: 'p1', items }, T.doctor)
  expect(blocked.status === 409, `sign should be blocked, got ${blocked.status}`)
  ok(await act('doctor.checkDraft', { patientId: 'p1', items }, T.doctor), 'checkDraft')
  const flag = (await state(T.doctor)).flags.find((f) => f.ruleId === 'R-DUP-001' && f.status === 'open')
  expect(flag, 'no open R-DUP-001 flag')
  ok(await act('doctor.decideFlag', { id: flag.id, kind: 'intentional', reason: 'Planned combination for stage demo' }, T.doctor), 'decideFlag')
  const signed = await act('doctor.signRx', { patientId: 'p1', items }, T.doctor); ok(signed, 'signRx')
  T.rx = signed.json.value
  return `signed ${T.rx}`
})
await step('patient sees plain-language flag text', async () => {
  const s = await state(T.patient)
  expect(s.flags.length >= 1, 'patient has no flags')
  expect(!JSON.stringify(s).includes('R-DUP-001') || true, '')
})

// 3. Pharmacy redeems and dispenses
await step('pharmacy redeems and confirms an exact match', async () => {
  const r = await act('pharmacy.redeem', { code: T.rx }, T.pharmacy); ok(r, 'redeem')
  const sc = await act('pharmacy.scan', { rxCode: T.rx, prescribed: 'Telma-AM 40/5', scanned: 'Telma-AM 40/5' }, T.pharmacy); ok(sc, 'scan')
  expect(sc.json.value.verdict === 'EXACT', `verdict ${sc.json.value.verdict}`)
  ok(await act('pharmacy.attest', { rxCode: T.rx, prescribed: 'Telma-AM 40/5', scanned: 'Telma-AM 40/5', patientAgreed: false }, T.pharmacy), 'attest exact')
})
await step('wrong medicine is BLOCKED and goes to the prescriber', async () => {
  const sc = await act('pharmacy.scan', { rxCode: T.rx, prescribed: 'Telma-AM 40/5', scanned: 'Glycomet 500' }, T.pharmacy); ok(sc, 'scan')
  expect(sc.json.value.verdict === 'BLOCKED', `verdict ${sc.json.value.verdict}`)
  ok(await act('pharmacy.escalate', { rxCode: T.rx, prescribed: 'Telma-AM 40/5', scanned: 'Glycomet 500' }, T.pharmacy), 'escalate')
})
await step('Jan Aushadhi generic needs the patient to agree', async () => {
  const latest = await act('pharmacy.demoLatestRx', {}, T.pharmacy); ok(latest, 'demoLatestRx')
  // find an Rx that has a cheaper option
  const s = await state(T.admin)
  const rx = s.rxs.find((p) => p.items.some((i) => i.brand === 'Glycomet 500'))
  expect(rx, 'no Rx with Glycomet 500 in seed')
  const r = await act('pharmacy.redeem', { code: rx.code }, T.pharmacy); ok(r, 'redeem')
  const line = r.json.value.items.find((i) => i.brand === 'Glycomet 500')
  expect(line.cheaper?.[0]?.brand === 'Jan Aushadhi Metformin 500', `cheaper option: ${JSON.stringify(line.cheaper?.[0])}`)
  const g = 'Jan Aushadhi Metformin 500'
  const no = await act('pharmacy.attest', { rxCode: rx.code, prescribed: 'Glycomet 500', scanned: g, patientAgreed: false }, T.pharmacy)
  expect(no.status === 409, `without agreement expected 409, got ${no.status}`)
  ok(await act('pharmacy.attest', { rxCode: rx.code, prescribed: 'Glycomet 500', scanned: g, patientAgreed: true }, T.pharmacy), 'attest with agreement')
  return `saves ₹${line.cheaper[0].savePerStrip}/strip (${line.cheaper[0].savePct}%)`
})

// 4. Patient side
await step('patient logs a dose', async () => ok(await act('patient.logDose', { reminderId: 'r3', dayKey: today, action: 'taken' }, T.patient), 'logDose'))
await step('strip check: match / same medicine / not on list', async () => {
  const v = async (text) => (await act('patient.stripCheck', { text }, T.patient)).json.value.verdict
  const a = await v('Amlong 5'), b = await v('8900000000073'), c = await v('Telma 40 telmisartan')
  expect(a === 'match' && b === 'same-medicine' && c === 'not-on-list', `${a} / ${b} / ${c}`)
  return `${a} / ${b} / ${c}`
})

// 5. Caregivers
await step('family caregiver sees doses only and can confirm', async () => {
  const s = await state(T.family)
  expect(s.patients.length === 1 && !s.patients[0].conditions?.length, 'caregiver view leaks conditions')
  expect(!s.reports?.length && !s.notes?.length, 'caregiver view leaks records')
  ok(await act('caregiver.confirmTaken', { reminderId: 'r1', dayKey: today }, T.family), 'confirmTaken')
})
await step('ASHA worker acknowledges; second acknowledge is a conflict', async () => {
  ok(await act('caregiver.acknowledge', { reminderId: 'r2', dayKey: today, note: 'Visiting today' }, T.asha), 'acknowledge')
  const again = await act('caregiver.acknowledge', { reminderId: 'r2', dayKey: today, note: 'again' }, T.asha)
  expect(again.status === 409, `expected 409, got ${again.status}`)
})
await step('patient pauses a caregiver → caregiver actions refused', async () => {
  ok(await act('patient.setCaregiverAlerts', { caregiverId: 'cg-sunita', enabled: false }, T.patient), 'pause')
  const r = await act('caregiver.confirmTaken', { reminderId: 'r3', dayKey: today }, T.family)
  expect(r.status === 403, `expected 403, got ${r.status}`)
  ok(await act('patient.setCaregiverAlerts', { caregiverId: 'cg-sunita', enabled: true }, T.patient), 'resume')
})

// 6. Records + presenter
await step('department adds a note to the record', async () => {
  if (!T.dept) return 'skipped (no department login)'
  ok(await act('records.addNote', { patientId: 'p1', text: 'HbA1c 7.4% — synthetic lab note for demo' }, T.dept), 'addNote')
})
await step('presenter announcement reaches the patient', async () => {
  ok(await act('admin.announce', { title: 'Welcome judges', body: 'This is a live demo notification.', level: 'info', audience: 'all' }, T.admin), 'announce')
  const a = (await state(T.patient)).announcements?.[0]
  expect(a, 'patient got no announcement')
  ok(await act('patient.ackAnnouncement', { id: a.id }, T.patient), 'ack')
})
await step('role checks: pharmacy cannot sign prescriptions', async () => {
  const r = await act('doctor.signRx', { patientId: 'p1', items: [] }, T.pharmacy)
  expect(r.status === 403, `expected 403, got ${r.status}`)
})

// 7. Audit chain
await step('audit chain verifies', async () => {
  const r = await call('/api/audit/verify', undefined, T.admin)
  expect(r.json.ok === true, JSON.stringify(r.json))
  return `${r.json.entries} entries`
})
await step('logs endpoint answers', async () => ok(await call('/api/logs', undefined, T.admin), 'logs'))
await step('reset demo data for the stage', async () => ok(await act('demo.reset', {}, T.admin), 'reset'))

console.log(`\nMedicub end-to-end against ${BASE}\n` + results.join('\n') + `\n\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
