// Ops console (internal): server health, counts, audit log + chain verification, structured logs, demo controls.
import { useEffect, useRef, useState } from 'react'
import { fmtDateTime, useNow } from '../lib/time'
import { I } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP, useStaggerIn } from '../patient/motion'
import { DEMO_LOGINS } from '../store/seed'
import { fetchLogs, health, login, logout, notify, resetDemo, setClockOffset, tamper, useStore, verifyAudit } from '../store/store'
import { Gate } from '../ui/AppFrame'

const APP = { fontFamily: 'var(--font-app)' }

export default function Console() {
  return (
    <Gate signIn={<AdminSignIn />}>
      <ConsoleApp />
    </Gate>
  )
}

export function AdminSignIn() {
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const card = useRef<HTMLDivElement>(null)
  useStaggerIn(card, 'admin')
  const go = (k: string) => login({ key: k }).catch((e: Error) => setErr(e.message))
  return (
    <div className="grid min-h-screen place-items-center bg-cream-50 p-5 text-ink" style={APP}>
      <div ref={card} className="flex w-full max-w-md flex-col gap-4 rounded-[28px] bg-white p-8">
        <h1 data-anim className="m-0 text-[28px] font-extrabold">Medicub ops console</h1>
        <p data-anim className="m-0 text-muted">Internal tool. Not part of any user-facing app.</p>
        <label data-anim className="flex flex-col gap-1.5 font-semibold text-muted">Admin key<input type="password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void go(key)} className="h-14 rounded-2xl border-[1.5px] border-line px-4 text-lg text-ink" autoComplete="current-password" /></label>
        {err && <p className="m-0 font-semibold text-red-700" role="alert">{err}</p>}
        <Pressable data-anim disabled={!key} onClick={() => void go(key)} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">Sign in</Pressable>
        <Pressable data-anim onClick={() => void go(DEMO_LOGINS.adminKey)} className="h-12 rounded-2xl bg-cream-100 font-bold">Demo admin</Pressable>
      </div>
    </div>
  )
}

type Log = Awaited<ReturnType<typeof fetchLogs>>[number]

function ConsoleApp() {
  const s = useStore()
  const t = useNow()
  const [hp, setHp] = useState<Awaited<ReturnType<typeof health>> | null>(null)
  const [verdict, setVerdict] = useState<{ ok: boolean; brokenAt: number | null; rev: number } | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all')
  const [busy, setBusy] = useState(false)
  const badge = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = () => {
      void health().then(setHp).catch(() => setHp(null))
      void fetchLogs(150).then(setLogs).catch(() => undefined)
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])
  useGSAP(() => {
    if (verdict && !reducedMotion()) gsap.from(badge.current, { scale: 0.6, autoAlpha: 0, duration: 0.5, ease: 'back.out(2)' })
  }, { dependencies: [verdict?.rev, verdict?.ok] })

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
  const stale = verdict && verdict.rev !== s.rev
  const counts: [string, number][] = [
    ['Verified doctors', s.doctors.filter((d) => d.verified).length],
    ['Patients', s.patients.length],
    ['Prescriptions', s.rxs.length],
    ['Open flags', s.flags.filter((f) => f.status === 'open').length],
    ['Reports & X-rays', s.reports.length],
    ['Live consents', s.consents.filter((c) => !c.revoked && c.expiresAt > t).length],
    ['Audit entries', s.audit.length],
  ]
  const shown = logs.filter((l) => level === 'all' || (level === 'warn' ? l.level !== 'info' && l.level !== 'debug' : l.level === 'error')).filter((l) => l.event !== 'http' || l.level !== 'debug')

  return (
    <div className="min-h-screen bg-cream-50 text-ink" style={APP}>
      <header className="flex flex-wrap items-center gap-3 border-b border-cream-200 px-5 py-3">
        <span className="grid size-10 place-items-center rounded-xl bg-ink text-white"><I n="shield" size={22} /></span>
        <span className="text-xl font-extrabold">Ops console</span>
        <span className={`ml-2 flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${hp ? 'bg-sage-100 text-sage-900' : 'bg-red-100 text-red-800'}`}><span className={`size-2 rounded-full ${hp ? 'bg-sage-700' : 'bg-red-600'}`} />{hp ? `Server up · ${hp.storage}` : 'Server unreachable'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Pressable onClick={() => setClockOffset(0)} className="h-11 rounded-xl bg-white px-3 text-sm font-bold ring-1 ring-cream-200">Clock: {s.clockOffsetMs ? 'shifted → reset' : 'real time'}</Pressable>
          <Pressable onClick={() => { if (confirm('Reset ALL demo data to seed? Everyone else will be signed out.')) void resetDemo().catch(() => undefined) }} className="h-11 rounded-xl bg-white px-3 text-sm font-bold text-red-700 ring-1 ring-red-200">Reset demo</Pressable>
          <Pressable onClick={() => void logout()} aria-label="Sign out" className="grid size-11 place-items-center rounded-xl bg-white ring-1 ring-cream-200"><I n="logout" /></Pressable>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-5">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map(([k, v]) => <div key={k} className="rounded-3xl bg-white p-4"><div className="text-3xl font-black tabular-nums">{v}</div><div className="text-sm font-semibold text-muted">{k}</div></div>)}
        </section>
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 flex-1 text-xl font-extrabold">Audit log</h2>
            {verdict && !stale && (
              <div ref={badge} className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-bold ${verdict.ok ? 'bg-sage-100 text-sage-900' : 'bg-red-100 text-red-800'}`}>
                <I n={verdict.ok ? 'check' : 'block'} size={18} stroke={2.6} />{verdict.ok ? `Chain verified (${s.audit.length} entries)` : `Broken at entry #${verdict.brokenAt}`}
              </div>
            )}
            {stale && <span className="text-sm font-semibold text-muted">Log changed — verify again</span>}
            <Pressable disabled={busy} onClick={() => void verify()} className="h-11 rounded-xl bg-sage-700 px-4 font-bold text-white">Verify chain</Pressable>
            <Pressable onClick={tamper} title="Edits one stored entry without re-hashing (demo)" className="h-11 rounded-xl bg-red-700 px-4 font-bold text-white">Tamper (demo)</Pressable>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-white text-subtle"><tr><th className="py-2">#</th><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th><th>Hash</th></tr></thead>
              <tbody>
                {s.audit.slice(-60).reverse().map((e) => (
                  <tr key={e.seq} className={`border-t border-divider align-top ${verdict && !verdict.ok && !stale && verdict.brokenAt === e.seq ? 'bg-red-50' : ''}`}>
                    <td className="py-2 font-mono">{e.seq}</td><td className="pr-2 whitespace-nowrap">{fmtDateTime(e.ts)}</td><td className="pr-2">{e.actor}</td><td className="pr-2 font-bold">{e.action}</td><td className="pr-2">{e.detail}</td><td className="font-mono text-xs text-subtle" title={e.hash}>{e.hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 flex-1 text-xl font-extrabold">Server logs</h2>
            {(['all', 'warn', 'error'] as const).map((l) => <Pressable key={l} onClick={() => setLevel(l)} aria-pressed={level === l} className={`h-10 rounded-full px-4 text-sm font-bold ${level === l ? 'bg-ink text-white' : 'ring-[1.5px] ring-line'}`}>{l === 'all' ? 'All' : l === 'warn' ? 'Warnings+' : 'Errors'}</Pressable>)}
          </div>
          <div className="max-h-[360px] overflow-auto font-mono text-xs">
            {shown.length === 0 && <p className="m-0 font-sans text-muted">No log lines at this level.</p>}
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
      </div>
    </div>
  )
}
