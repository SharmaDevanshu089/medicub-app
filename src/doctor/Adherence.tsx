// "Is it the medicine or the missed doses?" — 14 days of doses lined up with the BP-estimate trend.
// Descriptive only: it never says the medicine works or not; the doctor reads it and decides.
import { useMemo, useRef } from 'react'
import { adherence, type DoseOutcome } from '../engine/care'
import { hhmm12 } from '../patient/view'
import { I } from '../patient/icons'
import { gsap, reducedMotion, useGSAP } from '../patient/motion'
import type { PatientId, State } from '../store/types'

const CELL: Record<DoseOutcome, { cls: string; label: string }> = {
  taken: { cls: 'bg-sage-700', label: 'Taken' },
  skipped: { cls: 'bg-line', label: 'Skipped' },
  missed: { cls: 'bg-[#E8B04A]', label: 'Missed' },
  pending: { cls: 'bg-white ring-1 ring-line', label: 'Not yet due' },
}

export function AdherenceCard({ s, pid, t, compact = false }: { s: State; pid: PatientId; t: number; compact?: boolean }) {
  const reminders = s.reminders.filter((r) => r.patientId === pid).sort((a, b) => a.time.localeCompare(b.time))
  const a = useMemo(() => adherence(reminders, s.doseLog, s.vitals[pid], t, 14), [s.doseLog, s.vitals, pid, reminders.length, Math.floor(t / 600_000)]) // eslint-disable-line react-hooks/exhaustive-deps
  const root = useRef<HTMLElement>(null)
  useGSAP(() => {
    if (reducedMotion() || compact) return
    gsap.from('[data-col]', { scaleY: 0, transformOrigin: 'bottom', stagger: 0.03, duration: 0.35, ease: 'back.out(1.6)' })
    const line = root.current?.querySelector<SVGPolylineElement>('[data-bpline]')
    if (line) {
      const len = line.getTotalLength()
      gsap.fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.2, delay: 0.3, ease: 'power2.inOut' })
    }
  }, { scope: root, dependencies: [pid] })

  if (!reminders.length) return compact ? null : <section className="rounded-3xl bg-white p-5 text-muted">No dose reminders for this patient yet, so there's no adherence history.</section>
  const pctTone = a.pct === null ? 'text-muted' : a.pct >= 90 ? 'text-sage-800' : a.pct >= 75 ? 'text-[#7A4E00]' : 'text-red-700'
  if (compact)
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-cream-50 px-3 py-2.5">
        <I n="clock" size={18} />
        <span className="flex-1 text-sm">Doses taken, last 14 days</span>
        <b className={`text-lg ${pctTone}`}>{a.pct ?? '—'}%</b>
      </div>
    )

  // BP line geometry, one x per day column.
  const W = 700
  const H = 120
  const pts = a.days.map((d, i) => (d.bp ? { x: (i + 0.5) * (W / a.days.length), sys: d.bp.sys } : null))
  const vals = pts.filter(Boolean).map((p) => p!.sys)
  const lo = Math.min(...vals, 120) - 4
  const hi = Math.max(...vals, 150) + 4
  const y = (v: number) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16)
  const line = pts.filter(Boolean).map((p) => `${p!.x},${y(p!.sys)}`).join(' ')
  const missedDay = a.days.map((d) => d.doses.some((x) => x.outcome === 'missed'))

  return (
    <section ref={root} className="flex min-w-0 flex-col gap-4 rounded-3xl bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-extrabold">Is it the medicine, or the missed doses?</h2>
          <p className="m-0 text-sm text-muted">Last 14 days of doses, lined up with the wearable BP estimate. Check this before changing a dose.</p>
        </div>
        <div className="text-right"><div className={`text-4xl font-black ${pctTone}`}>{a.pct ?? '—'}%</div><div className="text-xs font-bold text-subtle">doses taken</div></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {a.byMedicine.map((m) => {
          const pct = m.scheduled ? Math.round((m.taken / m.scheduled) * 100) : 0
          return (
            <div key={m.brand} className="flex min-w-[180px] flex-1 flex-col gap-1 rounded-2xl bg-cream-50 p-3">
              <div className="flex justify-between text-sm"><b>{m.brand}</b><span className="text-muted">{m.taken}/{m.scheduled}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-cream-200"><div className={`h-full rounded-full ${pct >= 90 ? 'bg-sage-700' : 'bg-[#E8B04A]'}`} style={{ width: `${pct}%` }} /></div>
            </div>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* dose grid: one row per reminder, one column per day */}
          <div className="grid gap-y-1.5" style={{ gridTemplateColumns: `120px repeat(${a.days.length}, minmax(0, 1fr))` }}>
            <span />
            {a.days.map((d) => <span key={d.day} className="text-center text-[10px] font-semibold text-subtle">{new Date(d.at).toLocaleDateString([], { day: 'numeric' })}</span>)}
            {reminders.map((r) => (
              <div key={r.id} className="contents">
                <span className="truncate pr-2 text-xs font-semibold">{r.brand} <span className="text-subtle">{hhmm12(r.time)}</span></span>
                {a.days.map((d) => {
                  const dose = d.doses.find((x) => x.reminderId === r.id)
                  const o = dose?.outcome
                  return (
                    <span key={d.day} className="flex justify-center">
                      <span data-col title={`${d.day}: ${o ? CELL[o].label : 'Not scheduled'}${dose?.by ? ` (confirmed by ${dose.by})` : ''}`} className={`relative block h-5 w-[78%] rounded-md ${o ? CELL[o].cls : 'bg-cream-100'}`}>
                        {dose?.by && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-brand-600 ring-2 ring-white" />}
                      </span>
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
          {/* BP line aligned to the same columns; amber bands = days with a missed dose */}
          <div className="mt-3 grid" style={{ gridTemplateColumns: '120px 1fr' }}>
            <span className="pt-2 text-xs font-semibold">BP estimate<br /><span className="text-subtle">systolic, mmHg</span></span>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Systolic BP estimates over 14 days: ${vals.join(', ')}`}>
              {missedDay.map((m, i) => m && <rect key={i} x={i * (W / a.days.length) + 2} y={0} width={W / a.days.length - 4} height={H} rx={6} fill="#FCEFD3" />)}
              <line x1={0} x2={W} y1={y(140)} y2={y(140)} stroke="#D6CDB8" strokeDasharray="4 4" />
              <text x={W - 4} y={y(140) - 4} textAnchor="end" fontSize="10" fill="#6B6C5A">140</text>
              <polyline data-bpline points={line} fill="none" stroke="#CC3762" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => p && <circle key={i} cx={p.x} cy={y(p.sys)} r={4.5} fill="#fff" stroke="#CC3762" strokeWidth={2.5} />)}
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {(['taken', 'missed', 'skipped', 'pending'] as const).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={`size-3 rounded ${CELL[k].cls}`} />{CELL[k].label}</span>)}
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-600" />Confirmed by a caregiver</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-[#FCEFD3]" />Day with a missed dose</span>
      </div>

      {a.bpCompare && (
        <p className="m-0 flex items-start gap-2 rounded-2xl bg-cream-50 p-3 text-[15px]">
          <span className="mt-0.5 shrink-0 text-sage-800"><I n="pulse" size={18} /></span>
          <span>On <b>{a.bpCompare.missedDays} days with a missed dose</b>, BP estimates averaged <b>{a.bpCompare.missedSys}</b>; on <b>{a.bpCompare.fullDays} days with every dose taken</b>, <b>{a.bpCompare.fullSys}</b>. <span className="text-muted">Wearable estimates — context, not a diagnosis.</span></span>
        </p>
      )}
    </section>
  )
}
