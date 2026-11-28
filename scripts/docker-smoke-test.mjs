// End-to-end smoke & integration test executed against the running Medicub v2 Docker Compose container.
// Verifies: main UI serving on mapped port, SPA routes, zero-key startup & notice, API health, and full Scribe flow.

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')

function assert(cond, msg) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`)
    process.exit(1)
  }
  console.log(`[PASS] ${msg}`)
}

async function waitForReady(timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return
    } catch {
      // Container still booting
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Timed out waiting for ${BASE}/api/health after ${timeoutMs}ms`)
}

async function apiJson(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function main() {
  console.log(`[docker-smoke-test] Waiting for container at ${BASE}...`)
  await waitForReady()

  // 1. Main UI & SPA routes must return 200 text/html (not a 404 or default server page)
  for (const route of ['/', '/doctor', '/patient', '/qr']) {
    const res = await fetch(`${BASE}${route}`)
    const ct = res.headers.get('content-type') ?? ''
    const html = await res.text()
    assert(res.status === 200 && ct.includes('text/html'), `GET ${route} returned 200 text/html`)
    assert(html.includes('<div id="root">'), `GET ${route} served built Medicub v2 React bundle`)
  }

  // 2. Unknown API endpoints must still return 404 JSON with descriptive error
  const notFound = await apiJson('/api/does-not-exist')
  assert(notFound.status === 404 && notFound.data?.error?.code === 'NOT_FOUND', 'Unknown /api route returns 404 JSON')

  // 3. Health & Wispr Flow zero-key status check
  const health = await apiJson('/api/health')
  assert(health.status === 200 && health.data?.ok === true, 'GET /api/health returns ok: true')
  assert(String(health.data?.storage ?? '').startsWith('sqlite:'), `Persistent SQLite storage active (${health.data?.storage})`)

  const wispr = await apiJson('/api/wispr/status')
  assert(wispr.status === 200 && typeof wispr.data?.modeMessage === 'string', 'GET /api/wispr/status returns modeMessage')
  if (!wispr.data.wisprConfigured) {
    assert(wispr.data.modeMessage.toLowerCase().includes('not set'), 'Zero-key fallback notice mentions key is not set')
  }

  // 4. End-to-end Consultation Scribe workflow inside Docker container
  const docLogin = await apiJson('/api/login', { role: 'doctor', doctorId: 'meera' })
  assert(docLogin.status === 200 && docLogin.data?.token, 'Doctor sign-in succeeds')
  const docToken = docLogin.data.token

  const patLogin = await apiJson('/api/login', { role: 'patient', phone: '+91 98450 00001' })
  assert(patLogin.status === 200 && patLogin.data?.token, 'Patient sign-in succeeds')
  const patToken = patLogin.data.token

  const phLogin = await apiJson('/api/login', { role: 'pharmacy', code: 'PH-01', pin: '1234' })
  assert(phLogin.status === 200 && phLogin.data?.token, 'Pharmacy sign-in succeeds')
  const phToken = phLogin.data.token

  const qrRes = await apiJson('/api/action/doctor.issueQr', {}, docToken)
  assert(qrRes.status === 200 && qrRes.data?.value?.code, 'Doctor issued rotating desk QR')

  const scanRes = await apiJson('/api/action/patient.scanDoctorQr', { code: qrRes.data.value.code }, patToken)
  assert(scanRes.status === 200, 'Patient scanned clinic desk QR')

  const startRes = await apiJson('/api/action/consultation.start', { doctorId: 'meera' }, patToken)
  assert(startRes.status === 200 && startRes.data?.value?.sessionId, 'Consultation audio session started')
  const sessionId = startRes.data.value.sessionId

  const chunk = Buffer.from('docker test clinical audio chunk').toString('base64')
  const upRes = await apiJson('/api/consultation/upload-chunk', { sessionId, chunk, index: 0 }, patToken)
  assert(upRes.status === 200 && upRes.data?.received === true, 'Uploaded consultation audio chunk')

  const stopRes = await apiJson('/api/action/consultation.stop', { sessionId }, patToken)
  assert(stopRes.status === 200, 'Stopped consultation session')

  const procRes = await apiJson('/api/consultation/process', { sessionId }, patToken)
  assert(procRes.status === 200 && procRes.data?.cardId && procRes.data?.summary?.chiefComplaint, 'Processed transcript & generated ConsultationCard')

  const patState = await apiJson('/api/state', undefined, patToken)
  const card = patState.data?.state?.consultationCards?.find((c) => c.id === procRes.data.cardId)
  assert(Boolean(card), 'ConsultationCard persisted in Patient state')

  const phState = await apiJson('/api/state', undefined, phToken)
  assert(Array.isArray(phState.data?.state?.consultationCards) && phState.data.state.consultationCards.length === 0, 'Pharmacy state strictly isolated from ConsultationCards')

  console.log('[docker-smoke-test] ALL DOCKER E2E CHECKS PASSED!')
}

main().catch((err) => {
  console.error('[docker-smoke-test] FAILED:', err)
  process.exit(1)
})
