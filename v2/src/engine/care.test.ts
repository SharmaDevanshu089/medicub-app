import { describe, expect, it } from 'vitest'
import { dayKey, timeOn } from '../lib/dates'
import { getInitialState as seed } from '../store/initial-state'
import { adherence, cheaperEquivalents, escalations, LADDER, matchStripText } from './care'

const NOW = new Date(2026, 10, 20, 12, 0).getTime() // local noon
const DAY = 86_400_000

describe('adherence', () => {
  it('summarises the seeded 14 days and compares BP on full vs missed days', () => {
    const s = seed(NOW)
    const a = adherence(s.reminders.filter((r) => r.patientId === 'p1'), s.doseLog, s.vitals.p1, NOW, 14)
    expect(a.days).toHaveLength(14)
    expect(a.pct).toBeGreaterThan(70)
    expect(a.pct).toBeLessThan(100)
    const amlong = a.byMedicine.find((m) => m.brand === 'Amlong 5')
    expect(amlong && amlong.taken < amlong.scheduled).toBe(true)
    expect(a.bpCompare).not.toBeNull()
    expect(a.bpCompare!.missedSys).toBeGreaterThan(a.bpCompare!.fullSys) // synthetic seed pattern
    // today's 20:30 dose is still in the future at noon, so it isn't counted
    expect(a.days.at(-1)?.doses.some((d) => d.reminderId === 'r3')).toBe(false)
  })
})

describe('escalation ladder', () => {
  it('climbs reminder → repeat → family → ASHA, and stops when acknowledged or taken', () => {
    const s = { ...seed(NOW), doseLog: {} } // nothing recorded today
    const due = timeOn(NOW, '08:00')
    const at = (min: number) => escalations(s, 'p1', due + min * 60_000).find((e) => e.reminderId === 'r1' && e.day === dayKey(due))
    expect(at(5)?.stage).toBe('reminded')
    expect(at(LADDER.repeatAfterMin + 1)?.stage).toBe('repeat')
    expect(at(LADDER.familyAfterMin + 1)?.stage).toBe('family')
    expect(at(LADDER.familyAfterMin + 1)?.notified.at(-1)?.who).toMatch(/Sunita/)
    const nextMorning = timeOn(due + DAY, '09:05') - due
    expect(escalations(s, 'p1', due + nextMorning).find((e) => e.reminderId === 'r1' && e.day === dayKey(due))?.stage).toBe('asha')
    // a caregiver acknowledgement freezes the ladder
    const acked = { ...s, escalationAcks: { [`r1@${dayKey(due)}`]: { by: 'Sunita', at: due + 35 * 60_000, note: 'Called him' } } }
    const e = escalations(acked, 'p1', due + nextMorning).find((x) => x.reminderId === 'r1' && x.day === dayKey(due))
    expect(e?.stage).toBe('family')
    expect(e?.nextStep).toBeNull()
    // taken → no escalation
    const taken = { ...s, doseLog: { [`r1@${dayKey(due)}`]: { action: 'taken' as const, at: due + 40 * 60_000 } } }
    expect(escalations(taken, 'p1', due + 60 * 60_000).some((x) => x.reminderId === 'r1' && x.day === dayKey(due))).toBe(false)
  })
  it('respects the patient pausing a caregiver', () => {
    const base = seed(NOW)
    const s = { ...base, doseLog: {}, patients: base.patients.map((p) => (p.id === 'p1' ? { ...p, caregivers: p.caregivers?.map((c) => ({ ...c, enabled: c.relation !== 'family' })) } : p)) }
    const due = timeOn(NOW, '08:00')
    expect(escalations(s, 'p1', due + 45 * 60_000).find((e) => e.reminderId === 'r1')?.stage).toBe('repeat')
  })
})

describe('cheaper equivalents', () => {
  it('finds Jan Aushadhi with the same composition, never a different composition', () => {
    const c = cheaperEquivalents('Amlong 5')
    expect(c[0]?.product.brand).toBe('Jan Aushadhi Amlodipine 5')
    expect(c[0]?.savePct).toBeGreaterThan(50)
    expect(c.some((x) => x.product.brand === 'Telma-AM 40/5')).toBe(false)
    expect(cheaperEquivalents('Telma-AM 40/5')).toEqual([]) // no cheaper exact match in the demo catalog
  })
})

describe('strip photo check', () => {
  const mine = ['Amlong 5', 'Glycomet 500']
  it('matches by brand even with OCR noise', () => {
    expect(matchStripText('AMLONG-5\nAmlodipine Tablets IP 5 mg', mine)).toMatchObject({ verdict: 'match', by: 'brand' })
    expect(matchStripText('Am1ong 5 tablets', mine).verdict).toBe('match') // 1 read for l
  })
  it('recognises the same medicine under another brand, and flags a different one', () => {
    expect(matchStripText('Stamlo 5 amlodipine 5mg', mine)).toMatchObject({ verdict: 'same-medicine', mine: 'Amlong 5' })
    expect(matchStripText('TELMA-AM 40/5 telmisartan 40 mg amlodipine 5 mg', mine)).toMatchObject({ verdict: 'not-on-list', product: { brand: 'Telma-AM 40/5' } })
    expect(matchStripText('Jan Aushadhi metformin tablets IP 500 mg', mine)).toMatchObject({ verdict: 'same-medicine', mine: 'Glycomet 500' })
  })
  it('uses barcode digits and gives up honestly', () => {
    expect(matchStripText('BATCH 22 8900000000042 EXP 12/27', mine)).toMatchObject({ verdict: 'match', by: 'barcode' })
    expect(matchStripText('blurry nonsense ###', mine).verdict).toBe('unreadable')
  })
})
