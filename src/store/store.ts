// Client store: talks to the Medicub server. Each app signs in as one role, receives its role-filtered
// view of the state as a live stream, and sends actions. All errors surface as toasts and are reported to the server log.
import { useSyncExternalStore } from 'react'
import { AppError, type ErrorCode } from '../core/errors'
import type { Session } from '../core/session'
import type { Finding, SubResult } from '../engine/rules'
import type { CheckResult } from '../services/verification'
import type { DecisionKind, DoctorId, DoseAction, Note, PatientId, PhoneLocation, Reminder, Report, State, StockItem } from './types'

export { hasAccess } from '../core/session'
export type AppName = 'doctor' | 'patient' | 'pharmacy' | 'department' | 'caregiver' | 'admin'

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
export type Status = 'signed-out' | 'connecting' | 'online' | 'reconnecting'

let app: AppName = 'doctor'
let token: string | null = null
let state: State | null = null
let status: Status = 'signed-out'
let me: { session: Session; name: string } | null = null
let snapshot: { state: State | null; status: Status; me: { session: Session; name: string } | null } = { state, status, me }
const listeners = new Set<() => void>()
const emit = () => {
  snapshot = { state, status, me }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ---------- toasts (errors and confirmations) ----------
export interface Toast { id: number; kind: 'error' | 'info' | 'success'; text: string }
let toasts: Toast[] = []
const toastListeners = new Set<() => void>()
let toastId = 0
export function notify(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++toastId, kind, text }
  toasts = [...toasts.slice(-3), t]
  toastListeners.forEach((l) => l())
  setTimeout(() => dismissToast(t.id), kind === 'error' ? 7000 : 4000)
}
export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  toastListeners.forEach((l) => l())
}
export const useToasts = () => useSyncExternalStore((l) => { toastListeners.add(l); return () => toastListeners.delete(l) }, () => toasts)

