// Pharmacy web panel: redeem → scan → verdict → attest / send to prescriber, inventory, escalations, offline queue.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CATALOG } from '../engine/catalog'
import { checkSubstitution, describe, normalise, type SubResult } from '../engine/rules'
import { parseStockCsv } from '../lib/csv'
import { fmtDateTime, useNow } from '../lib/time'
import { I, Pill } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP, useStaggerIn } from '../patient/motion'
import { PHARMACY } from '../store/initial-state'
import {
  attest, doctorName, escalate, importStock, login, logout, notify, redeemRx, reportConnectivity, scanPack, useStore, type RedeemedRx,
} from '../store/store'
import type { State } from '../store/types'
import { Gate } from '../ui/AppFrame'

const APP = { fontFamily: 'var(--font-app)' }
const input = 'h-14 rounded-2xl border-[1.5px] border-line bg-white px-4 text-lg'

// ---------- offline queue (kept on this device until the server is reachable) ----------
interface Queued { id: string; kind: 'attest' | 'escalate'; rxCode: string; prescribed: string; scanned: string; at: number; patientAgreed?: boolean }
const QKEY = 'medicub:pharmacy-queue'
const RXKEY = 'medicub:pharmacy-rx-cache'
const readJson = <T,>(k: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T | null) ?? fallback
  } catch {
    return fallback
  }
}
const writeJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    notify('This device could not save offline work. Stay online to avoid losing it.', 'error')
  }
}

export default function Pharmacy() {
  return (
    <Gate signIn={<SignIn />}>
      <PharmacyApp />
    </Gate>
  )
}

function SignIn() {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  useStaggerIn(card, 'pharmacy-login')
  const go = (c = code, p = pin) => {
    setBusy(true)
    setErr('')
    login({ code: c, pin: p }).catch((e: Error) => {
      setErr(e.message)
      setBusy(false)
      if (!reducedMotion()) gsap.fromTo(card.current, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.4, 0.3)' })
    })
  }
  return (
    <div className="grid min-h-screen place-items-center bg-cream-50 p-5 text-ink" style={APP}>
      <div ref={card} className="flex w-full max-w-md flex-col gap-5 rounded-[28px] bg-white p-8 shadow-[0_20px_60px_rgba(40,30,10,0.08)]">
        <div data-anim className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-[14px] bg-brand-600 text-white"><I n="store" size={26} /></span><span className="text-2xl font-extrabold tracking-tight">Medicub Pharmacy</span></div>
        <h1 data-anim className="m-0 text-[30px] font-extrabold tracking-tight">Counter sign-in</h1>
        <label data-anim className="flex flex-col gap-1.5 font-semibold text-muted">Pharmacy code<input className={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="username" placeholder="PH-…" /></label>
        <label data-anim className="flex flex-col gap-1.5 font-semibold text-muted">PIN<input className={input} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} autoComplete="current-password" /></label>
        {err && <p className="m-0 font-semibold text-red-700" role="alert">{err}</p>}
        <Pressable data-anim disabled={busy || !code || !pin} onClick={() => go()} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">{busy ? 'Signing in…' : 'Sign in'}</Pressable>
        <Pressable data-anim disabled={busy} onClick={() => go('PH-DEMO-01', '4321')} className="h-12 rounded-2xl bg-cream-100 font-bold">{PHARMACY}</Pressable>
      </div>
    </div>
  )
}

type Tab = 'dispense' | 'inventory' | 'escalations'

