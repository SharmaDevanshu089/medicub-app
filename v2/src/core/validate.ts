// Minimal runtime validation for untrusted input at the API boundary. Each reader throws AppError('INVALID').
import { invalid } from './errors'

export type Obj = Record<string, unknown>

export function obj(v: unknown, what = 'body'): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw invalid(`${what} must be an object.`)
  return v as Obj
}

export function str(o: Obj, k: string, { min = 1, max = 500, pattern }: { min?: number; max?: number; pattern?: RegExp } = {}): string {
  const v = o[k]
  if (typeof v !== 'string') throw invalid(`${k} is required.`)
  const s = v.trim()
  if (s.length < min) throw invalid(`${k} must be at least ${min} character${min === 1 ? '' : 's'}.`)
  if (s.length > max) throw invalid(`${k} must be at most ${max} characters.`)
  if (pattern && !pattern.test(s)) throw invalid(`${k} has the wrong format.`)
  return s
}

export function optStr(o: Obj, k: string, opts?: { min?: number; max?: number; pattern?: RegExp }): string | undefined {
  return o[k] === undefined || o[k] === null || o[k] === '' ? undefined : str(o, k, opts)
}

export function num(o: Obj, k: string, { min = -Infinity, max = Infinity, int = false }: { min?: number; max?: number; int?: boolean } = {}): number {
  const v = o[k]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw invalid(`${k} must be a number.`)
  if (int && !Number.isInteger(v)) throw invalid(`${k} must be a whole number.`)
  if (v < min || v > max) throw invalid(`${k} must be between ${min} and ${max}.`)
  return v
}

export function oneOf<T extends string>(o: Obj, k: string, options: readonly T[]): T {
  const v = o[k]
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) throw invalid(`${k} must be one of: ${options.join(', ')}.`)
  return v as T
}

export function arr(o: Obj, k: string, { min = 0, max = 100 }: { min?: number; max?: number } = {}): unknown[] {
  const v = o[k]
  if (!Array.isArray(v)) throw invalid(`${k} must be a list.`)
  if (v.length < min || v.length > max) throw invalid(`${k} must have ${min}–${max} items.`)
  return v
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const DAY = /^\d{4}-\d{2}-\d{2}$/
