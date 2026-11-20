// Presenter control room: send notifications to every patient app (Android + web) and drive the live demo
// (clock, the patient's location, firing doses, reset, quick links, install QR).
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { fireTarget, fmtDateTime, useNow } from '../lib/time'
import { I, type IconName } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP, useStaggerIn } from '../patient/motion'
import { hhmm12 } from '../patient/view'
import { HOME, PHONE_PATIENT } from '../store/seed'
import { act, logout, notify, patientName, resetDemo, setClockOffset, useStore } from '../store/store'
import type { State } from '../store/types'
import { Gate } from '../ui/AppFrame'
import { AdminSignIn } from './Console'

const APP = { fontFamily: 'var(--font-app)' }
const field = 'h-12 rounded-xl border-[1.5px] border-line bg-white px-3 text-base text-ink'
const PRESETS: { label: string; title: string; body: string; level: 'info' | 'important' }[] = [
  { label: 'Lab report ready', title: 'Your lab report is ready', body: 'Your new results are in Records. Your doctor will go through them at your next visit.', level: 'info' },
  { label: 'Clinic timing', title: 'Clinic closes early today', body: 'Heart Care Clinic closes at 4 pm today. Tap your doctor’s tag before then if you need to share your record.', level: 'info' },
  { label: 'Check before next dose', title: 'Please check before your next dose', body: 'Your doctor wants to review one of your medicines. Ask your doctor or pharmacist before your next dose.', level: 'important' },
  { label: 'Pharmacy stock', title: 'Your medicine is back in stock', body: 'Demo Pharmacy, MG Road has your medicine again. Bring your prescription code.', level: 'info' },
]

export default function Present() {
  return (
    <Gate signIn={<AdminSignIn />}>
      <Room />
    </Gate>
  )
}

