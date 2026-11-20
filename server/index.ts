// Local server: `npm run server`. Env: PORT, MEDICUB_DB, MEDICUB_ADMIN_KEY, MEDICUB_ORIGINS (comma list).
import { createServer } from 'node:http'
import { createApp } from './app'
import { sqlitePersist } from './persist-sqlite'

const port = Number(process.env.PORT ?? 8787)
const app = createApp({
  persist: sqlitePersist(process.env.MEDICUB_DB ?? 'server/data/medicub.db'),
  adminKey: process.env.MEDICUB_ADMIN_KEY,
  origins: process.env.MEDICUB_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
})
const server = createServer((req, res) => void app.handler(req, res))
server.listen(port, '0.0.0.0', () => app.log('info', 'server.start', { port, pid: process.pid }))

process.on('unhandledRejection', (e) => app.log('error', 'process.unhandled_rejection', { message: String(e), stack: (e as Error)?.stack }))
process.on('uncaughtException', (e) => app.log('error', 'process.uncaught_exception', { message: e.message, stack: e.stack }))
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    app.log('info', 'server.stop', { signal: sig })
    server.close(() => void app.close().then(() => process.exit(0)))
  })
