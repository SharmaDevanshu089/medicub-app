// Vercel Function entry (bundled by scripts/build-vercel.mjs). Data lives in the project's private Vercel Blob store.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createApp } from './app'
import { blobPersist } from './persist-blob'
import { memoryPersist } from './persist'

const app = createApp({
  // Without a linked Blob store the API still runs, but data resets whenever the function restarts.
  persist: process.env.BLOB_READ_WRITE_TOKEN ? blobPersist() : memoryPersist(),
  adminKey: process.env.MEDICUB_ADMIN_KEY,
  origins: process.env.MEDICUB_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
})
if (!process.env.BLOB_READ_WRITE_TOKEN) app.log('warn', 'store.memory_only', { hint: 'Link a Vercel Blob store to persist data' })

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app.handler(req, res)
}
