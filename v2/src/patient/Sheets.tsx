import { useRef, useState } from 'react'
import { fmtTime } from '../lib/time'
import { acceptDoctor, declineDoctor, doctorName, grantConsent, now } from '../store/store'
import type { Doctor, Patient } from '../store/types'
import { I } from './icons'
import { gsap, HoldButton, Pressable, reducedMotion, Sheet, useGSAP } from './motion'
import { initials } from './view'

const SOURCE_LABEL: Record<string, string> = { DigiLocker: 'Identity verified', 'NMC registry': 'Registration matched', AskMyDoc: 'Cross-checked' }

function Verified({ d }: { d: Doctor }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-3.5">
      {d.checks.filter((c) => c.status === 'pass').map((c) => (
        <div key={c.source} className="flex items-center gap-2.5 text-[15px] text-sage-900"><I n="shield" size={20} stroke={2.2} /><span><b>{SOURCE_LABEL[c.source] ?? c.source}</b> · {c.source === 'NMC registry' ? 'NMC' : c.source}</span></div>
      ))}
    </div>
  )
}

/**
 * Patient taps the doctor's desk tag. The tag only identifies the doctor; consent is a separate, held confirmation.
 * shortcut: the tap is simulated (Web NFC needs Android Chrome + real tags); wire NDEFReader when tags exist.
 */
