// Doctor onboarding wizard. Verification (DigiLocker → NMC → AskMyDoc, mock adapters) runs on the server;
// only a fully verified doctor gets an account.
import { useRef, useState } from 'react'
import { I } from '../patient/icons'
import { gsap, Pressable, reducedMotion, useGSAP } from '../patient/motion'
import { COUNCILS, type CheckResult } from '../services/verification'
import { CLINIC_PRESETS } from '../store/initial-state'
import { adoptToken, onboardDoctor } from '../store/store'

const APP = { fontFamily: 'var(--font-app)' }
const SPECIALTIES = ['General Medicine', 'Cardiology', 'Diabetology', 'Nephrology', 'Pulmonology', 'Orthopaedics', 'Paediatrics']
const field = 'h-14 rounded-2xl border-[1.5px] border-line bg-white px-4 text-lg text-ink'
const STEPS = ['Your details', 'Clinic', 'ID document', 'Verify'] as const
const LABEL: Record<string, string> = { DigiLocker: 'Identity (DigiLocker)', 'NMC registry': 'Registration (NMC)', AskMyDoc: 'Cross-check (AskMyDoc)' }

export default function Onboard() {
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ name: '', email: '', specialty: SPECIALTIES[0] ?? '', regNo: '', council: COUNCILS[0] ?? '', clinicName: CLINIC_PRESETS[0]?.name ?? '', lat: String(CLINIC_PRESETS[0]?.lat ?? ''), lng: String(CLINIC_PRESETS[0]?.lng ?? '') })
  const [idFile, setIdFile] = useState<{ fileName: string; sizeKb: number } | null>(null)
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [state, setState] = useState<'idle' | 'running' | 'passed' | 'failed' | 'error'>('idle')
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const prev = useRef(0)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setState('idle'); setChecks([]) }

  useGSAP(() => {
    const dir = step - prev.current
    prev.current = step
    if (!reducedMotion()) gsap.fromTo('[data-step]', { x: dir * 40, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.45 })
    gsap.to('[data-progress]', { scaleX: (step + 1) / STEPS.length, duration: reducedMotion() ? 0 : 0.5, ease: 'power3.out' })
  }, { scope: root, dependencies: [step] })
  useGSAP(() => {
    if (checks.length && !reducedMotion()) gsap.from('[data-check]', { x: -16, autoAlpha: 0, stagger: 0.35, duration: 0.45, ease: 'back.out(1.6)' })
  }, { scope: root, dependencies: [checks.length] })

  const lat = Number(f.lat)
  const lng = Number(f.lng)
  const valid = [
    f.name.trim().length >= 3 && /^\S+@\S+\.\S+$/.test(f.email.trim()) && f.regNo.trim().length >= 3,
    f.clinicName.trim().length >= 3 && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180,
    !!idFile,
    true,
  ]

  const fillDemo = () => {
    const c = CLINIC_PRESETS[0]
    setF({ name: 'Dr Kavya Nair', email: 'kavya@medicub.in', specialty: 'General Medicine', regNo: 'KMC-2015-55821', council: 'Karnataka Medical Council', clinicName: c?.name ?? '', lat: String(c?.lat ?? ''), lng: String(c?.lng ?? '') })
    setIdFile({ fileName: 'kavya-nair-credential.pdf', sizeKb: 212 })
    setChecks([])
    setState('idle')
  }

  const verify = async () => {
    setState('running')
    setErr('')
    setChecks([])
    try {
      const r = await onboardDoctor({ name: f.name.trim(), email: f.email.trim(), specialty: f.specialty, council: f.council, regNo: f.regNo.trim(), clinic: { name: f.clinicName.trim(), lat, lng }, idFileName: idFile?.fileName })
      setChecks(r.checks)
      if (r.verified && r.token && r.session && r.name) {
        setState('passed')
        adoptToken(r.token, r.session, r.name)
      } else setState('failed')
    } catch (e) {
      setErr((e as Error).message)
      setState('error')
    }
  }

  return (
    <div ref={root} className="min-h-screen bg-cream-50 text-ink" style={APP}>
      <header className="flex items-center gap-3 border-b border-cream-200 px-5 py-3">
        <a href="/doctor" className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white" aria-label="Back to sign-in"><I n="plus" size={22} stroke={2.4} /></a>
        <span className="text-xl font-extrabold">Join Medicub as a doctor</span>
        <Pressable onClick={fillDemo} className="ml-auto h-10 rounded-xl bg-cream-100 px-3 text-sm font-bold text-ink hover:bg-cream-200">Sample Credentials</Pressable>
      </header>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-cream-200"><div data-progress className="h-full origin-left rounded-full bg-sage-700" style={{ transform: 'scaleX(0.25)' }} /></div>
          <ol className="m-0 flex list-none justify-between p-0 text-sm font-bold">
            {STEPS.map((x, i) => <li key={x} className={i <= step ? 'text-ink' : 'text-subtle'} aria-current={i === step ? 'step' : undefined}>{i + 1}. {x}</li>)}
          </ol>
        </div>

        <section data-step className="flex flex-col gap-4 rounded-3xl bg-white p-6">
          {step === 0 && (
            <>
              <h1 className="m-0 text-[28px] font-extrabold">Your details</h1>
              <label className="flex flex-col gap-1.5 font-semibold text-muted">Full name (as on your ID)<input className={field} value={f.name} onChange={set('name')} autoComplete="name" /></label>
              <label className="flex flex-col gap-1.5 font-semibold text-muted">Work email<input className={field} value={f.email} onChange={set('email')} type="email" autoComplete="email" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 font-semibold text-muted">Specialty<select className={field} value={f.specialty} onChange={set('specialty')}>{SPECIALTIES.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label className="flex flex-col gap-1.5 font-semibold text-muted">Medical council<select className={field} value={f.council} onChange={set('council')}>{COUNCILS.map((x) => <option key={x}>{x}</option>)}</select></label>
              </div>
              <label className="flex flex-col gap-1.5 font-semibold text-muted">Registration number<input className={`${field} font-mono`} value={f.regNo} onChange={set('regNo')} placeholder="KMC-2015-55821" /></label>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="m-0 text-[28px] font-extrabold">Where you practise</h1>
              <p className="m-0 text-muted">Patients within 150 m of this point may be offered you as their doctor, and your desk's Medicub NFC tag is linked to it.</p>
              <div className="flex flex-wrap gap-2">{CLINIC_PRESETS.map((c) => <Pressable key={c.name} onClick={() => setF({ ...f, clinicName: c.name, lat: String(c.lat), lng: String(c.lng) })} aria-pressed={f.clinicName === c.name} className={`h-10 rounded-full px-4 text-sm font-bold ${f.clinicName === c.name ? 'bg-ink text-white' : 'ring-[1.5px] ring-line'}`}>{c.name}</Pressable>)}</div>
              <label className="flex flex-col gap-1.5 font-semibold text-muted">Clinic name<input className={field} value={f.clinicName} onChange={set('clinicName')} /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 font-semibold text-muted">Latitude<input className={field} value={f.lat} onChange={set('lat')} inputMode="decimal" /></label>
                <label className="flex flex-col gap-1.5 font-semibold text-muted">Longitude<input className={field} value={f.lng} onChange={set('lng')} inputMode="decimal" /></label>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="m-0 text-[28px] font-extrabold">Government ID</h1>
              <p className="m-0 text-muted">Used for the DigiLocker identity check. In this prototype only the file name is kept.</p>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 text-center">
                <I n="doc" size={32} />
                <b>{idFile ? idFile.fileName : 'Choose a PDF or photo'}</b>
                <span className="text-sm text-muted">{idFile ? `${idFile.sizeKb} KB · tap to change` : 'Aadhaar, PAN, passport or driving licence'}</span>
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { const x = e.target.files?.[0]; setIdFile(x ? { fileName: x.name, sizeKb: Math.round(x.size / 1024) } : null); setState('idle') }} />
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="m-0 text-[28px] font-extrabold">Verify</h1>
              <p className="m-0 text-muted">Three checks run on our server. All must pass. <span className="rounded bg-[#FCEFD3] px-1.5 text-sm font-bold text-[#5C3B00]">mock adapters in this demo</span></p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {checks.map((c) => (
                  <li data-check key={c.source} className={`flex items-start gap-3 rounded-2xl p-4 ${c.status === 'pass' ? 'bg-sage-50 text-sage-900' : 'bg-red-50 text-red-900'}`}>
                    <I n={c.status === 'pass' ? 'check' : 'block'} stroke={2.6} />
                    <span><b>{LABEL[c.source] ?? c.source}: {c.status === 'pass' ? 'passed' : 'failed'}</b><span className="block text-sm">{c.detail}</span></span>
                  </li>
                ))}
              </ul>
              {state === 'running' && <p className="m-0 flex items-center gap-3 font-bold" role="status"><span className="size-6 animate-spin rounded-full border-4 border-sage-200 border-t-sage-700" />Checking with DigiLocker, NMC and AskMyDoc…</p>}
              {state === 'failed' && <p className="m-0 rounded-2xl bg-red-50 p-4 font-semibold text-red-900" role="alert">Verification failed, so no account was created. Go back, correct the details, and verify again.</p>}
              {state === 'error' && <p className="m-0 rounded-2xl bg-red-50 p-4 font-semibold text-red-900" role="alert">{err}</p>}
              {state === 'passed' ? (
                <a href="/doctor" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-sage-700 text-lg font-bold text-white"><I n="check" stroke={2.6} /> Verified — open my dashboard</a>
              ) : (
                <Pressable disabled={state === 'running' || !valid.slice(0, 3).every(Boolean)} onClick={() => void verify()} className="h-14 rounded-2xl bg-sage-700 text-lg font-bold text-white">{state === 'running' ? 'Verifying…' : 'Verify and create account'}</Pressable>
              )}
            </>
          )}
        </section>

        <div className="flex justify-between">
          <Pressable disabled={step === 0 || state === 'running'} onClick={() => setStep(step - 1)} className="h-12 rounded-2xl px-5 font-bold ring-[1.5px] ring-line">Back</Pressable>
          {step < 3 && <Pressable disabled={!valid[step]} onClick={() => setStep(step + 1)} className="h-12 rounded-2xl bg-ink px-6 font-bold text-white">Next</Pressable>}
        </div>
        <p className="m-0 text-center text-sm text-subtle">Already verified? <a href="/doctor" className="font-bold text-brand-700">Sign in</a></p>
      </div>
    </div>
  )
}
