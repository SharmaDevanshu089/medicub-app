import { Draggable } from 'gsap/Draggable'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { speak } from '../lib/device'
import { fmtDateTime } from '../lib/time'
import { doctorName } from '../store/store'
import type { Note, Report, State } from '../store/types'
import { XrayPlaceholder } from '../ui/kit'
import { I, type IconName } from './icons'
import { gsap, Pressable, reducedMotion, useGSAP, useStaggerIn } from './motion'
import { initials, patientView } from './view'

type Item = { kind: 'report'; at: number; r: Report } | { kind: 'note'; at: number; n: Note }
const FILTERS = ['All', 'X-rays', 'Lab tests', 'Notes'] as const
type Filter = (typeof FILTERS)[number]
const ICON: Record<Report['kind'], IconName> = { 'X-ray': 'xray', Lab: 'flask', ECG: 'pulse', Scan: 'doc', Discharge: 'doc', Other: 'doc' }

export function Records({ s, v }: { s: State; v: ReturnType<typeof patientView> }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [open, setOpen] = useState<Item | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const chips = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const me = v.me
  useStaggerIn(root, filter)

  // Slide the active-chip pill under the chosen filter.
  useLayoutEffect(() => {
    const btn = chips.current?.querySelector<HTMLElement>(`[data-f="${filter}"]`)
    if (btn && pill.current) gsap.to(pill.current, { x: btn.offsetLeft, width: btn.offsetWidth, duration: reducedMotion() ? 0 : 0.45, ease: 'power3.out' })
  }, [filter])

  if (!me) return null
  const items: Item[] = [
    ...s.reports.filter((r) => r.patientId === me.id).map((r) => ({ kind: 'report' as const, at: r.takenAt, r })),
    ...s.notes.filter((n) => n.patientId === me.id).map((n) => ({ kind: 'note' as const, at: n.at, n })),
  ]
    .filter((x) => filter === 'All' || (filter === 'Notes' ? x.kind === 'note' : x.kind === 'report' && x.r.kind === (filter === 'X-rays' ? 'X-ray' : 'Lab')))
    .sort((a, b) => b.at - a.at)

  return (
    <div className="relative h-full">
      <div ref={root} className="flex flex-col gap-4 px-5 pt-[60px] pb-6">
        <h1 data-anim className="m-0 text-[30px] font-extrabold tracking-tight">Records</h1>
        <section data-anim className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-full bg-brand-600 text-[17px] font-extrabold text-white">{v.currentDoctor ? initials(v.currentDoctor.name) : '—'}</div>
            <div className="flex flex-col"><span className="text-[13px] font-semibold text-subtle">My doctor</span><span className="text-lg font-extrabold">{v.currentDoctor?.name ?? 'None yet'}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">{me.conditions.map((c) => <span key={c.name} className="rounded-full bg-cream-100 px-3 py-1.5 text-sm font-semibold">{c.name} · {c.since}</span>)}</div>
        </section>
        <div ref={chips} role="tablist" aria-label="Filter records" className="relative flex gap-2">
          <span ref={pill} className="absolute top-0 left-0 h-10 rounded-full bg-ink" aria-hidden="true" />
          {FILTERS.map((f) => (
            <Pressable key={f} data-f={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`relative h-10 rounded-full px-4 text-[15px] font-bold transition-colors duration-300 ${filter === f ? 'text-white' : 'text-ink ring-[1.5px] ring-line'}`}>{f}</Pressable>
          ))}
        </div>
        <div className="flex flex-col overflow-hidden rounded-[20px] bg-white">
          {items.length === 0 && <p data-anim className="m-0 p-5 text-subtle">Nothing here yet. Reports your doctors and labs add will appear here.</p>}
          {items.map((x, i) => (
            <button data-anim key={x.kind === 'report' ? x.r.id : x.n.id} onClick={() => setOpen(x)} className={`flex w-full cursor-pointer items-center gap-3.5 px-4 py-3.5 text-left active:bg-cream-100 ${i ? 'border-t border-divider' : ''}`} style={{ touchAction: 'manipulation' }}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${x.kind === 'report' && x.r.kind === 'X-ray' ? 'bg-ink text-cream-50' : x.kind === 'report' && x.r.kind === 'ECG' ? 'bg-brand-50 text-brand-700' : 'bg-cream-100 text-sage-800'}`}>
                <I n={x.kind === 'report' ? ICON[x.r.kind] : 'doc'} size={22} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-bold">{x.kind === 'report' ? x.r.title : x.n.text.split('.')[0]}</span>
                <span className="text-sm text-subtle">{x.kind === 'report' ? `${x.r.kind} · ${x.r.department}` : `Note · ${x.n.department}`} · {new Date(x.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
              </span>
              {x.kind === 'report' && x.r.values?.[0] && <span className="text-[15px] font-bold whitespace-nowrap">{x.r.values[0].value}{x.r.values[0].unit === '%' ? '%' : ''}</span>}
              <span className="text-subtle"><I n="chevron" size={18} /></span>
            </button>
          ))}
        </div>
      </div>
      {/* Pushed screen covers the whole phone, not just the scrolled list. */}
      {open && createPortal(<Detail item={open} v={v} onBack={() => setOpen(null)} />, document.getElementById('phone-screen') ?? document.body)}
    </div>
  )
}

/** Pushed detail screen: slides in from the right; swipe right or tap back to return. */
function Detail({ item, v, onBack }: { item: Item; v: ReturnType<typeof patientView>; onBack: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const back = () => gsap.to(panel.current, { x: panel.current?.offsetWidth ?? 390, duration: reducedMotion() ? 0 : 0.35, ease: 'power3.in', overwrite: true, onComplete: onBack })
  useGSAP(() => {
    gsap.fromTo(panel.current, { x: panel.current?.offsetWidth ?? 390 }, { x: 0, duration: reducedMotion() ? 0 : 0.5, ease: 'expo.out' })
    gsap.from('[data-anim]', { y: 14, autoAlpha: 0, stagger: 0.05, delay: 0.15, duration: 0.4 })
    const [d] = Draggable.create(panel.current, {
      type: 'x', bounds: { minX: 0, maxX: 500 }, dragClickables: false, minimumMovement: 8,
      onPress() { gsap.killTweensOf(panel.current) },
      onRelease() { if (this.x > 110) back(); else gsap.to(panel.current, { x: 0, duration: 0.45, ease: 'elastic.out(1, 0.7)' }) },
    })
    return () => d?.kill()
  }, { scope: panel })

  const viewers = [...new Set([v.currentDoctor?.name, ...v.consents.map((c) => doctorName(c.doctorId))].filter(Boolean))].join(', ')
  const r = item.kind === 'report' ? item.r : null
  const n = item.kind === 'note' ? item.n : null
  const title = r?.title ?? `${n?.department} note`
  const say = r ? `${r.title}. ${r.values?.map((x) => `${x.name} ${x.value} ${x.unit}`).join('. ') ?? ''}. ${r.summary}` : (n?.text ?? '')

  return (
    <div ref={panel} className="absolute inset-0 z-20 overflow-y-auto bg-cream-50 px-5 pt-14 pb-8 text-ink shadow-[-12px_0_30px_rgba(40,30,10,0.12)]" style={{ touchAction: 'pan-y', willChange: 'transform' }}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Pressable aria-label="Back to records" onClick={back} className="grid size-12 place-items-center rounded-[14px] bg-cream-100"><I n="back" stroke={2.2} /></Pressable>
          <Pressable aria-label="Read this record aloud" onClick={() => speak(say)} className="grid size-12 place-items-center rounded-[14px] bg-cream-100 text-sage-800"><I n="speaker" /></Pressable>
        </div>
        <div data-anim className="flex flex-col gap-1.5">
          <span className="self-start rounded-lg bg-sage-100 px-2.5 py-1 text-[13px] font-bold text-sage-900">{r ? (r.kind === 'Lab' ? 'Lab test' : r.kind) : 'Note'}</span>
          <h1 className="m-0 text-[30px] leading-tight font-extrabold tracking-tight">{title}</h1>
          <span className="text-[15px] text-muted">{r ? `${r.author} · ${fmtDateTime(r.takenAt)}` : `${n?.author} · ${fmtDateTime(n?.at ?? 0)}`}</span>
        </div>
        {r?.values && r.values.length > 0 && (
          <section data-anim className="flex flex-col rounded-[20px] bg-white">
            {r.values.map((x, i) => (
              <div key={x.name} className={`flex items-baseline justify-between p-[18px] ${i ? 'border-t border-divider' : ''}`}>
                <span className="text-[17px] font-semibold">{x.name}</span>
                <span className="text-[26px] font-extrabold">{x.value} <span className="text-base font-semibold text-muted">{x.unit}</span></span>
              </div>
            ))}
          </section>
        )}
        {r?.image === 'placeholder' && <div data-anim className="grid place-items-center rounded-[20px] bg-ink p-4"><XrayPlaceholder className="h-64 w-52" /></div>}
        {r?.image?.startsWith('data:') && <img data-anim src={r.image} alt={r.title} className="max-h-72 rounded-[20px] object-contain" />}
        <section data-anim className="flex flex-col gap-2 rounded-[20px] bg-cream-100 px-[18px] py-4">
          <span className="text-sm font-bold text-muted">{r ? `From ${r.department}` : n?.department}</span>
          <p className="m-0 text-base leading-normal">{r?.summary ?? n?.text}</p>
        </section>
        {r && (
          <div data-anim className="flex items-start gap-3 px-1">
            <span className="mt-0.5 shrink-0 text-sage-800"><I n="clock" size={22} /></span>
            <p className="m-0 text-[15px] leading-normal text-muted">Ask your doctor what these results mean for you. Medicub shows results; it doesn't interpret them.</p>
          </div>
        )}
        <div data-anim className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3.5">
          <span className="text-sage-800"><I n="user" size={20} /></span>
          <span className="flex-1 text-[15px]">Visible to <b>{viewers || 'no doctor yet'}</b></span>
        </div>
        <p className="m-0 text-center text-[13px] text-subtle">Swipe right to go back</p>
      </div>
    </div>
  )
}