function PharmacyApp() {
  const s = useStore()
  const t = useNow()
  const [tab, setTab] = useState<Tab>('dispense')
  const [simOffline, setSimOffline] = useState(false)
  const [netOnline, setNetOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<Queued[]>(() => readJson(QKEY, []))
  const [syncing, setSyncing] = useState(false)
  const offline = simOffline || !netOnline
  const bar = useRef<HTMLDivElement>(null)
  const ind = useRef<HTMLSpanElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const openEsc = s.flags.filter((f) => f.status === 'open').length

  useEffect(() => {
    const on = () => setNetOnline(true)
    const off = () => setNetOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])
  useLayoutEffect(() => {
    const btn = bar.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
    if (btn && ind.current) gsap.to(ind.current, { x: btn.offsetLeft, width: btn.offsetWidth, duration: reducedMotion() ? 0 : 0.45, ease: 'power3.out' })
  }, [tab])
  useGSAP(() => {
    if (!reducedMotion()) gsap.from(page.current, { y: 14, autoAlpha: 0, duration: 0.4 })
  }, { dependencies: [tab] })

  const enqueue = (q: Omit<Queued, 'id' | 'at'>) => {
    const next = [...queue, { ...q, id: Math.random().toString(36).slice(2, 9), at: Date.now() }]
    setQueue(next)
    writeJson(QKEY, next)
  }

  /** Sends queued work oldest-first; anything the server rejects stays visible with its reason. */
  async function flush() {
    const items = readJson<Queued[]>(QKEY, [])
    if (!items.length) return
    setSyncing(true)
    reportConnectivity(true, items.length)
    let left = items
    for (const q of items) {
      try {
        await (q.kind === 'attest' ? attest(q.rxCode, q.prescribed, q.scanned, !!q.patientAgreed, q.at) : escalate(q.rxCode, q.prescribed, q.scanned, q.at))
        left = left.filter((x) => x.id !== q.id)
      } catch (e) {
        if ((e as { code?: string }).code === 'NETWORK') break // still offline: keep the rest
        left = left.filter((x) => x.id !== q.id) // rejected by the server (e.g. already sent): shown as a toast, not retried forever
      }
      setQueue(left)
      writeJson(QKEY, left)
    }
    setSyncing(false)
    if (!left.length) notify(`Synced ${items.length} offline item${items.length > 1 ? 's' : ''}.`, 'success')
  }

  useEffect(() => {
    if (!offline) void flush()
    else reportConnectivity(false)
  }, [offline]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-cream-50 text-ink" style={APP}>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-cream-200 bg-cream-50/90 px-5 py-3 backdrop-blur">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white"><I n="store" size={22} /></span>
        <span className="text-xl font-extrabold tracking-tight">Medicub Pharmacy</span>
        <span className="hidden text-muted md:inline">· {PHARMACY}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${offline ? 'bg-[#FCEFD3] text-[#5C3B00]' : 'bg-sage-100 text-sage-900'}`} role="status">
            <span className={`size-2 rounded-full ${offline ? 'bg-amber-500' : 'bg-sage-700'}`} />{offline ? (netOnline ? 'Offline (simulated)' : 'Offline') : syncing ? 'Syncing…' : 'Online'}{queue.length ? ` · ${queue.length} queued` : ''}
          </span>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-2xl bg-white px-3 text-sm font-bold ring-1 ring-cream-200">
            <input type="checkbox" className="size-4 accent-amber-600" checked={simOffline} onChange={(e) => setSimOffline(e.target.checked)} /> Simulate offline
          </label>
          <Pressable onClick={() => void logout()} aria-label="Sign out" className="grid size-11 place-items-center rounded-2xl bg-white text-muted ring-1 ring-cream-200"><I n="logout" /></Pressable>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1300px] flex-col gap-5 p-5">
        <div ref={bar} role="tablist" aria-label="Sections" className="relative flex gap-1 self-start rounded-2xl bg-white p-1.5">
          <span ref={ind} className="absolute top-1.5 left-0 h-11 rounded-xl bg-ink" aria-hidden="true" />
          {([['dispense', 'Dispense'], ['inventory', 'Inventory'], ['escalations', 'Escalations']] as const).map(([k, label]) => (
            <Pressable key={k} data-tab={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative flex h-11 items-center gap-1.5 rounded-xl px-5 font-bold transition-colors duration-200 ${tab === k ? 'text-white' : 'text-muted'}`}>
              {label}
              {k === 'escalations' && openEsc + queue.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-amber-500 text-xs text-ink">{openEsc + queue.length}</span>}
            </Pressable>
          ))}
        </div>
        <div ref={page}>
          {tab === 'dispense' && <Dispense offline={offline} enqueue={enqueue} />}
          {tab === 'inventory' && <Inventory s={s} t={t} offline={offline} />}
          {tab === 'escalations' && <Escalations s={s} queue={queue} />}
        </div>
      </div>
      <footer className="flex justify-center gap-3 py-6 text-sm text-subtle"><span className="font-bold text-sage-800">Decision support, not a decision</span><span className="rounded bg-cream-200 px-2 font-semibold">Synthetic data</span></footer>
    </div>
  )
}

