// Structured logs: one JSON line per event on stdout (Vercel runtime logs pick these up),
// plus the most recent lines in memory for the ops console. shortcut: per-instance ring buffer; use a log drain for history.
export type Level = 'debug' | 'info' | 'warn' | 'error'
export interface LogLine { id: number; ts: number; level: Level; event: string; data: Record<string, unknown> | null }

export function makeLogger({ quiet = false } = {}) {
  const ring: LogLine[] = []
  let id = 0
  const log = (level: Level, event: string, data?: Record<string, unknown>) => {
    const ts = Date.now()
    ring.push({ id: ++id, ts, level, event, data: data ?? null })
    if (ring.length > 2000) ring.splice(0, ring.length - 2000)
    if (quiet && level !== 'error') return
    if (level === 'debug' && event === 'http') return // request lines stay in the ring, not the console
    const line = JSON.stringify({ ts: new Date(ts).toISOString(), level, event, ...data })
    if (level === 'error') console.error(line)
    else console.log(line)
  }
  log.recent = (n: number) => ring.slice(-n).reverse()
  return log
}

export type Logger = ReturnType<typeof makeLogger>
