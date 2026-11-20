// "AI assist — demo": a deterministic, template-built summary of the record. No model call.
// It only restates what is in the record, with a source on every line. It never recommends or decides.
import { describe, normalise } from '../engine/rules'
import type { PatientId, State } from '../store/types'

const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export interface SummaryLine {
  text: string
  source: string
}

export function buildSummary(s: State, patientId: PatientId): SummaryLine[] {
  const p = s.patients.find((x) => x.id === patientId)
  if (!p) return []
  const doc = (id: string | null) => s.doctors.find((d) => d.id === id)?.name ?? 'none'
  const lines: SummaryLine[] = [
    { text: `${p.name}, ${p.age}${p.sex}. Conditions: ${p.conditions.map((c) => `${c.name} (since ${c.since})`).join(', ') || 'none recorded'}.`, source: 'patient profile' },
    { text: `Current doctor: ${doc(p.currentDoctorId)}.`, source: 'care relationship' },
  ]
  for (const m of s.meds.filter((x) => x.patientId === patientId)) {
    const prod = normalise(m.brand)
    lines.push({ text: `Medicine: ${m.brand} (${prod ? describe(prod) : 'unknown'}), ${m.dosesPerDay}×/day.`, source: `${m.rxCode}, ${doc(m.prescriberId)}` })
  }
  for (const f of s.flags.filter((x) => x.patientId === patientId))
    lines.push({ text: `${f.ruleId} ${f.severity}: ${f.title} — ${f.status}${f.decision ? ` (${f.decision.kind}: “${f.decision.reason}”)` : ''}.`, source: 'rules engine + decision record' })
  const reports = s.reports.filter((x) => x.patientId === patientId).sort((a, b) => b.takenAt - a.takenAt)
  for (const r of reports.slice(0, 5))
    lines.push({
      text: `${r.kind} ${fmtDate(r.takenAt)}: ${r.title}${r.values?.length ? ` — ${r.values.map((v) => `${v.name} ${v.value} ${v.unit}`).join(', ')}` : ` — ${r.summary}`}`,
      source: `${r.department}, ${r.author}`,
    })
  const notes = s.notes.filter((x) => x.patientId === patientId).sort((a, b) => b.at - a.at)
  for (const n of notes.slice(0, 3)) lines.push({ text: `Note ${fmtDate(n.at)}: ${n.text}`, source: `${n.department}, ${n.author}` })
  const v = s.vitals[patientId]
  if (v?.pulse.length) lines.push({ text: `Resting pulse 7-day average ${Math.round(v.pulse.reduce((a, x) => a + x.bpm, 0) / v.pulse.length)} bpm.`, source: 'wearable estimate' })
  const bp = v?.bp.at(-1)
  if (bp) lines.push({ text: `Latest BP estimate ${bp.sys}/${bp.dia} mmHg — not a cuff reading.`, source: 'wearable estimate' })
  return lines
}
