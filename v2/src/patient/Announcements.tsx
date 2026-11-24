// Shows presenter/clinic notifications as a banner on top of the app and posts them to the system tray.
// Also turns "dose due" into a system notification, so the phone buzzes even when another app is open.
import { useEffect, useRef } from 'react'
import { speak } from '../lib/device'
import { act } from '../store/store'
import { I } from './icons'
import { gsap, Pressable, reducedMotion, useGSAP } from './motion'
import { notifyOnce } from './notify'
import type { DoseRow } from './view'
import { dayKey } from '../lib/time'

export interface Announcement {
  id: string
  title: string
  body: string
  level?: 'info' | 'important'
  seenBy?: string[]
}

export function useSystemNotifications(items: Announcement[], due: DoseRow[], t: number) {
  const ids = items.map((a) => a.id).join()
  const dueKey = due.map((d) => d.r.id).join()
  useEffect(() => {
    for (const a of items) void notifyOnce(`ann:${a.id}`, a.title, a.body)
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    for (const d of due) void notifyOnce(`dose:${d.r.id}@${dayKey(t)}`, `Time for ${d.r.brand}`, `${d.r.instructions} · open Medicub to mark it taken`)
  }, [dueKey]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The newest unread notification, as a card that drops in from the top. */
export function AnnouncementBanner({ a, more }: { a: Announcement; more: number }) {
  const card = useRef<HTMLDivElement>(null)
  const important = a.level === 'important'
  useGSAP(() => {
    navigator.vibrate?.(important ? [40, 80, 40] : 20)
    if (reducedMotion()) return
    gsap.from(card.current, { y: -140, autoAlpha: 0, duration: 0.7, ease: 'back.out(1.4)' })
    if (important) gsap.fromTo(card.current, { boxShadow: '0 0 0 0 rgba(204,55,98,0.55)' }, { boxShadow: '0 0 0 16px rgba(204,55,98,0)', duration: 1.2, repeat: 2, delay: 0.5 })
  }, { dependencies: [a.id] })
  const ack = () => {
    const done = () => void act('patient.ackAnnouncement', { id: a.id }).catch(() => undefined)
    if (reducedMotion()) return done()
    gsap.to(card.current, { y: -40, autoAlpha: 0, duration: 0.3, ease: 'power2.in', onComplete: done })
  }
  return (
    <div className="pointer-events-none absolute top-0 right-0 left-0 z-40 p-3 pt-10">
      <div ref={card} role="alertdialog" aria-labelledby={`ann-${a.id}`} className={`pointer-events-auto flex flex-col gap-3 rounded-3xl p-4 shadow-2xl ${important ? 'bg-brand-600 text-white' : 'bg-ink text-white'}`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-white/20"><I n={important ? 'alert' : 'bell'} /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-bold tracking-wide uppercase opacity-80">{important ? 'Important' : 'Message'} from your clinic{more > 0 ? ` · ${more} more` : ''}</span>
            <b id={`ann-${a.id}`} className="text-lg leading-tight">{a.title}</b>
            <p className="m-0 text-[15px] leading-snug opacity-95">{a.body}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Pressable onClick={ack} className={`h-12 flex-1 rounded-2xl bg-white font-bold ${important ? 'text-brand-700' : 'text-ink'}`}>Got it</Pressable>
          <Pressable aria-label="Read aloud" onClick={() => speak(`${a.title}. ${a.body}`)} className="grid size-12 place-items-center rounded-2xl bg-white/20"><I n="speaker" /></Pressable>
        </div>
      </div>
    </div>
  )
}
