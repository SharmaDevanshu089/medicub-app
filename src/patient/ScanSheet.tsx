// Scan the QR on the doctor's desk → see whose it is → press and hold to share → access is pushed to that doctor.
// Camera decoding runs on the phone (jsQR); typing the code under the QR works when the camera can't.
import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { fmtTime } from '../lib/time'
import { lookupDoctorQr, now, scanDoctorQr, type ScannedDoctor } from '../store/store'
import { I } from './icons'
import { gsap, HoldButton, Pressable, reducedMotion, Sheet, useGSAP } from './motion'
import { initials } from './view'

const SOURCE: Record<string, string> = { DigiLocker: 'Identity verified', 'NMC registry': 'Registration matched', AskMyDoc: 'Cross-checked' }
type Step = 'camera' | 'checking' | 'confirm' | 'done'

export function ScanSheet({ initialCode, onClose }: { initialCode?: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>(initialCode ? 'checking' : 'camera')
  const [code, setCode] = useState(initialCode ?? '')
  const [typed, setTyped] = useState('')
  const [doctor, setDoctor] = useState<ScannedDoctor | null>(null)
  const [camErr, setCamErr] = useState('')
  const [err, setErr] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const root = useRef<HTMLDivElement>(null)

  const check = async (raw: string) => {
    setStep('checking')
    setErr('')
    try {
      const d = await lookupDoctorQr(raw)
      setCode(raw)
      setDoctor(d)
      navigator.vibrate?.(30)
      setStep('confirm')
    } catch (e) {
      setErr((e as Error).message)
      setStep('camera')
    }
  }
  useEffect(() => {
    if (initialCode) void check(initialCode)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Camera loop: decode a downscaled frame each animation frame until a QR turns up.
  useEffect(() => {
    if (step !== 'camera') return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const tick = () => {
      const v = video.current
      if (stopped || !v || !ctx) return
      if (v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 480 / v.videoWidth)
        canvas.width = Math.round(v.videoWidth * scale)
        canvas.height = Math.round(v.videoHeight * scale)
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        const hit = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })
        if (hit?.data) {
          stopped = true
          void check(hit.data)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => undefined)
        }
        raf = requestAnimationFrame(tick)
      })
      .catch((e: Error) => setCamErr(e.name === 'NotAllowedError' ? 'Camera permission was refused. Type the code shown under the QR instead.' : 'No camera available here. Type the code shown under the QR instead.'))
    if (!navigator.mediaDevices) setCamErr('No camera available here. Type the code shown under the QR instead.')
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  useGSAP(() => {
    if (reducedMotion()) return
    if (step === 'camera') gsap.fromTo('[data-scanline]', { y: 0 }, { y: 216, duration: 1.6, repeat: -1, yoyo: true, ease: 'sine.inOut' })
    else gsap.from('[data-anim]', { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.45 })
    if (step === 'done') gsap.from('[data-done]', { scale: 0, rotate: -45, duration: 0.6, ease: 'back.out(2.2)' })
  }, { scope: root, dependencies: [step] })

  return (
    <Sheet open label="Scan your doctor's QR" onClose={onClose}>
      {(close) => (
        <div ref={root} className="flex flex-col gap-4">
          {step === 'camera' && (
            <>
              <h1 className="m-0 text-center text-[26px] font-extrabold tracking-tight">Scan the QR on your doctor's desk</h1>
              <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-[28px] bg-ink">
                <video ref={video} playsInline muted className="size-full object-cover" aria-label="Camera preview" />
                <div className="pointer-events-none absolute inset-8 rounded-2xl border-4 border-white/80" aria-hidden="true">
                  <span data-scanline className="absolute top-0 right-2 left-2 h-0.5 rounded-full bg-brand-600 shadow-[0_0_12px_#CC3762]" />
                </div>
                {camErr && <div className="absolute inset-0 grid place-items-center bg-ink/90 p-6 text-center text-sm font-semibold text-white">{camErr}</div>}
              </div>
              {err && <p className="m-0 rounded-2xl bg-[#FCEFD3] p-3 text-center font-semibold text-[#5C3B00]" role="alert">{err}</p>}
              <div className="flex flex-col gap-2 rounded-2xl bg-white p-3">
                <label htmlFor="qr-code" className="text-sm font-semibold text-muted">Or type the code under the QR</label>
                <div className="flex gap-2">
                  <input id="qr-code" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && typed.length >= 6 && void check(typed)} autoCapitalize="characters" className="h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-line px-3 font-mono text-lg tracking-widest" placeholder="A1B2C3D4E5" />
                  <Pressable disabled={typed.length < 6} onClick={() => void check(typed)} className="h-12 rounded-xl bg-ink px-4 font-bold text-white">Go</Pressable>
                </div>
              </div>
              <Pressable onClick={() => close()} className="h-[52px] rounded-2xl border-[1.5px] border-line font-bold">Cancel</Pressable>
            </>
          )}
          {step === 'checking' && (
            <div className="flex flex-col items-center gap-3 py-10" role="status">
              <span className="size-10 animate-spin rounded-full border-4 border-sage-200 border-t-sage-700" />
              <b>Checking the code…</b>
            </div>
          )}
          {step === 'confirm' && doctor && (
            <>
              <span data-anim className="inline-flex items-center gap-1.5 self-start rounded-full bg-sage-100 px-3 py-1.5 text-sm font-bold text-sage-900"><I n="check" size={16} stroke={2.8} /> QR recognised</span>
              <div data-anim className="flex items-center gap-3.5">
                <div className="grid size-[60px] shrink-0 place-items-center rounded-full bg-brand-600 text-[22px] font-extrabold text-white">{initials(doctor.name)}</div>
                <div className="flex flex-col"><span className="text-[22px] font-extrabold">{doctor.name}</span><span className="text-[15px] text-muted">{doctor.specialty} · {doctor.clinic.split(',')[0]}</span></div>
              </div>
              <div data-anim className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3.5">
                {doctor.checks.filter((c) => c.status === 'pass').map((c) => <div key={c.source} className="flex items-center gap-2.5 text-[15px] text-sage-900"><I n="shield" size={20} stroke={2.2} /><b>{SOURCE[c.source] ?? c.source}</b></div>)}
              </div>
              <div data-anim className="flex flex-col gap-2">
                <h1 className="m-0 text-[22px] leading-tight font-extrabold">Let {doctor.name} see your full record?</h1>
                <p className="m-0 text-base leading-normal text-muted">Medicines, reports, X-rays, lab results and notes. Access ends at <b>{fmtTime(now() + 8 * 3_600_000)}</b>. You can stop it any time from Me.</p>
              </div>
              <div data-anim>
                <HoldButton onConfirm={() => { scanDoctorQr(code).then(() => setStep('done')).catch(() => setStep('camera')) }}><I n="fingerprint" /> Press and hold to share</HoldButton>
              </div>
              <Pressable data-anim onClick={() => close()} className="h-[52px] rounded-2xl border-[1.5px] border-line text-[17px] font-bold">Don't share</Pressable>
            </>
          )}
          {step === 'done' && doctor && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div data-done className="grid size-24 place-items-center rounded-full bg-sage-700 text-white"><I n="check" size={48} stroke={2.6} /></div>
              <h1 data-anim className="m-0 text-[26px] font-extrabold">Shared with {doctor.name}</h1>
              <p data-anim className="m-0 text-[17px] text-muted">They've been told you're here. Stop sharing any time in Me.</p>
              <Pressable data-anim onClick={() => close()} className="mt-2 h-14 w-full rounded-2xl bg-sage-700 text-lg font-bold text-white">Done</Pressable>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