export function NfcSheet({ doctor, me, onClose, onScanQr }: { doctor: Doctor | undefined; me: Patient; onClose: () => void; onScanQr: () => void }) {
  const [step, setStep] = useState<'scan' | 'confirm' | 'done'>('scan')
  const [until, setUntil] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (reducedMotion()) return
      if (step === 'scan') {
        gsap.fromTo('[data-ring]', { scale: 0.55, autoAlpha: 0.9 }, { scale: 1.35, autoAlpha: 0, duration: 1.8, stagger: { each: 0.6, repeat: -1 }, ease: 'sine.out' })
        gsap.to('[data-phone]', { y: -6, rotate: -4, repeat: -1, yoyo: true, duration: 1.1, ease: 'sine.inOut' })
      } else {
        gsap.from('[data-anim]', { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.45 })
        if (step === 'done') gsap.from('[data-done]', { scale: 0, rotate: -45, duration: 0.6, ease: 'back.out(2.2)' })
      }
    },
    { scope: root, dependencies: [step] },
  )

  const detect = () => {
    navigator.vibrate?.(30)
    if (reducedMotion()) return setStep('confirm')
    gsap.timeline({ onComplete: () => setStep('confirm') })
      .to('[data-ring]', { scale: 0, autoAlpha: 0, duration: 0.3, overwrite: true }, 0)
      .to('[data-phone]', { scale: 0.6, autoAlpha: 0, duration: 0.3, overwrite: true }, 0)
  }

  return (
    <Sheet open label="Share with doctor" onClose={onClose}>
      {(close) => (
        <div ref={root}>
          {!doctor ? (
            <p className="text-center text-lg">You're not at a Medicub clinic right now.</p>
          ) : step === 'scan' ? (
            <div className="flex flex-col items-center gap-5">
              <h1 className="m-0 text-center text-[26px] font-extrabold tracking-tight">Hold your phone near the tag</h1>
              <p className="m-0 text-center text-[17px] text-muted">The Medicub tag is on {doctor.name}'s desk.</p>
              <div className="relative grid size-[240px] place-items-center rounded-full bg-cream-100">
                {[0, 1, 2].map((i) => <span key={i} data-ring className="absolute size-[200px] rounded-full border-2 border-sage-400" />)}
                <svg data-phone width="84" height="128" viewBox="0 0 84 128" aria-hidden="true" className="relative"><rect x="4" y="4" width="76" height="120" rx="16" fill="#FFFFFF" stroke="#1F2015" strokeWidth="4" /><rect x="30" y="12" width="24" height="5" rx="2.5" fill="#1F2015" /><path d="M30 58a18 18 0 0 1 0 22M38 52a28 28 0 0 1 0 34M46 46a38 38 0 0 1 0 46" fill="none" stroke="#CC3762" strokeWidth="4" strokeLinecap="round" /></svg>
              </div>
              <div className="flex w-full gap-3 rounded-2xl bg-white px-4 py-3.5">
                <span className="mt-0.5 shrink-0 text-sage-800"><I n="lock" size={22} /></span>
                <p className="m-0 text-[15px] leading-normal text-muted">No health data passes through the tag. It only tells Medicub which doctor you're with. You'll confirm next.</p>
              </div>
              <Pressable onClick={detect} className="h-[54px] w-full rounded-2xl border-2 border-dashed border-brand-600 text-base font-bold text-brand-700">Demo: simulate tapping the tag</Pressable>
              <Pressable onClick={() => close(onScanQr)} className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold ring-[1.5px] ring-line"><I n="qr" size={20} /> No tag? Scan the doctor's QR</Pressable>
              <Pressable onClick={() => close()} className="h-[54px] w-full rounded-2xl text-[17px] font-bold text-muted">Cancel</Pressable>
            </div>
          ) : step === 'confirm' ? (
            <div className="flex flex-col gap-[18px]">
              <span data-anim className="inline-flex items-center gap-1.5 self-start rounded-full bg-sage-100 px-3 py-1.5 text-sm font-bold text-sage-900"><I n="check" size={16} stroke={2.8} /> Tag found</span>
              <div data-anim className="flex items-center gap-3.5">
                <div className="grid size-[60px] shrink-0 place-items-center rounded-full bg-brand-600 text-[22px] font-extrabold text-white">{initials(doctor.name)}</div>
                <div className="flex flex-col"><span className="text-[22px] font-extrabold">{doctor.name}</span><span className="text-[15px] text-muted">{doctor.specialty} · {doctor.clinic.name.split(',')[0]}</span></div>
              </div>
              <div data-anim><Verified d={doctor} /></div>
              <div data-anim className="flex flex-col gap-2">
                <h1 className="m-0 text-[22px] leading-tight font-extrabold">Let {doctor.name.replace(/^Dr\s+/, 'Dr ')} see your full record?</h1>
                <p className="m-0 text-base leading-normal text-muted">Medicines, reports, X-rays, lab results and notes. Access ends at <b>{fmtTime(now() + 8 * 3_600_000)}</b>. You can stop it any time from Me.</p>
              </div>
              <div data-anim>
                <HoldButton onConfirm={() => { grantConsent(me.id, doctor.id).then(() => { setUntil(now() + 8 * 3_600_000); setStep('done') }).catch(() => undefined) }}>
                  <I n="fingerprint" /> Press and hold to allow
                </HoldButton>
              </div>
              <Pressable data-anim onClick={() => close()} className="h-[52px] rounded-2xl border-[1.5px] border-line text-[17px] font-bold">Don't allow</Pressable>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div data-done className="grid size-24 place-items-center rounded-full bg-sage-700 text-white"><I n="check" size={48} stroke={2.6} /></div>
              <h1 data-anim className="m-0 text-[26px] font-extrabold">{doctor.name} can see your record</h1>
              <p data-anim className="m-0 text-[17px] text-muted">Until {fmtTime(until)}. Stop sharing any time in Me.</p>
              <Pressable data-anim onClick={() => close()} className="mt-2 h-14 w-full rounded-2xl bg-sage-700 text-lg font-bold text-white">Done</Pressable>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** Shown only at a verified doctor's clinic who isn't the patient's doctor yet. Accepting is always an explicit tap. */
export function GeofenceSheet({ doctor, me, onClose }: { doctor: Doctor; me: Patient; onClose: () => void }) {
  return (
    <Sheet open label="New doctor nearby" onClose={onClose}>
      {(close) => (
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-2 text-[15px] font-bold text-sage-800"><I n="pin" size={20} /> You're at {doctor.clinic.name.split(',')[0]}</div>
          <div className="flex items-center gap-3.5">
            <div className="grid size-[60px] shrink-0 place-items-center rounded-full bg-sage-400 text-[22px] font-extrabold">{initials(doctor.name)}</div>
            <div className="flex flex-col"><span className="text-[22px] font-extrabold">{doctor.name}</span><span className="text-[15px] text-muted">{doctor.specialty}</span></div>
          </div>
          <Verified d={doctor} />
          <h1 className="m-0 text-2xl leading-tight font-extrabold">Make {doctor.name} your doctor?</h1>
          <div className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-3.5 text-[15px] leading-snug">
            <div className="flex gap-2.5"><span className="mt-0.5 shrink-0 text-sage-800"><I n="folder" size={20} /></span><span>They'll see your <b>full history</b>: medicines, reports, X-rays and notes.</span></div>
            {me.currentDoctorId && <div className="flex gap-2.5"><span className="mt-0.5 shrink-0 text-sage-800"><I n="user" size={20} /></span><span>{doctorName(me.currentDoctorId)} stops being your main doctor. You can still share by tapping their tag.</span></div>}
          </div>
          <Pressable onClick={() => close(() => acceptDoctor(me.id, doctor.id))} className="h-[60px] rounded-[18px] bg-sage-700 text-lg font-bold text-white">Make {doctor.name.replace(/^Dr\s+/, 'Dr ')} my doctor</Pressable>
          <Pressable onClick={() => close(() => declineDoctor(me.id, doctor.id))} className="h-[52px] rounded-2xl border-[1.5px] border-line text-[17px] font-bold">Not now</Pressable>
          <p className="m-0 text-center text-[13px] text-subtle">We only suggest verified doctors, and only when you're at their clinic.</p>
        </div>
      )}
    </Sheet>
  )
}
