import { Draggable } from 'gsap/Draggable'
import { useRef, useState } from 'react'
import { DeviceFrame } from '../lib/device'
import { statusText } from '../lib/status'
import { dayKey, fmtCountdown, useNow } from '../lib/time'
import { I, Pill } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP } from '../patient/motion'
import { hhmm12, patientView } from '../patient/view'
import { login, logDose, useStore } from '../store/store'
import { Gate } from '../ui/AppFrame'

// CLINICIAN-REVIEW: placeholder threshold for suggesting a cuff check. A prompt only — never an alarm.
const BP_SYS_HINT = 140
const RING = 2 * Math.PI * 178
const WINDOW_MS = 12 * 3_600_000

export default function Watch() {
  return (
    <DeviceFrame w={396} h={396} round>
      <Gate dark signIn={<WatchSignIn />}>
        <WatchApp />
      </Gate>
    </DeviceFrame>
  )
}

/** The watch pairs with the phone's account; in this demo it can sign in directly. */
function WatchSignIn() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-14 text-center" style={{ fontFamily: 'var(--font-app)' }}>
      <span className="text-sage-300"><I n="user" size={32} /></span>
      <b className="text-xl">Sign in on your phone</b>
      <span className="text-sm text-white/70">Your watch uses your phone's Medicub account.</span>
      <Pressable onClick={() => void login({ phone: '+919845000001' }).catch(() => undefined)} className="mt-1 h-12 rounded-full bg-white px-5 font-bold text-ink hover:bg-cream-100">Pair with Ramesh's Phone</Pressable>
    </div>
  )
}

function WatchApp() {
  const s = useStore()
  const t = useNow()
  const v = patientView(s, t)
  const due = v.due[0]
  return (
    <div className="h-full" style={{ fontFamily: 'var(--font-app)' }}>
      {due ? <Reminder key={due.r.id} id={due.r.id} brand={due.r.brand} time={due.r.time} instructions={due.r.instructions} t={t} /> : <Glance s={s} t={t} v={v} />}
    </div>
  )
}

/** Swipe up for vitals, down to return. The ring fills as the next dose approaches. */
function Glance({ s, t, v }: { s: ReturnType<typeof useStore>; t: number; v: ReturnType<typeof patientView> }) {
  const root = useRef<HTMLDivElement>(null)
  const pages = useRef<HTMLDivElement>(null)
  const arc = useRef<SVGCircleElement>(null)
  const [page, setPage] = useState(0)
  const left = v.next ? v.next.at - t : 0
  const progress = v.next ? Math.min(1, Math.max(0, 1 - left / WINDOW_MS)) : 0
  const vit = s.vitals[v.me?.id ?? '']
  const pulse = vit?.pulse.at(-1)
  const sleep = vit?.sleep.at(-1)
  const bp = vit?.bp.at(-1)
  const flag = v.flags.find((f) => f.status === 'open') ?? v.flags[0]

  useGSAP(() => {
    gsap.to(arc.current, { strokeDashoffset: RING * (1 - progress), duration: reducedMotion() ? 0 : 0.9, ease: 'power2.out' })
  }, { scope: root, dependencies: [Math.round(progress * 200)] })

  useGSAP(() => {
    if (!reducedMotion()) gsap.from('[data-anim]', { y: 14, autoAlpha: 0, stagger: 0.07, duration: 0.5 })
    const [d] = Draggable.create(pages.current, {
      type: 'y', bounds: { minY: -380, maxY: 0 }, edgeResistance: 0.8, dragClickables: false,
      onRelease() {
        const to = this.y < -90 ? -380 : 0
        gsap.to(pages.current, { y: to, duration: 0.5, ease: 'power3.out' })
        setPage(to ? 1 : 0)
      },
    })
    return () => d?.kill()
  }, { scope: root })

  const go = (p: number) => { gsap.to(pages.current, { y: p ? -380 : 0, duration: 0.5, ease: 'power3.out' }); setPage(p) }

  return (
    // Paging is done with transforms; focus moves would otherwise scroll this clipped box and misalign the pages.
    <div ref={root} className="relative h-full overflow-hidden rounded-full bg-[#141410] text-white" onScroll={(e) => { e.currentTarget.scrollTop = 0 }}>
      <div ref={pages} style={{ touchAction: 'none', willChange: 'transform' }}>
        <section className="relative flex h-[380px] flex-col items-center justify-center gap-2 text-center" aria-label="Next dose">
          <svg width="380" height="380" viewBox="0 0 380 380" className="absolute top-0 left-0" aria-hidden="true">
            <circle cx="190" cy="190" r="178" fill="none" stroke="#2C2C24" strokeWidth="10" />
            <circle ref={arc} cx="190" cy="190" r="178" fill="none" stroke="#A2A971" strokeWidth="10" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING} transform="rotate(-90 190 190)" />
          </svg>
          <span data-anim className="relative text-[15px] font-semibold text-sage-300">Next dose</span>
          <span data-anim className="relative text-[28px] font-extrabold">{v.next?.r.brand ?? 'None scheduled'}</span>
          {v.next && <span data-anim className="relative text-[50px] font-extrabold tracking-tight tabular-nums">{fmtCountdown(left)}</span>}
          {v.next && <span data-anim className="relative text-base text-[#D6CDB8]">at {hhmm12(v.next.r.time)}</span>}
          {flag && (
            <span data-anim className={`relative mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-extrabold ${flag.status === 'open' ? 'bg-[#E8B04A] text-ink' : 'bg-white/10 text-white'}`}>
              <I n={flag.status === 'open' ? 'alert' : 'check'} size={16} stroke={2.6} /> {statusText[flag.decision?.kind ?? 'open']}
            </span>
          )}
          <button onClick={() => go(1)} aria-label="Show vitals" className="absolute bottom-6 cursor-pointer text-white/50"><svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true"><path d="M2 10l12-8 12 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></button>
        </section>
        <section className="flex h-[380px] flex-col items-center justify-center gap-3 px-14 text-center" aria-label="Vitals">
          <span className="text-[13px] font-semibold text-white/60">Wearable estimates</span>
          <div className="grid w-full grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/10 p-3"><span className="flex items-center justify-center gap-1 text-xs text-white/70"><I n="heart" size={14} /> Pulse</span><p className="m-0 text-3xl font-extrabold">{pulse?.bpm ?? '—'}</p><span className="text-[11px] text-white/60">estimate</span></div>
            <div className="rounded-2xl bg-white/10 p-3"><span className="flex items-center justify-center gap-1 text-xs text-white/70"><I n="moon" size={14} /> Sleep</span><p className="m-0 text-3xl font-extrabold">{sleep?.hours ?? '—'}h</p><span className="text-[11px] text-white/60">estimate</span></div>
          </div>
          {bp && bp.sys >= BP_SYS_HINT && <p className="m-0 text-sm leading-snug text-[#E6E9D0]">BP estimate is high. Do a proper cuff check.</p>}
          <button onClick={() => go(0)} aria-label="Back to next dose" className="cursor-pointer text-white/50"><svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true"><path d="M2 2l12 8 12-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></button>
        </section>
      </div>
      <span className="sr-only" aria-live="polite">{page ? 'Vitals' : 'Next dose'}</span>
    </div>
  )
}

