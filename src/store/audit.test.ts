import { describe, expect, it } from 'vitest'
import { makeEntry, verifyChain, type AuditEntry } from './audit'

async function chain(n: number) {
  const out: AuditEntry[] = []
  for (let i = 0; i < n; i++) out.push(await makeEntry(out.at(-1), 'tester', `act${i}`, `detail ${i}`, 1000 + i))
  return out
}

describe('audit hash chain', () => {
  it('verifies an intact chain', async () => {
    expect(await verifyChain(await chain(5))).toBeNull()
  })
  it('detects an edited entry', async () => {
    const c = await chain(5)
    c[2] = { ...c[2]!, detail: 'tampered' }
    expect(await verifyChain(c)).toBe(3)
  })
  it('detects a removed entry', async () => {
    const c = await chain(5)
    c.splice(1, 1)
    expect(await verifyChain(c)).toBe(3)
  })
})
