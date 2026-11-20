import { useRef, useState } from 'react'
import { LADDER } from '../engine/care'
import { speak } from '../lib/device'
import { statusText } from '../lib/status'
import { dayKey, fmtCountdown, fmtTime, slotOf, type DoseStatus } from '../lib/time'
import { checkIn, logDose } from '../store/store'
import type { Flag, State } from '../store/types'
import { I, Pill } from './icons'
import { collapse, gsap, Pressable, reducedMotion, useGSAP, useStaggerIn } from './motion'
import { hhmm12, patientView, type DoseRow } from './view'

type View = ReturnType<typeof patientView>

export function Today({ s, t, v, onTapTag, onCheck }: { s: State; t: number; v: View; onTapTag: () => void; onCheck: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useStaggerIn(root, 'today') // first paint only; cards that appear later animate themselves
  const first = v.me?.name.split(' ')[0] ?? ''
  const h = new Date(t).getHours()
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'

  const readAloud = () => {
    const parts = [
      ...v.flags.filter((f) => f.status === 'open').map((f) => `${f.patient} ${statusText.open}.`),
      v.due[0] ? `Time to take ${v.due.map((d) => d.r.brand).join(' and ')}.` : v.next ? `Next dose: ${v.next.r.brand} at ${hhmm12(v.next.r.time)}.` : 'No doses scheduled.',
    ]
    speak(parts.join(' '))
  }

  return (
    <div ref={root} className="flex flex-col gap-4 px-5 pt-[60px] pb-6">
      <div data-anim className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold text-subtle">{new Date(t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1 className="m-0 text-[30px] leading-tight font-extrabold tracking-tight">{hello}, {first}</h1>
        </div>
        <Pressable aria-label="Read this screen aloud" onClick={readAloud} className="grid size-12 place-items-center rounded-[14px] bg-cream-100 text-sage-800"><I n="speaker" /></Pressable>
      </div>

      {v.flags.slice(0, 2).map((f) => <AlertCard key={f.id} f={f} />)}

      {v.tagDoctor && <ClinicCard s={s} t={t} v={v} onTapTag={onTapTag} />}

      {v.due[0] ? <DueCard key={v.due[0].r.id} row={v.due[0]} t={t} more={v.due.length - 1} family={v.me?.caregivers?.find((c) => c.enabled && c.relation === 'family')?.name} /> : <CaughtUp v={v} t={t} />}

      <Pressable onClick={onCheck} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] border-line bg-white text-base font-bold"><I n="camera" size={22} /> Check a medicine strip</Pressable>

      <DayList rows={v.rows} />
    </div>
  )
}

function AlertCard({ f }: { f: Flag }) {
  const dot = useRef<HTMLSpanElement>(null)
  const open = f.status === 'open'
  const box = useRef<HTMLElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.from(box.current, { y: -16, autoAlpha: 0, duration: 0.5 })
  }, { dependencies: [] })
  useGSAP(() => {
    if (open && !reducedMotion()) gsap.to(dot.current, { scale: 1.6, autoAlpha: 0.35, repeat: -1, yoyo: true, duration: 0.8, ease: 'sine.inOut' })
  }, { dependencies: [open] })
  const st = statusText[f.decision?.kind ?? 'open']
  return (
    <section ref={box} className={`flex flex-col gap-3.5 rounded-[22px] border-[1.5px] p-[18px] ${open ? 'border-[#E8C77A] bg-[#FCEFD3]' : 'border-sage-200 bg-sage-50'}`}>
      <div className="flex items-start gap-3">
        <span className={open ? 'text-[#7A4E00]' : 'text-sage-800'}><I n={open ? 'alert' : 'check'} size={28} stroke={2.2} /></span>
        <div className="flex flex-col gap-1.5">
          <span className={`text-lg font-extrabold ${open ? 'text-[#5C3B00]' : 'text-sage-900'}`}>{open ? 'Please check before your next dose' : 'Your doctor has reviewed this'}</span>
          <p className={`m-0 text-base leading-normal ${open ? 'text-[#4A3300]' : 'text-sage-900'}`}>{f.patient}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5" aria-live="polite">
        <span className="relative grid size-2.5 place-items-center">
          <span ref={dot} className={`absolute size-2.5 rounded-full ${open ? 'bg-brand-600' : 'bg-sage-700'}`} />
          <span className={`size-2.5 rounded-full ${open ? 'bg-brand-600' : 'bg-sage-700'}`} />
        </span>
        <span className="flex-1 text-[15px] font-bold">{st}</span>
        <span className="text-[13px] text-subtle">{fmtTime(f.decision?.at ?? f.createdAt)}</span>
      </div>
      <Pressable onClick={() => speak(`${f.patient} ${st}.`)} className={`flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-bold ${open ? 'text-[#5C3B00]' : 'text-sage-900'}`}><I n="speaker" size={20} /> Read this to me</Pressable>
    </section>
  )
}

