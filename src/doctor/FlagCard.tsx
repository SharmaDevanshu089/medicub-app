import { useRef, useState } from 'react'
import type { Severity } from '../engine/rules'
import { I } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP } from '../patient/motion'
import { fmtDateTime } from '../lib/time'
import { decideFlag, doctorName, patientName } from '../store/store'
import type { DecisionKind, Flag } from '../store/types'

const SEV: Record<Severity, { cls: string; ring: string; icon: 'alert' | 'block' }> = {
  LOW: { cls: 'bg-cream-100 text-muted', ring: 'border-line', icon: 'alert' },
  MODERATE: { cls: 'bg-[#FCEFD3] text-[#5C3B00]', ring: 'border-[#E8C77A]', icon: 'alert' },
  HIGH: { cls: 'bg-[#FCEFD3] text-[#5C3B00]', ring: 'border-[#E8C77A]', icon: 'alert' },
  CRITICAL: { cls: 'bg-red-100 text-red-800', ring: 'border-red-400', icon: 'block' },
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEV[severity]
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold tracking-wide ${s.cls}`}><I n={s.icon} size={14} stroke={2.6} />{severity}</span>
}

const CLINICAL: { kind: DecisionKind; label: string }[] = [
  { kind: 'intentional', label: 'Intentional' },
  { kind: 'change-planned', label: 'Change planned' },
  { kind: 'dismissed', label: 'Dismiss' },
]
const REQUEST: { kind: DecisionKind; label: string }[] = [
  { kind: 'approved', label: 'Approve' },
  { kind: 'rejected', label: 'Reject' },
]

/** One flag. `by` = the signed-in owner's name; without it the card is read-only. */
export function FlagCard({ flag, by, now, showPatient = false }: { flag: Flag; by?: string; now: number; showPatient?: boolean }) {
  const card = useRef<HTMLElement>(null)
  const why = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<DecisionKind | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const s = SEV[flag.severity]
  const isOpen = flag.status === 'open'
  const overdue = isOpen && now > flag.deadline
  const canDecide = isOpen && !!by && doctorName(flag.ownerId) === by

  useGSAP(() => {
    if (reducedMotion()) return
    gsap.from(card.current, { y: 16, autoAlpha: 0, duration: 0.5 })
    // A new open flag gets one attention pulse — noticeable, not an alarm.
    if (isOpen) gsap.fromTo(card.current, { boxShadow: '0 0 0 0 rgba(232,176,74,0.6)' }, { boxShadow: '0 0 0 14px rgba(232,176,74,0)', duration: 1.1, delay: 0.3 })
  }, { scope: card, dependencies: [] })

  useGSAP(() => {
    if (!isOpen && !reducedMotion()) gsap.from('[data-resolved]', { scale: 0.6, autoAlpha: 0, duration: 0.5, ease: 'back.out(2)' })
  }, { scope: card, dependencies: [isOpen] })

  const toggleWhy = () => {
    if (!open) {
      setOpen(true)
      requestAnimationFrame(() => gsap.fromTo(why.current, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: reducedMotion() ? 0 : 0.4 }))
    } else gsap.to(why.current, { height: 0, autoAlpha: 0, duration: reducedMotion() ? 0 : 0.3, onComplete: () => setOpen(false) })
  }
  const choices = flag.request ? REQUEST : CLINICAL
  const ok = kind !== null && reason.trim().length >= 3

  return (
    <article ref={card} className={`rounded-3xl border-[1.5px] bg-white p-5 ${isOpen ? s.ring : 'border-sage-200'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={flag.severity} />
        <span className="rounded-full bg-cream-100 px-2.5 py-1 font-mono text-xs font-bold text-muted">{flag.ruleId}</span>
        {flag.request && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">From pharmacy</span>}
        {isOpen
          ? <span className={`ml-auto flex items-center gap-1 text-sm font-semibold ${overdue ? 'text-red-700' : 'text-subtle'}`}><I n="clock" size={16} /> {overdue ? 'Overdue · ' : 'Respond by '}{fmtDateTime(flag.deadline)}</span>
          : <span data-resolved className="ml-auto flex items-center gap-1 text-sm font-bold text-sage-800"><I n="check" size={16} stroke={2.8} /> Resolved</span>}
      </div>
      {showPatient && <p className="m-0 mt-3 text-sm font-bold text-subtle">{patientName(flag.patientId)}</p>}
      <h3 className="m-0 mt-2 text-xl font-extrabold">{flag.title}</h3>
      <p className="m-0 mt-1 text-[15px] text-muted">Owner <b>{doctorName(flag.ownerId)}</b> · raised by {flag.raisedBy}</p>

      <Pressable onClick={toggleWhy} aria-expanded={open} className="mt-3 flex items-center gap-1.5 rounded-lg py-1 text-[15px] font-bold text-brand-700">
        <span className={`transition-transform duration-300 ${open ? 'rotate-90' : ''}`}><I n="chevron" size={16} stroke={2.6} /></span>{open ? 'Hide why' : 'Why?'}
      </Pressable>
      {open && (
        <div ref={why} className="overflow-hidden">
          <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-cream-50 p-4 text-[15px]">
            <p className="m-0">{flag.clinician}</p>
            <ul className="m-0 flex flex-col gap-1 pl-5 text-muted">{flag.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
            <p className="m-0 rounded-xl bg-white p-3 text-muted"><b className="text-ink">Patient sees:</b> {flag.patient}</p>
          </div>
        </div>
      )}

      {flag.decision && (
        <p className="m-0 mt-3 rounded-2xl bg-sage-50 p-3 text-[15px] text-sage-900"><b className="capitalize">{flag.decision.kind.replace('-', ' ')}</b> by {flag.decision.by} · {fmtDateTime(flag.decision.at)} — “{flag.decision.reason}”</p>
      )}

      {canDecide && (
        <div className="mt-4 flex flex-col gap-3 border-t border-divider pt-4">
          <span className="text-sm font-bold text-muted">Your decision (required to close)</span>
          <div role="radiogroup" aria-label="Decision" className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <Pressable key={c.kind} role="radio" aria-checked={kind === c.kind} onClick={() => setKind(c.kind)} className={`h-11 rounded-full px-4 text-[15px] font-bold transition-colors duration-200 ${kind === c.kind ? 'bg-ink text-white' : 'bg-white text-ink ring-[1.5px] ring-line'}`}>{c.label}</Pressable>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold text-muted">Reason (goes in the audit log)
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-2xl border-[1.5px] border-line bg-white p-3 text-base text-ink" placeholder="e.g. Switching to Telma-AM; will stop Amlong at this visit" />
          </label>
          <Pressable disabled={!ok || busy} onClick={() => { if (kind) { setBusy(true); decideFlag(flag.id, kind, reason).catch(() => setBusy(false)) } }} className="h-12 self-start rounded-2xl bg-sage-700 px-5 font-bold text-white">Record decision</Pressable>
        </div>
      )}
    </article>
  )
}
