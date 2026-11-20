// Clinic QR: runs on a tablet or screen on the doctor's desk. Patients scan it with the Medicub app,
// confirm on their phone, and the doctor gets access to their record. The code rotates every 3 minutes
// so a photo of it can't be reused later.
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { fmtTime, useNow } from '../lib/time'
import { I } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP } from '../patient/motion'
import { initials } from '../patient/view'
import { issueClinicQr, logout, notify, patientName, reportClient, useStore } from '../store/store'
import { Gate } from '../ui/AppFrame'
import { DoctorSignIn } from './Doctor'

const APP = { fontFamily: 'var(--font-app)' }
const ROTATE_MS = 3 * 60_000
const SOURCE: Record<string, string> = { DigiLocker: 'Identity verified', 'NMC registry': 'NMC registered', AskMyDoc: 'Cross-checked' }

export default function ClinicQr() {
  return (
    <Gate signIn={<DoctorSignIn />}>
      <Desk />
    </Gate>
  )
}

function Desk() {
  const s = useStore()
  useNow() // re-render every second for the countdown
  const me = s.doctors.find((d) => d.id === s.doctorId)
  const [qr, setQr] = useState<{ code: string; expiresAt: number; img: string; issuedAt: number } | null>(null)
  const [err, setErr] = useState('')
  const card = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  // Fetch a code now and every 3 minutes; on failure retry in 10 s and say so on screen.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let alive = true
    const next = async () => {
      try {
        const r = await issueClinicQr()
        const img = await QRCode.toDataURL(`${location.origin}/patient?scan=${r.code}`, { width: 640, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1F2015', light: '#FFFFFF' } })
        if (!alive) return
        setQr({ ...r, img, issuedAt: Date.now() })
        setErr('')
        timer = setTimeout(() => void next(), ROTATE_MS)
      } catch (e) {
        if (!alive) return
        setErr((e as Error).message || 'Could not get a code.')
        reportClient('warn', 'clinicqr.issue_failed', String(e))
        timer = setTimeout(() => void next(), 10_000)
      }
    }
    void next()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  // Keep the screen on while the QR is displayed (supported browsers only).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => undefined)
    return () => void lock?.release().catch(() => undefined)
  }, [])

  // New code: flip the card. The bar under the QR empties as the code ages.
  useGSAP(() => {
    if (!qr) return
    if (!reducedMotion()) gsap.fromTo(card.current, { rotateY: -90, autoAlpha: 0 }, { rotateY: 0, autoAlpha: 1, duration: 0.7, ease: 'back.out(1.4)' })
    gsap.fromTo(bar.current, { scaleX: 1 }, { scaleX: 0, duration: ROTATE_MS / 1000, ease: 'none' })
  }, { dependencies: [qr?.code] })

  const shared = s.checkIns.filter((c) => c.doctorId === me?.id && (c.kind === 'qr' || c.kind === 'nfc')).slice(-5).reverse()
  const latest = shared[0]
  const lastSeen = useRef(latest?.at ?? 0)
  useEffect(() => {
    if (latest && latest.at > lastSeen.current) {
      notify(`${patientName(latest.patientId)} shared their record with you.`, 'success')
      navigator.vibrate?.(30)
    }
    lastSeen.current = latest?.at ?? 0
  }, [latest?.at]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null
  const left = qr ? Math.max(0, qr.expiresAt - Date.now()) : 0
  return (
    <div className="flex min-h-screen flex-col bg-cream-50 text-ink" style={APP}>
      <header className="flex items-center gap-3 px-6 py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white"><I n="plus" size={22} stroke={2.4} /></span>
        <span className="text-xl font-extrabold">Medicub</span>
        <span className="flex items-center gap-1.5 rounded-full bg-sage-100 px-3 py-1 text-sm font-bold text-sage-900"><span className="size-2 animate-pulse rounded-full bg-sage-700" />Live</span>
        <Pressable onClick={() => void logout()} aria-label="Sign out" className="ml-auto grid size-11 place-items-center rounded-xl bg-white ring-1 ring-cream-200"><I n="logout" /></Pressable>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-6 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
          <span className="text-sm font-bold tracking-wide text-brand-700 uppercase">{me.clinic.name}</span>
          <h1 className="m-0 text-[clamp(32px,5vw,56px)] leading-[1.05] font-extrabold tracking-tight">Share your record with {me.name}</h1>
          <ol className="m-0 flex list-none flex-col gap-3 p-0 text-lg">
            {['Open the Medicub app', 'Tap Share → Scan doctor’s QR', 'Point your camera here, then press and hold to allow'].map((x, i) => (
              <li key={x} className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-base font-black text-white">{i + 1}</span>{x}</li>
            ))}
          </ol>
          <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
            {me.checks.filter((c) => c.status === 'pass').map((c) => <span key={c.source} className="flex items-center gap-1 rounded-full bg-sage-100 px-3 py-1 text-sm font-bold text-sage-900"><I n="shield" size={14} />{SOURCE[c.source] ?? c.source}</span>)}
          </div>
          <p className="m-0 text-sm text-muted">Nothing is shared until the patient confirms on their own phone. They can stop sharing any time.</p>
        </div>

        <div className="flex flex-col items-center gap-4" style={{ perspective: 1200 }}>
          <div ref={card} className="flex w-full flex-col items-center gap-4 rounded-[32px] bg-white p-6 shadow-[0_30px_80px_rgba(40,30,10,0.12)]">
            <div className="flex items-center gap-3 self-stretch">
              <span className="grid size-12 place-items-center rounded-full bg-brand-600 font-extrabold text-white">{initials(me.name)}</span>
              <span className="flex flex-col"><b className="text-lg">{me.name}</b><span className="text-sm text-muted">{me.specialty}</span></span>
            </div>
            {qr ? <img src={qr.img} alt={`QR code to share your record with ${me.name}`} className="aspect-square w-full max-w-[360px]" /> : <div className="grid aspect-square w-full max-w-[360px] place-items-center rounded-2xl bg-cream-100"><span className="size-10 animate-spin rounded-full border-4 border-sage-200 border-t-sage-700" /></div>}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream-200" aria-hidden="true"><div ref={bar} className="h-full origin-left rounded-full bg-sage-700" /></div>
            <span className="text-sm font-semibold text-muted" aria-live="polite">{err ? <span className="text-red-700">{err} Retrying…</span> : qr ? <>Can't scan? Type <b className="font-mono tracking-widest text-ink">{qr.code}</b> · new code in {Math.ceil(Math.min(left, ROTATE_MS - (Date.now() - qr.issuedAt)) / 60_000)} min</> : 'Getting a code…'}</span>
          </div>
          {shared.length > 0 && (
            <div className="flex w-full flex-col gap-2 rounded-3xl bg-white p-4">
              <span className="text-sm font-bold text-subtle">Shared with you today</span>
              {shared.map((c) => (
                <div key={c.at} className="flex items-center gap-3 animate-enter">
                  <span className="grid size-9 place-items-center rounded-full bg-sage-100 text-sm font-extrabold text-sage-900">{initials(patientName(c.patientId))}</span>
                  <span className="flex-1"><b>{patientName(c.patientId)}</b><span className="block text-xs text-muted">{c.kind === 'qr' ? 'Scanned this QR' : 'Tapped your NFC tag'} · {fmtTime(c.at)}</span></span>
                  <a href="/doctor" className="text-sm font-bold text-brand-700">Open</a>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
