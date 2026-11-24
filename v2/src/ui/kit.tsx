import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Severity } from '../engine/rules'
import { decideFlag, doctorName } from '../store/store'
import type { DecisionKind, Flag, Note, Report } from '../store/types'
import { fmtDateTime } from '../lib/time'

// ---------- icons (colour is always paired with icon + text) ----------
type IconName = 'alert' | 'block' | 'check' | 'info' | 'clock' | 'watch' | 'speaker'
const PATHS: Record<IconName, string> = {
  alert: 'M12 3 2 21h20L12 3zm0 6v5m0 3v.5',
  block: 'M8 2h8l6 6v8l-6 6H8l-6-6V8l6-6zm-1 7 10 6m0-6L7 15',
  check: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-4 10 3 3 5-6',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 9v6m0-10v.5',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v5l3 2',
  watch: 'M8 2h8l1 4H7l1-4zm-1 16h10l-1 4H8l-1-4zM6 6h12v12H6z',
  speaker: 'M4 9h4l5-4v14l-5-4H4V9zm12 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',
}
export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

// ---------- badges ----------
const SEV: Record<Severity, { cls: string; icon: IconName }> = {
  LOW: { cls: 'bg-slate-100 text-slate-700 ring-slate-300', icon: 'info' },
  MODERATE: { cls: 'bg-amber-50 text-amber-800 ring-amber-300', icon: 'alert' },
  HIGH: { cls: 'bg-amber-100 text-amber-900 ring-amber-400', icon: 'alert' },
  CRITICAL: { cls: 'bg-red-100 text-red-800 ring-red-400', icon: 'block' },
}
export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity]
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ring-1 ${s.cls}`}>
      <Icon name={s.icon} className="size-3.5" />
      {severity}
    </span>
  )
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'teal' | 'amber' | 'red' | 'green' }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-accent-50 text-accent-800',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
    green: 'bg-sage-100 text-sage-800',
  }[tone]
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
}

export const EstimateBadge = ({ label = 'wearable estimate' }: { label?: string }) => (
  <Tag tone="slate">
    <Icon name="watch" className="size-3.5" />
    {label}
  </Tag>
)

// ---------- buttons / cards ----------
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'outline'
export function Btn({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const v = {
    primary: 'bg-accent-600 text-white hover:bg-accent-700 disabled:bg-slate-300 disabled:text-slate-600',
    ghost: 'text-accent-800 hover:bg-accent-50 disabled:text-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
    outline: 'ring-1 ring-slate-300 bg-white text-slate-800 hover:bg-cream-100 disabled:text-slate-400',
  }[variant]
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed ${v} ${className}`} />
}

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Footer({ clinical = false }: { clinical?: boolean }) {
  return (
    <footer className="mt-6 flex flex-wrap items-center justify-center gap-3 border-t border-slate-200 py-3 text-sm text-slate-600">
      {clinical && (
        <span className="inline-flex items-center gap-1 font-semibold text-accent-800">
          <Icon name="info" className="size-4" /> Decision support, not a decision
        </span>
      )}
      <span className="rounded bg-cream-200 px-2 py-0.5 font-semibold">Synthetic data</span>
      <a className="underline" href="/">Launcher</a>
    </footer>
  )
}

/** Placeholder pack image: colour derived from brand name. */
export function PillImage({ brand, size = 72 }: { brand: string; size?: number }) {
  let h = 0
  for (const c of brand) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={`${brand} pack (placeholder image)`}>
      <rect x="4" y="12" width="64" height="48" rx="8" fill={`hsl(${h} 60% 88%)`} stroke={`hsl(${h} 45% 45%)`} strokeWidth="2" />
      <ellipse cx="22" cy="36" rx="9" ry="6" fill={`hsl(${h} 45% 55%)`} />
      <ellipse cx="50" cy="36" rx="9" ry="6" fill={`hsl(${h} 45% 55%)`} />
      <text x="36" y="56" fontSize="8" textAnchor="middle" fill="#334155">{brand.slice(0, 12)}</text>
    </svg>
  )
}

export function Sparkline({ values, w = 280, h = 64, label }: { values: number[]; w?: number; h?: number; label: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values) - 2
  const max = Math.max(...values) + 2
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 4 - ((v - min) / (max - min)) * (h - 8)] as const)
  return (
    <svg width="100%" height={h * 1.5} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#5e6438" strokeWidth="2.5" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#5e6438" />
      ))}
    </svg>
  )
}

// ---------- flags ----------
const CLINICAL_KINDS: { kind: DecisionKind; label: string }[] = [
  { kind: 'intentional', label: 'Intentional' },
  { kind: 'change-planned', label: 'Change planned' },
  { kind: 'dismissed', label: 'Dismiss' },
]
const REQUEST_KINDS: { kind: DecisionKind; label: string }[] = [
  { kind: 'approved', label: 'Approve' },
  { kind: 'rejected', label: 'Reject' },
]

