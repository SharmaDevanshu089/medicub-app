import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CATALOG } from '../engine/catalog'
import { blocksSigning, describe, runChecks, type MedInput } from '../engine/rules'
import { I, Pill } from '../patient/icons'
import { collapse, gsap, HoldButton, Pressable, reducedMotion, useGSAP } from '../patient/motion'
import { checkDraft, doctorName, signRx } from '../store/store'
import type { Doctor, PatientId, State } from '../store/types'
import { FlagCard, SeverityPill } from './FlagCard'

export function Prescribe({ s, me, pid, t }: { s: State; me: Doctor; pid: PatientId; t: number }) {
  const [q, setQ] = useState('')
  const [freq, setFreq] = useState(1)
  const [draft, setDraft] = useState<{ brand: string; dosesPerDay: number }[]>([])
  const [signed, setSigned] = useState('')
  const seg = useRef<HTMLDivElement>(null)
  const segPill = useRef<HTMLSpanElement>(null)
  const results = useRef<HTMLUListElement>(null)
  const signedRef = useRef<HTMLParagraphElement>(null)

  const meds = s.meds.filter((m) => m.patientId === pid)
  const medKey = meds.map((m) => m.id).join()
  const findings = useMemo(() => {
    const input: MedInput[] = [
      ...meds.map((m) => ({ brand: m.brand, dosesPerDay: m.dosesPerDay, source: doctorName(m.prescriberId) })),
      ...draft.map((d) => ({ ...d, source: `draft — ${me.name}` })),
    ]
    const draftBrands = new Set(draft.map((d) => d.brand))
    return runChecks(input).filter((f) => f.brands.some((b) => draftBrands.has(b)))
  }, [medKey, draft, me.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // The server re-runs the rules and persists findings as flags the moment they appear,
  // so the patient sees "Doctor is reviewing" live. Local findings above only drive this screen.
  const keys = findings.map((f) => f.key).join(',')
  useEffect(() => {
    if (keys) checkDraft(pid, draft)
  }, [keys]) // eslint-disable-line react-hooks/exhaustive-deps

  const flags = s.flags.filter((x) => x.patientId === pid)
  const unresolved = findings.filter((f) => blocksSigning(f.severity) && !flags.some((x) => x.key === f.key && x.status === 'resolved'))
  const hits = q.trim() ? CATALOG.filter((p) => p.brand.toLowerCase().includes(q.toLowerCase()) || describe(p).includes(q.toLowerCase())) : []

  useLayoutEffect(() => {
    const btn = seg.current?.querySelector<HTMLElement>(`[data-f="${freq}"]`)
    if (btn && segPill.current) gsap.to(segPill.current, { x: btn.offsetLeft, width: btn.offsetWidth, duration: reducedMotion() ? 0 : 0.4, ease: 'power3.out' })
  }, [freq])
  useGSAP(() => {
    if (hits.length && !reducedMotion()) gsap.from('li', { y: -6, autoAlpha: 0, stagger: 0.03, duration: 0.25 })
  }, { scope: results, dependencies: [q] })
  useGSAP(() => {
    if (signed && !reducedMotion()) gsap.from(signedRef.current, { scale: 0.9, autoAlpha: 0, duration: 0.5, ease: 'back.out(2)' })
  }, { dependencies: [signed] })

  const add = (brand: string) => {
    if (!draft.some((d) => d.brand === brand)) setDraft([...draft, { brand, dosesPerDay: freq }])
    setQ('')
    setSigned('')
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex min-w-0 flex-col gap-4 rounded-3xl bg-white p-5">
        <h2 className="m-0 text-xl font-extrabold">New prescription</h2>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-subtle"><I n="search" size={20} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) add(hits[0].brand) }} placeholder="Search brand or ingredient" aria-label="Search drug" className="h-14 w-full rounded-2xl border-[1.5px] border-line bg-cream-50 pr-4 pl-12 text-lg" />
          {hits.length > 0 && (
            <ul ref={results} className="absolute top-[60px] right-0 left-0 z-10 m-0 flex list-none flex-col overflow-hidden rounded-2xl bg-white p-0 shadow-[0_16px_40px_rgba(40,30,10,0.16)] ring-1 ring-cream-200">
              {hits.map((p) => (
                <li key={p.brand}>
                  <button onClick={() => add(p.brand)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-cream-50 active:bg-cream-100" style={{ touchAction: 'manipulation' }}>
                    <Pill size={28} /><span className="flex-1"><b>{p.brand}</b> <span className="text-muted">— {describe(p)}</span></span><I n="plus" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div ref={seg} role="radiogroup" aria-label="Frequency" className="relative flex self-start rounded-full bg-cream-100 p-1">
          <span ref={segPill} className="absolute top-1 left-0 h-10 rounded-full bg-white shadow-sm" aria-hidden="true" />
          {[1, 2].map((f) => (
            <Pressable key={f} data-f={f} role="radio" aria-checked={freq === f} onClick={() => setFreq(f)} className={`relative h-10 rounded-full px-5 text-[15px] font-bold ${freq === f ? 'text-ink' : 'text-subtle'}`}>{f === 1 ? 'Once daily' : 'Twice daily'}</Pressable>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold tracking-wide text-subtle uppercase">Draft</span>
          {draft.length === 0 && <p className="m-0 rounded-2xl border-[1.5px] border-dashed border-line p-4 text-muted">Empty. Search a medicine above — try “Telma-AM”.</p>}
          {draft.map((d) => <DraftRow key={d.brand} brand={d.brand} n={d.dosesPerDay} onRemove={() => setDraft((x) => x.filter((y) => y.brand !== d.brand))} />)}
        </div>

        {draft.length > 0 && (unresolved.length > 0 ? (
          <div className="flex items-start gap-3 rounded-2xl bg-[#FCEFD3] p-4 text-[#5C3B00]">
            <I n="lock" size={22} />
            <p className="m-0 text-[15px] font-semibold">Signing is locked: {unresolved.length} HIGH/CRITICAL flag{unresolved.length > 1 ? 's need' : ' needs'} your decision and reason (right).</p>
          </div>
        ) : (
          <HoldButton onConfirm={() => { signRx(pid, draft).then((code) => { setSigned(code); setDraft([]) }).catch(() => undefined) }}><I n="fingerprint" /> Press and hold to sign</HoldButton>
        ))}
        {signed && <p ref={signedRef} className="m-0 flex items-center gap-2 rounded-2xl bg-sage-50 p-4 font-bold text-sage-900"><I n="check" size={22} stroke={2.8} /> Signed {signed}. Sent to the patient's pharmacy and written to the audit log.</p>}
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-xl font-extrabold">Live check</h2>
          <span className="text-sm font-semibold text-subtle">Decision support, not a decision</span>
        </div>
        {findings.length === 0 && (
          <div className="flex items-center gap-3 rounded-3xl bg-sage-50 p-5 text-sage-900">
            <I n="check" size={24} stroke={2.6} />
            <p className="m-0 font-semibold">{draft.length ? 'No rule findings for this draft.' : 'Findings appear here as you add medicines.'}</p>
          </div>
        )}
        {findings.map((f) => {
          const stored = flags.find((x) => x.key === f.key)
          return stored ? <FlagCard key={f.key} flag={stored} by={me.name} now={t} /> : <SeverityPill key={f.key} severity={f.severity} />
        })}
      </section>
    </div>
  )
}

function DraftRow({ brand, n, onRemove }: { brand: string; n: number; onRemove: () => void }) {
  const row = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.from(row.current, { x: -20, autoAlpha: 0, duration: 0.4, ease: 'back.out(1.6)' })
  })
  return (
    <div ref={row} className="flex items-center gap-3 rounded-2xl bg-cream-50 px-4 py-3">
      <Pill size={30} />
      <span className="flex-1 text-lg"><b>{brand}</b> <span className="text-muted">· {n === 1 ? 'once' : 'twice'} daily</span></span>
      <Pressable aria-label={`Remove ${brand}`} onClick={() => collapse(row.current, onRemove)} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-cream-100"><I n="x" size={20} /></Pressable>
    </div>
  )
}
