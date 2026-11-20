// Logs (admin): the full hash-chained audit trail with search, filters, chain check and export,
// plus the server's recent structured logs.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fmtDateTime } from '../lib/time'
import { I, type IconName } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP } from '../patient/motion'
import type { AuditEntry } from '../store/audit'
import { fetchLogs, logout, notify, patientName, useStore, verifyAudit } from '../store/store'
import { Gate } from '../ui/AppFrame'
import { AdminSignIn } from './Console'

const APP = { fontFamily: 'var(--font-app)' }
type Cat = 'all' | 'access' | 'clinical' | 'pharmacy' | 'system'
const CATS: { k: Cat; label: string; icon: IconName }[] = [
  { k: 'all', label: 'All', icon: 'doc' },
  { k: 'access', label: 'Sign-in & sharing', icon: 'lock' },
  { k: 'clinical', label: 'Clinical', icon: 'pulse' },
  { k: 'pharmacy', label: 'Pharmacy', icon: 'store' },
  { k: 'system', label: 'System & demo', icon: 'shield' },
]
/** Which group an audit action belongs to (by its name). */
export function categoryOf(action: string): Exclude<Cat, 'all'> {
  if (/^(LOGIN|LOGOUT|ACCESS_DENIED|CONSENT|SHARE|RECORD_VIEWED|CHECK_IN|DOCTOR_(ACCEPTED|DECLINED)|LOCATION)/.test(action)) return 'access'
  if (/^(FLAG|RX_SIGNED|REMINDER|NOTE|REPORT|SECOND_OPINION|DOSE)/.test(action)) return 'clinical'
  if (/^(SCAN|SUBSTITUTION|DISPENSED|STOCK|RX_REDEEMED|PHARMACY|ESCALATION)/.test(action)) return 'pharmacy'
  return 'system'
}
const PAGE = 100

export default function Logs() {
  return (
    <Gate signIn={<AdminSignIn />}>
      <LogsApp />
    </Gate>
  )
}