function Dispense({ offline, enqueue }: { offline: boolean; enqueue: (q: Omit<Queued, 'id' | 'at'>) => void }) {
  const [code, setCode] = useState('')
  const [rx, setRx] = useState<RedeemedRx | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const [scan, setScan] = useState('')
  const [result, setResult] = useState<{ scanned: string; r: SubResult } | null>(null)
  const [done, setDone] = useState<'' | 'attested' | 'sent' | 'queued'>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  const redeem = async (c: string) => {
    const k = c.trim().toUpperCase()
    if (!k) return
    setErr('')
    setLine(null)
    setResult(null)
    setDone('')
    const cache = readJson<Record<string, RedeemedRx>>(RXKEY, {})
    if (offline) {
      const hit = cache[k]
      if (hit) return setRx(hit)
      setRx(null)
      return setErr(`Offline: ${k} hasn't been opened on this device before. Reconnect to redeem it.`)
    }
    setBusy(true)
    try {
      const r = await redeemRx(k)
      setRx(r)
      writeJson(RXKEY, { ...cache, [k]: r }) // lets this prescription keep working if the connection drops
    } catch {
      setRx(null)
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    if (!rx || !line) return
    const prescribed = normalise(line)
    const scanned = normalise(scan)
    if (!prescribed) return
    if (!scanned) return setErr(`Unknown barcode or product: “${scan}”.`)
    setErr('')
    setDone('')
    // The rules run on this device first (works offline); online, the server re-checks and audits the scan.
    const local = checkSubstitution(prescribed, scanned)
    setResult({ scanned: scanned.brand, r: local })
    navigator.vibrate?.(local.verdict === 'BLOCKED' ? [40, 60, 40] : 20)
    if (!offline) void scanPack(rx.code, prescribed.brand, scanned.brand).catch(() => undefined)
  }

  const act = async (kind: 'attest' | 'escalate', patientAgreed = false) => {
    if (!rx || !line || !result) return
    if (offline) {
      enqueue({ kind, rxCode: rx.code, prescribed: line, scanned: result.scanned, patientAgreed })
      return setDone('queued')
    }
    setBusy(true)
    try {
      await (kind === 'attest' ? attest(rx.code, line, result.scanned, patientAgreed) : escalate(rx.code, line, result.scanned))
      setDone(kind === 'attest' ? 'attested' : 'sent')
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="flex min-w-0 flex-col gap-4 rounded-3xl bg-white p-5">
        <h2 className="m-0 text-xl font-extrabold">1 · Redeem prescription</h2>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} min-w-0 flex-1 font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void redeem(code)} placeholder="RX-1001" aria-label="Prescription code" />
          <Pressable disabled={busy || !code.trim()} onClick={() => void redeem(code)} className="h-14 rounded-2xl bg-sage-700 px-5 font-bold text-white">Redeem</Pressable>
        </div>
        <Pressable disabled={busy || offline} onClick={() => { setCode('RX-1001'); void redeem('RX-1001') }} className="flex h-11 items-center justify-center gap-2 self-start rounded-xl border-[1.5px] border-dashed border-line px-4 text-sm font-bold"><I n="qr" size={18} /> Sample Rx: RX-1001</Pressable>
        {err && <p className="m-0 rounded-2xl bg-[#FCEFD3] p-3 font-semibold text-[#5C3B00]" role="alert">{err}</p>}
        {rx && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[15px] text-muted"><b className="text-ink">{rx.patientName}</b> · {rx.code} · {rx.doctorName} · {fmtDateTime(rx.signedAt)}</p>
            {rx.items.map((i) => (
              <Pressable key={i.brand} onClick={() => { setLine(i.brand); setResult(null); setScan(''); setDone(''); setTimeout(() => scanRef.current?.focus(), 50) }} aria-pressed={line === i.brand} className={`flex items-center gap-3 rounded-2xl p-3 text-left ring-[1.5px] ${line === i.brand ? 'bg-sage-50 ring-sage-700' : 'bg-white ring-cream-200'}`}>
                <Pill size={32} /><span className="flex-1"><b>{i.brand}</b> <span className="text-muted">· {i.dosesPerDay}×/day</span></span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${i.inStock ? 'bg-sage-100 text-sage-900' : 'bg-red-100 text-red-800'}`}>{i.inStock ? 'IN STOCK' : 'OUT OF STOCK'}</span>
              </Pressable>
            ))}
            {rx.items.filter((i) => line === i.brand && i.cheaper?.length).map((i) => {
              const c = i.cheaper![0]!
              return (
                <div key={c.brand} className="flex flex-wrap items-center gap-3 rounded-2xl bg-sage-50 p-3 text-sage-900">
                  <I n="heart" size={20} />
                  <span className="min-w-0 flex-1 text-[15px]"><b>{c.janAushadhi ? 'Jan Aushadhi generic' : 'Cheaper equivalent'}:</b> {c.brand} · ₹{c.mrp} vs ₹{i.mrp} per strip — <b>save {c.savePct}%</b>{c.inStock ? '' : ' · not in stock'}</span>
                  <Pressable disabled={!c.inStock} onClick={() => { setScan(c.brand); setTimeout(() => scanRef.current?.focus(), 50) }} className="h-10 rounded-xl bg-sage-700 px-3 text-sm font-bold text-white">Offer to patient</Pressable>
                  <span className="w-full text-xs text-sage-800">Same ingredients, strength and form. Only with the patient's agreement — the substitution check still runs. Demo prices.</span>
                </div>
              )
            })}
          </div>
        )}
        {line && (
          <div className="flex flex-col gap-2 border-t border-divider pt-4">
            <h2 className="m-0 text-xl font-extrabold">2 · Scan the pack</h2>
            <div className="flex gap-2">
              <input ref={scanRef} className={`${input} min-w-0 flex-1 font-mono`} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void check()} placeholder="Barcode or brand" aria-label="Barcode" />
              <Pressable disabled={!scan.trim()} onClick={() => void check()} className="h-14 rounded-2xl bg-ink px-5 font-bold text-white">Check</Pressable>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Demo barcodes">
              {CATALOG.map((p) => <button key={p.barcode} onClick={() => setScan(p.barcode)} className="cursor-pointer rounded-lg bg-cream-100 px-2 py-1 text-xs font-semibold hover:bg-cream-200">{p.brand}</button>)}
            </div>
          </div>
        )}
      </section>
      <section className="min-w-0">
        {rx && line && result ? <Verdict prescribed={line} scanned={result.scanned} r={result.r} done={done} busy={busy} offline={offline} onAct={act} /> : (
          <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 rounded-3xl border-[1.5px] border-dashed border-line p-8 text-center text-muted">
            <I n="search" size={32} />
            <b className="text-ink">The check appears here</b>
            <span>Redeem a prescription, pick the line, then scan the pack. Same ingredients, strength and form = equivalent candidate; anything else is blocked.</span>
          </div>
        )}
      </section>
    </div>
  )
}

function Verdict({ prescribed, scanned, r, done, busy, offline, onAct }: { prescribed: string; scanned: string; r: SubResult; done: string; busy: boolean; offline: boolean; onAct: (k: 'attest' | 'escalate', agreed?: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [agreed, setAgreed] = useState(false)
  const save = (normalise(prescribed)?.mrp ?? 0) - (normalise(scanned)?.mrp ?? 0)
  const swap = r.verdict === 'EQUIVALENT'
  const blocked = r.verdict === 'BLOCKED'
  useGSAP(() => {
    if (reducedMotion()) return
    gsap.from('[data-side]', { y: 20, autoAlpha: 0, stagger: 0.1, duration: 0.45 })
    gsap.from('[data-verdict]', { scale: 0.9, autoAlpha: 0, delay: 0.2, duration: 0.5, ease: 'back.out(1.8)' })
    if (blocked) gsap.fromTo('[data-verdict]', { x: -8 }, { x: 0, delay: 0.7, duration: 0.5, ease: 'elastic.out(1.4, 0.3)' })
  }, { scope: box, dependencies: [scanned, prescribed] })
  const side = (label: string, brand: string) => {
    const p = normalise(brand)
    return (
      <div data-side className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 text-center">
        <span className="text-xs font-extrabold tracking-wide text-subtle uppercase">{label}</span>
        <Pill size={56} />
        <b className="text-lg">{brand}</b>
        <span className="text-sm text-muted">{p ? describe(p) : '?'} · {p?.form}</span>
      </div>
    )
  }
  return (
    <div ref={box} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">{side('Prescribed', prescribed)}{side('Scanned', scanned)}</div>
      <div data-verdict className={`flex flex-col gap-2 rounded-3xl p-5 ring-2 ${blocked ? 'bg-red-50 text-red-900 ring-red-400' : 'bg-sage-50 text-sage-900 ring-sage-400'}`} role="status">
        <p className="m-0 flex items-center gap-2 text-2xl font-black"><I n={blocked ? 'block' : 'check'} size={28} stroke={2.4} /> {r.verdict}</p>
        <ul className="m-0 flex flex-col gap-1 pl-5">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
        {r.finding && <p className="m-0 text-sm font-bold">{r.finding.ruleId} · HIGH · goes to the prescriber, who must approve or reject with a reason</p>}
      </div>
      {done === 'queued' ? <p className="m-0 flex items-center gap-2 rounded-2xl bg-[#FCEFD3] p-4 font-bold text-[#5C3B00]"><I n="clock" /> Saved on this device — it will sync automatically when you're back online.</p>
        : done === 'attested' ? <p className="m-0 flex items-center gap-2 rounded-2xl bg-sage-50 p-4 font-bold text-sage-900"><I n="check" stroke={2.6} /> Recorded in the audit log.</p>
        : done === 'sent' ? <p className="m-0 flex items-center gap-2 rounded-2xl bg-sage-50 p-4 font-bold text-sage-900"><I n="send" /> Sent to the prescriber's inbox.</p>
        : blocked ? <Pressable disabled={busy} onClick={() => onAct('escalate')} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-red-700 text-lg font-bold text-white"><I n="send" /> {offline ? 'Queue for prescriber' : 'Send to prescriber'}</Pressable>
        : <>
          {swap && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 ring-[1.5px] ring-cream-200">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 accent-[#5E6B3A]" />
              <span><b>The patient agreed to {scanned}</b> instead of {prescribed}.{save > 0 && <> They save <b>₹{save} per strip</b> (demo price).</>}</span>
            </label>
          )}
          <Pressable disabled={busy || (swap && !agreed)} onClick={() => onAct('attest', agreed)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-sage-700 text-lg font-bold text-white"><I n="shield" /> {r.verdict === 'EXACT' ? 'Confirm dispense' : 'I attest this is equivalent'}</Pressable>
        </>}
    </div>
  )
}

const SAMPLE_CSV = `name,batch,expiry,qty
Telma 40,TL2501,2027-09-30,40
Atorva 10,AT2502,2026-12-15,25
Stamlo 5,ST2502,2027-11-30,80`

function Inventory({ s, t, offline }: { s: State; t: number; offline: boolean }) {
  const [q, setQ] = useState('')
  const [csv, setCsv] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const status = (expiry: string) => {
    const days = (new Date(`${expiry}T00:00:00`).getTime() - t) / 86_400_000
    return days < 0 ? 'expired' : days < 90 ? 'near' : 'ok' // operational threshold, not clinical
  }
  const rows = s.stock.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()))
  const doImport = async () => {
    const { rows: parsed, errors: errs } = parseStockCsv(csv)
    setErrors(errs)
    if (!parsed.length) return
    setBusy(true)
    try {
      await importStock(parsed)
      notify(`Imported ${parsed.length} row${parsed.length > 1 ? 's' : ''}${errs.length ? `; ${errs.length} skipped` : ''}.`, 'success')
      if (!errs.length) setCsv('')
    } catch {
      /* toast shown */
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <div className="flex flex-wrap items-center gap-3"><h2 className="m-0 flex-1 text-xl font-extrabold">Stock</h2><input className="h-11 rounded-xl border-[1.5px] border-line px-3" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter stock" /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead className="text-sm text-subtle"><tr><th className="py-2">Medicine</th><th>Batch</th><th>Expiry</th><th className="text-right">Qty</th></tr></thead>
            <tbody>
              {rows.map((x) => {
                const st = status(x.expiry)
                return (
                  <tr key={x.name + x.batch} className="border-t border-divider">
                    <td className="py-3 font-bold">{x.name}</td>
                    <td className="font-mono text-sm">{x.batch}</td>
                    <td>{x.expiry} {st !== 'ok' && <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-extrabold ${st === 'expired' ? 'bg-red-100 text-red-800' : 'bg-[#FCEFD3] text-[#5C3B00]'}`}>{st === 'expired' ? 'EXPIRED' : 'NEAR EXPIRY'}</span>}</td>
                    <td className={`text-right font-bold ${x.qty === 0 ? 'text-red-700' : ''}`}>{x.qty === 0 ? 'Out' : x.qty}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="flex h-fit min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <h2 className="m-0 text-xl font-extrabold">Import CSV</h2>
        <p className="m-0 text-sm text-muted">Columns: name, batch, expiry (YYYY-MM-DD), qty. Same name + batch updates the row. Bad rows are listed and skipped.</p>
        <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} className="rounded-2xl border-[1.5px] border-line bg-cream-50 p-3 font-mono text-sm" aria-label="CSV text" placeholder="name,batch,expiry,qty" />
        <div className="flex flex-wrap gap-2">
          <Pressable disabled={busy || offline || !csv.trim()} onClick={() => void doImport()} className="h-12 rounded-2xl bg-sage-700 px-5 font-bold text-white">Import</Pressable>
          <label className="flex h-12 cursor-pointer items-center rounded-2xl bg-cream-100 px-4 font-bold">Choose file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setCsv).catch(() => notify('Could not read that file.', 'error')) }} /></label>
          <Pressable onClick={() => setCsv(SAMPLE_CSV)} className="h-12 rounded-2xl px-4 font-bold text-brand-700">Paste sample</Pressable>
        </div>
        {offline && <p className="m-0 text-sm font-semibold text-[#5C3B00]">Stock imports need a connection.</p>}
        {errors.map((e) => <p key={e} className="m-0 text-sm text-red-700">{e}</p>)}
      </section>
    </div>
  )
}

