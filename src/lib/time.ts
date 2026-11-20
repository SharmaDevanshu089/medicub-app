import { useEffect, useState } from 'react'
import { now } from '../store/store'
import type { DoseEntry, Reminder } from '../store/types'

/** Re-renders every second and returns demo-clock time. */
export function useNow(): number {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return now()
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function timeOn(t: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(t)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d.getTime()
}
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const fmtDateTime = (t: number) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}:${pad(s % 60)}`
}

export type Slot = 'morning' | 'noon' | 'night'
export const slotOf = (hhmm: string): Slot => {
  const h = Number(hhmm.split(':')[0])
  return h < 11 ? 'morning' : h < 17 ? 'noon' : 'night'
}

export type DoseStatus = 'taken' | 'skipped' | 'snoozed' | 'due' | 'upcoming' | 'missed'
const DUE_WINDOW = 60 * 60_000

export function doseStatus(r: Reminder, t: number, log: Record<string, DoseEntry>): DoseStatus {
  const e = log[`${r.id}@${dayKey(t)}`]
  if (e?.action === 'taken' || e?.action === 'skipped') return e.action
  if (e?.action === 'snoozed') return e.until !== undefined && t < e.until ? 'snoozed' : 'due'
  const at = timeOn(t, r.time)
  if (t < at) return 'upcoming'
  return t - at <= DUE_WINDOW ? 'due' : 'missed'
}

/** Next scheduled dose after t that isn't already handled (today or tomorrow). */
export function nextDose(reminders: Reminder[], t: number, log: Record<string, DoseEntry>): { r: Reminder; at: number } | null {
  const cands = reminders.flatMap((r) => {
    const today = timeOn(t, r.time)
    return doseStatus(r, t, log) === 'upcoming' ? [{ r, at: today }] : [{ r, at: today + 86_400_000 }]
  })
  return cands.sort((a, b) => a.at - b.at)[0] ?? null
}

/** Demo clock target that makes reminder r fire now. */
export function fireTarget(r: Reminder, t: number, log: Record<string, DoseEntry>): number {
  const today = timeOn(t, r.time)
  const st = doseStatus(r, t, log)
  return st === 'upcoming' ? today + 1000 : today + 86_400_000 + 1000
}
export const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
