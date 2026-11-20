// "Check my medicine": photo of a strip → text read on the phone (tesseract, loaded only when needed) → the server
// compares it with the patient's own medicines. It never says "take it" — only whether it matches the list.
import { useRef, useState } from 'react'
import type { StripResult } from '../engine/care'
import { act } from '../store/store'
import { I } from './icons'
import { gsap, Pressable, reducedMotion, Sheet, useGSAP } from './motion'

type Step = 'pick' | 'reading' | 'result'

async function readText(file: File, onProgress: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { logger: (m) => m.status === 'recognizing text' && onProgress(m.progress) })
  try {
    const { data } = await worker.recognize(file)
    return data.text
  } finally {
    void worker.terminate()
  }
}

const LOOK = {
  match: { tone: 'bg-sage-100 text-sage-900', icon: 'check', title: (r: StripResult) => `Yes — this is your ${r.mine}`, body: 'It matches a medicine on your list.' },
  'same-medicine': { tone: 'bg-sage-50 text-sage-900', icon: 'check', title: (r: StripResult) => `Same medicine as your ${r.mine}`, body: 'Different brand name, same ingredients and strength. If you weren\'t expecting a different brand, ask your pharmacist.' },
  'not-on-list': { tone: 'bg-[#FCEFD3] text-[#5C3B00]', icon: 'alert', title: () => 'This is not on your medicine list', body: 'Ask your doctor or pharmacist before taking it.' },
  unreadable: { tone: 'bg-cream-100 text-ink', icon: 'camera', title: () => "Couldn't read the strip", body: 'Try again in good light with the name or barcode filling the frame, or type the name below.' },
} as const

export function StripSheet({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('pick')
  const [progress, setProgress] = useState(0)
  const [typed, setTyped] = useState('')
  const [res, setRes] = useState<StripResult | null>(null)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (reducedMotion()) return
    gsap.from('[data-anim]', { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.45 })
    if (step === 'result') gsap.from('[data-badge]', { scale: 0, rotate: -30, duration: 0.55, ease: 'back.out(2)' })
  }, { scope: root, dependencies: [step] })

  const check = async (text: string) => {
    setErr('')
    try {
      // Empty OCR text still goes through as a single space-free marker so the server records an unreadable check.
      setRes(await act<StripResult>('patient.stripCheck', { text: text.trim() || '?' }))
      navigator.vibrate?.(30)
      setStep('result')
    } catch (e) {
      setErr((e as Error).message)
      setStep('pick')
    }
  }
  const onPhoto = async (f: File | undefined) => {
    if (!f) return
    setStep('reading')
    setProgress(0)
    try {
      await check(await readText(f, setProgress))
    } catch {
      setErr("The text reader couldn't load (it needs internet the first time). Type the name instead.")
      setStep('pick')
    }
  }

  return (
    <Sheet open label="Check my medicine" onClose={onClose}>
      {(close) => (
        <div ref={root} className="flex flex-col gap-4">
          {step === 'pick' && (
            <>
              <h1 data-anim className="m-0 text-center text-[26px] font-extrabold tracking-tight">Is this the right medicine?</h1>
              <p data-anim className="m-0 text-center text-muted">Take a photo of the strip — the side with the name or barcode. We'll compare it with your list.</p>
              <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = '' }} />
              <Pressable data-anim onClick={() => input.current?.click()} className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-sage-700 text-lg font-bold text-white"><I n="camera" size={24} /> Take a photo</Pressable>
              {err && <p className="m-0 rounded-2xl bg-[#FCEFD3] p-3 text-center font-semibold text-[#5C3B00]" role="alert">{err}</p>}
              <div data-anim className="flex flex-col gap-2 rounded-2xl bg-white p-3">
                <label htmlFor="strip-text" className="text-sm font-semibold text-muted">Or type what's printed on it</label>
                <div className="flex gap-2">
                  <input id="strip-text" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && typed.trim().length >= 3 && void check(typed)} className="h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-line px-3 text-lg" placeholder="e.g. Telma-AM" />
                  <Pressable disabled={typed.trim().length < 3} onClick={() => void check(typed)} className="h-12 rounded-xl bg-ink px-4 font-bold text-white">Check</Pressable>
                </div>
              </div>
              <Pressable data-anim onClick={() => close()} className="h-[52px] rounded-2xl border-[1.5px] border-line font-bold">Close</Pressable>
            </>
          )}
          {step === 'reading' && (
            <div className="flex flex-col items-center gap-3 py-10" role="status">
              <span className="size-10 animate-spin rounded-full border-4 border-sage-200 border-t-sage-700" />
              <b>Reading the strip… {Math.round(progress * 100)}%</b>
              <span className="text-sm text-muted">The photo stays on your phone; only the words read are checked.</span>
            </div>
          )}
          {step === 'result' && res && (() => {
            const L = LOOK[res.verdict]
            return (
              <>
                <div className={`flex flex-col items-center gap-3 rounded-3xl p-6 text-center ${L.tone}`}>
                  <span data-badge className="grid size-16 place-items-center rounded-full bg-white/70"><I n={L.icon} size={32} stroke={2.4} /></span>
                  <h1 data-anim className="m-0 text-[24px] leading-tight font-extrabold">{L.title(res)}</h1>
                  <p data-anim className="m-0 text-base">{L.body}</p>
                </div>
                {res.product && <p data-anim className="m-0 rounded-2xl bg-white p-3 text-sm text-muted">Read as <b className="text-ink">{res.product.brand}</b> · {res.product.ingredients.map((i) => `${i.name} ${i.mg} mg`).join(' + ')}{res.by ? ` · matched by ${res.by}` : ''}</p>}
                <p data-anim className="m-0 text-xs text-subtle">Decision support, not a decision. Reading a strip can be wrong — if in doubt, ask your pharmacist.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Pressable data-anim onClick={() => { setRes(null); setTyped(''); setStep('pick') }} className="h-14 rounded-2xl border-[1.5px] border-line font-bold">Check another</Pressable>
                  <Pressable data-anim onClick={() => close()} className="h-14 rounded-2xl bg-sage-700 font-bold text-white">Done</Pressable>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </Sheet>
  )
}
