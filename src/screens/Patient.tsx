import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DeviceFrame } from '../lib/device'
import { fireTarget, useNow } from '../lib/time'
import { I, type IconName } from '../patient/icons'
import { AnnouncementBanner, useSystemNotifications } from '../patient/Announcements'
import { Me } from '../patient/Me'
import { gsap, Pressable, reducedMotion, Sheet, useGSAP } from '../patient/motion'
import { Onboarding } from '../patient/Onboarding'
import { Records } from '../patient/Records'
import { ScanSheet } from '../patient/ScanSheet'
import { GeofenceSheet, NfcSheet } from '../patient/Sheets'
import { Today } from '../patient/Today'
import { hhmm12, patientView } from '../patient/view'
import { login, setClockOffset, useStore } from '../store/store'
import { Gate } from '../ui/AppFrame'
import type { State } from '../store/types'

type Tab = 'today' | 'records' | 'me'
const TABS: { k: Tab; label: string; icon: IconName }[] = [
  { k: 'today', label: 'Today', icon: 'sun' },
  { k: 'records', label: 'Records', icon: 'folder' },
  { k: 'me', label: 'Me', icon: 'user' },
]
const ONBOARD_KEY = 'medicub:patient-onboarded'
const readOnboarded = () => {
  try {
    return localStorage.getItem(ONBOARD_KEY) === '1'
  } catch {
    return false
  }
}

export default function Patient() {
  return (
    <DeviceFrame w={390} h={844}>
      <Gate signIn={<PatientSignIn />}>
        <PatientApp />
      </Gate>
    </DeviceFrame>
  )
}