function ClinicCard({ s, t, v, onTapTag }: { s: State; t: number; v: View; onTapTag: () => void }) {
  const box = useRef<HTMLElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.from(box.current, { y: 20, autoAlpha: 0, duration: 0.55, ease: 'back.out(1.3)' })
  }, { dependencies: [v.tagDoctor?.id] })
  const d = v.tagDoctor
  if (!d || !v.me) return null
  const isMine = d.id === v.me.currentDoctorId
  const checked = isMine && s.checkIns.some((c) => c.patientId === v.me?.id && c.doctorId === d.id && dayKey(c.at) === dayKey(t))
  return (
    <section ref={box} className="flex flex-col gap-3.5 rounded-[22px] bg-white p-[18px]">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-sage-100 text-sage-800"><I n="pin" /></span>
        <div className="flex flex-col">
          <span className="text-[17px] font-extrabold">You're at {d.clinic.name.split(',')[0]}</span>
          <span className="text-[15px] text-muted">{d.name}{isMine ? ' · your doctor' : ''}</span>
        </div>
      </div>
      {isMine && (checked
        ? <p className="m-0 flex items-center gap-2 rounded-2xl bg-sage-50 px-4 py-3 font-bold text-sage-900"><I n="check" size={22} stroke={2.6} /> Checked in — the clinic knows you're here</p>
        : <Pressable onClick={() => checkIn(v.me!.id, d.id)} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">I'm here</Pressable>)}
      <Pressable onClick={onTapTag} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] border-line text-base font-bold"><I n="nfc" size={22} /> Share with doctor — tap their tag</Pressable>
    </section>
  )
}

function DueCard({ row, t, more, family }: { row: DoseRow; t: number; more: number; family?: string }) {
  const card = useRef<HTMLElement>(null)
  const badge = useRef<HTMLSpanElement>(null)
  const burst = useRef<HTMLSpanElement>(null)
  const [busy, setBusy] = useState(false)
  const dk = dayKey(t)
  useGSAP(() => {
    if (reducedMotion()) return
    gsap.from(card.current, { y: 24, scale: 0.97, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.4)', clearProps: 'transform' })
    gsap.to(badge.current, { scale: 1.06, repeat: -1, yoyo: true, duration: 0.9, ease: 'sine.inOut' })
  }, { scope: card })

  const act = (action: 'taken' | 'snoozed' | 'skipped') => {
    if (busy) return
    setBusy(true)
    navigator.vibrate?.(action === 'taken' ? [12, 40, 12] : 10)
    if (reducedMotion()) return logDose(row.r.id, dk, action)
    const tl = gsap.timeline({ onComplete: () => collapse(card.current, () => logDose(row.r.id, dk, action)) })
    if (action === 'taken') {
      tl.fromTo(burst.current, { scale: 0, autoAlpha: 0.6 }, { scale: 9, autoAlpha: 0, duration: 0.6, ease: 'power2.out' })
        .fromTo('[data-check]', { scale: 0, rotate: -30 }, { scale: 1, rotate: 0, duration: 0.45, ease: 'back.out(2.5)' }, 0)
        .to(card.current, { y: -8, duration: 0.25 }, 0.3)
    } else {
      tl.to(card.current, { x: action === 'skipped' ? -40 : 40, autoAlpha: 0.4, duration: 0.3, ease: 'power2.in' })
    }
  }

  return (
    <section ref={card} className="flex flex-col gap-[18px] overflow-hidden rounded-3xl border-2 border-brand-600 bg-white p-5 shadow-[0_8px_24px_rgba(60,50,20,0.08)]">
      <div className="flex items-center justify-between">
        <span ref={badge} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-bold text-white"><I n="clock" size={16} stroke={2.4} /> Due now · {hhmm12(row.r.time)}</span>
        <span className="text-sm font-semibold text-subtle">{row.r.createdBy}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="grid size-[76px] shrink-0 place-items-center rounded-[20px] bg-brand-50"><Pill /></div>
        <div className="flex flex-col gap-1">
          <span className="text-[26px] font-extrabold tracking-tight">{row.r.brand}</span>
          <span className="text-[17px] text-muted">{row.r.instructions}{more > 0 ? ` · +${more} more due` : ''}</span>
        </div>
      </div>
      <Pressable onClick={() => act('taken')} className="relative flex h-[60px] items-center justify-center gap-2.5 overflow-hidden rounded-[18px] bg-sage-700 text-xl font-bold text-white">
        <span ref={burst} className="pointer-events-none absolute size-10 rounded-full bg-white opacity-0" aria-hidden="true" />
        <span data-check className="relative"><I n="check" size={24} stroke={2.6} /></span>
        <span className="relative">I've taken it</span>
      </Pressable>
      <div className="grid grid-cols-2 gap-2.5">
        <Pressable onClick={() => act('snoozed')} className="h-[50px] rounded-[14px] border-[1.5px] border-line bg-white text-base font-semibold">Remind in 10 min</Pressable>
        <Pressable onClick={() => act('skipped')} className="h-[50px] rounded-[14px] border-[1.5px] border-line bg-white text-base font-semibold text-muted">Skip this dose</Pressable>
      </div>
      {family && <span className="text-center text-sm text-subtle">Not marked in {LADDER.familyAfterMin} min? We'll let {family.split(' ')[0]} know.</span>}
    </section>
  )
}

function CaughtUp({ v, t }: { v: View; t: number }) {
  const ring = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.from(ring.current, { scale: 0.4, rotate: -90, duration: 0.8, ease: 'back.out(2)' })
  }, { dependencies: [] })
  return (
    <section className="flex items-center gap-4 rounded-3xl bg-sage-100 p-5">
      <div ref={ring} className="grid size-16 shrink-0 place-items-center rounded-full bg-sage-700 text-white"><I n="check" size={32} stroke={2.6} /></div>
      <div className="flex flex-col gap-1">
        <span className="text-[21px] font-extrabold text-sage-900">All caught up</span>
        <span className="text-base text-sage-900">{v.next ? `Next: ${v.next.r.brand} at ${hhmm12(v.next.r.time)} · in ${fmtCountdown(v.next.at - t)}` : 'No doses scheduled'}</span>
      </div>
    </section>
  )
}