function LogsApp() {
  const [tab, setTab] = useState<'audit' | 'server'>('audit')
  const bar = useRef<HTMLDivElement>(null)
  const ind = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const place = () => {
      const b = bar.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
      if (b && ind.current) gsap.to(ind.current, { x: b.offsetLeft, width: b.offsetWidth, duration: reducedMotion() ? 0 : 0.4, ease: 'power3.out' })
    }
    place()
    void document.fonts?.ready.then(place) // labels change width once the web font arrives
  }, [tab])
  return (
    <div className="min-h-screen bg-cream-50 text-ink" style={APP}>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-cream-200 bg-cream-50/90 px-5 py-3 backdrop-blur">
        <span className="grid size-10 place-items-center rounded-xl bg-ink text-white"><I n="doc" size={22} /></span>
        <span className="text-xl font-extrabold">Logs</span>
        <div ref={bar} role="tablist" className="relative ml-2 flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-cream-200">
          <span ref={ind} className="absolute top-1 left-0 h-10 rounded-xl bg-ink" aria-hidden="true" />
          {([['audit', 'Audit trail'], ['server', 'Server logs']] as const).map(([k, l]) => <Pressable key={k} data-tab={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative h-10 rounded-xl px-4 font-bold transition-colors ${tab === k ? 'text-white' : 'text-muted'}`}>{l}</Pressable>)}
        </div>
        <Pressable onClick={() => void logout()} aria-label="Sign out" className="ml-auto grid size-11 place-items-center rounded-xl bg-white ring-1 ring-cream-200"><I n="logout" /></Pressable>
      </header>
      <div className="mx-auto max-w-[1400px] p-5">{tab === 'audit' ? <Audit /> : <Server />}</div>
    </div>
  )
}

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const csvCell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`

function Audit() {
  const s = useStore()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Cat>('all')
  const [pid, setPid] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<number | null>(null)
  const [verdict, setVerdict] = useState<{ ok: boolean; brokenAt: number | null; rev: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    const c: Record<Cat, number> = { all: s.audit.length, access: 0, clinical: 0, pharmacy: 0, system: 0 }
    for (const e of s.audit) c[categoryOf(e.action)]++
    return c
  }, [s.audit])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...s.audit].reverse().filter((e) =>
      (cat === 'all' || categoryOf(e.action) === cat) &&
      (pid === 'all' || e.subject === pid) &&
      (!needle || `${e.actor} ${e.action} ${e.detail} ${e.subject ? patientName(e.subject) : ''}`.toLowerCase().includes(needle)))
  }, [s.audit, q, cat, pid])
  useGSAP(() => {
    if (!reducedMotion()) gsap.from('[data-row]', { y: 8, autoAlpha: 0, stagger: 0.012, duration: 0.25, clearProps: 'all' })
  }, { scope: list, dependencies: [cat, pid, q.length > 0] })

  const verify = async () => {
    setBusy(true)
    try {
      const r = await verifyAudit()
      setVerdict({ ok: r.ok, brokenAt: r.brokenAt, rev: s.rev })
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const exportCsv = () => download(`medicub-audit-${stamp}.csv`, 'text/csv', ['seq,time,actor,action,detail,patient,prev_hash,hash', ...rows.map((e) => [e.seq, new Date(e.ts).toISOString(), e.actor, e.action, e.detail, e.subject ? patientName(e.subject) : '', e.prevHash, e.hash].map(csvCell).join(','))].join('\n'))
  const exportJson = () => download(`medicub-audit-${stamp}.json`, 'application/json', JSON.stringify(rows, null, 2))
  const stale = verdict && verdict.rev !== s.rev

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-3xl bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"><I n="search" size={18} /></span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="Search actor, action, detail or patient" aria-label="Search audit trail" className="h-12 w-full rounded-xl border-[1.5px] border-line bg-cream-50 pr-3 pl-10" />
          </div>
          <select value={pid} onChange={(e) => { setPid(e.target.value); setLimit(PAGE) }} aria-label="Patient" className="h-12 rounded-xl border-[1.5px] border-line bg-white px-3">
            <option value="all">All patients</option>
            {s.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Pressable disabled={busy} onClick={() => void verify()} className="flex h-12 items-center gap-2 rounded-xl bg-sage-700 px-4 font-bold text-white"><I n="shield" size={18} /> Verify chain</Pressable>
          <Pressable onClick={exportCsv} className="h-12 rounded-xl px-4 font-bold ring-[1.5px] ring-line">Export CSV</Pressable>
          <Pressable onClick={exportJson} className="h-12 rounded-xl px-4 font-bold ring-[1.5px] ring-line">JSON</Pressable>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATS.map((c) => <Pressable key={c.k} aria-pressed={cat === c.k} onClick={() => { setCat(c.k); setLimit(PAGE) }} className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold ${cat === c.k ? 'bg-ink text-white' : 'bg-cream-100'}`}><I n={c.icon} size={16} />{c.label}<span className="opacity-60">{counts[c.k]}</span></Pressable>)}
        </div>
        {verdict && !stale && (
          <p className={`m-0 flex items-center gap-2 rounded-2xl p-3 font-bold ${verdict.ok ? 'bg-sage-50 text-sage-900' : 'bg-red-50 text-red-800'}`} role="status">
            <I n={verdict.ok ? 'check' : 'block'} stroke={2.6} />{verdict.ok ? `Chain intact — all ${s.audit.length} stored entries verify.` : `Tampering detected at entry #${verdict.brokenAt}. Every entry from there on can't be trusted.`}
          </p>
        )}
        {stale && <p className="m-0 text-sm text-muted">New entries since the last check — verify again.</p>}
      </section>

      <section className="rounded-3xl bg-white p-2 sm:p-4">
        <p className="m-0 px-2 pb-2 text-sm text-muted">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}{rows.length > limit ? ` · showing newest ${limit}` : ''}</p>
        <div ref={list} className="flex flex-col">
          {rows.length === 0 && <p className="m-0 p-6 text-center text-muted">No entries match.</p>}
          {rows.slice(0, limit).map((e) => <Row key={e.seq} e={e} open={open === e.seq} broken={!!verdict && !verdict.ok && !stale && verdict.brokenAt === e.seq} onToggle={() => setOpen(open === e.seq ? null : e.seq)} />)}
        </div>
        {rows.length > limit && <Pressable onClick={() => setLimit(limit + PAGE)} className="mx-auto mt-3 flex h-11 items-center rounded-xl px-5 font-bold ring-[1.5px] ring-line">Show {Math.min(PAGE, rows.length - limit)} more</Pressable>}
      </section>
    </div>
  )
}

const CAT_DOT: Record<Exclude<Cat, 'all'>, string> = { access: 'bg-sage-700', clinical: 'bg-brand-600', pharmacy: 'bg-amber-500', system: 'bg-subtle' }

