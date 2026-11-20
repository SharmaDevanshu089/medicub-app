// Care insights, all pure and deterministic: adherence history, the missed-dose escalation ladder,
// cheaper same-composition generics, and matching text read off a medicine strip.
// Like the rules engine, none of this decides anything clinical — it describes and routes.
import { dayKey, timeOn } from '../lib/dates'
import type { Caregiver, DoseEntry, EscalationAck, Reminder, State, Vitals } from '../store/types'
import { CATALOG, type Product } from './catalog'
import { normalise } from './rules'

const DAY = 86_400_000

// ---------- 1. adherence (feature: "is it the drug or the dose?") ----------

export type DoseOutcome = 'taken' | 'skipped' | 'missed' | 'pending'
export interface AdherenceDay {
  day: string
  at: number // start-of-day-ish timestamp for charts
  doses: { reminderId: string; brand: string; time: string; outcome: DoseOutcome; by?: string }[]
  taken: number
  scheduled: number // doses whose time has passed
  bp?: { sys: number; dia: number }
}
export interface AdherenceSummary {
  days: AdherenceDay[]
  pct: number | null // taken / scheduled over the window
  byMedicine: { brand: string; taken: number; scheduled: number }[]
  /** Average BP estimate on days with every dose taken vs days with a missed dose. Descriptive only. */
  bpCompare: { fullSys: number; fullDays: number; missedSys: number; missedDays: number } | null
}

function outcome(r: Reminder, t: number, log: Record<string, DoseEntry>): DoseOutcome {
  const e = log[`${r.id}@${dayKey(t)}`]
  if (e?.action === 'taken' || e?.action === 'skipped') return e.action
  return timeOn(t, r.time) + 60 * 60_000 > t ? 'pending' : 'missed' // one grace hour before a dose counts as missed
}

export function adherence(reminders: Reminder[], log: Record<string, DoseEntry>, vitals: Vitals | undefined, now: number, days = 14): AdherenceSummary {
  const out: AdherenceDay[] = []
  for (let ago = days - 1; ago >= 0; ago--) {
    const ref = ago === 0 ? now : timeOn(now - ago * DAY, '23:59')
    const doses = reminders
      .filter((r) => ago > 0 || timeOn(now, r.time) <= now)
      .map((r) => {
        const e = log[`${r.id}@${dayKey(ref)}`]
        return { reminderId: r.id, brand: r.brand, time: r.time, outcome: outcome(r, ref, log), ...(e?.by ? { by: e.by } : {}) }
      })
    const key = dayKey(ref)
    const bps = (vitals?.bp ?? []).filter((b) => dayKey(b.at) === key)
    const bp = bps.length ? { sys: Math.round(bps.reduce((a, b) => a + b.sys, 0) / bps.length), dia: Math.round(bps.reduce((a, b) => a + b.dia, 0) / bps.length) } : undefined
    const scheduled = doses.filter((d) => d.outcome !== 'pending')
    out.push({ day: key, at: timeOn(ref, '12:00'), doses, taken: scheduled.filter((d) => d.outcome === 'taken').length, scheduled: scheduled.length, ...(bp ? { bp } : {}) })
  }
  const taken = out.reduce((a, d) => a + d.taken, 0)
  const scheduled = out.reduce((a, d) => a + d.scheduled, 0)
  const byMedicine = [...new Set(reminders.map((r) => r.brand))].map((brand) => {
    const ds = out.flatMap((d) => d.doses.filter((x) => x.brand === brand && x.outcome !== 'pending'))
    return { brand, taken: ds.filter((x) => x.outcome === 'taken').length, scheduled: ds.length }
  })
  const withBp = out.filter((d) => d.bp && d.scheduled > 0)
  const full = withBp.filter((d) => d.taken === d.scheduled)
  const missed = withBp.filter((d) => d.doses.some((x) => x.outcome === 'missed'))
  const avg = (xs: AdherenceDay[]) => Math.round(xs.reduce((a, d) => a + (d.bp?.sys ?? 0), 0) / xs.length)
  return {
    days: out,
    pct: scheduled ? Math.round((taken / scheduled) * 100) : null,
    byMedicine,
    bpCompare: full.length >= 2 && missed.length >= 2 ? { fullSys: avg(full), fullDays: full.length, missedSys: avg(missed), missedDays: missed.length } : null,
  }
}

// ---------- 2. missed-dose escalation ladder ----------

// CLINICIAN-REVIEW: escalation timings are product defaults, to be agreed with clinicians.
export const LADDER = {
  repeatAfterMin: 15, // second reminder on phone + watch
  familyAfterMin: 30, // family caregiver alerted
  ashaAtHour: '09:00', // ASHA worker alerted the next morning
}

export type Stage = 'reminded' | 'repeat' | 'family' | 'asha'
export interface Escalation {
  key: string // `${reminderId}@${day}`
  reminderId: string
  brand: string
  time: string
  day: string
  dueAt: number
  stage: Stage
  /** Who has been told so far, in order. */
  notified: { who: string; at: number }[]
  nextStep: { who: string; at: number } | null
  ack?: EscalationAck
}

/**
 * Open escalations for one patient: doses from today and yesterday that are past due and not recorded
 * as taken or skipped. A caregiver acknowledgement stops the ladder (a human has taken responsibility).
 */