function Escalations({ s, queue }: { s: State; queue: Queued[] }) {
  const root = useRef<HTMLDivElement>(null)
  useStaggerIn(root, s.flags.length + queue.length)
  const sent = [...s.flags].sort((a, b) => b.createdAt - a.createdAt)
  return (
    <div ref={root} className="flex flex-col gap-3">
      {queue.length === 0 && sent.length === 0 && <p data-anim className="m-0 rounded-3xl bg-white p-6 text-muted">No escalations yet. Blocked substitutions you send to a prescriber appear here with their decision.</p>}
      {queue.map((q) => (
        <div data-anim key={q.id} className="flex items-center gap-3 rounded-3xl bg-[#FCEFD3] p-4 text-[#5C3B00]">
          <I n="clock" /><span className="flex-1"><b>Waiting to sync</b> · {q.kind === 'escalate' ? 'send to prescriber' : 'attestation'} · {q.rxCode}: {q.scanned} for {q.prescribed}</span><span className="text-sm">{fmtDateTime(q.at)}</span>
        </div>
      ))}
      {sent.map((f) => (
        <div data-anim key={f.id} className={`flex flex-wrap items-center gap-3 rounded-3xl bg-white p-4 ring-[1.5px] ${f.status === 'open' ? 'ring-[#E8C77A]' : 'ring-sage-200'}`}>
          <span className={f.status === 'open' ? 'text-[#7A4E00]' : 'text-sage-800'}><I n={f.status === 'open' ? 'clock' : 'check'} /></span>
          <span className="min-w-0 flex-1"><b>{f.request?.rxCode}: {f.request?.scanned} for {f.request?.prescribed}</b><span className="block text-sm text-muted">To {doctorName(f.ownerId)} · {fmtDateTime(f.createdAt)}</span></span>
          {f.decision ? <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${f.decision.kind === 'approved' ? 'bg-sage-100 text-sage-900' : 'bg-red-100 text-red-800'}`}>{f.decision.kind.toUpperCase()}</span> : <span className="rounded-full bg-[#FCEFD3] px-3 py-1 text-sm font-extrabold text-[#5C3B00]">AWAITING DOCTOR</span>}
          {f.decision && <p className="m-0 w-full text-sm text-muted">“{f.decision.reason}” — {f.decision.by}</p>}
        </div>
      ))}
    </div>
  )
}