function Row({ e, open, broken, onToggle }: { e: AuditEntry; open: boolean; broken: boolean; onToggle: () => void }) {
  return (
    <div data-row className={`rounded-xl ${broken ? 'bg-red-50 ring-2 ring-red-400' : open ? 'bg-cream-50' : ''}`}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-start gap-3 px-2 py-2.5 text-left hover:bg-cream-50" style={{ touchAction: 'manipulation' }}>
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${CAT_DOT[categoryOf(e.action)]}`} aria-hidden="true" />
        <span className="w-12 shrink-0 font-mono text-xs text-subtle">#{e.seq}</span>
        <span className="w-32 shrink-0 text-sm text-muted tabular-nums">{fmtDateTime(e.ts)}</span>
        <span className="min-w-0 flex-1">
          <b className="text-sm">{e.action.replaceAll('_', ' ')}</b>
          <span className="block truncate text-sm text-muted">{e.actor}{e.subject ? ` · ${patientName(e.subject)}` : ''} — {e.detail}</span>
        </span>
        <span className={`mt-1 shrink-0 text-subtle transition-transform ${open ? 'rotate-90' : ''}`}><I n="chevron" size={16} /></span>
      </button>
      {open && (
        <div className="grid gap-1 px-4 pb-3 text-sm sm:grid-cols-[120px_1fr]">
          <span className="text-subtle">Detail</span><span>{e.detail}</span>
          <span className="text-subtle">Actor</span><span>{e.actor}</span>
          {e.subject && <><span className="text-subtle">Patient</span><span>{patientName(e.subject)}</span></>}
          <span className="text-subtle">Time</span><span>{new Date(e.ts).toLocaleString()}</span>
          <span className="text-subtle">Hash</span><span className="font-mono text-xs break-all">{e.hash}</span>
          <span className="text-subtle">Previous</span><span className="font-mono text-xs break-all">{e.prevHash}</span>
        </div>
      )}
    </div>
  )
}

type Line = Awaited<ReturnType<typeof fetchLogs>>[number]

function Server() {
  const [lines, setLines] = useState<Line[]>([])
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all')
  const [q, setQ] = useState('')
  const [live, setLive] = useState(true)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!live) return
    const load = () => void fetchLogs(500).then((l) => { setLines(l); setErr('') }).catch((e: Error) => setErr(e.message))
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [live])
  const needle = q.trim().toLowerCase()
  const shown = lines.filter((l) => (level === 'all' ? l.level !== 'debug' || l.event !== 'http' : level === 'warn' ? l.level === 'warn' || l.level === 'error' : l.level === 'error') && (!needle || `${l.event} ${JSON.stringify(l.data)}`.toLowerCase().includes(needle)))
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'warn', 'error'] as const).map((l) => <Pressable key={l} aria-pressed={level === l} onClick={() => setLevel(l)} className={`h-10 rounded-full px-4 text-sm font-bold ${level === l ? 'bg-ink text-white' : 'bg-cream-100'}`}>{l === 'all' ? 'All' : l === 'warn' ? 'Warnings & errors' : 'Errors'}</Pressable>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" aria-label="Search server logs" className="h-10 min-w-[180px] flex-1 rounded-xl border-[1.5px] border-line bg-cream-50 px-3" />
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold ring-[1.5px] ring-line"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-sage-700" /> Live</label>
      </div>
      <p className="m-0 text-xs text-subtle">Recent lines from the server instance that answered (cloud functions keep only a short window). The complete history is in Vercel's runtime logs: <code>npx vercel logs medicub.vercel.app</code>.</p>
      {err && <p className="m-0 text-sm font-semibold text-red-700" role="alert">{err}</p>}
      <div className="max-h-[70vh] overflow-auto font-mono text-xs">
        {shown.length === 0 && <p className="m-0 p-6 text-center font-sans text-muted">No log lines here.</p>}
        {shown.map((l) => (
          <div key={l.id} className="flex gap-3 border-t border-divider py-1.5">
            <span className="shrink-0 text-subtle">{new Date(l.ts).toLocaleTimeString()}</span>
            <span className={`w-12 shrink-0 font-bold ${l.level === 'error' ? 'text-red-700' : l.level === 'warn' ? 'text-[#7A4E00]' : 'text-sage-800'}`}>{l.level}</span>
            <span className="shrink-0 font-bold">{l.event}</span>
            <span className="min-w-0 break-all text-muted">{l.data ? JSON.stringify(l.data) : ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