const MARK: Record<DoseStatus, { label: string; cls: string }> = {
  taken: { label: 'Taken', cls: 'bg-sage-700 text-white' },
  skipped: { label: 'Skipped', cls: 'bg-cream-200 text-muted' },
  snoozed: { label: 'Snoozed', cls: 'bg-[#FCEFD3] text-[#5C3B00]' },
  due: { label: 'Due now', cls: 'bg-brand-600 text-white' },
  missed: { label: 'Missed', cls: 'bg-[#FCEFD3] text-[#5C3B00]' },
  upcoming: { label: '', cls: 'border-2 border-sage-400' },
}

function DayList({ rows }: { rows: DoseRow[] }) {
  const [open, setOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const later = rows.filter((x) => x.status === 'upcoming')
  const toggle = () => {
    const el = body.current
    if (!el) return setOpen(!open)
    if (open) gsap.to(el, { height: 0, autoAlpha: 0, duration: reducedMotion() ? 0 : 0.4, ease: 'power2.inOut', onComplete: () => setOpen(false) })
    else {
      setOpen(true)
      requestAnimationFrame(() => gsap.fromTo(el, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: reducedMotion() ? 0 : 0.45, ease: 'power2.out' }))
    }
  }
  return (
    <section data-anim className="flex flex-col gap-2.5">
      {!open && later.length > 0 && (
        <>
          <h2 className="m-0 text-lg font-bold">Later today</h2>
          <div className="flex flex-col rounded-[18px] bg-white">
            {later.map((x, i) => (
              <div key={x.r.id} className={`flex items-center gap-3.5 px-4 py-3.5 ${i ? 'border-t border-divider' : ''}`}>
                <span className="w-[68px] text-base font-bold text-sage-800">{hhmm12(x.r.time)}</span>
                <span className="flex-1 text-[17px] font-semibold">{x.r.brand}</span>
                <span className="text-sm text-subtle">{x.r.instructions}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div ref={body} className="overflow-hidden" style={{ height: open ? 'auto' : 0 }}>
        {open && (
          <div className="flex flex-col gap-3.5 rounded-[18px] bg-white p-4">
            {(['morning', 'noon', 'night'] as const).map((slot) => {
              const list = rows.filter((x) => slotOf(x.r.time) === slot)
              return (
                <div key={slot} className="flex flex-col gap-3">
                  <span className="text-sm font-bold tracking-wide text-subtle uppercase">{slot === 'noon' ? 'Afternoon' : slot === 'morning' ? 'Morning' : 'Night'}</span>
                  {list.length === 0 && <span className="text-base text-subtle">Nothing to take</span>}
                  {list.map((x) => (
                    <div key={x.r.id} className="flex items-center gap-3">
                      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${MARK[x.status].cls}`}>{x.status === 'taken' && <I n="check" size={16} stroke={3} />}</span>
                      <span className="flex-1 text-[17px] font-semibold">{x.r.brand}</span>
                      <span className="text-sm font-semibold text-subtle">{MARK[x.status].label || hhmm12(x.r.time)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <Pressable onClick={toggle} aria-expanded={open} className="self-start rounded-lg py-1 text-base font-bold text-brand-700">{open ? 'Show less' : 'See the whole day'}</Pressable>
    </section>
  )
}