export function DecisionForm({ flag, by }: { flag: Flag; by: string }) {
  const kinds = flag.request ? REQUEST_KINDS : CLINICAL_KINDS
  const [kind, setKind] = useState<DecisionKind | null>(null)
  const [reason, setReason] = useState('')
  const ok = kind !== null && reason.trim().length >= 3
  return (
    <div className="mt-3 rounded-lg bg-cream-100 p-3 ring-1 ring-slate-200">
      <p className="mb-2 text-sm font-semibold text-slate-700">Record decision (required) — {by}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
        {kinds.map((k) => (
          <button
            key={k.kind}
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${kind === k.kind ? 'bg-accent-600 text-white ring-accent-600' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-100'}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <label className="mt-2 block text-sm text-slate-700">
        Reason
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" placeholder="Why? (recorded in the audit log)" />
      </label>
      <Btn className="mt-2" disabled={!ok} onClick={() => kind && void decideFlag(flag.id, kind, reason).catch(() => undefined)}>
        Record decision
      </Btn>
      {!ok && <p className="mt-1 text-xs text-slate-600">Pick a decision and write a reason.</p>}
    </div>
  )
}

export function FlagCard({ flag, by, now }: { flag: Flag; by?: string; now: number }) {
  const [open, setOpen] = useState(false)
  const overdue = flag.status === 'open' && now > flag.deadline
  return (
    <article className={`animate-enter rounded-xl bg-white p-4 ring-1 ${flag.severity === 'CRITICAL' ? 'ring-red-300' : flag.status === 'open' ? 'ring-amber-300' : 'ring-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={flag.severity} />
        <Tag>{flag.ruleId}</Tag>
        {flag.status === 'open' ? (
          <Tag tone="amber">
            <Icon name="clock" className="size-3.5" /> Open
          </Tag>
        ) : (
          <Tag tone="green">
            <Icon name="check" className="size-3.5" /> Resolved
          </Tag>
        )}
        {flag.request && <Tag tone="teal">From pharmacy</Tag>}
      </div>
      <h3 className="mt-2 font-bold text-slate-900">{flag.title}</h3>
      <p className="text-sm text-slate-600">
        Owner: <b>{doctorName(flag.ownerId)}</b> · Raised by {flag.raisedBy} · Respond by{' '}
        <span className={overdue ? 'font-bold text-red-700' : ''}>{fmtDateTime(flag.deadline)}{overdue ? ' (overdue)' : ''}</span>
      </p>
      <button className="mt-2 text-sm font-semibold text-accent-800 underline" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Hide why' : 'Why?'}
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-slate-800">{flag.clinician}</p>
          <ul className="list-disc pl-5 text-slate-700">
            {flag.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="text-slate-600">
            <b>Patient sees:</b> {flag.patient}
          </p>
        </div>
      )}
      {flag.decision && (
        <p className="mt-2 rounded-lg bg-sage-50 p-2 text-sm text-sage-900">
          <b>{flag.decision.kind}</b> by {flag.decision.by} at {fmtDateTime(flag.decision.at)} — “{flag.decision.reason}”
        </p>
      )}
      {flag.status === 'open' && by && <DecisionForm flag={flag} by={by} />}
    </article>
  )
}

// ---------- records ----------
/** Synthetic X-ray placeholder art (no real imaging). */
export function XrayPlaceholder({ className = 'h-40 w-32' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 150" className={`rounded bg-black ${className}`} role="img" aria-label="Synthetic X-ray placeholder">
      <ellipse cx="60" cy="80" rx="46" ry="58" fill="#1c1c1c" />
      <rect x="57" y="20" width="6" height="110" fill="#d9d9d9" opacity="0.7" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} stroke="#cfcfcf" strokeWidth="3" fill="none" opacity={0.75 - i * 0.07}>
          <path d={`M57 ${38 + i * 14} q-26 -4 -40 ${10 + i}`} />
          <path d={`M63 ${38 + i * 14} q26 -4 40 ${10 + i}`} />
        </g>
      ))}
      <text x="60" y="146" fontSize="7" fill="#9ca3af" textAnchor="middle">synthetic placeholder</text>
    </svg>
  )
}

const KIND_ICON: Record<Report['kind'], string> = { 'X-ray': '🩻', Lab: '🧪', ECG: '💓', Scan: '🖥️', Discharge: '📄', Other: '📎' }

export function ReportCard({ r }: { r: Report }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="animate-enter rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <span aria-hidden>{KIND_ICON[r.kind]}</span> <b>{r.title}</b> <Tag>{r.kind}</Tag>
          <span className="block text-sm text-slate-600">{fmtDateTime(r.takenAt)} · {r.department} · {r.author}</span>
        </span>
        <span className="text-sm font-semibold text-accent-800">{open ? 'Hide' : 'View'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          {r.values && (
            <table className="w-full">
              <tbody>{r.values.map((v) => <tr key={v.name} className="border-t"><td className="py-1">{v.name}</td><td className="text-right font-semibold">{v.value} {v.unit}</td></tr>)}</tbody>
            </table>
          )}
          <p className="text-slate-700">{r.summary}</p>
          {r.image === 'placeholder' && <XrayPlaceholder />}
          {r.image?.startsWith('data:') && <img src={r.image} alt={r.title} className="max-h-64 rounded" />}
        </div>
      )}
    </article>
  )
}

export function NoteCard({ n }: { n: Note }) {
  return (
    <article className="animate-enter rounded-lg bg-cream-100 p-3 text-sm">
      <p className="text-slate-600">📝 <b>{n.department}</b> · {n.author} · {fmtDateTime(n.at)}</p>
      <p className="mt-1 text-slate-900">{n.text}</p>
    </article>
  )
}

/** Mock AI summary: every line carries its source; explicitly no decisions. */
export function SummaryCard({ lines, title = 'AI summary' }: { lines: { text: string; source: string }[]; title?: string }) {
  return (
    <Card title={title} right={<Tag tone="amber">AI assist — demo</Tag>}>
      <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700"><Icon name="info" className="size-4" /> Summarises the record only. It makes no diagnosis, recommendation or decision.</p>
      <ul className="space-y-1 text-sm">{lines.map((l, i) => <li key={i}>{l.text} <span className="text-slate-500">— {l.source}</span></li>)}</ul>
    </Card>
  )
}
