// Department desk (part of the Clinic app): radiology, pathology, nursing… add reports, X-rays, lab values and notes.
import { useRef, useState } from 'react'
import { dayKey, fmtDateTime, timeOn } from '../lib/time'
import { I, type IconName } from '../patient/icons'
import { Pressable, useStaggerIn } from '../patient/motion'
import { addNote, addReport, login, logout, notify, now, useClient, useStore } from '../store/store'
import type { ReportKind } from '../store/types'
import { Gate } from '../ui/AppFrame'
import { XrayPlaceholder } from '../ui/kit'

const APP = { fontFamily: 'var(--font-app)' }
const DEPARTMENTS = ['Radiology', 'Pathology', 'Cardiology', 'Diabetology', 'Nursing', 'Physiotherapy', 'Nephrology']
const KINDS: ReportKind[] = ['X-ray', 'Lab', 'ECG', 'Scan', 'Discharge', 'Other']
const KIND_ICON: Record<ReportKind, IconName> = { 'X-ray': 'xray', Lab: 'flask', ECG: 'pulse', Scan: 'doc', Discharge: 'doc', Other: 'doc' }
const MAX_IMAGE_KB = 500 // shortcut: images travel as data URLs; production uploads to object storage and stores a link
const field = 'h-12 rounded-xl border-[1.5px] border-line bg-cream-50 px-3 text-base text-ink'

/** "name, value, unit" per line → values; lines without a value are reported back, not silently dropped. */
export function parseValues(text: string): { values: { name: string; value: string; unit: string }[]; bad: string[] } {
  const values: { name: string; value: string; unit: string }[] = []
  const bad: string[] = []
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [name = '', value = '', unit = ''] = line.split(',').map((x) => x.trim())
    if (name && value) values.push({ name, value, unit })
    else bad.push(line)
  }
  return { values, bad }
}

export default function Department() {
  return (
    <Gate signIn={<SignIn />}>
      <Desk />
    </Gate>
  )
}

