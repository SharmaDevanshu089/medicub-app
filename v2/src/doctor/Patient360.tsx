import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { describe, normalise } from '../engine/rules'
import { buildSummary } from '../lib/summary'
import { fmtDateTime, fmtTime } from '../lib/time'
import { I, Pill, type IconName } from '../patient/icons'
import { gsap, Pressable, reducedMotion, Sheet, useGSAP } from '../patient/motion'
import { initials } from '../patient/view'
import { addNote, addReminder, doctorName, sendSecondOpinion, startConsultation, viewRecord } from '../store/store'
import type { ConsultationCard, Doctor, Note, PatientId, Report, State } from '../store/types'
import { ConsultationCardView } from '../consultation/ConsultationCardView'
import { XrayPlaceholder } from '../ui/kit'
import { AdherenceCard } from './Adherence'
import { FlagCard } from './FlagCard'
import { Prescribe } from './Prescribe'

type Tab = 'overview' | 'consultations' | 'prescribe' | 'history' | 'vitals' | 'more'
const TABS: { k: Tab; label: string }[] = [
  { k: 'overview', label: 'Overview' },
  { k: 'consultations', label: 'Consultations' },
  { k: 'prescribe', label: 'Prescribe' },
  { k: 'history', label: 'History' },
  { k: 'vitals', label: 'Adherence & vitals' },
  { k: 'more', label: 'More' },
]