function PatientApp() {
  const s = useStore()
  const t = useNow()
  const v = patientView(s, t)
  const [onboarded, setOnboarded] = useState(readOnboarded)
  const [tab, setTab] = useState<Tab>('today')
  const [sheet, setSheet] = useState<'nfc' | 'qr' | 'clock' | null>(null)
  const [geoHidden, setGeoHidden] = useState('')
  // A QR scanned with the phone's own camera opens /patient?scan=CODE: go straight to the confirm step.
  const [scanCode, setScanCode] = useState<string | undefined>(() => new URLSearchParams(location.search).get('scan') ?? undefined)
  useEffect(() => {
    if (!scanCode) return
    history.replaceState(null, '', location.pathname)
    setSheet('qr')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const prevTab = useRef<Tab>('today')
  const page = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const ind = useRef<HTMLSpanElement>(null)
  const press = useRef<number | undefined>(undefined)
  const unread = (s.announcements ?? []).filter((a) => !a.seenBy.includes(v.me?.id ?? ''))
  useSystemNotifications(unread, v.due, t)

  // Page transition: slide in from the side of the tab you came from.
  useGSAP(() => {
    const dir = TABS.findIndex((x) => x.k === tab) - TABS.findIndex((x) => x.k === prevTab.current)
    prevTab.current = tab
    if (!reducedMotion() && dir !== 0) gsap.fromTo(page.current, { x: dir * 36, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.4, ease: 'power3.out', clearProps: 'transform' })
    page.current?.scrollTo({ top: 0 })
  }, { dependencies: [tab] })

  // Tab indicator glides under the active tab.
  useLayoutEffect(() => {
    const btn = bar.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
    if (btn && ind.current) gsap.to(ind.current, { x: btn.offsetLeft + btn.offsetWidth / 2 - 14, duration: reducedMotion() ? 0 : 0.5, ease: 'elastic.out(1, 0.75)' })
  }, [tab, onboarded])

  if (!v.me) return null
  const finish = () => {
    try {
      localStorage.setItem(ONBOARD_KEY, '1')
    } catch {
      /* private mode: onboarding shows again next time, harmless */
    }
    setOnboarded(true)
  }

  // Long-press any screen title to open the demo clock.
  const titleDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('h1')) press.current = window.setTimeout(() => setSheet('clock'), 700)
  }
  const cancelPress = () => clearTimeout(press.current)
  const showGeo = v.candidate && geoHidden !== v.candidate.id && onboarded && !sheet

  return (
    <>
      <div id="phone-screen" className="relative flex h-full flex-col bg-cream-50 text-ink" style={{ fontFamily: 'var(--font-app)' }}>
        {!onboarded ? (
          <Onboarding firstName={v.me.name.split(' ')[0] ?? ''} onDone={finish} />
        ) : (
          <>
            <div ref={page} className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" onPointerDown={titleDown} onPointerUp={cancelPress} onPointerLeave={cancelPress}>
              {tab === 'today' && <Today s={s} t={t} v={v} onTapTag={() => setSheet('nfc')} />}
              {tab === 'records' && <Records s={s} v={v} />}
              {tab === 'me' && <Me s={s} v={v} onTapTag={() => setSheet('nfc')} onQr={() => setSheet('qr')} onClock={() => setSheet('clock')} onReplay={() => { try { localStorage.removeItem(ONBOARD_KEY) } catch { /* ignore */ } setOnboarded(false) }} />}
            </div>
            {tab !== 'today' && v.due[0] && <DueToast brand={v.due[0].r.brand} onOpen={() => setTab('today')} />}
            <nav ref={bar} aria-label="Main" className="relative grid h-[84px] grid-cols-3 border-t border-cream-200 bg-white px-3 pt-2 pb-5">
              <span ref={ind} className="absolute top-0 left-0 h-[3px] w-7 rounded-full bg-brand-600" aria-hidden="true" />
              {TABS.map((x) => (
                <Pressable key={x.k} data-tab={x.k} aria-current={tab === x.k ? 'page' : undefined} onClick={() => setTab(x.k)} className={`relative flex flex-col items-center gap-1 text-[13px] ${tab === x.k ? 'font-bold text-brand-700' : 'font-semibold text-subtle'}`}>
                  <I n={x.icon} size={26} stroke={tab === x.k ? 2.2 : 2} />{x.label}
                  {x.k === 'today' && v.flags.some((f) => f.status === 'open') && <span className="absolute top-1 ml-6 size-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-label="Open alert" />}
                </Pressable>
              ))}
            </nav>
          </>
        )}

        {onboarded && unread[0] && <AnnouncementBanner key={unread[0].id} a={unread[0]} more={unread.length - 1} />}
        {sheet === 'nfc' && <NfcSheet doctor={v.tagDoctor} me={v.me} onClose={() => setSheet((x) => (x === 'nfc' ? null : x))} onScanQr={() => setSheet('qr')} />}
        {sheet === 'qr' && <ScanSheet initialCode={scanCode} onClose={() => { setSheet(null); setScanCode(undefined) }} />}
        {sheet === 'clock' && <ClockSheet s={s} t={t} onClose={() => setSheet(null)} />}
        {showGeo && v.candidate && <GeofenceSheet key={v.candidate.id} doctor={v.candidate} me={v.me} onClose={() => setGeoHidden(v.candidate?.id ?? '')} />}
      </div>
    </>
  )
}

/** Phone-number sign-in. shortcut: demo numbers only, no OTP; production sends an SMS OTP (see REPORT.md). */
function PatientSignIn() {
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.from('[data-anim]', { y: 18, autoAlpha: 0, stagger: 0.07, duration: 0.5 })
  }, { scope: root })
  const go = (num: string) => {
    setBusy(true)
    setErr('')
    login({ phone: num }).catch((e: Error) => { setErr(e.message); setBusy(false) })
  }
  return (
    <div ref={root} className="flex h-full flex-col gap-6 bg-cream-50 px-6 pt-[72px] pb-8 text-ink" style={{ fontFamily: 'var(--font-app)' }}>
      <div data-anim className="flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-[14px] bg-brand-600 text-white"><I n="plus" size={26} stroke={2.4} /></div>
        <span className="text-2xl font-extrabold tracking-tight">Medicub</span>
      </div>
      <div data-anim className="flex flex-col gap-2">
        <h1 className="m-0 text-[32px] leading-tight font-extrabold tracking-tight">Sign in with your phone number</h1>
        <p className="m-0 text-lg text-muted">We'll find your Medicub record.</p>
      </div>
      <label data-anim className="flex flex-col gap-2 text-[15px] font-semibold text-muted">Mobile number
        <div className="flex h-14 items-center overflow-hidden rounded-2xl border-[1.5px] border-line bg-white focus-within:border-sage-700">
          <span className="px-4 text-lg font-bold text-ink">+91</span>
          <input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && phone && go(phone)} placeholder="98450 00001" className="h-full flex-1 bg-transparent pr-4 text-lg text-ink outline-none" />
        </div>
      </label>
      {err && <p className="m-0 font-semibold text-red-700" role="alert">{err}</p>}
      <Pressable data-anim disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={() => go(`+91${phone}`)} className="h-[58px] rounded-2xl bg-sage-700 text-lg font-bold text-white">{busy ? 'Signing in…' : 'Continue'}</Pressable>
      <div data-anim className="mt-auto flex flex-col gap-2 rounded-2xl border-[1.5px] border-dashed border-line p-4">
        <span className="text-sm font-bold text-subtle">Demo</span>
        <Pressable disabled={busy} onClick={() => go('+919845000001')} className="h-12 rounded-xl bg-cream-100 font-bold">Continue as Ramesh Kumar</Pressable>
      </div>
    </div>
  )
}

