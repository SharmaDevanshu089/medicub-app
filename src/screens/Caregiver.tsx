// Caregiver page (family member or ASHA worker): opens in any phone browser. Shows only the linked patient's
// doses and the missed-dose ladder; lets the caregiver confirm "taken" or say they're handling it.
import { useRef, useState } from 'react'
import { escalations, LADDER, type Escalation } from '../engine/care'
import { dayKey, fmtTime, useNow } from '../lib/time'
import { I } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP, useStaggerIn } from '../patient/motion'
import { notifyOnce } from '../patient/notify'
import { hhmm12, initials } from '../patient/view'
import { caregiverAcknowledge, caregiverConfirmTaken, login, logout, useClient, useStore } from '../store/store'
import type { Caregiver as CaregiverT } from '../store/types'
import { Gate } from '../ui/AppFrame'

const APP = { fontFamily: 'var(--font-app)' }
const PATIENT_PHONE = '+919845000001' // demo patient's number for the Call button

export default function Caregiver() {
  return (
    <Gate signIn={<SignIn />}>
      <Home />
    </Gate>
  )
}

function SignIn() {
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useStaggerIn(root, 'cg-login')
  const go = (n: string) => login({ phone: n }).catch((e: Error) => setErr(e.message))
  return (
    <div ref={root} className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-cream-50 px-6 pt-16 pb-8 text-ink" style={APP}>
      <div data-anim className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-[14px] bg-brand-600 text-white"><I n="heart" size={24} /></span><span className="text-2xl font-extrabold">Medicub Care</span></div>
      <h1 data-anim className="m-0 text-[30px] leading-tight font-extrabold tracking-tight">For family and ASHA workers</h1>
      <p data-anim className="m-0 text-lg text-muted">Get told if someone you look after misses a medicine — only if they've said yes.</p>
      <label data-anim className="flex flex-col gap-2 font-semibold text-muted">Your mobile number
        <div className="flex h-14 items-center overflow-hidden rounded-2xl border-[1.5px] border-line bg-white"><span className="px-4 font-bold text-ink">+91</span><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ''))} className="h-full flex-1 bg-transparent pr-4 text-lg text-ink outline-none" placeholder="98450 00002" /></div>
      </label>
      {err && <p className="m-0 font-semibold text-red-700" role="alert">{err}</p>}
      <Pressable data-anim disabled={phone.replace(/\D/g, '').length < 10} onClick={() => void go(`+91${phone}`)} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">Continue</Pressable>
      <div data-anim className="mt-auto flex flex-col gap-2 rounded-2xl border-[1.5px] border-dashed border-line p-4">
        <span className="text-sm font-bold text-subtle">Demo</span>
        <Pressable onClick={() => void go('+919845000002')} className="h-12 rounded-xl bg-cream-100 font-bold">Sunita — Ramesh's daughter</Pressable>
        <Pressable onClick={() => void go('+919845000003')} className="h-12 rounded-xl bg-cream-100 font-bold">Anita Devi — ASHA worker</Pressable>
      </div>
    </div>
  )
}

const when = (at: number) => `${dayKey(at) === dayKey(Date.now()) ? '' : dayKey(at) > dayKey(Date.now()) ? 'tomorrow ' : 'yesterday '}${fmtTime(at)}`

const STAGE_TEXT = { reminded: 'Reminded on phone and watch', repeat: 'Second reminder sent', family: 'Family told', asha: 'ASHA worker told' } as const

