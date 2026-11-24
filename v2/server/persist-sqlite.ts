// Local persistence on Node's built-in SQLite (npm run server). The whole snapshot is one row with a version counter.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Persist, Snapshot } from './persist'

export function sqlitePersist(file: string): Persist {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL);`)
  const getRow = db.prepare('SELECT json, version FROM snapshot WHERE id = 1')
  const getVersion = db.prepare('SELECT version FROM snapshot WHERE id = 1')
  const insert = db.prepare('INSERT INTO snapshot (id, json, version, updated_at) VALUES (1, ?, 1, ?)')
  const update = db.prepare('UPDATE snapshot SET json = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ?')
  const current = () => (getVersion.get() as { version: number } | undefined)?.version ?? null

  return {
    name: `sqlite:${file}`,
    async load() {
      const row = getRow.get() as { json: string; version: number } | undefined
      return row ? { snap: JSON.parse(row.json) as Snapshot, version: String(row.version) } : { snap: null, version: null }
    },
    async save(snap, version) {
      const json = JSON.stringify(snap)
      if (version === null) {
        if (current() !== null) return null
        insert.run(json, Date.now())
        return '1'
      }
      const r = update.run(json, Date.now(), Number(version))
      return r.changes === 1 ? String(Number(version) + 1) : null
    },
    async changed(version) {
      const v = current()
      return (v === null ? null : String(v)) !== version
    },
  }
}