function Room() {
  const s = useStore()
  const t = useNow()
  const root = useRef<HTMLDivElement>(null)
  useStaggerIn(root, 'present')
  const fullscreen = () => {
    const d = document.documentElement
    void (document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen()).catch(() => notify('Full screen is not available here.', 'error'))
  }
  return (
    <div className="min-h-screen bg-cream-50 text-ink" style={APP}>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-cream-200 bg-cream-50/90 px-5 py-3 backdrop-blur">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white"><I n="bell" size={22} /></span>
        <span className="text-xl font-extrabold">Presenter</span>
        <span className="rounded-full bg-sage-100 px-3 py-1 text-sm font-bold text-sage-900 tabular-nums">Demo time {new Date(t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}{s.clockOffsetMs ? ' (shifted)' : ''}</span>
        <div className="ml-auto flex gap-2">
          <Pressable onClick={fullscreen} className="h-11 rounded-xl bg-white px-3 text-sm font-bold ring-1 ring-cream-200">Full screen</Pressable>
          <Pressable onClick={() => void logout()} aria-label="Sign out" className="grid size-11 place-items-center rounded-xl bg-white ring-1 ring-cream-200"><I n="logout" /></Pressable>
        </div>
      </header>
      <div ref={root} className="mx-auto grid max-w-[1400px] gap-5 p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Broadcast s={s} />
          <Sent s={s} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Clock s={s} t={t} />
          <Location s={s} />
          <Launch />
          <Live s={s} />
        </div>
      </div>
    </div>
  )
}

function Broadcast({ s }: { s: State }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [level, setLevel] = useState<'info' | 'important'>('info')
  const [audience, setAudience] = useState('all')
  const [busy, setBusy] = useState(false)
  const preview = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.fromTo(preview.current, { scale: 0.97 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' })
  }, { dependencies: [level] })
  const ok = title.trim().length >= 2 && body.trim().length >= 2
  const send = async () => {
    setBusy(true)
    try {
      await act('admin.announce', { title: title.trim(), body: body.trim(), level, audience })
      notify(`Sent to ${audience === 'all' ? 'all patient apps' : patientName(audience)}.`, 'success')
      setTitle('')
      setBody('')
    } catch {
      /* toast shown */
    } finally {
      setBusy(false)
    }
  }
  const important = level === 'important'
  return (
    <section data-anim className="flex flex-col gap-4 rounded-3xl bg-white p-5">
      <h2 className="m-0 text-xl font-extrabold">Send a notification to patient apps</h2>
      <div className="flex flex-wrap gap-2" aria-label="Templates">
        {PRESETS.map((p) => <Pressable key={p.label} onClick={() => { setTitle(p.title); setBody(p.body); setLevel(p.level) }} className="h-9 rounded-full bg-cream-100 px-3 text-sm font-bold">{p.label}</Pressable>)}
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Title<input className={field} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Your lab report is ready" /></label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Message<textarea rows={3} maxLength={500} className="rounded-xl border-[1.5px] border-line bg-white p-3 text-base text-ink" value={body} onChange={(e) => setBody(e.target.value)} /><span className="self-end text-xs">{body.length}/500</span></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Importance
          <div role="radiogroup" className="flex gap-2">
            {(['info', 'important'] as const).map((l) => <Pressable key={l} role="radio" aria-checked={level === l} onClick={() => setLevel(l)} className={`h-12 flex-1 rounded-xl font-bold ${level === l ? (l === 'important' ? 'bg-brand-600 text-white' : 'bg-ink text-white') : 'ring-[1.5px] ring-line'}`}>{l === 'info' ? 'Info' : 'Important'}</Pressable>)}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Send to
          <select className={field} value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">All patients</option>
            {s.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div ref={preview} className={`flex items-start gap-3 rounded-2xl p-4 text-white ${important ? 'bg-brand-600' : 'bg-ink'}`} aria-label="Preview">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20"><I n={important ? 'alert' : 'bell'} /></span>
        <div className="flex min-w-0 flex-col gap-0.5"><span className="text-xs font-bold uppercase opacity-80">Preview on the phone</span><b>{title || 'Title'}</b><span className="text-sm opacity-90">{body || 'Message'}</span></div>
      </div>
      <Pressable disabled={!ok || busy} onClick={() => void send()} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-sage-700 text-lg font-bold text-white"><I n="send" /> {busy ? 'Sending…' : 'Send now'}</Pressable>
      <p className="m-0 text-xs text-subtle">Shows as a banner in every open patient app and as an Android notification. Phones that are fully closed get it when Medicub next opens (real background push needs Firebase).</p>
    </section>
  )
}

function Sent({ s }: { s: State }) {
  const list = s.announcements ?? []
  return (
    <section data-anim className="flex flex-col gap-3 rounded-3xl bg-white p-5">
      <h2 className="m-0 text-xl font-extrabold">Sent <span className="text-base text-subtle">({list.length})</span></h2>
      {list.length === 0 && <p className="m-0 text-muted">Nothing sent yet.</p>}
      {list.slice(0, 12).map((a) => {
        const total = a.audience === 'all' ? s.patients.length : 1
        return (
          <div key={a.id} className="flex items-start gap-3 border-t border-divider pt-3 first:border-0 first:pt-0">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${a.level === 'important' ? 'bg-brand-600' : 'bg-ink'}`} />
            <div className="flex min-w-0 flex-1 flex-col">
              <b className="truncate">{a.title}</b>
              <span className="text-sm text-muted">{a.audience === 'all' ? 'All patients' : patientName(a.audience)} · {fmtDateTime(a.at)}</span>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${a.seenBy.length ? 'bg-sage-100 text-sage-900' : 'bg-cream-100 text-muted'}`}>Read {a.seenBy.length}/{total}</span>
          </div>
        )
      })}
    </section>
  )
}

function Clock({ s, t }: { s: State; t: number }) {
  const shift = (ms: number) => setClockOffset(s.clockOffsetMs + ms)
  const reminders = s.reminders.filter((r) => r.patientId === PHONE_PATIENT).sort((a, b) => a.time.localeCompare(b.time))
  return (
    <section data-anim className="flex flex-col gap-3 rounded-3xl bg-white p-5">
      <h2 className="m-0 text-xl font-extrabold">Demo clock</h2>
      <p className="m-0 text-3xl font-black tabular-nums">{new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
      <div className="grid grid-cols-4 gap-2">
        <Pressable onClick={() => shift(-3_600_000)} className="h-11 rounded-xl bg-cream-100 font-bold">−1 h</Pressable>
        <Pressable onClick={() => shift(15 * 60_000)} className="h-11 rounded-xl bg-cream-100 font-bold">+15 min</Pressable>
        <Pressable onClick={() => shift(3_600_000)} className="h-11 rounded-xl bg-cream-100 font-bold">+1 h</Pressable>
        <Pressable onClick={() => setClockOffset(0)} className="h-11 rounded-xl bg-cream-100 font-bold">Real</Pressable>
      </div>
      <span className="text-sm font-bold text-subtle">Fire a dose reminder on {patientName(PHONE_PATIENT)}'s phone and watch</span>
      {reminders.map((r) => (
        <Pressable key={r.id} onClick={() => setClockOffset(fireTarget(r, t, s.doseLog) - Date.now())} className="flex h-12 items-center justify-between rounded-xl bg-brand-50 px-4 text-left">
          <span><b>{hhmm12(r.time)}</b> · {r.brand}</span><span className="font-bold text-brand-700">Fire</span>
        </Pressable>
      ))}
    </section>
  )
}

function Location({ s }: { s: State }) {
  const places = [HOME, ...s.doctors.filter((d) => d.verified).map((d) => ({ label: `Near ${d.clinic.name}`, lat: d.clinic.lat + 0.0004, lng: d.clinic.lng }))]
  return (
    <section data-anim className="flex flex-col gap-3 rounded-3xl bg-white p-5">
      <h2 className="m-0 text-xl font-extrabold">{patientName(PHONE_PATIENT)}'s phone location</h2>
      <p className="m-0 text-sm text-muted">Simulated GPS. At his doctor's clinic: check-in and NFC sharing appear. At another verified doctor's clinic: the “make this your doctor?” prompt.</p>
      <div className="flex flex-wrap gap-2">
        {places.map((p) => {
          const here = s.phoneLocation.label === p.label
          return <Pressable key={p.label} aria-pressed={here} onClick={() => void act('admin.setPatientLocation', { ...p }).catch(() => undefined)} className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold ${here ? 'bg-ink text-white' : 'ring-[1.5px] ring-line'}`}><I n={p === HOME ? 'user' : 'pin'} size={16} />{p.label.replace(/^Near /, '')}</Pressable>
        })}
      </div>
    </section>
  )
}

const LINKS: [string, string, IconName][] = [['Doctor', '/doctor', 'user'], ['Patient phone', '/patient', 'sun'], ['Watch', '/watch', 'clock'], ['Pharmacy', '/pharmacy', 'store'], ['Department', '/department', 'flask'], ['Clinic QR', '/qr', 'qr'], ['Logs', '/logs', 'doc'], ['Side-by-side', '/demo', 'doc'], ['Ops console', '/console', 'shield']]

function Launch() {
  const [qr, setQr] = useState('')
  const apk = `${location.origin}/medicub-patient.apk`
  useEffect(() => void QRCode.toDataURL(apk, { width: 220, margin: 1 }).then(setQr).catch(() => undefined), [apk])
  return (
    <section data-anim className="flex flex-col gap-3 rounded-3xl bg-white p-5">
      <h2 className="m-0 text-xl font-extrabold">Open the apps</h2>
      <div className="grid grid-cols-2 gap-2">
        {LINKS.map(([label, href, icon]) => <a key={href} href={href} target="_blank" rel="noreferrer" className="flex h-12 items-center gap-2 rounded-xl bg-cream-100 px-3 font-bold text-ink no-underline hover:bg-cream-200"><I n={icon} size={18} />{label}</a>)}
      </div>
      <div className="flex items-center gap-4 rounded-2xl bg-cream-50 p-3">
        {qr ? <img src={qr} alt="QR code to download the Android app" className="size-28 rounded-lg bg-white p-1" /> : <div className="size-28 rounded-lg bg-cream-100" />}
        <div className="flex flex-col gap-1 text-sm"><b className="text-base">Install the Android app</b><span className="text-muted">Scan with a phone camera, download, open, allow “install unknown apps”.</span><a href="/medicub-patient.apk" className="font-bold text-brand-700">Download APK</a></div>
      </div>
      <Pressable onClick={() => { if (confirm('Reset ALL demo data to the clean seed? Everyone else is signed out.')) void resetDemo().catch(() => undefined) }} className="h-12 rounded-xl font-bold text-red-700 ring-[1.5px] ring-red-200">Reset demo data</Pressable>
    </section>
  )
}

function Live({ s }: { s: State }) {
  const feed = s.audit.slice(-8).reverse()
  const box = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.from('[data-row]:first-child', { x: -12, autoAlpha: 0, duration: 0.4 })
  }, { scope: box, dependencies: [s.audit.length] })
  const stats: [string, number][] = [
    ['Open flags', s.flags.filter((f) => f.status === 'open').length],
    ['Prescriptions', s.rxs.length],
    ['Unread notifications', (s.announcements ?? []).filter((a) => a.seenBy.length === 0).length],
  ]
  return (
    <section data-anim className="flex flex-col gap-3 rounded-3xl bg-white p-5">
      <h2 className="m-0 text-xl font-extrabold">Live</h2>
      <div className="grid grid-cols-3 gap-2">{stats.map(([k, v]) => <div key={k} className="rounded-2xl bg-cream-50 p-3"><div className="text-2xl font-black">{v}</div><div className="text-xs font-semibold text-muted">{k}</div></div>)}</div>
      <div ref={box} className="flex flex-col">
        {feed.map((e) => <div data-row key={e.seq} className="flex gap-2 border-t border-divider py-1.5 text-sm first:border-0"><span className="w-14 shrink-0 text-subtle tabular-nums">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span className="min-w-0"><b>{e.action.replaceAll('_', ' ').toLowerCase()}</b> · {e.actor}</span></div>)}
      </div>
    </section>
  )
}
