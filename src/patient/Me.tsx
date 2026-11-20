import { useRef, useState } from 'react'
import { fmtTime } from '../lib/time'
import { HOME } from '../store/seed'
import { doctorName, revokeConsent, setPhoneLocation } from '../store/store'
import type { State } from '../store/types'
import { I } from './icons'
import { collapse, gsap, Pressable, reducedMotion, useStaggerIn } from './motion'
import { initials, patientView } from './view'

export function Me({ s, v, onTapTag, onQr, onClock, onReplay }: { s: State; v: ReturnType<typeof patientView>; onTapTag: () => void; onQr: () => void; onClock: () => void; onReplay: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [stock, setStock] = useState(false)
  const stockBody = useRef<HTMLDivElement>(null)
  useStaggerIn(root, 'me')
  const me = v.me
  if (!me) return null
  const brands = [...new Set(s.meds.filter((m) => m.patientId === me.id).map((m) => m.brand))]
  const places = [HOME, ...s.doctors.filter((d) => d.verified).map((d) => ({ label: `Near ${d.clinic.name}`, lat: d.clinic.lat + 0.0004, lng: d.clinic.lng }))]

  const toggleStock = () => {
    if (!stock) {
      setStock(true)
      requestAnimationFrame(() => gsap.fromTo(stockBody.current, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: reducedMotion() ? 0 : 0.4 }))
    } else gsap.to(stockBody.current, { height: 0, autoAlpha: 0, duration: reducedMotion() ? 0 : 0.3, onComplete: () => setStock(false) })
  }

  return (
    <div ref={root} className="flex flex-col gap-[18px] px-5 pt-[60px] pb-6">
      <div data-anim className="flex items-center gap-3.5">
        <div className="grid size-14 place-items-center rounded-full bg-sage-400 text-xl font-extrabold">{initials(me.name)}</div>
        <div className="flex flex-col"><h1 className="m-0 text-[26px] font-extrabold tracking-tight">{me.name}</h1><span className="text-[15px] text-muted">{me.age} · Medicub ID {me.id.toUpperCase()}</span></div>
      </div>

      <section data-anim className="flex flex-col gap-2.5">
        <h2 className="m-0 text-lg font-bold">Who can see my record</h2>
        <div className="flex flex-col overflow-hidden rounded-[20px] bg-white">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="grid size-11 place-items-center rounded-full bg-brand-600 font-extrabold text-white">{v.currentDoctor ? initials(v.currentDoctor.name) : '—'}</div>
            <div className="flex flex-1 flex-col"><span className="font-bold">{v.currentDoctor?.name ?? 'No main doctor yet'}</span><span className="text-sm text-muted">Your main doctor · always</span></div>
          </div>
          {v.consents.map((c) => <ConsentRow key={c.id} id={c.id} name={doctorName(c.doctorId)} until={c.expiresAt} />)}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Pressable onClick={onTapTag} className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-sage-700 text-[15px] font-bold text-white"><I n="nfc" size={20} /> Tap a tag</Pressable>
          <Pressable onClick={onQr} className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-line bg-white text-[15px] font-bold"><I n="qr" size={20} /> Scan QR</Pressable>
        </div>
      </section>

      <section data-anim className="flex flex-col overflow-hidden rounded-[20px] bg-white">
        <div className="flex items-center gap-3 p-4"><span className="flex-1 font-semibold">Caregiver</span><span className="text-[15px] text-muted">{me.caregiver ?? 'None'}</span></div>
        <button onClick={toggleStock} aria-expanded={stock} className="flex w-full cursor-pointer items-center gap-3 border-t border-divider p-4 text-left" style={{ touchAction: 'manipulation' }}>
          <span className="text-sage-800"><I n="store" size={20} /></span>
          <span className="flex-1 font-semibold">Which pharmacy has my medicine</span>
          <span className={`text-subtle transition-transform duration-300 ${stock ? 'rotate-90' : ''}`}><I n="chevron" size={20} /></span>
        </button>
        {stock && (
          <div ref={stockBody} className="overflow-hidden">
            <div className="flex flex-col gap-2 px-4 pb-4">
              <span className="text-sm text-subtle">Demo Pharmacy, MG Road</span>
              {brands.map((b) => {
                const yes = s.stock.some((x) => x.name === b && x.qty > 0)
                return (
                  <div key={b} className="flex items-center justify-between rounded-xl bg-cream-100 px-3 py-2.5">
                    <span className="font-semibold">{b}</span>
                    <span className={`flex items-center gap-1 text-sm font-bold ${yes ? 'text-sage-800' : 'text-muted'}`}>{yes ? <><I n="check" size={16} stroke={2.8} /> In stock</> : 'Not in stock'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section data-anim className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-dashed border-line p-4">
        <span className="text-sm font-bold tracking-wide text-subtle uppercase">Demo controls</span>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">Location (simulated GPS)
          <select className="h-12 rounded-xl border-[1.5px] border-line bg-white px-3 text-base" value={s.phoneLocation.label} onChange={(e) => { const p = places.find((x) => x.label === e.target.value); if (p) setPhoneLocation(p) }}>
            {places.map((p) => <option key={p.label}>{p.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <Pressable onClick={onClock} className="h-12 rounded-xl bg-cream-100 text-[15px] font-bold">Demo clock</Pressable>
          <Pressable onClick={onReplay} className="h-12 rounded-xl bg-cream-100 text-[15px] font-bold">Replay setup</Pressable>
        </div>
        <p className="m-0 text-[13px] text-subtle">Synthetic data. Tip: long-press the screen title for the demo clock.</p>
      </section>
    </div>
  )
}

function ConsentRow({ id, name, until }: { id: string; name: string; until: number }) {
  const row = useRef<HTMLDivElement>(null)
  return (
    <div ref={row} className="flex items-center gap-3 border-t border-divider px-4 py-3.5">
      <div className="grid size-11 place-items-center rounded-full bg-sage-100 font-extrabold text-sage-900">{initials(name)}</div>
      <div className="flex flex-1 flex-col"><span className="font-bold">{name}</span><span className="text-sm text-muted">Shared · until {fmtTime(until)}</span></div>
      <Pressable onClick={() => collapse(row.current, () => revokeConsent(id))} className="h-11 rounded-xl border-[1.5px] border-brand-600 px-3.5 text-[15px] font-bold text-brand-700">Stop</Pressable>
    </div>
  )
}
