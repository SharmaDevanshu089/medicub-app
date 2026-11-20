import { describe, expect, it } from 'vitest'
import { CATALOG, type Product } from './catalog'
import { checkDuplicates, checkInteractions, checkSubstitution, normalise, runChecks } from './rules'

const p = (b: string) => {
  const x = normalise(b)
  if (!x) throw new Error(`missing ${b}`)
  return x
}

describe('normalise', () => {
  it('expands combination pills', () => {
    expect(p('Telma-AM 40/5').ingredients.map((i) => i.name)).toEqual(['telmisartan', 'amlodipine'])
  })
  it('accepts barcode', () => expect(normalise('8900000000035')?.brand).toBe('Stamlo 5'))
})

describe('R-DUP-001', () => {
  it('Telma-AM vs Amlong 5 → duplicate amlodipine, HIGH, combined 10 mg/day', () => {
    const f = checkDuplicates([
      { brand: 'Amlong 5', dosesPerDay: 1, source: 'Dr Meera Iyer' },
      { brand: 'Telma-AM 40/5', dosesPerDay: 1, source: 'draft' },
    ])
    expect(f).toHaveLength(1)
    expect(f[0]?.ruleId).toBe('R-DUP-001')
    expect(f[0]?.severity).toBe('HIGH')
    expect(f[0]?.evidence.at(-1)).toBe('Combined daily amlodipine: 10 mg/day')
    expect(f[0]?.patient).not.toMatch(/stop/i)
    expect(f[0]?.patient).toMatch(/Ask your doctor or pharmacist/)
  })
  it('seed meds alone raise nothing', () => {
    expect(
      runChecks([
        { brand: 'Amlong 5', dosesPerDay: 1, source: 'a' },
        { brand: 'Glycomet 500', dosesPerDay: 2, source: 'b' },
      ]),
    ).toEqual([])
  })
})

describe('R-INT-001', () => {
  it('ACE inhibitor + ARB → CRITICAL', () => {
    const testAce: Product = { brand: 'TestACE', ingredients: [{ name: 'test-acei', mg: 1, drugClass: 'ACE inhibitor' }], form: 'tablet', barcode: 'x', mrp: 1 }
    const f = checkInteractions(
      [
        { brand: 'TestACE', dosesPerDay: 1, source: 'a' },
        { brand: 'Telma 40', dosesPerDay: 1, source: 'b' },
      ],
      [...CATALOG, testAce],
    )
    expect(f).toHaveLength(1)
    expect(f[0]?.severity).toBe('CRITICAL')
  })
})

describe('R-SUB-001', () => {
  it('Stamlo 5 for Amlong 5 → equivalent', () => {
    expect(checkSubstitution(p('Amlong 5'), p('Stamlo 5')).verdict).toBe('EQUIVALENT')
  })
  it('Telma-AM scanned for Amlong 5 → blocked with finding', () => {
    const r = checkSubstitution(p('Amlong 5'), p('Telma-AM 40/5'))
    expect(r.verdict).toBe('BLOCKED')
    expect(r.finding?.ruleId).toBe('R-SUB-001')
    expect(r.reasons.join()).toMatch(/telmisartan/)
  })
  it('same brand → exact', () => expect(checkSubstitution(p('Amlong 5'), p('Amlong 5')).verdict).toBe('EXACT'))
})
