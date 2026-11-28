// Local / Docker v2 server: `npm run server`. Env: PORT, MEDICUB_DB, MEDICUB_ADMIN_KEY, MEDICUB_ORIGINS, MEDICUB_STATIC_DIR.
import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'
import { sqlitePersist } from './persist-sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultDb = path.join(__dirname, 'data', 'medicub.db')
const defaultStaticDir = path.resolve(__dirname, '..', 'dist')
const staticDir = process.env.MEDICUB_STATIC_DIR ?? (fs.existsSync(defaultStaticDir) ? defaultStaticDir : undefined)

const port = Number(process.env.PORT ?? 8788)
const app = createApp({
  persist: sqlitePersist(process.env.MEDICUB_DB ?? defaultDb),
  adminKey: process.env.MEDICUB_ADMIN_KEY ?? 'medicub-v2-admin',
  origins: process.env.MEDICUB_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
  staticDir,
})
const server = createServer((req, res) => void app.handler(req, res))
server.listen(port, '0.0.0.0', () => app.log('info', 'server.start', { port, pid: process.pid, staticDir: staticDir ?? null }))

process.on('unhandledRejection', (e) => app.log('error', 'process.unhandled_rejection', { message: String(e), stack: (e as Error)?.stack }))
process.on('uncaughtException', (e) => app.log('error', 'process.uncaught_exception', { message: e.message, stack: e.stack }))
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    app.log('info', 'server.stop', { signal: sig })
    server.close(() => void app.close().then(() => process.exit(0)))
  })