/** Drops in from the top when a dose falls due while you're on another tab. */
function DueToast({ brand, onOpen }: { brand: string; onOpen: () => void }) {
  const el = useRef<HTMLButtonElement>(null)
  useGSAP(() => {
    navigator.vibrate?.([20, 60, 20])
    if (!reducedMotion()) gsap.from(el.current, { y: -90, duration: 0.7, ease: 'back.out(1.4)' })
  })
  return (
    <button ref={el} onClick={onOpen} className="absolute top-12 right-4 left-4 z-10 flex cursor-pointer items-center gap-3 rounded-2xl bg-brand-600 p-3.5 text-left text-white shadow-lg" style={{ touchAction: 'manipulation' }}>
      <span className="grid size-10 place-items-center rounded-xl bg-white/20"><I n="clock" /></span>
      <span className="flex-1"><b>Time for {brand}</b><span className="block text-sm opacity-90">Tap to open Today</span></span>
    </button>
  )
}

function ClockSheet({ s, t, onClose }: { s: State; t: number; onClose: () => void }) {
  const reminders = s.reminders.filter((r) => r.patientId === 'p1').sort((a, b) => a.time.localeCompare(b.time))
  const shift = (ms: number) => setClockOffset(s.clockOffsetMs + ms)
  return (
    <Sheet open label="Demo clock" onClose={onClose}>
      {(close) => (
        <div className="flex flex-col gap-3">
          <h1 className="m-0 text-2xl font-extrabold">Demo clock</h1>
          <p className="m-0 text-2xl font-bold tabular-nums">{new Date(t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          <div className="grid grid-cols-3 gap-2">
            <Pressable className="h-12 rounded-xl bg-cream-100 font-bold" onClick={() => shift(15 * 60_000)}>+15 min</Pressable>
            <Pressable className="h-12 rounded-xl bg-cream-100 font-bold" onClick={() => shift(3_600_000)}>+1 h</Pressable>
            <Pressable className="h-12 rounded-xl bg-cream-100 font-bold" onClick={() => setClockOffset(0)}>Real time</Pressable>
          </div>
          <span className="mt-2 text-sm font-bold text-subtle">Fire a reminder now</span>
          {reminders.map((r) => (
            <Pressable key={r.id} className="flex h-14 items-center justify-between rounded-xl bg-brand-50 px-4 text-left" onClick={() => close(() => setClockOffset(fireTarget(r, t, s.doseLog) - Date.now()))}>
              <span><b>{hhmm12(r.time)}</b> · {r.brand}</span><span className="font-bold text-brand-700">Fire</span>
            </Pressable>
          ))}
        </div>
      )}
    </Sheet>
  )
}
