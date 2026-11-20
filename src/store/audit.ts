// Append-only audit log with a SHA-256 hash chain (Web Crypto: browser and Node).
export interface AuditEntry {
  seq: number
  ts: number
  actor: string
  action: string
  detail: string
  /** Patient the event is about, when there is one — lets each role see only its own trail. */
  subject?: string
  prevHash: string
  hash: string
}

export const GENESIS = '0'.repeat(64)

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const payload = (e: Omit<AuditEntry, 'hash'>) => JSON.stringify([e.seq, e.ts, e.actor, e.action, e.detail, e.subject ?? null, e.prevHash])

export async function makeEntry(prev: AuditEntry | undefined, actor: string, action: string, detail: string, ts: number, subject?: string): Promise<AuditEntry> {
  const base = { seq: (prev?.seq ?? 0) + 1, ts, actor, action, detail, ...(subject ? { subject } : {}), prevHash: prev?.hash ?? GENESIS }
  return { ...base, hash: await sha256(payload(base)) }
}

/** Returns null if intact, else the seq of the first broken entry. */
export async function verifyChain(entries: AuditEntry[]): Promise<number | null> {
  let prev = GENESIS
  for (const e of entries) {
    if (e.prevHash !== prev || (await sha256(payload(e))) !== e.hash) return e.seq
    prev = e.hash
  }
  return null
}
