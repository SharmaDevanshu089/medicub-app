// Where the server keeps its data. One snapshot (state + audit + sessions), written with optimistic
// concurrency: `save` only succeeds if nobody else wrote since our `load` (version check), so two
// serverless instances can never silently overwrite each other.
import type { Session } from '../src/core/session'
import type { State } from '../src/store/types'

export interface Snapshot {
  state: State
  sessions: Record<string, Session>
}

export interface Persist {
  name: string
  load(): Promise<{ snap: Snapshot | null; version: string | null }>
  /** Writes if the stored version still equals `version`. Returns the new version, or null on a conflict. */
  save(snap: Snapshot, version: string | null): Promise<string | null>
  /** Cheap freshness check: true when the stored version differs from `version`. */
  changed(version: string | null): Promise<boolean>
  close?(): Promise<void> | void
}

/** In-memory store (tests, and a fallback if nothing else is configured). */
export function memoryPersist(): Persist {
  let data: string | null = null
  let v = 0
  return {
    name: 'memory',
    async load() {
      return { snap: data ? (JSON.parse(data) as Snapshot) : null, version: data ? String(v) : null }
    },
    async save(snap, version) {
      if ((data ? String(v) : null) !== version) return null
      data = JSON.stringify(snap)
      return String(++v)
    },
    async changed(version) {
      return (data ? String(v) : null) !== version
    },
  }
}