function SignIn() {
  const [name, setName] = useState('')
  const [dept, setDept] = useState(DEPARTMENTS[0] ?? '')
  const [err, setErr] = useState('')
  const card = useRef<HTMLDivElement>(null)
  useStaggerIn(card, 'dept')
  const go = (n: string, d: string) => login({ name: n, department: d }).catch((e: Error) => setErr(e.message))
  return (
    <div className="grid min-h-screen place-items-center bg-cream-50 p-5 text-ink" style={APP}>
      <div ref={card} className="flex w-full max-w-md flex-col gap-4 rounded-[28px] bg-white p-8">
        <div data-anim className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-[14px] bg-brand-600 text-white"><I n="flask" size={24} /></span><span className="text-2xl font-extrabold">Medicub Clinic</span></div>
        <h1 data-anim className="m-0 text-[28px] font-extrabold">Department desk</h1>
        <label data-anim className="flex flex-col gap-1.5 font-semibold text-muted">Your name<input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label data-anim className="flex flex-col gap-1.5 font-semibold text-muted">Department<select className={field} value={dept} onChange={(e) => setDept(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></label>
        {err && <p className="m-0 font-semibold text-red-700" role="alert">{err}</p>}
        <Pressable data-anim disabled={name.trim().length < 2} onClick={() => void go(name.trim(), dept)} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">Sign in</Pressable>
        <Pressable data-anim onClick={() => void go('Dr S. Pillai', 'Radiology')} className="h-12 rounded-2xl bg-cream-100 font-bold text-ink hover:bg-cream-200">Quick Sign In: Dr S. Pillai (Radiology)</Pressable>
        <p data-anim className="m-0 text-xs text-subtle">Staff sign in by department name or clinical credentials.</p>
      </div>
    </div>
  )
}

function Desk() {
  const s = useStore()
  const { me } = useClient()
  const [pid, setPid] = useState(s.patients[0]?.id ?? '')
  const [mode, setMode] = useState<'report' | 'note'>('report')
  const [kind, setKind] = useState<ReportKind>('X-ray')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(dayKey(now()))
  const [time, setTime] = useState('10:00')
  const [summary, setSummary] = useState('')
  const [values, setValues] = useState('')
  const [image, setImage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  useStaggerIn(list, pid)
  const dept = me?.session.role === 'department' ? me.session.department : ''
  const parsed = parseValues(values)

  const onImage = (file: File | undefined) => {
    if (!file) return setImage(undefined)
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return notify('Use a PNG, JPEG, WebP or GIF image.', 'error')
    if (file.size > MAX_IMAGE_KB * 1024) return notify(`Image is too large (max ${MAX_IMAGE_KB} KB in this demo).`, 'error')
    const r = new FileReader()
    r.onload = () => typeof r.result === 'string' && setImage(r.result)
    r.onerror = () => notify('Could not read that image.', 'error')
    r.readAsDataURL(file)
  }
  const save = async () => {
    if (parsed.bad.length) return notify(`Fix these value lines (need “name, value, unit”): ${parsed.bad.join(' · ')}`, 'error')
    setBusy(true)
    try {
      if (mode === 'note') await addNote({ patientId: pid, text: summary.trim() })
      else await addReport({ patientId: pid, kind, title: title.trim(), takenAt: timeOn(new Date(`${date}T00:00:00`).getTime(), time), summary: summary.trim(), values: parsed.values, image })
      notify(`Saved to ${s.patients.find((p) => p.id === pid)?.name}'s record — their doctors and phone update live.`, 'success')
      setTitle(''); setSummary(''); setValues(''); setImage(undefined)
    } catch {
      /* toast shown */
    } finally {
      setBusy(false)
    }
  }
  const ok = pid && summary.trim().length >= 3 && (mode === 'note' || title.trim())
  const items = [...s.reports.filter((r) => r.patientId === pid).map((r) => ({ at: r.takenAt, id: r.id, icon: KIND_ICON[r.kind], title: r.title, sub: `${r.kind} · ${r.author}`, r })), ...s.notes.filter((n) => n.patientId === pid).map((n) => ({ at: n.at, id: n.id, icon: 'doc' as IconName, title: n.text, sub: `Note · ${n.author}`, r: null }))].sort((a, b) => b.at - a.at)

  return (
    <div className="min-h-screen bg-cream-50 text-ink" style={APP}>
      <header className="flex flex-wrap items-center gap-3 border-b border-cream-200 px-5 py-3">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white"><I n="flask" size={22} /></span>
        <span className="text-xl font-extrabold">Department desk</span>
        <span className="rounded-full bg-sage-100 px-3 py-1 text-sm font-bold text-sage-900">{me?.name}</span>
        <Pressable onClick={() => void logout()} aria-label="Sign out" className="ml-auto grid size-11 place-items-center rounded-xl bg-white ring-1 ring-cream-200"><I n="logout" /></Pressable>
      </header>
      <div className="mx-auto grid max-w-[1300px] gap-5 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-4 rounded-3xl bg-white p-5">
          <label className="flex flex-col gap-1.5 font-semibold text-muted">Patient
            <select className={field} value={pid} onChange={(e) => setPid(e.target.value)}>{s.patients.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.age}{p.sex} · {p.id.toUpperCase()}</option>)}</select>
          </label>
          <div role="radiogroup" aria-label="What to add" className="flex gap-2">
            {(['report', 'note'] as const).map((m) => <Pressable key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`h-11 rounded-full px-5 font-bold ${mode === m ? 'bg-ink text-white' : 'ring-[1.5px] ring-line'}`}>{m === 'report' ? 'Report / X-ray' : 'Note'}</Pressable>)}
          </div>
          {mode === 'report' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Type<select className={field} value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Title<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chest X-ray (PA view)" /></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Date<input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">Time<input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} /></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted sm:col-span-2">Values — one per line: name, value, unit
                <textarea rows={3} className="rounded-xl border-[1.5px] border-line bg-cream-50 p-3 font-mono text-sm text-ink" value={values} onChange={(e) => setValues(e.target.value)} placeholder="HbA1c, 7.1, %" />
                {parsed.bad.length > 0 && <span className="text-red-700">Needs a value: {parsed.bad.join(' · ')}</span>}
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-cream-100 p-3 text-sm font-bold sm:col-span-2">
                <I n="xray" /> {image ? 'Image attached — change' : `Attach image (≤ ${MAX_IMAGE_KB} KB)`}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} />
              </label>
            </div>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-muted">{mode === 'report' ? 'Report text' : 'Note'}<textarea rows={4} className="rounded-xl border-[1.5px] border-line bg-cream-50 p-3 text-base text-ink" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
          <Pressable disabled={!ok || busy} onClick={() => void save()} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">{busy ? 'Saving…' : `Save to record as ${dept || 'department'}`}</Pressable>
        </section>
        <section className="flex min-w-0 flex-col gap-3 rounded-3xl bg-white p-5">
          <h2 className="m-0 text-xl font-extrabold">This patient's history <span className="text-base text-subtle">({items.length})</span></h2>
          <div ref={list} className="flex flex-col">
            {items.map((x, i) => (
              <div data-anim key={x.id} className={`flex gap-3 py-3 ${i ? 'border-t border-divider' : ''}`}>
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${x.icon === 'xray' ? 'bg-ink text-cream-50' : 'bg-cream-100 text-sage-800'}`}><I n={x.icon} size={22} /></span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <b className="truncate">{x.title}</b>
                  <span className="text-sm text-subtle">{x.sub} · {fmtDateTime(x.at)}</span>
                  {x.r?.values && <span className="text-sm">{x.r.values.map((v) => `${v.name} ${v.value} ${v.unit}`).join(' · ')}</span>}
                  {x.r?.image === 'placeholder' && <XrayPlaceholder className="h-24 w-20" />}
                  {x.r?.image?.startsWith('data:') && <img src={x.r.image} alt={x.title} className="max-h-32 self-start rounded-lg" />}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