// ---------- client logging ----------
export function reportClient(level: 'error' | 'warn' | 'info', event: string, message: string, stack?: string) {
  const body = JSON.stringify({ level, event, message: message.slice(0, 2000), stack: stack?.slice(0, 4000), app, url: location.pathname })
  if (level === 'error') console.error(`[medicub:${app}] ${event}: ${message}`)
  try {
    void fetch(`${API}/api/client-log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
  } catch {
    /* logging must never throw */
  }
}

// ---------- token ----------
const tokenKey = () => `medicub:token:${app}`
function saveToken(t: string | null) {
  token = t
  try {
    if (t) localStorage.setItem(tokenKey(), t)
    else localStorage.removeItem(tokenKey())
  } catch {
    /* private mode: stay signed in for this tab only */
  }
}

// ---------- http ----------
async function request<T>(path: string, body?: unknown, { timeoutMs = 15_000 } = {}): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch {
    throw new AppError('NETWORK', "Can't reach Medicub. Check your connection and try again.")
  } finally {
    clearTimeout(timer)
  }
  const json = (await res.json().catch(() => null)) as { error?: { code: ErrorCode; message: string; requestId?: string } } | null
  if (!res.ok) {
    const code = json?.error?.code ?? (res.status >= 500 ? 'INTERNAL' : 'INVALID')
    const message = json?.error?.message ?? `Request failed (${res.status}).`
    if (code === 'UNAUTHENTICATED' && token) signedOut(message)
    throw new AppError(code, message)
  }
  return json as T
}

function signedOut(why?: string) {
  saveToken(null)
  stopSync()
  state = null
  me = null
  status = 'signed-out'
  emit()
  if (why) notify(why, 'info')
}

// ---------- sync: poll the server; unchanged data costs one tiny response ----------
// (Serverless hosting can't hold long-lived connections, so apps ask every 2 s, and right after every action.)
let syncTimer: ReturnType<typeof setTimeout> | undefined
let syncGen = 0
let retry = 0
let rev: number | null = null
let lastFull = 0
function stopSync() {
  syncGen++
  clearTimeout(syncTimer)
}
function schedule(gen: number, ms: number) {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void pollOnce(gen), ms)
}
async function pollOnce(gen: number) {
  if (gen !== syncGen || !token) return
  try {
    const full = rev === null || Date.now() - lastFull > 15_000 // time-based changes (consent expiry, due doses) need a fresh view
    const r = await request<{ rev: number; unchanged?: boolean; state?: State }>(full ? '/api/state' : `/api/state?rev=${rev}`)
    if (gen !== syncGen) return
    if (r.state) {
      state = r.state
      lastFull = Date.now()
    }
    rev = r.rev
    retry = 0
    if (status !== 'online' || r.state) {
      status = 'online'
      emit()
    }
    schedule(gen, typeof document !== 'undefined' && document.hidden ? 10_000 : 2_000)
  } catch (e) {
    if (gen !== syncGen || (e as AppError).code === 'UNAUTHENTICATED') return // signed out already handled
    status = state ? 'reconnecting' : 'connecting'
    emit()
    if (++retry === 3) reportClient('warn', 'sync.retrying', (e as Error).message)
    schedule(gen, Math.min(10_000, 1000 * 2 ** retry))
  }
}
function startSync() {
  stopSync()
  rev = null
  status = state ? 'reconnecting' : 'connecting'
  emit()
  void pollOnce(syncGen)
}
/** Fetch now instead of waiting for the next poll (after this app changed something). */
const syncNow = () => {
  if (token) void pollOnce(syncGen)
}

// ---------- public: lifecycle ----------
export function initClient(name: AppName) {
  app = name
  try {
    token = localStorage.getItem(tokenKey())
  } catch {
    token = null
  }
  if (token) {
    status = 'connecting'
    void request<{ session: Session; name: string }>('/api/me')
      .then((m) => { me = m; emit(); startSync() })
      .catch((e: AppError) => { if (e.code === 'NETWORK') startSync() })
  }
  addEventListener('online', () => { if (token && status !== 'online') startSync() })
  addEventListener('visibilitychange', () => { if (!document.hidden) syncNow() })
}

export async function login(creds: Record<string, unknown>): Promise<void> {
  const r = await request<{ token: string; session: Session; name: string }>('/api/login', { role: app === 'admin' ? 'admin' : app, ...creds })
  saveToken(r.token)
  me = { session: r.session, name: r.name }
  emit()
  startSync()
}

export async function logout() {
  try {
    await request('/api/logout', {})
  } catch {
    /* signing out locally is enough */
  }
  signedOut()
}

/** Signs in with a token issued elsewhere (doctor onboarding). */
export function adoptToken(t: string, session: Session, name: string) {
  saveToken(t)
  me = { session, name }
  emit()
  startSync()
}

export const useClient = () => useSyncExternalStore(subscribe, () => snapshot)
/** Only call inside <Gate>, which guarantees the state is loaded. */
export function useStore(): State {
  const s = useSyncExternalStore(subscribe, () => snapshot.state)
  if (!s) throw new Error('useStore() used outside <Gate>')
  return s
}

// ---------- actions ----------
/** Runs a server action. Errors show as a toast (unless `quiet`) and are rethrown so callers can react. */
export async function act<T = unknown>(name: string, payload: Record<string, unknown> = {}, { quiet = false } = {}): Promise<T> {
  try {
    const r = await request<{ value: T }>(`/api/action/${name}`, payload)
    syncNow()
    return r.value
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError('INTERNAL', String(e))
    if (!quiet) notify(err.message, 'error')
    if (err.code === 'INTERNAL' || err.code === 'NETWORK') reportClient('error', `action.${name}`, err.message)
    throw err
  }
}
/** Fire-and-forget variant for UI handlers: errors are already shown as toasts. */
const fire = (name: string, payload: Record<string, unknown> = {}) => void act(name, payload).catch(() => undefined)

export const now = () => Date.now() + (state?.clockOffsetMs ?? 0)
export const doctorName = (id: DoctorId | null | undefined) => state?.doctors.find((d) => d.id === id)?.name ?? 'No doctor'
export const patientName = (id: PatientId) => state?.patients.find((p) => p.id === id)?.name ?? 'Patient'

// demo / admin
export const setClockOffset = (ms: number) => fire('demo.setClock', { offsetMs: ms })
export const resetDemo = () => act('demo.reset').then(() => notify('Demo data reset.', 'success'))
export const tamper = () => fire('admin.tamper')
export const verifyAudit = () => request<{ ok: boolean; brokenAt: number | null; entries: number }>('/api/audit/verify')
export const fetchLogs = (limit = 100) => request<{ id: number; ts: number; level: string; event: string; data: Record<string, unknown> | null }[]>(`/api/logs?limit=${limit}`)
export const health = () => request<{ ok: boolean; storage: string; uptimeS: number; rev: number; auditEntries: number }>('/api/health')

// patient (patientId comes from the session on the server; the parameter is kept for readability at call sites)
export const setPhoneLocation = (loc: PhoneLocation) => fire('patient.setLocation', { ...loc })
export const checkIn = (_p: PatientId, doctorId: DoctorId) => fire('patient.checkIn', { doctorId })
export const acceptDoctor = (_p: PatientId, doctorId: DoctorId) => fire('patient.acceptDoctor', { doctorId })
export const declineDoctor = (_p: PatientId, doctorId: DoctorId) => fire('patient.declineDoctor', { doctorId })
export const grantConsent = (_p: PatientId, doctorId: DoctorId) => act('patient.grantConsent', { doctorId })
export const createShare = (_p: PatientId) => fire('patient.createShare')
export const revokeConsent = (id: string) => fire('patient.revokeConsent', { id })
export const logDose = (reminderId: string, dayKey: string, action: DoseAction) => fire('patient.logDose', { reminderId, dayKey, action })

// doctor
export const scanPatientQr = (): Promise<PatientId | null> => act<PatientId>('doctor.scanQr', {}, { quiet: true }).catch((e: AppError) => { if (e.code !== 'NOT_FOUND') notify(e.message, 'error'); return null })
export const viewRecord = (patientId: PatientId) => void act('doctor.viewRecord', { patientId }, { quiet: true }).catch(() => undefined)
export const checkDraft = (patientId: PatientId, items: { brand: string; dosesPerDay: number }[]) => (items.length ? fire('doctor.checkDraft', { patientId, items }) : undefined)
export const decideFlag = (id: string, kind: DecisionKind, reason: string) => act('doctor.decideFlag', { id, kind, reason })
export const signRx = (patientId: PatientId, items: { brand: string; dosesPerDay: number }[]) => act<string>('doctor.signRx', { patientId, items })
export const addReminder = (r: Omit<Reminder, 'id' | 'createdBy'>) => act('doctor.addReminder', { ...r })
export const sendSecondOpinion = (toId: DoctorId, patientId: PatientId, question: string) => act('doctor.secondOpinion', { toId, patientId, question })
export const addNote = (n: Pick<Note, 'patientId' | 'text'>) => act(me?.session.role === 'department' ? 'records.addNote' : 'doctor.addNote', { patientId: n.patientId, text: n.text })
export const addReport = (r: Omit<Report, 'id' | 'author' | 'department'>) => act('records.addReport', { ...r })

// pharmacy
export interface RedeemedRx { code: string; signedAt: number; patientName: string; doctorName: string; items: { brand: string; dosesPerDay: number; inStock: boolean; mrp?: number | null; cheaper?: Cheaper[] }[] }
export interface Cheaper { brand: string; mrp: number; savePct: number; savePerStrip: number; janAushadhi: boolean; inStock: boolean }
export const redeemRx = (code: string) => act<RedeemedRx>('pharmacy.redeem', { code })
export const scanPack = (rxCode: string, prescribed: string, scanned: string) => act<SubResult>('pharmacy.scan', { rxCode, prescribed, scanned })
export const attest = (rxCode: string, prescribed: string, scanned: string, patientAgreed: boolean, offlineAt?: number) => act('pharmacy.attest', { rxCode, prescribed, scanned, patientAgreed, ...(offlineAt ? { offlineAt } : {}) })
export const escalate = (rxCode: string, prescribed: string, scanned: string, offlineAt?: number) => act('pharmacy.escalate', { rxCode, prescribed, scanned, ...(offlineAt ? { offlineAt } : {}) })
export const importStock = (rows: StockItem[]) => act('pharmacy.importStock', { rows })
export const reportConnectivity = (online: boolean, queued = 0) => void act('pharmacy.connectivity', { online, queued }, { quiet: true }).catch(() => undefined)
export const demoLatestRx = () => act<string | null>('pharmacy.demoLatestRx')

// onboarding
export const onboardDoctor = (data: Record<string, unknown>) => request<{ verified: boolean; checks: CheckResult[]; token?: string; session?: Session; name?: string }>('/api/onboard', data, { timeoutMs: 30_000 })

export type { Finding }

// clinic QR (patient scans the code on the doctor's desk)
export interface ScannedDoctor { doctorId: DoctorId; name: string; specialty: string; clinic: string; checks: CheckResult[] }
export const issueClinicQr = () => act<{ code: string; expiresAt: number }>('doctor.issueQr', {}, { quiet: true })
export const lookupDoctorQr = (code: string) => act<ScannedDoctor>('patient.lookupDoctorQr', { code }, { quiet: true })
export const scanDoctorQr = (code: string) => act<DoctorId>('patient.scanDoctorQr', { code })

// caregivers (escalation ladder)
export const caregiverConfirmTaken = (reminderId: string, dayKey: string) => act('caregiver.confirmTaken', { reminderId, dayKey })
export const caregiverAcknowledge = (reminderId: string, dayKey: string, note: string) => act('caregiver.acknowledge', { reminderId, dayKey, note })
export const setCaregiverAlerts = (caregiverId: string, enabled: boolean) => act('patient.setCaregiverAlerts', { caregiverId, enabled })
