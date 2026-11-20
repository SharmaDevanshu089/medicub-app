// Deterministic rules engine. Pure: no UI, no I/O. Flags, explains, routes — never prescribes.
import { CATALOG, type Product } from './catalog'

export type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
export type RuleId = 'R-DUP-001' | 'R-INT-001' | 'R-SUB-001'

export interface Finding {
  ruleId: RuleId
  key: string // stable identity: rule + products involved
  severity: Severity
  title: string
  evidence: string[]
  clinician: string
  patient: string // plain language, never says "stop taking"
  brands: string[]
}

/** A medicine as the engine sees it: product + doses per day + who prescribed it. */
export interface MedInput {
  brand: string
  dosesPerDay: number
  source: string // e.g. "Dr Meera Iyer" or "draft"
}

const ASK = 'Ask your doctor or pharmacist before your next dose.'

export function normalise(brandOrBarcode: string, catalog: Product[] = CATALOG): Product | undefined {
  const q = brandOrBarcode.trim().toLowerCase()
  return catalog.find((p) => p.brand.toLowerCase() === q || p.barcode === q)
}

export function describe(p: Product): string {
  return p.ingredients.map((i) => `${i.name} ${i.mg} mg`).join(' + ')
}

const keyOf = (rule: RuleId, brands: string[]) => `${rule}:${[...brands].sort().join('|')}`

/** R-DUP-001: same ingredient in more than one active/proposed product (combination pills expanded). */
export function checkDuplicates(meds: MedInput[], catalog: Product[] = CATALOG): Finding[] {
  const byIngredient = new Map<string, { med: MedInput; mg: number }[]>()
  for (const med of meds) {
    const p = normalise(med.brand, catalog)
    if (!p) continue
    for (const ing of p.ingredients) {
      const list = byIngredient.get(ing.name) ?? []
      list.push({ med, mg: ing.mg })
      byIngredient.set(ing.name, list)
    }
  }
  const out: Finding[] = []
  for (const [ingredient, hits] of byIngredient) {
    const brands = [...new Set(hits.map((h) => h.med.brand))]
    if (brands.length < 2) continue
    const total = hits.reduce((s, h) => s + h.mg * h.med.dosesPerDay, 0)
    out.push({
      ruleId: 'R-DUP-001',
      key: keyOf('R-DUP-001', brands),
      severity: 'HIGH',
      title: `Duplicate ingredient: ${ingredient}`,
      evidence: [
        ...hits.map((h) => `${h.med.brand} — ${ingredient} ${h.mg} mg × ${h.med.dosesPerDay}/day (${h.med.source})`),
        `Combined daily ${ingredient}: ${total} mg/day`,
      ],
      clinician: `${ingredient} is present in ${brands.join(' and ')}. Combined daily dose would be ${total} mg/day. Confirm whether this is intended or a change is planned.`,
      patient: `Two of your medicines (${brands.join(', ')}) contain the same ingredient, ${ingredient}. ${ASK}`,
      brands,
    })
  }
  return out
}

// CLINICIAN-REVIEW: curated demo table (class pairs), not a clinical reference.
export const INTERACTIONS: { a: string; b: string; severity: Severity; note: string }[] = [
  { a: 'ACE inhibitor', b: 'ARB', severity: 'CRITICAL', note: 'ACE inhibitor + ARB is listed as critical in the curated table.' },
]

/** R-INT-001: class-pair interaction from the curated table. */
export function checkInteractions(meds: MedInput[], catalog: Product[] = CATALOG): Finding[] {
  const items = meds.flatMap((m) => {
    const p = normalise(m.brand, catalog)
    return p ? p.ingredients.map((i) => ({ med: m, ing: i })) : []
  })
  const out: Finding[] = []
  const seen = new Set<string>()
  for (const x of items)
    for (const y of items) {
      if (x.med.brand === y.med.brand) continue
      const rule = INTERACTIONS.find((r) => r.a === x.ing.drugClass && r.b === y.ing.drugClass)
      if (!rule) continue
      const key = keyOf('R-INT-001', [x.med.brand, y.med.brand])
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        ruleId: 'R-INT-001',
        key,
        severity: rule.severity,
        title: `Interaction: ${rule.a} + ${rule.b}`,
        evidence: [
          `${x.med.brand} — ${x.ing.name} (${x.ing.drugClass}) (${x.med.source})`,
          `${y.med.brand} — ${y.ing.name} (${y.ing.drugClass}) (${y.med.source})`,
          'Source: curated interaction table (demo)',
        ],
        clinician: `${rule.note} Review whether both are needed.`,
        patient: `Two of your medicines may not be safe together. ${ASK}`,
        brands: [x.med.brand, y.med.brand],
      })
    }
  return out
}

export type SubVerdict = 'EXACT' | 'EQUIVALENT' | 'BLOCKED'

export interface SubResult {
  verdict: SubVerdict
  reasons: string[]
  finding?: Finding
}

/** R-SUB-001: same ingredients + strengths + form = equivalent candidate (a human must attest). Anything else is blocked. */
export function checkSubstitution(prescribed: Product, scanned: Product): SubResult {
  if (prescribed.brand === scanned.brand) return { verdict: 'EXACT', reasons: ['Same product as prescribed'] }
  const pIng = new Map(prescribed.ingredients.map((i) => [i.name, i.mg]))
  const sIng = new Map(scanned.ingredients.map((i) => [i.name, i.mg]))
  const reasons: string[] = []
  for (const [n, mg] of sIng) {
    if (!pIng.has(n)) reasons.push(`Scanned contains ${n} ${mg} mg — not in prescription`)
    else if (pIng.get(n) !== mg) reasons.push(`${n} strength differs: prescribed ${pIng.get(n)} mg, scanned ${mg} mg`)
  }
  for (const [n, mg] of pIng) if (!sIng.has(n)) reasons.push(`Prescribed ${n} ${mg} mg is missing from scanned product`)
  if (prescribed.form !== scanned.form) reasons.push(`Form differs: ${prescribed.form} vs ${scanned.form}`)

  if (reasons.length === 0)
    return { verdict: 'EQUIVALENT', reasons: ['Same ingredients, strengths and form — equivalent candidate. Pharmacist must attest.'] }

  const brands = [prescribed.brand, scanned.brand]
  return {
    verdict: 'BLOCKED',
    reasons,
    finding: {
      ruleId: 'R-SUB-001',
      key: keyOf('R-SUB-001', brands),
      severity: 'HIGH',
      title: `Substitution blocked: ${scanned.brand} for ${prescribed.brand}`,
      evidence: [`Prescribed: ${prescribed.brand} (${describe(prescribed)})`, `Scanned: ${scanned.brand} (${describe(scanned)})`, ...reasons],
      clinician: `Pharmacy scanned ${scanned.brand} against a prescription for ${prescribed.brand}. Composition does not match; prescriber decision required.`,
      patient: `The pharmacy found that the medicine offered is different from your prescription. ${ASK}`,
      brands,
    },
  }
}

export function runChecks(meds: MedInput[], catalog: Product[] = CATALOG): Finding[] {
  return [...checkDuplicates(meds, catalog), ...checkInteractions(meds, catalog)]
}

export const blocksSigning = (s: Severity) => s === 'HIGH' || s === 'CRITICAL'