export function Patient360({ s, me, pid, t }: { s: State; me: Doctor; pid: PatientId; t: number }) {
  const [tab, setTab] = useState<Tab>('overview')
  const prev = useRef<Tab>('overview')
  const body = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const ind = useRef<HTMLSpanElement>(null)
  const p = s.patients.find((x) => x.id === pid)
  const openFlags = s.flags.filter((f) => f.patientId === pid && f.status === 'open').length
  useEffect(() => viewRecord(pid), [pid]) // every record opening is audited

  useGSAP(() => {
    const dir = TABS.findIndex((x) => x.k === tab) - TABS.findIndex((x) => x.k === prev.current)
    prev.current = tab
    if (!reducedMotion()) gsap.fromTo(body.current, { x: dir * 30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.4, clearProps: 'transform' })
  }, { dependencies: [tab] })
  useLayoutEffect(() => {
    const btn = bar.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
    if (btn && ind.current) gsap.to(ind.current, { x: btn.offsetLeft, width: btn.offsetWidth, duration: reducedMotion() ? 0 : 0.45, ease: 'power3.out' })
  }, [tab])

  if (!p) return null
  const isMine = p.currentDoctorId === me.id
  const consent = s.consents.filter((c) => c.patientId === pid && c.doctorId === me.id && !c.revoked).at(-1)
  const consultationCards = (s.consultationCards ?? []).filter((c) => c.patientId === pid)
  const isRecordingThis = (s.consultations ?? []).some(
    (c) => c.patientId === pid && (c.status === 'recording' || c.status === 'paused'),
  )

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-5">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-sage-400 text-2xl font-extrabold">{initials(p.name)}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="m-0 text-[28px] leading-tight font-extrabold tracking-tight">{p.name} <span className="text-xl font-semibold text-subtle">· {p.age}{p.sex}</span></h1>
          <div className="flex flex-wrap gap-2">
            {p.conditions.map((c) => <span key={c.name} className="rounded-full bg-cream-100 px-3 py-1 text-sm font-semibold">{c.name} · since {c.since}</span>)}
            {p.caregiver && <span className="rounded-full bg-cream-100 px-3 py-1 text-sm font-semibold">Caregiver: {p.caregiver}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${isMine ? 'bg-sage-100 text-sage-900' : 'bg-brand-50 text-brand-700'}`}>
            {isMine ? 'Your patient' : `Shared with you · until ${fmtTime(consent?.expiresAt ?? t)}`}
          </span>
          {isRecordingThis ? (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">
              <span className="size-2 animate-pulse rounded-full bg-red-600" />
              Scribe Active
            </span>
          ) : (
            <Pressable
              onClick={() => void startConsultation({ patientId: pid })}
              className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              <I n="mic" size={15} />
              <span>Scribe Consultation</span>
            </Pressable>
          )}
        </div>
      </header>

      <div ref={bar} role="tablist" aria-label="Patient sections" className="relative flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5">
        <span ref={ind} className="absolute top-1.5 left-0 h-11 rounded-xl bg-ink" aria-hidden="true" />
        {TABS.map((x) => (
          <Pressable key={x.k} data-tab={x.k} role="tab" aria-selected={tab === x.k} onClick={() => setTab(x.k)} className={`relative flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-5 text-base font-bold transition-colors duration-200 ${tab === x.k ? 'text-white' : 'text-muted'}`}>
            {x.label}
            {x.k === 'overview' && openFlags > 0 && <span className="grid size-5 place-items-center rounded-full bg-amber-500 text-xs text-ink">{openFlags}</span>}
            {x.k === 'consultations' && consultationCards.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-brand-600 text-xs text-white">{consultationCards.length}</span>}
          </Pressable>
        ))}
      </div>

      <div ref={body}>
        {tab === 'overview' && <Overview s={s} me={me} pid={pid} t={t} onPrescribe={() => setTab('prescribe')} onOpenConsultations={() => setTab('consultations')} />}
        {tab === 'consultations' && <ConsultationsTab cards={consultationCards} pid={pid} onStart={() => void startConsultation({ patientId: pid })} />}
        {tab === 'prescribe' && <Prescribe s={s} me={me} pid={pid} t={t} />}
        {tab === 'history' && <History s={s} me={me} pid={pid} />}
        {tab === 'vitals' && <div className="flex flex-col gap-5"><AdherenceCard s={s} pid={pid} t={t} /><Vitals s={s} pid={pid} /></div>}
        {tab === 'more' && <More s={s} me={me} pid={pid} />}
      </div>
    </div>
  )
}

function Overview({ s, me, pid, t, onPrescribe, onOpenConsultations }: { s: State; me: Doctor; pid: PatientId; t: number; onPrescribe: () => void; onOpenConsultations?: () => void }) {
  const lines = useMemo(() => buildSummary(s, pid), [s, pid])
  const [all, setAll] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const meds = s.meds.filter((m) => m.patientId === pid)
  const flags = s.flags.filter((f) => f.patientId === pid).sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open'))
  const consultationCards = (s.consultationCards ?? []).filter((c) => c.patientId === pid)
  const latestCard = consultationCards[0]

  useGSAP(() => {
    if (!reducedMotion()) gsap.from('[data-line]', { x: -10, autoAlpha: 0, stagger: 0.04, duration: 0.35 })
  }, { scope: box, dependencies: [all] })
  const shown = all ? lines : lines.slice(0, 5)
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {latestCard && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-xl font-extrabold text-ink">Latest Consultation Scribe</h2>
              {onOpenConsultations && (
                <button
                  onClick={onOpenConsultations}
                  className="cursor-pointer text-xs font-bold text-brand-700 hover:underline"
                >
                  View All ({consultationCards.length})
                </button>
              )}
            </div>
            <ConsultationCardView card={latestCard} isDoctorView />
          </div>
        )}

        <section ref={box} className="flex flex-col gap-3 rounded-3xl bg-white p-5">
          <div className="flex items-center gap-2">
            <span className="text-brand-600"><I n="sparkle" size={22} /></span>
            <h2 className="m-0 flex-1 text-xl font-extrabold">Clinical summary</h2>
            <span className="rounded-full bg-sage-100 px-2.5 py-1 text-xs font-bold text-sage-900">Verified Sourced Record</span>
          </div>
          <p className="m-0 text-sm font-semibold text-muted">Restates the record with a source on every line. No diagnosis, recommendation or decision.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {shown.map((l, i) => <li data-line key={i} className="rounded-xl bg-cream-50 px-3 py-2 text-[15px]">{l.text} <span className="text-subtle">— {l.source}</span></li>)}
          </ul>
          {lines.length > 5 && <Pressable onClick={() => setAll(!all)} className="self-start rounded-lg py-1 text-[15px] font-bold text-brand-700">{all ? 'Show less' : `Show all ${lines.length} lines`}</Pressable>}
        </section>
        {flags.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-xl font-extrabold">Flags on this record</h2>
            {flags.map((f) => <FlagCard key={f.id} flag={f} by={me.name} now={t} />)}
          </section>
        )}
      </div>
      <section className="flex h-fit min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-xl font-extrabold">Active medicines</h2>
          <Pressable onClick={onPrescribe} className="flex h-10 items-center gap-1.5 rounded-xl bg-sage-700 px-3.5 text-sm font-bold text-white"><I n="plus" size={18} /> Prescribe</Pressable>
        </div>
        {[...new Set(meds.map((m) => m.prescriberId))].map((did) => (
          <div key={did} className="flex flex-col gap-2">
            <span className="text-sm font-bold text-subtle">{doctorName(did)} · {s.doctors.find((d) => d.id === did)?.specialty}</span>
            {meds.filter((m) => m.prescriberId === did).map((m) => {
              const prod = normalise(m.brand)
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-cream-50 px-3 py-3">
                  <Pill size={30} />
                  <div className="flex min-w-0 flex-1 flex-col"><b>{m.brand}</b><span className="text-sm text-muted">{prod ? describe(prod) : '?'} · {m.dosesPerDay === 1 ? 'once' : 'twice'} daily · {m.rxCode}</span></div>
                </div>
              )
            })}
          </div>
        ))}
        {meds.length === 0 && <p className="m-0 text-muted">No active medicines.</p>}
        <AdherenceCard s={s} pid={pid} t={t} compact />
        <p className="m-0 text-xs text-subtle">Brand data: demo — verify against label.</p>
      </section>
    </div>
  )
}

const FILTERS = ['All', 'X-ray', 'Lab', 'ECG', 'Notes'] as const
const KIND_ICON: Record<Report['kind'], IconName> = { 'X-ray': 'xray', Lab: 'flask', ECG: 'pulse', Scan: 'doc', Discharge: 'doc', Other: 'doc' }
type Item = { at: number; r?: Report; n?: Note }

function History({ s, me, pid }: { s: State; me: Doctor; pid: PatientId }) {
  const [f, setF] = useState<(typeof FILTERS)[number]>('All')
  const [text, setText] = useState('')
  const [open, setOpen] = useState<Item | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const chips = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const items: Item[] = [
    ...s.reports.filter((r) => r.patientId === pid && (f === 'All' || r.kind === f)).map((r) => ({ at: r.takenAt, r })),
    ...(f === 'All' || f === 'Notes' ? s.notes.filter((n) => n.patientId === pid).map((n) => ({ at: n.at, n })) : []),
  ].sort((a, b) => b.at - a.at)
  useLayoutEffect(() => {
    const btn = chips.current?.querySelector<HTMLElement>(`[data-f="${f}"]`)
    if (btn && pill.current) gsap.to(pill.current, { x: btn.offsetLeft, width: btn.offsetWidth, duration: reducedMotion() ? 0 : 0.4, ease: 'power3.out' })
  }, [f])
  useGSAP(() => {
    if (!reducedMotion()) gsap.from('[data-row]', { y: 12, autoAlpha: 0, stagger: 0.04, duration: 0.35 })
  }, { scope: list, dependencies: [f, items.length] })

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-4 rounded-3xl bg-white p-5">
        <div ref={chips} role="tablist" aria-label="Filter history" className="relative flex flex-wrap gap-2">
          <span ref={pill} className="absolute top-0 left-0 h-10 rounded-full bg-ink" aria-hidden="true" />
          {FILTERS.map((x) => <Pressable key={x} data-f={x} role="tab" aria-selected={f === x} onClick={() => setF(x)} className={`relative h-10 rounded-full px-4 text-[15px] font-bold transition-colors duration-200 ${f === x ? 'text-white' : 'text-ink ring-[1.5px] ring-line'}`}>{x}</Pressable>)}
        </div>
        <div ref={list} className="flex flex-col">
          {items.length === 0 && <p className="m-0 text-muted">Nothing here yet.</p>}
          {items.map((x, i) => (
            <button data-row key={x.r?.id ?? x.n?.id} onClick={() => setOpen(x)} className={`flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-2 py-3 text-left hover:bg-cream-50 active:bg-cream-100 ${i ? 'border-t border-divider' : ''}`} style={{ touchAction: 'manipulation' }}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${x.r?.kind === 'X-ray' ? 'bg-ink text-cream-50' : 'bg-cream-100 text-sage-800'}`}><I n={x.r ? KIND_ICON[x.r.kind] : 'doc'} size={22} /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate">{x.r?.title ?? x.n?.text}</b>
                <span className="text-sm text-subtle">{x.r ? `${x.r.kind} · ${x.r.department} · ${x.r.author}` : `Note · ${x.n?.department} · ${x.n?.author}`} · {fmtDateTime(x.at)}</span>
              </span>
              {x.r?.values?.[0] && <b className="whitespace-nowrap">{x.r.values[0].value} {x.r.values[0].unit}</b>}
              <span className="text-subtle"><I n="chevron" size={18} /></span>
            </button>
          ))}
        </div>
      </section>
      <section className="flex h-fit min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <h2 className="m-0 text-xl font-extrabold">Add a note</h2>
        <p className="m-0 text-sm text-muted">As {me.name} ({me.specialty}). Visible to the care team and the patient.</p>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Note" className="rounded-2xl border-[1.5px] border-line bg-cream-50 p-3 text-base" />
        <Pressable disabled={text.trim().length < 3} onClick={() => { addNote({ patientId: pid, text: text.trim() }).then(() => setText('')).catch(() => undefined) }} className="h-12 self-start rounded-2xl bg-sage-700 px-5 font-bold text-white">Add note</Pressable>
        <a href="/department" target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-700">Department desk — add reports & X-rays →</a>
      </section>
      {open && (
        <Sheet open side="right" label="Record detail" onClose={() => setOpen(null)}>
          {(close) => (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-sage-100 px-2.5 py-1 text-sm font-bold text-sage-900">{open.r?.kind ?? 'Note'}</span>
                <Pressable aria-label="Close" onClick={() => close()} className="grid size-11 place-items-center rounded-xl bg-cream-100"><I n="x" /></Pressable>
              </div>
              <h2 className="m-0 text-[28px] leading-tight font-extrabold">{open.r?.title ?? `${open.n?.department} note`}</h2>
              <span className="text-muted">{open.r ? `${open.r.author} · ${open.r.department}` : open.n?.author} · {fmtDateTime(open.at)}</span>
              {open.r?.values?.map((v) => <div key={v.name} className="flex items-baseline justify-between rounded-2xl bg-white p-4"><span className="font-semibold">{v.name}</span><b className="text-2xl">{v.value} <span className="text-base font-semibold text-muted">{v.unit}</span></b></div>)}
              {open.r?.image === 'placeholder' && <div className="grid place-items-center rounded-2xl bg-ink p-4"><XrayPlaceholder className="h-80 w-64" /></div>}
              {open.r?.image?.startsWith('data:') && <img src={open.r.image} alt={open.r.title} className="max-h-96 rounded-2xl object-contain" />}
              <p className="m-0 rounded-2xl bg-white p-4">{open.r?.summary ?? open.n?.text}</p>
              <p className="m-0 text-center text-sm text-subtle">Swipe right or press Esc to close</p>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}

function Vitals({ s, pid }: { s: State; pid: PatientId }) {
  const v = s.vitals[pid]
  const svg = useRef<SVGSVGElement>(null)
  useGSAP(() => {
    const path = svg.current?.querySelector('polyline')
    if (!path || reducedMotion()) return
    const len = path.getTotalLength()
    gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' })
    gsap.from(svg.current?.querySelectorAll('circle') ?? [], { scale: 0, transformOrigin: 'center', stagger: 0.12, delay: 0.4, duration: 0.4, ease: 'back.out(2)' })
  }, { scope: svg })
  if (!v) return <section className="rounded-3xl bg-white p-5 text-muted">No wearable linked for this patient.</section>
  const W = 640
  const H = 180
  const vals = v.pulse.map((x) => x.bpm)
  const min = Math.min(...vals) - 4
  const max = Math.max(...vals) + 4
  const pts = vals.map((b, i) => [24 + (i / (vals.length - 1)) * (W - 48), H - 20 - ((b - min) / (max - min)) * (H - 40)] as const)
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <div className="flex items-center justify-between"><h2 className="m-0 text-xl font-extrabold">Resting pulse · 7 days</h2><span className="flex items-center gap-1 rounded-full bg-cream-100 px-3 py-1 text-sm font-bold text-muted"><I n="heart" size={16} /> wearable estimate</span></div>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Pulse estimates: ${vals.join(', ')} bpm`}>
          <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#5E6438" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="6" fill="#FFFFFF" stroke="#5E6438" strokeWidth="3" />)}
        </svg>
        <div className="flex justify-between px-2 text-sm text-subtle">{v.pulse.map((x) => <span key={x.at} className="text-center">{new Date(x.at).toLocaleDateString([], { weekday: 'short' })}<br /><b className="text-ink">{x.bpm}</b></span>)}</div>
      </section>
      <section className="flex min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <h2 className="m-0 text-xl font-extrabold">BP estimates</h2>
        {v.bp.map((b) => <div key={b.at} className="flex items-center justify-between rounded-2xl bg-cream-50 px-4 py-3"><span className="text-muted">{fmtDateTime(b.at)}</span><b className="text-lg">{b.sys}/{b.dia}</b></div>)}
        <p className="m-0 text-sm text-muted">Sleep (h): {v.sleep.map((x) => x.hours).join(' · ')}</p>
        <p className="m-0 flex items-start gap-2 rounded-2xl bg-sage-50 p-3 text-sm text-sage-900"><I n="shield" size={18} /> Wearable readings are context only. They never raise alerts on their own.</p>
      </section>
    </div>
  )
}

function More({ s, me, pid }: { s: State; me: Doctor; pid: PatientId }) {
  const brands = [...new Set(s.meds.filter((m) => m.patientId === pid).map((m) => m.brand))]
  const [brand, setBrand] = useState('')
  const [time, setTime] = useState('13:00')
  const [instr, setInstr] = useState('')
  const [added, setAdded] = useState(0)
  const others = s.doctors.filter((d) => d.id !== me.id)
  const [to, setTo] = useState(others[0]?.id ?? '')
  const [question, setQuestion] = useState('Please review the current regimen.')
  const [sent, setSent] = useState(false)
  const sendBtn = useRef<HTMLSpanElement>(null)
  const chosen = brand || brands[0] || ''
  const reminders = s.reminders.filter((r) => r.patientId === pid).sort((a, b) => a.time.localeCompare(b.time))
  const audit = s.audit.filter((e) => e.detail.includes(s.patients.find((p) => p.id === pid)?.name ?? '§')).slice(-10).reverse()
  const input = 'h-12 rounded-xl border-[1.5px] border-line bg-cream-50 px-3 text-base'

  const send = () => {
    sendSecondOpinion(to, pid, question).then(() => setSent(true)).catch(() => undefined)
    if (!reducedMotion()) gsap.fromTo(sendBtn.current, { scale: 0.9 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="flex min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <h2 className="m-0 text-xl font-extrabold">Reminders</h2>
        {reminders.map((r) => <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-cream-50 px-4 py-3"><b className="w-14">{r.time}</b><span className="flex-1">{r.brand} · {r.instructions}</span><span className="text-sm text-subtle">{r.createdBy}</span></div>)}
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Medicine" value={chosen} onChange={(e) => setBrand(e.target.value)} className={input}>{brands.map((b) => <option key={b}>{b}</option>)}</select>
          <input aria-label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
          <input aria-label="Instructions" placeholder="Instructions, e.g. after lunch" value={instr} onChange={(e) => setInstr(e.target.value)} className={`${input} col-span-2`} />
        </div>
        <Pressable disabled={!chosen} onClick={() => { addReminder({ patientId: pid, brand: chosen, time, instructions: instr.trim() || 'As prescribed' }).then(() => { setInstr(''); setAdded((n) => n + 1) }).catch(() => undefined) }} className="h-12 self-start rounded-2xl bg-sage-700 px-5 font-bold text-white">Send to phone & watch</Pressable>
        {added > 0 && <span key={added} className="animate-enter text-sm font-bold text-sage-800">Reminder sent.</span>}
      </section>
      <section className="flex min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
        <div className="flex items-center gap-2"><h2 className="m-0 flex-1 text-xl font-extrabold">Second opinion</h2><span className="rounded-full bg-[#FCEFD3] px-2.5 py-1 text-xs font-bold text-[#5C3B00]">AI assist — demo</span></div>
        <p className="m-0 text-sm text-muted">Sends the sourced AI summary and your question to a colleague's Medicub inbox — not WhatsApp.</p>
        <select aria-label="Send to" value={to} onChange={(e) => { setTo(e.target.value); setSent(false) }} className={input}>{others.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialty}</option>)}</select>
        <input aria-label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} className={input} />
        <Pressable disabled={sent || !to} onClick={send} className={`flex h-12 items-center gap-2 self-start rounded-2xl px-5 font-bold ${sent ? 'bg-sage-100 text-sage-900' : 'bg-sage-700 text-white'}`}>
          <span ref={sendBtn} className="flex items-center gap-2">{sent ? <><I n="check" size={18} stroke={2.8} /> Sent to {doctorName(to)}</> : <><I n="send" size={18} /> Send case summary</>}</span>
        </Pressable>
      </section>
      <section className="flex min-w-0 flex-col gap-2 rounded-3xl bg-white p-5 xl:col-span-2">
        <h2 className="m-0 text-xl font-extrabold">Timeline</h2>
        {audit.map((e) => <div key={e.seq} className="flex gap-3 border-t border-divider py-2 text-[15px] first:border-0"><span className="w-36 shrink-0 text-subtle">{fmtDateTime(e.ts)}</span><span><b>{e.action.replaceAll('_', ' ').toLowerCase()}</b> · {e.actor} — {e.detail}</span></div>)}
      </section>
    </div>
  )
}

function ConsultationsTab({ cards, pid: _pid, onStart }: { cards: ConsultationCard[]; pid: PatientId; onStart: () => void }) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-white p-12 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <I n="mic" size={32} />
        </div>
        <div>
          <h2 className="m-0 text-xl font-extrabold text-ink">No Consultation Scribes Yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Start ambient audio scribing during this visit to automatically capture patient-reported symptoms, timelines, and agreed plans with Wispr Flow.
          </p>
        </div>
        <Pressable
          onClick={onStart}
          className="flex h-12 items-center gap-2 rounded-2xl bg-sage-700 px-6 font-bold text-white shadow-md hover:bg-sage-600"
        >
          <I n="mic" size={18} />
          <span>Start Recording This Visit</span>
        </Pressable>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="m-0 text-xl font-extrabold text-ink">Consultation Scribe History</h2>
          <span className="text-xs text-muted">Transcribed via Wispr Flow and compiled into structured clinical cards</span>
        </div>
        <Pressable
          onClick={onStart}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-xs font-bold text-white hover:bg-slate-800"
        >
          <I n="mic" size={16} />
          <span>New Session</span>
        </Pressable>
      </div>
      {cards.map((c) => (
        <ConsultationCardView key={c.id} card={c} isDoctorView />
      ))}
    </div>
  )
}