function Home() {
  const s = useStore()
  const t = useNow()
  const { me } = useClient()
  const root = useRef<HTMLDivElement>(null)
  useStaggerIn(root, 'cg-home')
  const p = s.patients[0]
  const mine: CaregiverT | undefined = me?.session.role === 'caregiver' ? p?.caregivers?.find((c) => c.id === (me.session.role === 'caregiver' ? me.session.caregiverId : '')) : undefined
  if (!p || !mine) return null
  const all = escalations(s, p.id, t)
  // A caregiver sees a dose once the ladder has reached them; ASHA workers only from the next morning.
  const forMe = all.filter((e) => e.ack || e.notified.some((n) => n.who.startsWith(mine.name)))
  const soon = all.filter((e) => !forMe.includes(e))
  forMe.forEach((e) => void notifyOnce(`esc:${mine.id}:${e.key}`, `${p.name} hasn't taken ${e.brand}`, `Due ${hhmm12(e.time)}. Open Medicub Care to check in.`))
  const today = s.reminders.filter((r) => r.patientId === p.id).sort((a, b) => a.time.localeCompare(b.time))

  return (
    <div ref={root} className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-cream-50 px-5 pt-10 pb-8 text-ink" style={APP}>
      <header data-anim className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-sage-400 font-extrabold">{initials(p.name)}</span>
        <div className="flex flex-1 flex-col"><span className="text-sm font-semibold text-subtle">You're looking after</span><b className="text-xl">{p.name}, {p.age}</b></div>
        <Pressable onClick={() => void logout()} aria-label="Sign out" className="grid size-11 place-items-center rounded-xl bg-white ring-1 ring-cream-200"><I n="logout" /></Pressable>
      </header>
      <p data-anim className="m-0 rounded-2xl bg-white px-4 py-3 text-sm text-muted">Signed in as <b className="text-ink">{mine.name}</b> · {mine.label}. You see doses only — not medical records.</p>

      {!mine.enabled ? (
        <section data-anim className="flex flex-col gap-2 rounded-3xl bg-white p-5"><b className="text-lg">{p.name} has paused sharing with you</b><span className="text-muted">You won't get missed-dose alerts until they turn it back on in their Medicub app.</span></section>
      ) : (
        <>
          {forMe.length === 0 && <section data-anim className="flex items-center gap-3 rounded-3xl bg-sage-50 p-5 text-sage-900"><I n="check" size={28} stroke={2.6} /><div><b className="text-lg">All fine right now</b><div className="text-sm">You'll be told if a dose is missed.</div></div></section>}
          {forMe.map((e) => <EscalationCard key={e.key} e={e} name={p.name} me={mine} />)}
          {soon.length > 0 && (
            <section data-anim className="flex flex-col gap-2 rounded-3xl bg-white p-4">
              <span className="text-sm font-bold text-subtle">Not marked yet — reminders still running</span>
              {soon.map((e) => <div key={e.key} className="flex items-center justify-between text-sm"><span><b>{e.brand}</b> · due {hhmm12(e.time)}</span><span className="text-muted">{e.nextStep ? `${e.nextStep.who.split(' (')[0]} at ${fmtTime(e.nextStep.at)}` : ''}</span></div>)}
            </section>
          )}
          <section data-anim className="flex flex-col gap-2 rounded-3xl bg-white p-4">
            <span className="text-sm font-bold text-subtle">Today's medicines</span>
            {today.map((r) => {
              const d = s.doseLog[`${r.id}@${dayKey(t)}`]
              const state = d?.action === 'taken' ? `Taken ${fmtTime(d.at)}${d.by ? ` · by ${d.by.split(' ')[0]}` : ''}` : d?.action === 'skipped' ? 'Skipped' : t < new Date(new Date(t).toDateString()).getTime() + Number(r.time.slice(0, 2)) * 3_600_000 + Number(r.time.slice(3)) * 60_000 ? 'Later today' : 'Not marked'
              return <div key={r.id} className="flex items-center gap-3 border-t border-divider pt-2 first:border-0 first:pt-0"><span className="w-16 text-sm font-bold text-sage-800">{hhmm12(r.time)}</span><span className="flex-1 font-semibold">{r.brand}</span><span className={`text-sm ${d?.action === 'taken' ? 'font-bold text-sage-800' : 'text-muted'}`}>{state}</span></div>
            })}
          </section>
          <p data-anim className="m-0 text-xs text-subtle">How alerts work: phone and watch at dose time → second reminder after {LADDER.repeatAfterMin} min → family after {LADDER.familyAfterMin} min → ASHA worker next morning at {LADDER.ashaAtHour}. Anyone marking the dose taken, or saying they're handling it, stops the alerts.</p>
        </>
      )}
    </div>
  )
}

function EscalationCard({ e, name, me }: { e: Escalation; name: string; me: CaregiverT }) {
  const card = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  useGSAP(() => {
    if (reducedMotion() || e.ack) return
    navigator.vibrate?.([40, 80, 40])
    gsap.fromTo(card.current, { boxShadow: '0 0 0 0 rgba(204,55,98,0.5)' }, { boxShadow: '0 0 0 14px rgba(204,55,98,0)', duration: 1.2, repeat: 2 })
  }, { dependencies: [e.key] })
  const run = (f: () => Promise<unknown>) => {
    setBusy(true)
    f().catch(() => setBusy(false))
  }
  const late = Math.round((Date.now() - e.dueAt) / 60_000)
  return (
    <section ref={card} data-anim className={`flex flex-col gap-3 rounded-3xl p-5 ${e.ack ? 'bg-white ring-1 ring-cream-200' : 'bg-white ring-2 ring-brand-600'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${e.ack ? 'bg-sage-100 text-sage-900' : 'bg-brand-50 text-brand-700'}`}><I n={e.ack ? 'check' : 'bell'} /></span>
        <div className="flex flex-col">
          <b className="text-lg leading-tight">{e.ack ? `${e.ack.by.split(' ')[0]} is handling it` : `${name} hasn't marked ${e.brand}`}</b>
          <span className="text-sm text-muted">Due {hhmm12(e.time)}{e.day !== dayKey(Date.now()) ? ' yesterday' : ''}{!e.ack && late > 0 ? ` · ${late >= 120 ? `${Math.round(late / 60)} h` : `${late} min`} ago` : ''}{e.ack ? ` · “${e.ack.note}”` : ''}</span>
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        {e.notified.map((n) => <li key={n.who} className="flex items-center gap-2"><span className="text-sage-700"><I n="check" size={14} stroke={3} /></span>{n.who}<span className="ml-auto text-subtle">{when(n.at)}</span></li>)}
        {e.nextStep && <li className="flex items-center gap-2 text-subtle"><span className="size-3.5 rounded-full border-2 border-line" />{e.nextStep.who}<span className="ml-auto">{when(e.nextStep.at)}</span></li>}
      </ol>
      <span className="text-xs font-semibold text-subtle">Now: {STAGE_TEXT[e.stage]}</span>
      {!e.ack && (
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${PATIENT_PHONE}`} className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink font-bold text-white no-underline"><I n="bell" size={18} /> Call {name.split(' ')[0]}</a>
          <Pressable disabled={busy} onClick={() => run(() => caregiverConfirmTaken(e.reminderId, e.day))} className="h-12 rounded-2xl bg-sage-700 font-bold text-white">He's taken it</Pressable>
          <Pressable disabled={busy} onClick={() => run(() => caregiverAcknowledge(e.reminderId, e.day, me.relation === 'asha' ? 'Visiting today' : 'Calling him now'))} className="h-12 rounded-2xl font-bold ring-[1.5px] ring-line">{me.relation === 'asha' ? "I'll visit" : "I'll handle it"}</Pressable>
        </div>
      )}
    </section>
  )
}
