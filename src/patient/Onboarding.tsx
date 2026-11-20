import { useRef, useState } from 'react'
import { I, type IconName } from './icons'
import { gsap, Pressable, reducedMotion, useGSAP } from './motion'
import { askNotifyPermission } from './notify'

const PROMISES: { icon: IconName; bold: string; rest: string }[] = [
  { icon: 'clock', bold: 'Gentle reminders', rest: ' on your phone and watch.' },
  { icon: 'lock', bold: 'You decide', rest: ' which doctor sees your record, and for how long.' },
  { icon: 'shield', bold: 'Nothing changes', rest: ' about your medicines without your doctor.' },
]

export function Onboarding({ firstName, onDone }: { firstName: string; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(firstName)
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (reducedMotion()) return
      const tl = gsap.timeline()
      tl.from('[data-step]', { x: step === 0 ? 0 : 60, autoAlpha: 0, duration: 0.5 })
        .from('[data-anim]', { y: 20, autoAlpha: 0, stagger: 0.07, duration: 0.5, clearProps: 'all' }, '<0.05')
      if (step === 1) tl.from('[data-notif]', { y: -40, scale: 0.92, autoAlpha: 0, duration: 0.7, ease: 'back.out(1.6)' }, 0.25)
    },
    { scope: root, dependencies: [step] },
  )

  const allow = async () => {
    await askNotifyPermission() // Android notification permission, or the browser's; reminders still show in-app if refused
    onDone()
  }

  return (
    <div ref={root} className="h-full overflow-hidden">
      {step === 0 ? (
        <div data-step key="s0" className="flex h-full flex-col gap-7 px-6 pt-[72px] pb-8">
          <div data-anim className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-[14px] bg-brand-600 text-white"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></div>
            <span className="text-2xl font-extrabold tracking-tight">Medicub</span>
          </div>
          <div data-anim className="flex flex-col gap-3">
            <h1 className="m-0 text-[34px] leading-[1.15] font-extrabold tracking-tight">Your medicines and records, in one calm place.</h1>
            <p className="m-0 text-lg text-muted">Set up takes about a minute.</p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {PROMISES.map((p) => (
              <li data-anim key={p.bold} className="flex items-start gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage-100 text-sage-800"><I n={p.icon} size={22} /></span>
                <p className="m-0 text-[17px] leading-snug"><b>{p.bold}</b>{p.rest}</p>
              </li>
            ))}
          </ul>
          <div data-anim className="mt-auto flex flex-col gap-2">
            <label htmlFor="ob-name" className="text-[15px] font-semibold text-muted">What should we call you?</label>
            <input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} className="h-14 rounded-[14px] border-[1.5px] border-line bg-white px-4 text-lg" />
          </div>
          <Pressable data-anim className="h-[58px] rounded-2xl bg-sage-700 text-lg font-bold text-white" disabled={!name.trim()} onClick={() => setStep(1)}>Continue</Pressable>
          <p className="m-0 text-center text-[13px] text-subtle">Demo · synthetic data</p>
        </div>
      ) : (
        <div data-step key="s1" className="flex h-full flex-col gap-7 px-6 pt-16 pb-8">
          <div data-anim className="flex items-center justify-between">
            <div className="flex gap-1.5" aria-label="Step 2 of 2">
              <span className="h-1.5 w-6 rounded-full bg-sage-400" />
              <span className="h-1.5 w-6 rounded-full bg-sage-700" />
            </div>
            <Pressable className="rounded-lg px-2 py-1 text-sm font-semibold text-subtle" onClick={() => setStep(0)}>Back</Pressable>
          </div>
          <div className="grid h-[240px] place-items-center rounded-[28px] bg-cream-100 p-6">
            <div data-notif className="flex w-full items-start gap-3 rounded-[18px] bg-white p-4 shadow-[0_10px_30px_rgba(60,50,20,0.12)]">
              <div className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-brand-600 text-white"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-subtle">Medicub · now</span>
                <span className="font-bold">Time for Amlong 5</span>
                <span className="text-[15px] text-muted">1 tablet · morning dose</span>
              </div>
            </div>
          </div>
          <div data-anim className="flex flex-col gap-3">
            <h1 className="m-0 text-[30px] leading-tight font-extrabold tracking-tight">{name.trim() ? `${name.trim()}, can we` : 'Can we'} remind you when it's time?</h1>
            <p className="m-0 text-lg leading-normal text-muted">One quiet reminder per dose. You can mark it taken from the notification or your watch.</p>
          </div>
          <div data-anim className="mt-auto flex flex-col gap-3">
            <Pressable className="h-[58px] rounded-2xl bg-sage-700 text-lg font-bold text-white" onClick={allow}>Allow reminders</Pressable>
            <Pressable className="h-[52px] rounded-2xl text-[17px] font-semibold text-sage-800" onClick={onDone}>Not now</Pressable>
          </div>
          <p data-anim className="m-0 text-center text-[13px] text-subtle">Location and NFC are asked later, only when you first need them.</p>
        </div>
      )}
    </div>
  )
}
