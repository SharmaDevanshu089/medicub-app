// Vercel Serverless Function entry for Medicub v2 (bundled by scripts/build-vercel.mjs).
// Data lives in the project's private Vercel Blob store.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createApp } from './app'
import { blobPersist } from './persist-blob'
import { memoryPersist } from './persist'

const app = createApp({
  persist: process.env.BLOB_READ_WRITE_TOKEN ? blobPersist() : memoryPersist(),
  adminKey: process.env.MEDICUB_ADMIN_KEY ?? 'medicub-v2-admin',
  origins: process.env.MEDICUB_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
})

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  app.log('warn', 'store.memory_only', { hint: 'Link a Vercel Blob store to persist data across invocations' })
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app.handler(req, res)
}