export function escalations(s: State, patientId: string, now: number): Escalation[] {
  const p = s.patients.find((x) => x.id === patientId)
  const cgs: Caregiver[] = (p?.caregivers ?? []).filter((c) => c.enabled)
  const family = cgs.find((c) => c.relation === 'family')
  const asha = cgs.find((c) => c.relation === 'asha')
  const out: Escalation[] = []
  for (const ago of [1, 0]) {
    const ref = now - ago * DAY
    const day = dayKey(ref)
    for (const r of s.reminders.filter((x) => x.patientId === patientId)) {
      const key = `${r.id}@${day}`
      const e = s.doseLog[key]
      if (e?.action === 'taken' || e?.action === 'skipped') continue
      const dueAt = timeOn(ref, r.time)
      if (dueAt > now) continue
      const steps: { who: string; at: number; stage: Stage }[] = [
        { who: 'Phone and watch', at: dueAt, stage: 'reminded' },
        { who: 'Second reminder on phone and watch', at: dueAt + LADDER.repeatAfterMin * 60_000, stage: 'repeat' },
        ...(family ? [{ who: `${family.name} (${family.label.toLowerCase()})`, at: dueAt + LADDER.familyAfterMin * 60_000, stage: 'family' as const }] : []),
        ...(asha ? [{ who: `${asha.name} (${asha.label})`, at: timeOn(dueAt + DAY, LADDER.ashaAtHour), stage: 'asha' as const }] : []),
      ]
      const ack = s.escalationAcks?.[key]
      const cutoff = ack ? ack.at : now
      const done = steps.filter((x) => x.at <= cutoff)
      const last = done.at(-1)
      if (!last) continue
      // Yesterday's doses only stay open if they still need (or reached) the ASHA step.
      if (ago === 1 && !asha) continue
      out.push({
        key, reminderId: r.id, brand: r.brand, time: r.time, day, dueAt, stage: last.stage,
        notified: done.map(({ who, at }) => ({ who, at })),
        nextStep: ack ? null : (steps.find((x) => x.at > now) ?? null),
        ...(ack ? { ack } : {}),
      })
    }
  }
  return out.sort((a, b) => b.dueAt - a.dueAt)
}

// ---------- 3. cheaper equivalents (same ingredients, strengths and form) ----------

const signature = (p: Product) => `${p.form}|${p.ingredients.map((i) => `${i.name}:${i.mg}`).sort().join('+')}`

export interface Cheaper {
  product: Product
  savePerStrip: number
  savePct: number
}

/** Cheaper products with exactly the same composition, cheapest first. Never decides; the pharmacist offers, the patient chooses. */
export function cheaperEquivalents(brand: string, catalog: Product[] = CATALOG): Cheaper[] {
  const p = normalise(brand, catalog)
  if (!p) return []
  return catalog
    .filter((x) => x.brand !== p.brand && signature(x) === signature(p) && x.mrp < p.mrp)
    .sort((a, b) => a.mrp - b.mrp)
    .map((x) => ({ product: x, savePerStrip: p.mrp - x.mrp, savePct: Math.round(((p.mrp - x.mrp) / p.mrp) * 100) }))
}

// ---------- 4. strip photo check ----------

export type StripVerdict = 'match' | 'same-medicine' | 'not-on-list' | 'unreadable'
export interface StripResult {
  verdict: StripVerdict
  product?: Product
  /** The patient's own medicine it was compared with. */
  mine?: string
  by?: 'barcode' | 'brand' | 'ingredients'
}

/** Normalises OCR text: lowercase, common misreads (0→o, 1→l, 5→s inside words), single spaces. */
function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[|]/g, 'l')
    .replace(/([a-z])0([a-z])/g, '$1o$2')
    .replace(/([a-z])1([a-z])/g, '$1l$2')
    .replace(/[^a-z0-9.\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const squash = (s: string) => s.replace(/[\s-]/g, '')

/**
 * Identifies a medicine from text read off its strip and compares it with the patient's medicines.
 * Order: barcode digits → exact brand name → ingredients with strengths. Unknown text → 'unreadable'.
 */
export function matchStripText(text: string, myBrands: string[], catalog: Product[] = CATALOG): StripResult {
  const raw = text.replace(/\s/g, '')
  const t = clean(text)
  const flat = squash(t)
  let product: Product | undefined
  let by: StripResult['by']
  product = catalog.find((p) => raw.includes(p.barcode))
  if (product) by = 'barcode'
  if (!product) {
    // Longest brand first so "Telma-AM 40/5" wins over "Telma 40".
    product = [...catalog].sort((a, b) => b.brand.length - a.brand.length).find((p) => flat.includes(squash(p.brand.toLowerCase())))
    if (product) by = 'brand'
  }
  if (!product) {
    const hits = catalog.filter((p) => p.ingredients.every((i) => new RegExp(`${i.name}[^0-9]{0,40}${i.mg}\\s*mg`).test(t) || new RegExp(`${i.name}\\s*${i.mg}`).test(t)))
    // Prefer the product with the most ingredients matched (combination pills) — compositions are what matter here.
    product = hits.sort((a, b) => b.ingredients.length - a.ingredients.length)[0]
    if (product) by = 'ingredients'
  }
  if (!product || !by) return { verdict: 'unreadable' }
  // Only a read brand name or barcode identifies the exact product; ingredients alone can't tell brands apart.
  if (by !== 'ingredients' && myBrands.includes(product.brand)) return { verdict: 'match', product, mine: product.brand, by }
  const sig = signature(product)
  const same = myBrands.find((b) => {
    const mine = normalise(b, catalog)
    return mine && signature(mine) === sig
  })
  return same ? { verdict: 'same-medicine', product, mine: same, by } : { verdict: 'not-on-list', product, by }
}
