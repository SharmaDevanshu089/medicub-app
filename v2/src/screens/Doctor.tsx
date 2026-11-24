import { useEffect, useRef, useState } from 'react'
import { FlagCard } from '../doctor/FlagCard'
import { Patient360 } from '../doctor/Patient360'
import { fmtDateTime, fmtTime, useNow } from '../lib/time'
import { I } from '../patient/icons'
import { gsap, Pressable, reducedMotion, Sheet, useGSAP, useStaggerIn } from '../patient/motion'
import { initials } from '../patient/view'
import { getInitialState } from '../store/initial-state'
import { RecordingBar } from '../consultation/RecordingBar'
import { Gate } from '../ui/AppFrame'
import { doctorName, hasAccess, login, logout, patientName, useStore } from '../store/store'
import type { CheckIn, Doctor as DoctorT, PatientId, State } from '../store/types'

const APP = { fontFamily: 'var(--font-app)' }

export default function Doctor() {
  return (
    <Gate signIn={<DoctorSignIn />}>
      <DoctorApp />
    </Gate>
  )
}

const VERIFIED_DOCTORS = getInitialState(0).doctors

function DoctorApp() {
  const s = useStore()
  const t = useNow()
  const [open, setOpen] = useState<PatientId | null>(null)
  const [inbox, setInbox] = useState(false)
  const badge = useRef<HTMLSpanElement>(null)
  const me = s.doctors.find((d) => d.id === s.doctorId)
  const myOpen = me ? s.flags.filter((f) => f.ownerId === me.id && f.status === 'open').length : 0
  const unread = me ? s.inbox.filter((m) => m.toId === me.id).length : 0

  // Bounce the inbox badge whenever something new lands in it.
  useGSAP(() => {
    if (myOpen + unread > 0 && !reducedMotion()) gsap.fromTo(badge.current, { scale: 0.4 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1.2, 0.4)' })
  }, { dependencies: [myOpen + unread] })

  if (!me) return null
  const canOpen = open !== null && hasAccess(s, me.id, open, t)
  const activeSession = (s.consultations ?? []).find(
    (c) =>
      (c.status === 'recording' || c.status === 'paused' || c.status === 'processing') &&
      c.doctorId === me.id &&
      (open ? c.patientId === open : true),
  )

  return (
    <div className="min-h-screen bg-cream-50 text-ink" style={APP}>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cream-200 bg-cream-50/90 px-5 py-3 backdrop-blur">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white"><I n="plus" size={22} stroke={2.4} /></span>
        <span className="text-xl font-extrabold tracking-tight">Medicub</span>
        <span className="ml-2 hidden rounded-full bg-sage-100 px-3 py-1 text-sm font-bold text-sage-900 sm:inline-flex sm:items-center sm:gap-1"><I n="shield" size={16} /> Verified</span>
        <span className="ml-auto hidden text-base font-semibold text-muted md:block">{me.name} · {me.specialty}</span>
        <Pressable onClick={() => setInbox(true)} aria-label={`Inbox, ${myOpen} open flags, ${unread} messages`} className="relative flex h-12 items-center gap-2 rounded-2xl bg-white px-4 font-bold ring-1 ring-cream-200">
          <I n="inbox" /> <span className="hidden sm:inline">Inbox</span>
          {myOpen + unread > 0 && <span ref={badge} className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-sm font-extrabold ${myOpen ? 'bg-amber-500 text-ink' : 'bg-brand-600 text-white'}`}>{myOpen + unread}</span>}
        </Pressable>
        <Pressable onClick={logout} aria-label="Sign out" className="grid size-12 place-items-center rounded-2xl bg-white text-muted ring-1 ring-cream-200"><I n="logout" /></Pressable>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 p-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Sidebar s={s} me={me} t={t} open={open} setOpen={setOpen} />
        <main className="min-w-0">
          {open && canOpen ? <Patient360 key={open} s={s} me={me} pid={open} t={t} /> : <Empty s={s} me={me} ended={open !== null} />}
        </main>
      </div>
      <footer className="flex flex-wrap justify-center gap-3 py-6 text-sm text-subtle">
        <span className="flex items-center gap-1 font-bold text-sage-800"><I n="shield" size={16} /> Decision support, not a decision</span>
        <span className="rounded bg-cream-200 px-2 font-semibold">Synthetic data</span>
        <a href="/" className="font-semibold text-brand-700">Launcher</a>
      </footer>

      <ArrivalToast s={s} me={me} onOpen={setOpen} />
      {activeSession && (
        <RecordingBar
          sessionId={activeSession.id}
          patientName={patientName(activeSession.patientId)}
          doctorName={me.name}
          role="doctor"
        />
      )}
      {inbox && <InboxDrawer s={s} me={me} t={t} onClose={() => setInbox(false)} />}
    </div>
  )
}

export function DoctorSignIn() {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const card = useRef<HTMLDivElement>(null)
  useStaggerIn(card, 'login')
  const go = () => {
    void login({ email: email.trim() }).catch((e: Error) => {
      setErr(e.message)
      if (!reducedMotion()) gsap.fromTo(card.current, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.4, 0.3)' })
    })
  }
  return (
    <div className="grid min-h-screen place-items-center bg-cream-50 p-5 text-ink" style={APP}>
      <div ref={card} className="flex w-full max-w-md flex-col gap-5 rounded-[28px] bg-white p-8 shadow-[0_20px_60px_rgba(40,30,10,0.08)]">
        <div data-anim className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-[14px] bg-brand-600 text-white"><I n="plus" size={26} stroke={2.4} /></span><span className="text-2xl font-extrabold tracking-tight">Medicub</span></div>
        <div data-anim><h1 className="m-0 text-[30px] font-extrabold tracking-tight">Clinician sign-in</h1><p className="m-0 mt-1 text-muted">Only DigiLocker + NMC verified doctors can sign in.</p></div>
        <label data-anim className="flex flex-col gap-1.5 font-semibold text-muted">Email
          <input value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="you@clinic.in" className="h-14 rounded-2xl border-[1.5px] border-line bg-cream-50 px-4 text-lg text-ink" />
        </label>
        {err && <p className="m-0 text-[15px] font-semibold text-red-700" role="alert">{err}</p>}
        <Pressable data-anim onClick={go} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">Continue</Pressable>
        <div data-anim className="flex flex-col gap-2 border-t border-divider pt-5">
          <span className="text-sm font-bold text-subtle">Verified clinician accounts</span>
          {VERIFIED_DOCTORS.map((d) => (
            <Pressable key={d.id} onClick={() => void login({ doctorId: d.id }).catch((e: Error) => setErr(e.message))} className="flex h-14 items-center gap-3 rounded-2xl bg-cream-50 px-3 text-left">
              <span className="grid size-10 place-items-center rounded-full bg-brand-600 text-sm font-extrabold text-white">{initials(d.name)}</span>
              <span className="flex flex-1 flex-col"><b>{d.name}</b><span className="text-sm text-muted">{d.specialty}</span></span><I n="chevron" size={18} />
            </Pressable>
          ))}
        </div>
        <a data-anim href="/onboard" className="text-center font-bold text-brand-700">New doctor? Register and verify →</a>
        <p data-anim className="m-0 text-center text-sm text-subtle">Patients share their record by tapping their phone on the Medicub tag at your desk.</p>
      </div>
    </div>
  )
}

function Sidebar({ s, me, t, open, setOpen }: { s: State; me: DoctorT; t: number; open: PatientId | null; setOpen: (p: PatientId) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useStaggerIn(root, 'side')
  const mine = s.patients.filter((p) => p.currentDoctorId === me.id)
  const shared = s.patients.filter((p) => p.currentDoctorId !== me.id && hasAccess(s, me.id, p.id, t))
  const latest = new Map<PatientId, CheckIn>()
  for (const c of s.checkIns.filter((x) => x.doctorId === me.id)) latest.set(c.patientId, c)
  const arrivals = [...latest.values()].sort((a, b) => b.at - a.at)

  const row = (pid: PatientId, sub: string) => {
    const p = s.patients.find((x) => x.id === pid)
    if (!p) return null
    const flags = s.flags.filter((f) => f.patientId === pid && f.status === 'open').length
    const active = open === pid
    return (
      <Pressable key={pid} data-anim onClick={() => setOpen(pid)} aria-current={active ? 'true' : undefined} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors duration-200 ${active ? 'bg-ink text-white' : 'bg-white hover:bg-cream-100'}`}>
        <span className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-extrabold ${active ? 'bg-white/15' : 'bg-sage-100 text-sage-900'}`}>{initials(p.name)}</span>
        <span className="flex min-w-0 flex-1 flex-col"><b className="truncate">{p.name}, {p.age}</b><span className={`truncate text-sm ${active ? 'text-white/70' : 'text-muted'}`}>{sub}</span></span>
        {flags > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-extrabold text-ink"><I n="alert" size={12} stroke={2.8} />{flags}</span>}
      </Pressable>
    )
  }

  return (
    <aside ref={root} className="flex min-w-0 flex-col gap-5">
      {arrivals.length > 0 && (
        <section data-anim className="flex flex-col gap-2 rounded-3xl bg-brand-50 p-4">
          <h2 className="m-0 flex items-center gap-2 text-base font-extrabold text-brand-700"><I n="bell" size={18} /> Waiting room</h2>
          {arrivals.map((c) => (
            <Pressable key={c.patientId} onClick={() => setOpen(c.patientId)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left">
              <span className="text-brand-600"><I n={c.kind === 'nfc' ? 'nfc' : c.kind === 'qr' ? 'qr' : c.kind === 'joined' ? 'sparkle' : 'pin'} size={22} /></span>
              <span className="flex flex-1 flex-col"><b>{patientName(c.patientId)}</b><span className="text-sm text-muted">{c.kind === 'nfc' ? 'Tapped your tag — record shared' : c.kind === 'qr' ? 'Scanned your QR — record shared' : c.kind === 'joined' ? 'Chose you as their doctor' : 'Checked in'} · {fmtTime(c.at)}</span></span>
            </Pressable>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 data-anim className="m-0 flex items-center justify-between text-base font-extrabold">My patients <span className="text-sm font-bold text-subtle">{mine.length}</span></h2>
        {mine.length === 0 && <p data-anim className="m-0 rounded-2xl bg-white p-4 text-muted">No patients yet. Patients near your clinic can choose you as their doctor.</p>}
        {mine.map((p) => row(p.id, p.conditions.map((c) => c.name).join(', ')))}
      </section>
      {shared.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-extrabold">Shared with you</h2>
          {shared.map((p) => row(p.id, `Main doctor: ${doctorName(p.currentDoctorId)}`))}
        </section>
      )}
      <a data-anim href="/qr" target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-line bg-white font-bold text-ink no-underline">
        <I n="qr" size={20} /> Show my clinic QR
      </a>
      <p data-anim className="m-0 text-xs text-subtle">Put it on a screen at your desk. Patients scan it in the Medicub app to share their record with you.</p>
    </aside>
  )
}

function Empty({ s, me, ended }: { s: State; me: DoctorT; ended: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useStaggerIn(root, ended)
  const open = s.flags.filter((f) => f.ownerId === me.id && f.status === 'open').length
  return (
    <div ref={root} className="flex flex-col gap-4 rounded-3xl bg-white p-8">
      <h1 data-anim className="m-0 text-[30px] font-extrabold tracking-tight">{ended ? 'Access to this record has ended' : `Good to see you, ${me.name.replace(/^Dr\s+/, 'Dr ')}`}</h1>
      <p data-anim className="m-0 text-lg text-muted">{ended ? 'The patient stopped sharing, or the time window closed. Ask them to tap your desk tag again.' : 'Pick a patient on the left. When a patient taps your desk tag, they appear in the waiting room instantly.'}</p>
      {open > 0 && <p data-anim className="m-0 flex items-center gap-2 rounded-2xl bg-[#FCEFD3] p-4 font-bold text-[#5C3B00]"><I n="alert" /> {open} flag{open > 1 ? 's' : ''} waiting for your decision — open the Inbox.</p>}
    </div>
  )
}

/** Slides in when a patient taps your tag, checks in, or picks you — the live moment of the demo. */
function ArrivalToast({ s, me, onOpen }: { s: State; me: DoctorT; onOpen: (p: PatientId) => void }) {
  const mine = s.checkIns.filter((c) => c.doctorId === me.id)
  const seen = useRef(mine.length)
  const [toast, setToast] = useState<CheckIn | null>(null)
  const el = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (mine.length > seen.current) setToast(mine.at(-1) ?? null)
    seen.current = mine.length
  }, [mine.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useGSAP(() => {
    if (!toast) return
    const tl = gsap.timeline({ onComplete: () => setToast(null) })
    tl.fromTo(el.current, { x: 420, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: reducedMotion() ? 0 : 0.6, ease: 'back.out(1.3)' })
      .to(el.current, { x: 420, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=6')
    return () => tl.kill()
  }, { dependencies: [toast?.at] })
  if (!toast) return null
  return (
    <button ref={el} onClick={() => { onOpen(toast.patientId); setToast(null) }} className="fixed top-20 right-5 z-30 flex w-[min(380px,90vw)] cursor-pointer items-center gap-3 rounded-3xl bg-ink p-4 text-left text-white shadow-2xl" style={{ ...APP, touchAction: 'manipulation' }}>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-600"><I n={toast.kind === 'nfc' ? 'nfc' : toast.kind === 'qr' ? 'qr' : toast.kind === 'joined' ? 'sparkle' : 'pin'} /></span>
      <span className="flex flex-col"><b className="text-lg">{patientName(toast.patientId)}</b><span className="text-white/80">{toast.kind === 'nfc' ? 'Tapped your tag — record shared' : toast.kind === 'qr' ? 'Scanned your QR — record shared' : toast.kind === 'joined' ? 'Chose you as their doctor' : 'Checked in'}</span><span className="text-sm font-bold text-[#F2B8C8]">Open record →</span></span>
    </button>
  )
}

function InboxDrawer({ s, me, t, onClose }: { s: State; me: DoctorT; t: number; onClose: () => void }) {
  const flags = s.flags.filter((f) => f.ownerId === me.id).sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || b.createdAt - a.createdAt)
  const msgs = s.inbox.filter((m) => m.toId === me.id)
  return (
    <Sheet open side="right" label="Inbox" onClose={onClose}>
      {(close) => (
        <div className="flex flex-col gap-4" style={APP}>
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[28px] font-extrabold">Inbox</h2>
            <Pressable aria-label="Close inbox" onClick={() => close()} className="grid size-11 place-items-center rounded-xl bg-cream-100"><I n="x" /></Pressable>
          </div>
          <p className="m-0 text-sm text-muted">Flags assigned to you stay open until you record a decision and reason. Swipe right or press Esc to close.</p>
          {flags.length === 0 && msgs.length === 0 && <p className="m-0 rounded-2xl bg-white p-5 text-muted">Nothing here. All clear.</p>}
          {flags.map((f) => <FlagCard key={f.id} flag={f} by={me.name} now={t} showPatient />)}
          {msgs.length > 0 && <h3 className="m-0 mt-2 text-lg font-extrabold">Second-opinion requests</h3>}
          {msgs.map((m) => (
            <details key={m.id} className="rounded-3xl bg-white p-4">
              <summary className="cursor-pointer list-none"><b>{m.title}</b><span className="block text-sm text-muted">from {m.from} · {fmtDateTime(m.at)}</span></summary>
              <ul className="m-0 mt-3 flex flex-col gap-1.5 pl-5 text-[15px]">{m.lines.map((l, i) => <li key={i}>{l.text} <span className="text-subtle">— {l.source}</span></li>)}</ul>
            </details>
          ))}
        </div>
      )}
    </Sheet>
  )
}