function Reminder({ id, brand, time, instructions, t }: { id: string; brand: string; time: string; instructions: string; t: number }) {
  const root = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  useGSAP(() => {
    navigator.vibrate?.([30, 80, 30])
    if (reducedMotion()) return
    gsap.from(root.current, { scale: 0.6, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.8)' })
    gsap.fromTo('[data-pulse]', { scale: 0.8, autoAlpha: 0.5 }, { scale: 1.12, autoAlpha: 0, duration: 1.6, repeat: -1, ease: 'sine.out' })
    gsap.to('[data-pill]', { rotate: 8, yoyo: true, repeat: -1, duration: 0.7, ease: 'sine.inOut' })
  }, { scope: root })

  const act = (action: 'taken' | 'snoozed') => {
    if (busy) return
    setBusy(true)
    const commit = () => logDose(id, dayKey(t), action)
    if (reducedMotion()) return commit()
    gsap.timeline({ onComplete: commit })
      .to('[data-pill]', { scale: action === 'taken' ? 1.4 : 0.8, rotate: 0, duration: 0.2, overwrite: true })
      .to(root.current, { scale: action === 'taken' ? 1.08 : 0.85, autoAlpha: 0, duration: 0.35, ease: 'power2.in' })
  }

  return (
    <div ref={root} className="relative flex h-full flex-col items-center justify-center gap-1.5 rounded-full bg-brand-600 px-12 text-center text-white">
      <span data-pulse className="pointer-events-none absolute inset-0 rounded-full border-[6px] border-white/60" aria-hidden="true" />
      <span data-pill><Pill size={44} light /></span>
      <span className="text-base font-bold">Time to take</span>
      <span className="text-[32px] leading-tight font-extrabold">{brand}</span>
      <span className="text-[15px] text-brand-50">{instructions} · {hhmm12(time)}</span>
      <div className="mt-3.5 flex gap-2.5">
        <Pressable onClick={() => act('taken')} className="flex h-14 w-32 items-center justify-center gap-1.5 rounded-full bg-white text-lg font-extrabold text-sage-900"><I n="check" size={20} stroke={3} /> Taken</Pressable>
        <Pressable onClick={() => act('snoozed')} className="h-14 w-24 rounded-full bg-[#8C2242] text-base font-bold text-white">10 min</Pressable>
      </div>
    </div>
  )
}
