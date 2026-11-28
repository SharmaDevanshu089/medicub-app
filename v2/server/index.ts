// Local / Docker v2 server: `npm run v2:server`. Env: PORT, HOST, MEDICUB_DB, MEDICUB_ADMIN_KEY, MEDICUB_ORIGINS, MEDICUB_STATIC_DIR.
import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { consultationExtractor } from '../src/ai/extraction'
import { WISPR_MEDICAL_DICTIONARY, wisprSTT } from '../src/ai/wispr'
import { createApp } from './app'
import { sqlitePersist } from './persist-sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.MEDICUB_DB ?? path.join(__dirname, 'data', 'medicub.db')
const defaultStaticDir = path.resolve(__dirname, '..', 'dist')
const staticDir = process.env.MEDICUB_STATIC_DIR ?? (fs.existsSync(defaultStaticDir) ? defaultStaticDir : undefined)

const port = Number(process.env.PORT ?? 8788)
const host = process.env.HOST ?? '0.0.0.0'

const app = createApp({
  persist: sqlitePersist(dbPath),
  adminKey: process.env.MEDICUB_ADMIN_KEY ?? 'medicub-v2-admin',
  origins: process.env.MEDICUB_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
  staticDir,
})

const server = createServer((req, res) => void app.handler(req, res))

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(`\n[MEDICUB V2 ERROR] HTTP server failed to bind on ${host}:${port}`)
  console.error(`  Code   : ${err.code ?? 'UNKNOWN'}`)
  console.error(`  Message: ${err.message}`)
  if (err.code === 'EADDRINUSE') {
    console.error(`  Hint   : Port ${port} is already in use. Stop the other process or set PORT=<free_port>.`)
  }
  console.error(err.stack ?? err)
  process.exit(1)
})

server.listen(port, host, () => {
  const base = `http://localhost:${port}`
  const wisprOk = wisprSTT.isConfigured()
  const llmOk = consultationExtractor.isConfigured()

  app.log('info', 'server.start', {
    port,
    host,
    pid: process.pid,
    dbPath,
    staticDir: staticDir ?? null,
    wisprConfigured: wisprOk,
    llmConfigured: llmOk,
  })

  console.log('')
  console.log('========================================================================')
  console.log(`  MEDICUB v2 — AMBIENT CONSULTATION SCRIBE (Running on ${base})`)
  console.log('========================================================================')
  console.log('  [IMPORTANT INFO & STATUS]')
  console.log('    * Scope         : Everything active is built in v2/ (root is legacy only)')
  console.log('    * Web Showcase  : This Web/Docker build is an interactive showcase preview;')
  console.log('                      full native Android/Desktop frameworks are under development')
  console.log(`    * Database      : ${dbPath}`)
  console.log(
    staticDir
      ? `    * Static Web UI : Serving built UI from ${staticDir}`
      : '    * Static Web UI : WARNING - v2/dist not found (run "npm run build" first)',
  )
  console.log(
    wisprOk
      ? `    * Wispr Flow    : API Key Configured (${WISPR_MEDICAL_DICTIONARY.length} medical terms loaded)`
      : '    * Wispr Flow    : API Key NOT SET -> Using built-in offline clinical fallback',
  )
  console.log(
    llmOk
      ? '    * Clinical LLM  : API Key Configured'
      : '    * Clinical LLM  : API Key NOT SET -> Using built-in deterministic fallback',
  )
  console.log('')
  console.log('  [FIRST-TIME GUIDE: PATIENT & DOCTOR SIDES]')
  console.log(`    1) Patient Mobile App : ${base}/patient`)
  console.log('       - Sign in  : Click "Continue as Ramesh Kumar" (+91 98450 00001)')
  console.log('       - Try flow : Me -> Scan QR (enter code from /qr, hold to share) ->')
  console.log('                    Tap "Start Audio Scribing" -> Pause/Stop on Recording Bar')
  console.log('                    -> Check generated Consultation Card in Records -> Visits')
  console.log('')
  console.log(`    2) Doctor Console     : ${base}/doctor`)
  console.log('       - Sign in  : Click "Dr Meera Iyer" (Cardiology) or meera@medicub.in')
  console.log('       - Try flow : Open /qr on a desk tab -> click arrival toast for Ramesh')
  console.log('                    -> Co-control live Recording Bar -> View "Consultations"')
  console.log('                    & "Adherence & vitals" tabs inside Patient 360')
  console.log('')
  console.log('  [OTHER PAGES & DIAGNOSTIC URLS]')
  console.log(`    * Main Launcher       : ${base}/`)
  console.log(`    * Clinic Desk QR      : ${base}/qr`)
  console.log(`    * Caregiver Portal    : ${base}/caregiver    (Phone: +91 98450 00002)`)
  console.log(`    * Pharmacy Panel      : ${base}/pharmacy     (Code: PH-DEMO-01, PIN: 4321)`)
  console.log(`    * Department Desk     : ${base}/department`)
  console.log(`    * Doctor Onboarding   : ${base}/onboard`)
  console.log(`    * Watch Companion     : ${base}/watch`)
  console.log(`    * API Health Check    : ${base}/api/health`)
  console.log(`    * Wispr Flow Status   : ${base}/api/wispr/status`)
  console.log('========================================================================')
  console.log('')
})

process.on('unhandledRejection', (e) => {
  console.error('[MEDICUB V2 UNHANDLED REJECTION]', e)
  app.log('error', 'process.unhandled_rejection', { message: String(e), stack: (e as Error)?.stack })
})

process.on('uncaughtException', (e) => {
  console.error('[MEDICUB V2 UNCAUGHT EXCEPTION]', e)
  app.log('error', 'process.uncaught_exception', { message: e.message, stack: e.stack })
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`\n[MEDICUB V2] Received ${sig}, shutting down cleanly...`)
    app.log('info', 'server.stop', { signal: sig })
    server.close(() => void app.close().then(() => process.exit(0)))
  })
}
