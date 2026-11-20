// Stage show: a keyboard-driven, animated walkthrough of Medicub for the pitch.
// Enter / → / Space / PageDown = next step · Backspace / ← / PageUp = back · Home / End · F = full screen.
// Self-contained: no server calls, so it works offline once loaded. Stage is 1920×1080, scaled to fit.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { gsap, reducedMotion, useGSAP } from '../patient/motion'

if (import.meta.env.DEV) (window as unknown as { gsap: typeof gsap }).gsap = gsap // lets a test drive time while the tab is hidden
const W = 1920
const H = 1080
const FONT = { fontFamily: 'var(--font-app)' }

type Pos = { x: number; y: number; s: number; o?: number }
type LapMode = 'home' | 'qr' | 'flag' | 'adherence' | 'inbox'
type PhoneMode = 'lock' | 'scan' | 'reminder' | 'caregiver' | 'strip'
type TabMode = 'counter' | 'blocked' | 'generic'
interface Step {
  id: string
  kicker: string
  title: string
  sub?: string
  center?: boolean
  lap: Pos & { m: LapMode }
  phone: Pos & { m: PhoneMode }
  tab: Pos & { m: TabMode }
}

const OFF = { y: 1420, s: 0.8, o: 0 }
const ROW = { lap: { x: 960, y: 800, s: 0.42, m: 'home' as const }, phone: { x: 600, y: 810, s: 0.5, m: 'lock' as const }, tab: { x: 1340, y: 810, s: 0.42, m: 'counter' as const } }
const SPREAD = { lap: { x: 1010, y: 330, s: 0.6, m: 'home' as const }, phone: { x: 1650, y: 570, s: 0.78, m: 'lock' as const }, tab: { x: 1030, y: 800, s: 0.6, m: 'counter' as const } }
const HUB = { x: 1375, y: 560 }

const STEPS: Step[] = [
  { id: 'intro', center: true, kicker: 'CATALYST · Problem Statement 4', title: 'One patient.\nOne medication record.', sub: 'Medicub: safer, connected care from doctor to patient to pharmacy.', ...ROW },
  { id: 'problem', kicker: 'The problem', title: 'Many clinicians.\nOne patient.\nNo single list.', sub: 'Records go fragmented and out of date: duplicate therapy, dosing errors, interactions, confusion.', ...SPREAD },
  { id: 'hub', kicker: 'Our answer', title: 'One shared medication record.', sub: 'Doctors, patient and pharmacy read and write the same list: brand and generic, strength, dose, timing.', ...SPREAD },
  { id: 'scenario', kicker: 'The defining scenario', title: 'Two specialists.\nOne hidden duplicate.', sub: 'Ramesh, 62, has diabetes and hypertension. A new prescription repeats amlodipine under another brand name.', lap: { x: 1250, ...OFF, m: 'home' }, phone: { x: 1500, ...OFF, m: 'lock' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'share', kicker: '1 · Consent', title: 'The patient shares by scanning the desk QR.', sub: 'No data moves. The scan grants time-limited access he can stop any time.', lap: { x: 1060, y: 540, s: 0.88, m: 'qr' }, phone: { x: 1640, y: 560, s: 1.05, m: 'scan' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'flag', kicker: '2 · Doctor', title: "Risky prescriptions can't be signed until a doctor decides.", sub: 'Ranked by severity, explained, and the prescriber is asked: is this combination intentional?', lap: { x: 1250, y: 545, s: 1.18, m: 'flag' }, phone: { x: 1700, ...OFF, m: 'scan' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'adherence', kicker: '3 · Context', title: 'Is it the medicine, or the missed doses?', sub: '14 days of doses beside the wearable BP estimate. Context, not a diagnosis.', lap: { x: 1250, y: 545, s: 1.18, m: 'adherence' }, phone: { x: 1700, ...OFF, m: 'reminder' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'reminder', kicker: '4 · Patient', title: 'Reminders on the phone and the watch.', sub: 'Plain words, always: "Ask your doctor or pharmacist before your next dose."', lap: { x: 1250, ...OFF, m: 'adherence' }, phone: { x: 1240, y: 560, s: 1.3, m: 'reminder' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'ladder', kicker: '5 · Caregivers', title: 'Nobody misses a dose silently.', sub: 'Family see doses only, never records. The patient can pause anyone.', lap: { x: 1250, ...OFF, m: 'inbox' }, phone: { x: 1640, y: 560, s: 1.1, m: 'caregiver' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'pharmacy', kicker: '6 · Pharmacy', title: 'Wrong pack? Blocked, and sent to the prescriber.', sub: 'The pharmacy never decides. It keeps working offline too.', lap: { x: 1650, y: 210, s: 0.36, m: 'inbox' }, phone: { x: 1640, ...OFF, m: 'caregiver' }, tab: { x: 1150, y: 600, s: 1.2, m: 'blocked' } },
  { id: 'generic', kicker: '7 · Savings', title: 'Same medicine, a third of the price.', sub: 'Jan Aushadhi generic, offered only with the patient\'s agreement. Demo prices.', lap: { x: 1650, ...OFF, m: 'inbox' }, phone: { x: 1640, ...OFF, m: 'strip' }, tab: { x: 1230, y: 560, s: 1.3, m: 'generic' } },
  { id: 'strip', kicker: '8 · Patient check', title: 'Is this the right strip?', sub: 'A photo, read on the phone, compared with his medicine list.', lap: { x: 1650, ...OFF, m: 'home' }, phone: { x: 1240, y: 560, s: 1.3, m: 'strip' }, tab: { x: 1200, ...OFF, m: 'generic' } },
  { id: 'audit', kicker: '9 · Trust', title: 'Every action, in a tamper-evident chain.', sub: 'SHA-256 hash chain. Change one entry and the chain breaks.', lap: { x: 1250, ...OFF, m: 'home' }, phone: { x: 1500, ...OFF, m: 'strip' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'fit', kicker: 'Problem Statement 4', title: 'Every requirement, covered.', sub: 'All seven asks, all three innovation levers, and the safety guardrail.', lap: { x: 1250, ...OFF, m: 'home' }, phone: { x: 1500, ...OFF, m: 'lock' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'roadmap', kicker: "What's next", title: 'Built today.\nNext, with funding.', sub: 'Honest about what is simulated in this prototype.', lap: { x: 1250, ...OFF, m: 'home' }, phone: { x: 1500, ...OFF, m: 'lock' }, tab: { x: 1200, ...OFF, m: 'counter' } },
  { id: 'end', center: true, kicker: 'Thank you', title: 'Medicub', sub: 'Try it live · medicub.vercel.app', ...ROW },
]

const K = (k: string) => `[data-k="${k}"]`
type El = (k: string) => Element | null

function typeText(tl: gsap.core.Timeline, node: Element | null, text: string, at: number, dur = 1) {
  if (!node) return
  const o = { n: 0 }
  tl.to(o, { n: text.length, duration: dur, ease: 'none', onUpdate: () => { node.textContent = text.slice(0, Math.round(o.n)) } }, at)
}
function countTo(tl: gsap.core.Timeline, node: Element | null, from: number, to: number, at: number, dur: number, fmt: (v: number) => string) {
  if (!node) return
  const o = { v: from }
  node.textContent = fmt(from)
  tl.to(o, { v: to, duration: dur, ease: 'power2.out', onUpdate: () => { node.textContent = fmt(o.v) } }, at)
}
const press = (tl: gsap.core.Timeline, sel: string, at: number) => tl.to(sel, { scale: 0.94, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' }, at)
const shake = (tl: gsap.core.Timeline, sel: string, at: number) => tl.fromTo(sel, { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1.4, 0.25)' }, at)

// Per-step animation. Elements are found by data-k inside the stage.
const PLAY: Record<string, (tl: gsap.core.Timeline, el: El) => void> = {
  intro: (tl) => {
    tl.from(K('logo'), { scale: 0, rotate: -90, duration: 0.9, ease: 'back.out(1.8)' }, 0.1)
  },
  problem: (tl) => {
    tl.from(K('dev-label'), { y: 20, autoAlpha: 0, stagger: 0.12, duration: 0.6 }, 0.9)
      .from(K('broken'), { strokeDashoffset: 400, autoAlpha: 0, stagger: 0.15, duration: 0.8 }, 1.2)
      .from(K('cross'), { scale: 0, stagger: 0.15, duration: 0.5, ease: 'back.out(2.5)' }, 1.7)
  },
  hub: (tl) => {
    tl.from(K('hub-line'), { strokeDashoffset: 700, stagger: 0.12, duration: 0.9, ease: 'power2.inOut' }, 0.6)
      .from(K('hub'), { scale: 0, duration: 0.8, ease: 'back.out(2)' }, 0.8)
      .from(K('hub-ring'), { scale: 0.6, autoAlpha: 0.9, duration: 1.6, repeat: -1, ease: 'power1.out' }, 1.4)
    tl.to(K('packet'), { strokeDashoffset: -60, duration: 1.4, repeat: -1, ease: 'none' }, 1.5)
  },
  scenario: (tl) => {
    tl.from(K('rx-card'), { y: 50, autoAlpha: 0, stagger: 0.2, duration: 0.8, ease: 'expo.out' }, 0.4)
      .from(K('dup-mark'), { backgroundColor: 'rgba(204,55,98,0)', color: '#1f2015', stagger: 0.25, duration: 0.5 }, 1.6)
      .from(K('dup-link'), { scaleX: 0, transformOrigin: 'left center', duration: 0.6, ease: 'power2.inOut' }, 2.1)
      .from(K('dup-badge'), { scale: 0, rotate: -10, duration: 0.6, ease: 'back.out(2.2)' }, 2.6)
      .from(K('dup-quote'), { y: 20, autoAlpha: 0, duration: 0.6 }, 3.4)
  },
  fit: (tl) => {
    tl.from(K('fit-col'), { y: 40, autoAlpha: 0, stagger: 0.15, duration: 0.7, ease: 'expo.out' }, 0.3)
      .from(K('fit-row'), { x: -18, autoAlpha: 0, stagger: 0.07, duration: 0.4 }, 0.6)
      .from(K('fit-tick'), { scale: 0, stagger: 0.07, duration: 0.35, ease: 'back.out(3)' }, 0.7)
  },
  share: (tl) => {
    tl.fromTo(K('scanline'), { y: 0 }, { y: 180, duration: 0.7, yoyo: true, repeat: 2, ease: 'sine.inOut' }, 0.6)
      .from(K('qr-glow'), { autoAlpha: 0, scale: 0.9, duration: 0.6, repeat: 2, yoyo: true }, 0.6)
      .from(K('sheet'), { yPercent: 100, duration: 0.7, ease: 'expo.out' }, 2.4)
      .from(K('hold-fill'), { scaleX: 0, transformOrigin: 'left center', duration: 1.1, ease: 'none' }, 3.3)
      .from(K('done'), { autoAlpha: 0, duration: 0.3 }, 4.4)
      .from(K('done-check'), { scale: 0, rotate: -45, duration: 0.6, ease: 'back.out(2.4)' }, 4.45)
      .from(K('arrived'), { x: 80, autoAlpha: 0, duration: 0.7, ease: 'expo.out' }, 4.8)
  },
  flag: (tl, el) => {
    typeText(tl, el('rx-input'), 'Telma-AM 40/5', 0.7, 0.9)
    tl.from(K('flag'), { x: 60, autoAlpha: 0, duration: 0.7, ease: 'expo.out' }, 1.8)
      .fromTo(K('flag'), { boxShadow: '0 0 0 0 rgba(204,55,98,0.45)' }, { boxShadow: '0 0 0 16px rgba(204,55,98,0)', duration: 1, repeat: 1 }, 2.2)
    press(tl, K('sign'), 3)
    shake(tl, K('sign'), 3.25)
    tl.from(K('blocked'), { autoAlpha: 0, y: -6, duration: 0.4 }, 3.25)
      .from(K('decide'), { autoAlpha: 0, y: 14, duration: 0.5 }, 4)
      .to(K('chip'), { backgroundColor: '#5e6438', color: '#ffffff', duration: 0.25 }, 4.6)
    typeText(tl, el('reason'), 'Switching to the combination; Amlong stopped', 4.9, 1.3)
    tl.to(K('flag-status'), { autoAlpha: 1, duration: 0.3 }, 6.3)
      .to(K('blocked'), { autoAlpha: 0, duration: 0.3 }, 6.4)
    press(tl, K('sign'), 6.6)
    tl.to(K('sign'), { backgroundColor: '#5e6438', duration: 0.3 }, 6.8)
      .call(() => { const n = el('sign-label'); if (n) n.textContent = 'Signed' }, [], 6.8)
      .from(K('stamp'), { scale: 2.2, autoAlpha: 0, rotate: -18, duration: 0.6, ease: 'back.out(1.6)' }, 7)
  },
  adherence: (tl, el) => {
    tl.from(K('cell'), { scale: 0, duration: 0.35, ease: 'back.out(2)', stagger: { each: 0.012, grid: [3, 14], axis: 'x', from: 'start' } }, 0.6)
      .from(K('band'), { autoAlpha: 0, duration: 0.5, stagger: 0.06 }, 1.3)
      .from(K('bpline'), { strokeDashoffset: 1200, duration: 1.4, ease: 'power2.inOut' }, 1.4)
      .from(K('bpdot'), { scale: 0, transformOrigin: 'center', duration: 0.3, stagger: 0.07, ease: 'back.out(3)' }, 1.6)
      .from(K('stat'), { y: 20, autoAlpha: 0, stagger: 0.12, duration: 0.6 }, 2.6)
    countTo(tl, el('pct'), 0, 78, 2.7, 1.2, (v) => `${Math.round(v)}%`)
    countTo(tl, el('miss'), 120, 143, 2.9, 1.2, (v) => `${Math.round(v)}`)
    countTo(tl, el('full'), 120, 130, 3.0, 1.2, (v) => `${Math.round(v)}`)
    tl.from(K('compare'), { autoAlpha: 0, y: 10, duration: 0.6 }, 3.6)
  },
  reminder: (tl) => {
    tl.from(K('watch'), { x: 120, autoAlpha: 0, duration: 0.9, ease: 'expo.out' }, 0.5)
      .from(K('notif'), { y: -140, duration: 0.7, ease: 'back.out(1.4)' }, 1.2)
      .fromTo(K('watch'), { rotate: -4 }, { rotate: 4, duration: 0.07, repeat: 9, yoyo: true, ease: 'none', clearProps: 'rotate' }, 1.3)
      .from(K('w-alert'), { scale: 0.6, autoAlpha: 0, duration: 0.4, ease: 'back.out(2)' }, 1.3)
      .to(K('notif'), { y: -140, duration: 0.5, ease: 'power2.in' }, 2.8)
    press(tl, K('take'), 3.2)
    tl.fromTo(K('ripple'), { scale: 0, autoAlpha: 0.6 }, { scale: 9, autoAlpha: 0, duration: 0.7 }, 3.3)
      .from(K('took'), { autoAlpha: 0, duration: 0.35 }, 3.5)
      .from(K('took-check'), { scale: 0, rotate: -40, duration: 0.6, ease: 'back.out(2.4)' }, 3.55)
      .to(K('w-alert'), { autoAlpha: 0, duration: 0.3 }, 3.6)
      .from(K('w-took'), { scale: 0.5, autoAlpha: 0, duration: 0.5, ease: 'back.out(2)' }, 3.7)
  },
  ladder: (tl) => {
    tl.from(K('ladder-line'), { scaleY: 0, transformOrigin: 'top center', duration: 1.8, ease: 'none' }, 0.6)
      .from(K('node'), { scale: 0, autoAlpha: 0, stagger: 0.55, duration: 0.45, ease: 'back.out(2.4)' }, 0.6)
      .from(K('node-label'), { x: -20, autoAlpha: 0, stagger: 0.55, duration: 0.5 }, 0.7)
      .from(K('cg-card'), { scale: 0.85, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.6)' }, 1.9)
      .fromTo(K('node-hot'), { boxShadow: '0 0 0 0 rgba(204,55,98,0.6)' }, { boxShadow: '0 0 0 18px rgba(204,55,98,0)', duration: 1, repeat: 1 }, 1.9)
    press(tl, K('cg-btn'), 3.6)
    tl.from(K('cg-ok'), { autoAlpha: 0, y: 10, duration: 0.4 }, 3.85)
      .to(K('cg-card'), { borderColor: '#5e6438', duration: 0.3 }, 3.85)
      .to(K('node-last'), { autoAlpha: 0.35, duration: 0.4 }, 4.1)
      .from(K('stopped'), { autoAlpha: 0, x: -10, duration: 0.4 }, 4.2)
  },
  pharmacy: (tl) => {
    tl.fromTo(K('bscan'), { x: 0 }, { x: 230, duration: 0.6, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.7)
      .from(K('verdict'), { scale: 0.85, autoAlpha: 0, duration: 0.5, ease: 'back.out(1.8)' }, 2)
    shake(tl, K('verdict'), 2.3)
    press(tl, K('send'), 3.2)
    tl.fromTo(K('beam'), { x: 1150, y: 830, autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.15 }, 3.4)
      .to(K('beam'), { x: 1650, duration: 0.9, ease: 'power1.inOut' }, 3.5)
      .to(K('beam'), { y: 215, duration: 0.9, ease: 'power3.out' }, 3.5)
      .to(K('beam'), { scale: 0, autoAlpha: 0, duration: 0.25 }, 4.35)
      .from(K('sent'), { autoAlpha: 0, y: 8, duration: 0.4 }, 3.6)
      .from(K('inbox-item'), { x: 40, autoAlpha: 0, duration: 0.5, ease: 'expo.out' }, 4.4)
      .from(K('inbox-badge'), { scale: 0, duration: 0.5, ease: 'back.out(3)' }, 4.4)
  },
  generic: (tl, el) => {
    tl.from(K('gcard'), { y: 30, autoAlpha: 0, duration: 0.7, ease: 'expo.out' }, 0.6)
    countTo(tl, el('price'), 30, 10, 1.3, 1.3, (v) => `₹${Math.round(v)}`)
    tl.from(K('save'), { scale: 0, rotate: -20, duration: 0.6, ease: 'back.out(2.4)' }, 2.6)
      .from(K('equiv'), { autoAlpha: 0, duration: 0.4 }, 2.8)
      .from(K('tick'), { scale: 0, duration: 0.4, ease: 'back.out(3)' }, 3.4)
      .to(K('agree'), { backgroundColor: '#5e6438', borderColor: '#5e6438', duration: 0.2 }, 3.4)
    press(tl, K('attest'), 4)
    tl.to(K('attest'), { backgroundColor: '#5e6438', duration: 0.3 }, 4.2)
      .call(() => { const n = el('attest-label'); if (n) n.textContent = 'Dispensed · ₹20 saved per strip' }, [], 4.2)
  },
  strip: (tl, el) => {
    tl.from(K('foil'), { y: 60, rotate: -10, autoAlpha: 0, duration: 0.9, ease: 'expo.out' }, 0.5)
      .fromTo(K('sscan'), { y: 0 }, { y: 210, duration: 0.7, yoyo: true, repeat: 2, ease: 'sine.inOut' }, 1.1)
    countTo(tl, el('reading'), 0, 100, 1.1, 2, (v) => `Reading the strip… ${Math.round(v)}%`)
    tl.from(K('sresult'), { yPercent: 110, duration: 0.7, ease: 'expo.out' }, 3.3)
  },
  audit: (tl, el) => {
    tl.from(K('blk'), { y: 50, autoAlpha: 0, stagger: 0.12, duration: 0.6, ease: 'expo.out' }, 0.5)
      .from(K('lnk'), { scaleX: 0, transformOrigin: 'left center', stagger: 0.12, duration: 0.3 }, 1)
      .from(K('chain-ok'), { autoAlpha: 0, y: 10, duration: 0.4 }, 1.9)
    shake(tl, K('blk-4'), 3)
    tl.call(() => {
      const a = el('blk-4-text'); if (a) a.textContent = 'RX-9999 signed'
      const h = el('blk-4-hash'); if (h) h.textContent = 'hash ≠ next'
    }, [], 3)
      .to([K('blk-4'), K('blk-5'), K('blk-6')], { borderColor: '#cc3762', backgroundColor: '#fbeaef', duration: 0.3, stagger: 0.15 }, 3.2)
      .to(K('lnk-bad'), { backgroundColor: '#cc3762', duration: 0.3, stagger: 0.15 }, 3.2)
      .to(K('chain-ok'), { autoAlpha: 0, duration: 0.2 }, 3.4)
      .from(K('chain-bad'), { autoAlpha: 0, y: 10, duration: 0.4 }, 3.5)
  },
  roadmap: (tl) => {
    tl.from(K('rm-col'), { y: 40, autoAlpha: 0, stagger: 0.2, duration: 0.7, ease: 'expo.out' }, 0.4)
      .from(K('rm-item'), { x: -16, autoAlpha: 0, stagger: 0.06, duration: 0.4 }, 0.8)
  },
  end: (tl) => {
    tl.from(K('logo'), { scale: 0, rotate: -90, duration: 0.9, ease: 'back.out(1.8)' }, 0.1)
  },
}

export default function Show() {
  const [i, setI] = useState(() => Math.min(STEPS.length - 1, Math.max(0, Number(location.hash.slice(1)) - 1 || 0)))
  const [hint, setHint] = useState(true)
  const dir = useRef(1)
  const root = useRef<HTMLDivElement>(null)
  const lap = useRef<HTMLDivElement>(null)
  const phone = useRef<HTMLDivElement>(null)
  const tab = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  const [k, setK] = useState(1)
  const step = STEPS[i]!

  // Fit the 1920×1080 stage to any screen.
  useEffect(() => {
    const fit = () => setK(Math.min(innerWidth / W, innerHeight / H))
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    const go = (d: number) => { dir.current = d; setI((x) => Math.min(STEPS.length - 1, Math.max(0, x + d))) }
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const next = ['Enter', 'ArrowRight', ' ', 'PageDown'].includes(e.key)
      const back = ['Backspace', 'ArrowLeft', 'PageUp'].includes(e.key)
      if (next || back || e.key === 'Home' || e.key === 'End' || e.key.toLowerCase() === 'f') { e.preventDefault(); setHint(false) }
      if (next) go(1)
      else if (back) go(-1)
      else if (e.key === 'Home') { dir.current = -1; setI(0) }
      else if (e.key === 'End') { dir.current = 1; setI(STEPS.length - 1) }
      else if (e.key.toLowerCase() === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { history.replaceState(null, '', `#${i + 1}`) }, [i])

  // Devices glide between layouts; these tweens persist across steps.
  useGSAP(() => {
    const quick = first.current || reducedMotion()
    first.current = false
    ;([[lap, step.lap], [phone, step.phone], [tab, step.tab]] as const).forEach(([r, p]) => {
      gsap.to(r.current, { x: p.x, y: p.y, scale: p.s, autoAlpha: p.o ?? 1, xPercent: -50, yPercent: -50, duration: quick ? 0 : 1.15, ease: 'expo.inOut', overwrite: 'auto' })
    })
  }, { dependencies: [i] })

  // Step content: caption + scene timeline. Reverted and rebuilt on every step change.
  useGSAP(() => {
    const tl = gsap.timeline()
    tl.from(K('cap-line'), { y: 46, autoAlpha: 0, filter: 'blur(8px)', stagger: 0.09, duration: 0.9, ease: 'expo.out' }, 0.15)
    const el: El = (key) => root.current?.querySelector(K(key)) ?? null
    PLAY[step.id]?.(tl, el)
    if (reducedMotion()) tl.progress(1)
    else if (dir.current < 0) tl.timeScale(2.6) // going back replays fast, like rewinding
  }, { scope: root, dependencies: [i], revertOnUpdate: true })

  // Slow drifting background.
  useGSAP(() => {
    if (reducedMotion()) return
    gsap.to(K('blob-a'), { x: 160, y: 90, duration: 14, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    gsap.to(K('blob-b'), { x: -140, y: -70, duration: 17, yoyo: true, repeat: -1, ease: 'sine.inOut' })
  }, { scope: root })

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1f2015]" style={FONT}>
      <div ref={root} className="absolute top-1/2 left-1/2 overflow-hidden bg-cream-50 text-ink" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${k})` }}>
        <div data-k="blob-a" className="pointer-events-none absolute will-change-transform -top-40 -left-40 size-[760px] rounded-full bg-sage-200/60 blur-[120px]" />
        <div data-k="blob-b" className="pointer-events-none absolute will-change-transform -right-40 -bottom-60 size-[820px] rounded-full bg-brand-50 blur-[120px]" />

        {/* overlays drawn behind the devices */}
        {step.id === 'problem' && <Broken />}
        {step.id === 'hub' && <HubLines />}

        <div ref={lap} className="absolute top-0 left-0 will-change-transform"><Laptop><LapScreen m={step.lap.m} /></Laptop></div>
        <div ref={tab} className="absolute top-0 left-0 will-change-transform"><Tablet><TabScreen m={step.tab.m} /></Tablet></div>
        <div ref={phone} className="absolute top-0 left-0 will-change-transform"><Phone><PhoneScreen m={step.phone.m} /></Phone></div>

        {/* overlays drawn in front */}
        {step.id === 'problem' && <DeviceLabels />}
        {step.id === 'hub' && <HubOrb />}
        {step.id === 'reminder' && <Watch />}
        {step.id === 'ladder' && <Ladder />}
        {step.id === 'pharmacy' && <div data-k="beam" className="absolute top-0 left-0 -mt-4 -ml-4 size-8 rounded-full bg-brand-600 shadow-[0_0_30px_10px_rgba(204,55,98,0.45)]" />}
        {step.id === 'scenario' && <Scenario />}
        {step.id === 'fit' && <Fit />}
        {step.id === 'audit' && <Chain />}
        {step.id === 'roadmap' && <Roadmap />}

        <Caption key={step.id} step={step} />

        <footer className="absolute right-[120px] bottom-[44px] left-[120px] flex items-center gap-8 text-[18px] text-subtle">
          <span className="w-[420px]">Decision support, not a decision · Synthetic data</span>
          <div className="flex flex-1 gap-2">
            {STEPS.map((s, n) => <span key={s.id} className={`h-[5px] flex-1 rounded-full transition-colors duration-500 ${n <= i ? 'bg-sage-700' : 'bg-cream-200'}`} />)}
          </div>
          <span className="w-[420px] text-right font-semibold tabular-nums">
            {hint ? <span className="text-muted">Enter → next · Backspace ← back · F full screen</span> : `${String(i + 1).padStart(2, '0')} / ${STEPS.length}`}
          </span>
        </footer>
      </div>
    </div>
  )
}

function Caption({ step }: { step: Step }) {
  const lines = step.title.split('\n')
  if (step.center)
    return (
      <div className="absolute top-[150px] right-0 left-0 flex flex-col items-center gap-6 text-center">
        <span data-k="cap-line" className="flex items-center gap-4">
          <span data-k="logo" className="grid size-[72px] place-items-center rounded-[22px] bg-brand-600 text-[44px] font-extrabold text-white">+</span>
          <span className="text-[30px] font-extrabold tracking-[0.18em] text-brand-600 uppercase">{step.kicker}</span>
        </span>
        <h1 className="m-0 text-[92px] leading-[1.02] font-extrabold tracking-tight">{lines.map((l) => <span key={l} data-k="cap-line" className="block">{l}</span>)}</h1>
        {step.sub && <p data-k="cap-line" className="m-0 text-[34px] text-muted">{step.sub}</p>}
      </div>
    )
  return (
    <div className="absolute top-0 left-[120px] flex h-full w-[540px] flex-col justify-center gap-7 pb-10">
      <span data-k="cap-line" className="text-[22px] font-extrabold tracking-[0.2em] text-brand-600 uppercase">{step.kicker}</span>
      <h1 className="m-0 text-[60px] leading-[1.05] font-extrabold tracking-tight">{lines.map((l) => <span key={l} data-k="cap-line" className="block">{l}</span>)}</h1>
      {step.sub && <p data-k="cap-line" className="m-0 text-[27px] leading-snug text-muted">{step.sub}</p>}
    </div>
  )
}

// ---------- device frames ----------
const SHADOW = 'shadow-[0_50px_100px_-30px_rgba(57,61,33,0.45)]'
function Laptop({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: 884 }}>
      <div className={`rounded-[24px] bg-[#1d1e17] p-3 ${SHADOW}`}><div className="relative h-[538px] w-[860px] overflow-hidden rounded-[12px] bg-cream-50">{children}</div></div>
      <div className="h-[24px] rounded-b-[20px] bg-gradient-to-b from-[#cfc6b0] to-[#a79f88]" style={{ width: 1000, marginLeft: -58 }} />
    </div>
  )
}
function Phone({ children }: { children: ReactNode }) {
  return (
    <div className={`rounded-[52px] bg-[#1d1e17] p-[10px] ${SHADOW}`}>
      <div className="relative h-[630px] w-[300px] overflow-hidden rounded-[42px] bg-cream-50">
        {children}
        <div className="absolute top-2 left-1/2 z-30 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#1d1e17]" />
      </div>
    </div>
  )
}
function Tablet({ children }: { children: ReactNode }) {
  return <div className={`rounded-[34px] bg-[#1d1e17] p-[14px] ${SHADOW}`}><div className="relative h-[460px] w-[680px] overflow-hidden rounded-[20px] bg-cream-50">{children}</div></div>
}
function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  const r = useRef<HTMLDivElement>(null)
  useGSAP(() => { if (!reducedMotion()) gsap.from(r.current, { autoAlpha: 0, duration: 0.5, delay: 0.3 }) }, { scope: r })
  return <div ref={r} className={`absolute inset-0 ${className}`}>{children}</div>
}
const Check = ({ size = 24, stroke = 3 }: { size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
const Pill = ({ c = '#cc3762' }: { c?: string }) => (
  <svg width="34" height="34" viewBox="0 0 40 40"><rect x="6" y="14" width="28" height="12" rx="6" fill={c} /><rect x="20" y="14" width="14" height="12" rx="6" fill="#fff" opacity=".55" /></svg>
)

function Qr({ size }: { size: number }) {
  const n = 21
  const cells = useMemo(() => {
    let seed = 7
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    return Array.from({ length: n * n }, (_, idx) => {
      const x = idx % n
      const y = Math.floor(idx / n)
      const inFinder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
      if (!inFinder) return rnd() > 0.52
      const fx = x < 7 ? x : x - (n - 7)
      const fy = y < 7 ? y : y - (n - 7)
      return fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
    })
  }, [])
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges">
      {cells.map((on, idx) => on && <rect key={idx} x={idx % n} y={Math.floor(idx / n)} width={1} height={1} fill="#1f2015" />)}
    </svg>
  )
}

// ---------- laptop (clinic) ----------
function ClinicBar({ right }: { right?: string }) {
  return (
    <div className="flex h-[46px] items-center gap-3 border-b border-cream-200 bg-white/70 px-5 text-[14px]">
      <span className="grid size-7 place-items-center rounded-lg bg-brand-600 font-extrabold text-white">+</span>
      <b>Medicub Clinic</b>
      <span className="ml-auto text-subtle">{right ?? 'Dr Meera Iyer · Cardiology'}</span>
    </div>
  )
}
function LapScreen({ m }: { m: LapMode }) {
  if (m === 'qr')
    return (
      <Screen key={m}>
        <ClinicBar />
        <div className="grid grid-cols-[1fr_1fr] gap-6 p-7">
          <div className="relative flex flex-col items-center gap-3 rounded-[24px] bg-white p-6">
            <div data-k="qr-glow" className="absolute inset-3 rounded-[20px] ring-4 ring-sage-400" />
            <span className="text-[15px] font-bold text-subtle">Scan with the Medicub app</span>
            <Qr size={230} />
            <span className="font-mono text-[18px] tracking-[0.3em]">K7Q2M9X4TA</span>
            <span className="text-[13px] text-subtle">New code every 4 minutes</span>
          </div>
          <div className="flex flex-col gap-3">
            <b className="text-[18px]">Today</b>
            <div className="rounded-2xl bg-white p-4 text-[14px] text-subtle">Waiting for patients to share…</div>
            <div data-k="arrived" className="flex items-center gap-3 rounded-2xl bg-sage-100 p-4 text-sage-900">
              <span className="grid size-10 place-items-center rounded-full bg-sage-400 font-extrabold text-ink">RK</span>
              <div className="flex flex-col text-[14px]"><b className="text-[16px]">Ramesh Kumar is here</b>Shared via QR · access until 4:31 pm</div>
            </div>
          </div>
        </div>
      </Screen>
    )
  if (m === 'flag')
    return (
      <Screen key={m}>
        <ClinicBar right="Ramesh Kumar, 62 · Prescribe" />
        <div className="grid grid-cols-[250px_1fr] gap-5 p-5 text-[14px]">
          <div className="flex flex-col gap-2">
            <b className="text-[15px] text-subtle">Current medicines</b>
            {[['Amlong 5', 'amlodipine 5 mg · Dr Meera'], ['Glycomet 500', 'metformin 500 mg · Dr Arjun']].map(([b, d]) => (
              <div key={b} className="flex items-center gap-2 rounded-xl bg-white p-3"><Pill c="#a2a971" /><div className="flex flex-col"><b>{b}</b><span className="text-[12px] text-subtle">{d}</span></div></div>
            ))}
          </div>
          <div className="relative flex flex-col gap-3">
            <b className="text-[15px] text-subtle">New prescription</b>
            <div className="flex h-[46px] items-center rounded-xl border-[1.5px] border-line bg-white px-4 text-[17px] font-semibold"><span data-k="rx-input" /><span className="ml-0.5 h-5 w-[2px] animate-pulse bg-ink" /></div>
            <div data-k="flag" className="flex flex-col gap-1.5 rounded-2xl border-2 border-brand-600 bg-white p-4">
              <div className="flex items-center gap-2"><span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[12px] font-extrabold text-white">HIGH</span><b className="text-[15px]">Duplicate therapy: amlodipine</b></div>
              <span className="text-[13px] text-muted">Telma-AM 40/5 contains amlodipine 5 mg. Ramesh already takes Amlong 5 (amlodipine 5 mg).</span>
              <span data-k="flag-status" className="text-[13px] font-bold text-sage-800 opacity-0">Decided by Dr Meera Iyer · reason recorded</span>
            </div>
            <div data-k="decide" className="flex flex-col gap-2">
              <div className="flex gap-2">
                <span data-k="chip" className="rounded-full border-[1.5px] border-sage-700 px-3 py-1 font-semibold">Intentional</span>
                <span className="rounded-full border-[1.5px] border-line px-3 py-1 text-subtle">Change prescription</span>
                <span className="rounded-full border-[1.5px] border-line px-3 py-1 text-subtle">Not relevant</span>
              </div>
              <div className="flex h-[40px] items-center rounded-xl border-[1.5px] border-line bg-white px-3 text-[14px]"><span data-k="reason" /></div>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span data-k="sign" className="rounded-xl bg-ink px-5 py-3 text-[15px] font-bold text-white"><span data-k="sign-label">Sign prescription</span></span>
              <span data-k="blocked" className="font-bold text-brand-700">Signing blocked: 1 HIGH flag needs a decision</span>
            </div>
            <div data-k="stamp" className="absolute right-2 bottom-0 rotate-[-8deg] rounded-2xl border-4 border-sage-700 px-5 py-2 text-[22px] font-extrabold text-sage-700">SIGNED · RX-1005</div>
          </div>
        </div>
      </Screen>
    )
  if (m === 'adherence') {
    const MISSED: Record<number, number[]> = { 0: [3, 4, 10], 1: [4], 2: [2, 9, 10] }
    const SYS = [131, 129, 133, 147, 144, 130, 132, 128, 131, 141, 143, 140, 130, 129] // oldest → today
    const missedDay = SYS.map((_, c) => [0, 1, 2].some((r) => MISSED[r]!.includes(13 - c)))
    const x = (c: number) => 20 + c * 40
    const y = (v: number) => 110 - ((v - 122) / 30) * 90
    return (
      <Screen key={m}>
        <ClinicBar right="Ramesh Kumar, 62 · Adherence & vitals" />
        <div className="flex flex-col gap-3 px-6 pt-4">
          <div className="grid grid-cols-[110px_1fr] gap-y-1.5">
            {['Amlong 5', 'Glycomet am', 'Glycomet pm'].map((label, r) => (
              <div key={label} className="contents">
                <span className="text-[12px] font-semibold">{label}</span>
                <div className="grid grid-cols-[repeat(14,1fr)] gap-1">
                  {SYS.map((_, c) => {
                    const ago = 13 - c
                    const miss = MISSED[r]!.includes(ago)
                    const pend = ago === 0 && r === 2
                    return <span key={c} data-k="cell" className={`h-[18px] rounded-[5px] ${pend ? 'bg-white ring-1 ring-line' : miss ? 'bg-[#E8B04A]' : 'bg-sage-700'}`} />
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[110px_1fr]">
            <span className="text-[12px] font-semibold">BP estimate<br /><span className="text-subtle">systolic</span></span>
            <svg viewBox="0 0 560 120" className="w-full">
              {missedDay.map((md, c) => md && <rect key={c} data-k="band" x={x(c) - 18} y={0} width={36} height={120} rx={6} fill="#FCEFD3" />)}
              <line x1={0} x2={560} y1={y(140)} y2={y(140)} stroke="#D6CDB8" strokeDasharray="4 4" />
              <polyline data-k="bpline" points={SYS.map((v, c) => `${x(c)},${y(v)}`).join(' ')} fill="none" stroke="#CC3762" strokeWidth={3} strokeDasharray={1200} strokeLinecap="round" strokeLinejoin="round" />
              {SYS.map((v, c) => <circle key={c} data-k="bpdot" cx={x(c)} cy={y(v)} r={4.5} fill="#fff" stroke="#CC3762" strokeWidth={2.5} />)}
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div data-k="stat" className="rounded-2xl bg-white p-3"><div data-k="pct" className="text-[38px] leading-none font-black text-[#7A4E00]">78%</div><span className="text-[12px] text-subtle">doses taken, 14 days</span></div>
            <div data-k="stat" className="rounded-2xl bg-[#FCEFD3] p-3"><div data-k="miss" className="text-[38px] leading-none font-black">143</div><span className="text-[12px] text-subtle">avg BP, days with a missed dose</span></div>
            <div data-k="stat" className="rounded-2xl bg-sage-100 p-3"><div data-k="full" className="text-[38px] leading-none font-black">130</div><span className="text-[12px] text-subtle">avg BP, days with every dose</span></div>
          </div>
          <span data-k="compare" className="text-[13px] text-muted">Wearable estimates. Context for the doctor, not a diagnosis.</span>
        </div>
      </Screen>
    )
  }
  if (m === 'inbox')
    return (
      <Screen key={m}>
        <ClinicBar />
        <div className="flex flex-col gap-4 p-7">
          <div className="flex items-center gap-3"><b className="text-[30px]">Inbox</b><span data-k="inbox-badge" className="grid size-10 place-items-center rounded-full bg-brand-600 text-[20px] font-extrabold text-white">1</span></div>
          <div data-k="inbox-item" className="flex flex-col gap-1 rounded-2xl border-2 border-brand-600 bg-white p-5 text-[20px]">
            <b>Pharmacy: wrong pack for RX-1005</b>
            <span className="text-muted">Telma 40 scanned for Telma-AM 40/5. Needs your decision.</span>
          </div>
        </div>
      </Screen>
    )
  return (
    <Screen key={m} className="grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <span className="grid size-24 place-items-center rounded-[28px] bg-brand-600 text-[60px] font-extrabold text-white">+</span>
        <b className="text-[34px]">Medicub Clinic</b>
        <span className="text-[18px] text-subtle">Doctors and departments</span>
      </div>
    </Screen>
  )
}

// ---------- phone (patient / caregiver) ----------
const StatusBar = ({ dark = false }: { dark?: boolean }) => (
  <div className={`relative z-20 flex h-[40px] items-end justify-between px-7 pb-1 text-[13px] font-bold ${dark ? 'text-white' : ''}`}><span>8:31</span><span>●●● 5G</span></div>
)
function PhoneScreen({ m }: { m: PhoneMode }) {
  if (m === 'scan')
    return (
      <Screen key={m} className="bg-[#16170f]">
        <StatusBar dark />
        <div className="absolute top-[70px] left-1/2 size-[210px] -translate-x-1/2">
          <div className="absolute inset-0 grid place-items-center rounded-2xl bg-white/90"><Qr size={160} /></div>
          {[0, 1, 2, 3].map((c) => <span key={c} className="absolute size-9 border-white" style={{ [c < 2 ? 'top' : 'bottom']: -8, [c % 2 ? 'right' : 'left']: -8, borderTopWidth: c < 2 ? 5 : 0, borderBottomWidth: c >= 2 ? 5 : 0, borderLeftWidth: c % 2 ? 0 : 5, borderRightWidth: c % 2 ? 5 : 0, borderRadius: 10 }} />)}
          <span data-k="scanline" className="absolute top-3 right-3 left-3 h-[3px] rounded-full bg-brand-600 shadow-[0_0_14px_#CC3762]" />
        </div>
        <div data-k="sheet" className="absolute right-0 bottom-0 left-0 flex flex-col gap-3 rounded-t-[30px] bg-cream-50 p-5">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-sage-100 px-3 py-1 text-[12px] font-bold text-sage-900"><Check size={14} /> QR recognised</span>
          <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-brand-600 text-[18px] font-extrabold text-white">MI</span><div className="flex flex-col"><b className="text-[18px]">Dr Meera Iyer</b><span className="text-[13px] text-subtle">Cardiology · Heart Care Clinic</span></div></div>
          <div className="flex flex-col gap-1 rounded-2xl bg-white p-3 text-[13px] font-semibold text-sage-900"><span>✓ Identity verified (DigiLocker)</span><span>✓ Registration matched (NMC)</span></div>
          <div className="relative h-[52px] overflow-hidden rounded-2xl bg-sage-200">
            <div data-k="hold-fill" className="absolute inset-0 bg-sage-700" />
            <span className="relative grid h-full place-items-center font-bold text-white">Press and hold to share</span>
          </div>
          <div data-k="done" className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-t-[30px] bg-cream-50 text-center">
            <span data-k="done-check" className="grid size-20 place-items-center rounded-full bg-sage-700 text-white"><Check size={40} /></span>
            <b className="text-[20px]">Shared with Dr Meera Iyer</b>
            <span className="text-[13px] text-subtle">Access ends 4:31 pm · stop any time</span>
          </div>
        </div>
      </Screen>
    )
  if (m === 'reminder')
    return (
      <Screen key={m}>
        <StatusBar />
        <div data-k="notif" className="absolute top-[44px] right-3 left-3 z-20 flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-xl">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-600 font-extrabold text-white">+</span>
          <div className="flex flex-col text-[13px]"><b>Medicub · now</b>Time for Glycomet 500 · morning dose</div>
        </div>
        <div className="flex flex-col gap-4 px-5 pt-6">
          <span className="text-[13px] text-subtle">Friday, 20 November</span>
          <b className="text-[26px] leading-tight">Good morning, Ramesh</b>
          <div className="relative flex flex-col gap-3 overflow-hidden rounded-3xl border-2 border-brand-600 bg-white p-4">
            <span className="self-start rounded-full bg-brand-600 px-3 py-1 text-[12px] font-bold text-white">Due now · 8:30 am</span>
            <div className="flex items-center gap-3"><Pill /><div className="flex flex-col"><b className="text-[22px]">Glycomet 500</b><span className="text-[13px] text-subtle">Morning dose · Dr Arjun Rao</span></div></div>
            <div data-k="take" className="relative grid h-[52px] place-items-center overflow-hidden rounded-2xl bg-sage-700 text-[17px] font-bold text-white">
              <span data-k="ripple" className="absolute size-10 rounded-full bg-white opacity-0" />
              <span className="relative">I've taken it</span>
            </div>
            <span className="text-[12px] text-subtle">Unsure? Ask your doctor or pharmacist before your next dose.</span>
            <div data-k="took" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white">
              <span data-k="took-check" className="grid size-16 place-items-center rounded-full bg-sage-700 text-white"><Check size={34} /></span>
              <b className="text-[18px]">Taken at 8:31 am</b>
            </div>
          </div>
        </div>
      </Screen>
    )
  if (m === 'caregiver')
    return (
      <Screen key={m}>
        <StatusBar />
        <div className="flex flex-col gap-3 px-5 pt-4">
          <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-[13px] font-extrabold text-white">♥</span><b>Medicub Care</b></div>
          <span className="text-[13px] text-subtle">Signed in as Sunita · Daughter</span>
          <b className="text-[20px] leading-tight">Looking after Ramesh Kumar, 62</b>
          <div data-k="cg-card" className="flex flex-col gap-2.5 rounded-3xl border-2 border-brand-600 bg-white p-4">
            <b className="text-[17px] leading-tight">Ramesh hasn't marked Glycomet 500</b>
            <span className="text-[12px] text-subtle">Due 8:30 am · 31 min ago</span>
            <div className="flex flex-col gap-1 text-[12px]"><span>✓ Phone and watch · 8:30</span><span>✓ Second reminder · 8:45</span><span>✓ Sunita (daughter) · 9:00</span></div>
            <span className="grid h-[42px] place-items-center rounded-2xl bg-ink font-bold text-white">Call Ramesh</span>
            <span data-k="cg-btn" className="grid h-[42px] place-items-center rounded-2xl bg-sage-700 font-bold text-white">He's taken it</span>
            <span data-k="cg-ok" className="flex items-center gap-1.5 font-bold text-sage-800"><Check size={18} /> Taken · confirmed by Sunita</span>
          </div>
          <span className="text-[11px] text-subtle">You see doses only, never medical records.</span>
        </div>
      </Screen>
    )
  if (m === 'strip')
    return (
      <Screen key={m} className="bg-[#16170f]">
        <StatusBar dark />
        <div className="absolute top-[70px] left-1/2 h-[230px] w-[250px] -translate-x-1/2">
          <div data-k="foil" className="absolute inset-4 rounded-2xl bg-gradient-to-br from-[#e8e8e8] via-[#bdbdbd] to-[#efefef] p-3 shadow-lg">
            <span className="block text-center text-[15px] font-black tracking-[0.25em] text-[#3a3a3a]">TELMA 40</span>
            <div className="mt-2 grid grid-cols-5 gap-2">{Array.from({ length: 10 }, (_, n) => <span key={n} className="h-[44px] rounded-full bg-white/80 shadow-inner" />)}</div>
          </div>
          {[0, 1, 2, 3].map((c) => <span key={c} className="absolute size-8 border-white" style={{ [c < 2 ? 'top' : 'bottom']: 0, [c % 2 ? 'right' : 'left']: 0, borderTopWidth: c < 2 ? 4 : 0, borderBottomWidth: c >= 2 ? 4 : 0, borderLeftWidth: c % 2 ? 0 : 4, borderRightWidth: c % 2 ? 4 : 0, borderRadius: 8 }} />)}
          <span data-k="sscan" className="absolute top-2 right-2 left-2 h-[3px] rounded-full bg-brand-600 shadow-[0_0_14px_#CC3762]" />
        </div>
        <span data-k="reading" className="absolute top-[318px] right-0 left-0 text-center text-[14px] font-semibold text-white/80">Reading the strip… 0%</span>
        <div data-k="sresult" className="absolute right-0 bottom-0 left-0 flex flex-col gap-3 rounded-t-[30px] bg-[#FCEFD3] p-6 text-[#5C3B00]">
          <span className="grid size-14 place-items-center rounded-full bg-white/70 text-[30px] font-black">!</span>
          <b className="text-[22px] leading-tight">This is not on your medicine list</b>
          <span className="text-[14px]">Read as Telma 40 · telmisartan 40 mg</span>
          <b className="text-[16px]">Ask your doctor or pharmacist before taking it.</b>
        </div>
      </Screen>
    )
  return (
    <Screen key={m} className="bg-gradient-to-b from-sage-200 to-cream-50">
      <StatusBar />
      <div className="flex flex-col items-center gap-1 pt-16">
        <span className="text-[72px] leading-none font-extrabold tracking-tight">8:31</span>
        <span className="text-[15px] text-muted">Friday, 20 November</span>
      </div>
      <div className="absolute right-0 bottom-16 left-0 flex flex-col items-center gap-2">
        <span className="grid size-16 place-items-center rounded-[20px] bg-brand-600 text-[38px] font-extrabold text-white">+</span>
        <b>Medicub</b>
      </div>
    </Screen>
  )
}

// ---------- tablet (pharmacy) ----------
function PharmBar({ right }: { right: string }) {
  return (
    <div className="flex h-[48px] items-center gap-3 border-b border-cream-200 bg-white/70 px-5 text-[14px]">
      <span className="grid size-7 place-items-center rounded-lg bg-sage-700 font-extrabold text-white">Rx</span>
      <b>Medicub Pharmacy</b>
      <span className="ml-auto text-subtle">{right}</span>
    </div>
  )
}
function TabScreen({ m }: { m: TabMode }) {
  if (m === 'blocked')
    return (
      <Screen key={m}>
        <PharmBar right="RX-1005 · Ramesh Kumar" />
        <div className="flex flex-col gap-3 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3"><span className="text-[11px] font-extrabold tracking-wide text-subtle uppercase">Prescribed</span><Pill /><b className="text-[17px]">Telma-AM 40/5</b><span className="text-[12px] text-subtle">telmisartan 40 + amlodipine 5</span></div>
            <div className="relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl bg-white p-3">
              <span className="text-[11px] font-extrabold tracking-wide text-subtle uppercase">Scanned</span>
              <div className="flex h-[34px] items-end gap-[3px]">{Array.from({ length: 34 }, (_, n) => <span key={n} className="bg-ink" style={{ width: n % 3 ? 2 : 4, height: 34 }} />)}</div>
              <b className="text-[17px]">Telma 40</b><span className="text-[12px] text-subtle">telmisartan 40</span>
              <span data-k="bscan" className="absolute top-8 left-6 h-[40px] w-[3px] bg-brand-600 shadow-[0_0_12px_#CC3762]" />
            </div>
          </div>
          <div data-k="verdict" className="flex flex-col gap-1 rounded-2xl bg-red-50 p-4 text-red-900 ring-2 ring-red-400">
            <b className="text-[24px]">⛔ BLOCKED</b>
            <span className="text-[14px]">Different ingredients: amlodipine is missing. The prescriber must decide.</span>
          </div>
          <div className="flex items-center gap-3">
            <span data-k="send" className="rounded-2xl bg-red-700 px-5 py-3 font-bold text-white">Send to prescriber</span>
            <span data-k="sent" className="font-bold text-sage-800">✓ Sent to Dr Meera Iyer's inbox</span>
          </div>
        </div>
      </Screen>
    )
  if (m === 'generic')
    return (
      <Screen key={m}>
        <PharmBar right="Glycomet 500 · 1 strip of 10" />
        <div className="flex flex-col gap-3 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-2xl bg-white p-4"><span className="text-[12px] font-bold text-subtle">Prescribed brand</span><b className="text-[18px]">Glycomet 500</b><span className="text-[40px] leading-none font-black">₹30</span></div>
            <div data-k="gcard" className="relative flex flex-col gap-1 rounded-2xl bg-sage-700 p-4 text-white">
              <span className="text-[12px] font-bold text-sage-100">Jan Aushadhi generic</span><b className="text-[18px]">Metformin 500</b><span data-k="price" className="text-[40px] leading-none font-black">₹10</span>
              <span data-k="save" className="absolute -top-4 -right-3 rounded-full bg-brand-600 px-4 py-2 text-[18px] font-extrabold">Save 67%</span>
            </div>
          </div>
          <span data-k="equiv" className="font-semibold text-sage-800">✓ Same ingredients · same strength · same form</span>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3">
            <span data-k="agree" className="grid size-7 place-items-center rounded-lg border-2 border-line text-white"><span data-k="tick"><Check size={18} /></span></span>
            <b className="text-[15px]">The patient agreed to the generic</b>
          </div>
          <span data-k="attest" className="self-start rounded-2xl bg-ink px-5 py-3 font-bold text-white"><span data-k="attest-label">Attest &amp; dispense</span></span>
        </div>
      </Screen>
    )
  return (
    <Screen key={m} className="grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-20 place-items-center rounded-[24px] bg-sage-700 text-[34px] font-extrabold text-white">Rx</span>
        <b className="text-[28px]">Medicub Pharmacy</b>
        <span className="text-[16px] text-subtle">Counter · works offline</span>
      </div>
    </Screen>
  )
}

// ---------- overlays ----------
const C = { lap: { x: SPREAD.lap.x, y: SPREAD.lap.y }, phone: { x: SPREAD.phone.x, y: SPREAD.phone.y }, tab: { x: SPREAD.tab.x, y: SPREAD.tab.y } }
const PAIRS = [[C.lap, C.phone], [C.phone, C.tab], [C.lap, C.tab]] as const

function Broken() {
  return (
    <svg className="absolute inset-0" width={W} height={H}>
      {PAIRS.map(([a, b], n) => <line key={n} data-k="broken" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cc3762" strokeWidth={4} strokeDasharray="14 14" strokeLinecap="round" opacity={0.6} />)}
    </svg>
  )
}
function DeviceLabels() {
  const L = [{ t: 'Cardiologist', x: C.lap.x, y: 118 }, { t: 'Patient', x: C.phone.x, y: 282 }, { t: 'Pharmacy', x: C.tab.x, y: 625 }]
  return (
    <>
      {L.map((l) => <span key={l.t} data-k="dev-label" className="absolute -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-[20px] font-bold text-white" style={{ left: l.x, top: l.y }}>{l.t}</span>)}
      {PAIRS.map(([a, b], n) => (
        <span key={n} data-k="cross" className="absolute grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand-600 text-[30px] font-black text-white shadow-lg" style={{ left: (a.x + b.x) / 2 + (n === 2 ? -60 : 0), top: (a.y + b.y) / 2 }}>✕</span>
      ))}
    </>
  )
}
function HubLines() {
  return (
    <svg className="absolute inset-0" width={W} height={H}>
      {[C.lap, C.phone, C.tab].map((p, n) => (
        <g key={n}>
          <line data-k="hub-line" x1={HUB.x} y1={HUB.y} x2={p.x} y2={p.y} stroke="#5e6438" strokeWidth={5} strokeDasharray={700} strokeLinecap="round" />
          <line data-k="packet" x1={HUB.x} y1={HUB.y} x2={p.x} y2={p.y} stroke="#cc3762" strokeWidth={7} strokeDasharray="6 54" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  )
}
function HubOrb() {
  return (
    <div data-k="hub" className="absolute grid size-[170px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sage-700 text-center text-white shadow-[0_30px_60px_-20px_rgba(57,61,33,0.6)]" style={{ left: HUB.x, top: HUB.y }}>
      <span data-k="hub-ring" className="absolute inset-0 rounded-full ring-8 ring-sage-400/60" />
      <span className="text-[22px] leading-tight font-extrabold">One<br />record</span>
    </div>
  )
}
function Watch() {
  return (
    <div data-k="watch" className="absolute flex flex-col items-center" style={{ left: 1560, top: 380 }}>
      <div className="h-[70px] w-[120px] rounded-t-[30px] bg-[#3a3c2e]" />
      <div className={`relative grid h-[250px] w-[210px] place-items-center rounded-[64px] bg-[#1d1e17] ${SHADOW}`}>
        <div className="relative grid size-[178px] place-items-center overflow-hidden rounded-[52px] bg-black text-center text-white">
          <div data-k="w-alert" className="absolute inset-0 flex flex-col items-center justify-center gap-1"><Pill /><b className="text-[20px]">Glycomet 500</b><span className="text-[14px] text-white/70">8:30 · Morning</span></div>
          <div data-k="w-took" className="absolute inset-0 flex flex-col items-center justify-center gap-2"><span className="grid size-14 place-items-center rounded-full bg-sage-400 text-ink"><Check size={30} /></span><b>Taken</b></div>
        </div>
      </div>
      <div className="h-[70px] w-[120px] rounded-b-[30px] bg-[#3a3c2e]" />
    </div>
  )
}
function Ladder() {
  const steps = [['8:30', 'Phone + watch reminder'], ['8:45', 'Second reminder'], ['9:00', 'Family caregiver (Sunita)'], ['Next morning', 'ASHA worker (Anita)']]
  return (
    <div className="absolute" style={{ left: 840, top: 250 }}>
      <span data-k="ladder-line" className="absolute top-[30px] left-[29px] h-[540px] w-[4px] rounded-full bg-sage-400" />
      {steps.map(([t, l], n) => (
        <div key={t} data-k={n === 3 ? 'node-last' : undefined} className="relative mb-[118px] flex items-center gap-6 last:mb-0">
          <span data-k="node" className={`relative z-10 grid size-[62px] place-items-center rounded-full text-[22px] font-extrabold ${n === 2 ? 'bg-brand-600 text-white' : n === 3 ? 'border-4 border-sage-400 bg-cream-50 text-sage-800' : 'bg-sage-700 text-white'}`}>
            {n === 2 ? <span data-k="node-hot" className="absolute inset-0 rounded-full" /> : null}{n + 1}
          </span>
          <div data-k="node-label" className="flex flex-col">
            <b className="text-[26px]">{t}</b>
            <span className="text-[20px] text-muted">{l}</span>
            {n === 3 && <span data-k="stopped" className="text-[18px] font-bold text-sage-800">Not needed: Sunita confirmed</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
function Chain() {
  const B = [['Doctor signed in', 'a3f9c1'], ['QR share · Ramesh', '7c21e0'], ['Flag decided · reason', '19be4d'], ['RX-1005 signed', 'e04a77'], ['Wrong pack blocked', '5d93f2'], ['Dose taken · Sunita', 'b8c610']]
  return (
    <div className="absolute flex flex-col gap-10" style={{ left: 760, top: 330, width: 1080 }}>
      <div className="flex items-center">
        {B.map(([t, h], n) => (
          <div key={t} className="flex items-center">
            {n > 0 && <span data-k={n >= 4 ? 'lnk-bad' : 'lnk'} className="h-[6px] w-[28px] bg-sage-700" />}
            <div data-k={n >= 3 ? `blk-${n + 1}` : 'blk'} className="flex h-[190px] w-[150px] flex-col justify-between rounded-2xl border-[3px] border-sage-700 bg-white p-3">
              <span className="text-[15px] font-extrabold text-subtle">#{n + 1}</span>
              <b data-k={n === 3 ? 'blk-4-text' : undefined} className="text-[18px] leading-tight">{t}</b>
              <span data-k={n === 3 ? 'blk-4-hash' : undefined} className="font-mono text-[14px] text-subtle">{h}…</span>
            </div>
          </div>
        ))}
      </div>
      <div className="relative h-[60px] text-[30px] font-extrabold">
        <span data-k="chain-ok" className="absolute flex items-center gap-3 text-sage-800"><Check size={34} /> Chain verified: 6 of 6 entries</span>
        <span data-k="chain-bad" className="absolute text-brand-700">⚠ Tampering detected at entry #4</span>
      </div>
    </div>
  )
}
function Roadmap() {
  const sim = ['DigiLocker, NMC, AskMyDoc checks (mock adapters)', 'AI summary from the record, no language model yet', 'NFC tag tap (simulated in the app)', 'Watch vitals: synthetic BP estimates', 'Location: simulated GPS', 'Medicine list and prices: small synthetic set', 'Caregiver alerts: in-app only']
  const need = [['Voice call + SMS reminders', 'telecom gateway, DLT registration'], ['ABDM: ABHA ID, linked records, consent', 'registration + certification'], ['Medical language model for matching', 'data, compute, validation'], ['iOS app + Apple Watch', 'Apple program, hardware'], ['National drug database', 'licensing'], ['Pharmacy inventory integration', 'partner pharmacies'], ['Clinical validation + security audit', 'partner doctors, pilot']]
  return (
    <div className="absolute grid grid-cols-2 gap-8" style={{ left: 760, top: 170, width: 1060 }}>
      <div data-k="rm-col" className="flex flex-col gap-3 rounded-[28px] bg-white p-7">
        <b className="text-[26px]">Simulated in this prototype</b>
        {sim.map((t) => <span key={t} data-k="rm-item" className="flex gap-3 text-[20px] leading-snug text-muted"><span className="mt-2.5 size-2.5 shrink-0 rounded-full bg-sage-400" />{t}</span>)}
      </div>
      <div data-k="rm-col" className="flex flex-col gap-3 rounded-[28px] bg-sage-700 p-7 text-white">
        <b className="text-[26px]">Needs funding or partners</b>
        {need.map(([t, w]) => <span key={t} data-k="rm-item" className="flex flex-col text-[20px] leading-snug"><b className="font-semibold">{t}</b><span className="text-[16px] text-sage-100">{w}</span></span>)}
      </div>
    </div>
  )
}

function Scenario() {
  const mark = (t: string) => <span data-k="dup-mark" className="rounded-md bg-brand-600 px-1.5 text-white">{t}</span>
  return (
    <div className="absolute" style={{ left: 760, top: 190, width: 1060 }}>
      <div className="relative grid grid-cols-2 gap-16">
        <div data-k="rx-card" className={`flex flex-col gap-4 rounded-[28px] bg-white p-7 ${SHADOW}`}>
          <span className="text-[18px] font-extrabold tracking-[0.15em] text-subtle uppercase">What he takes now</span>
          <div className="flex flex-col gap-1 rounded-2xl bg-cream-50 p-4"><b className="text-[28px]">Amlong 5</b><span className="text-[21px] text-muted">{mark('amlodipine')} 5 mg · once daily</span><span className="text-[17px] text-subtle">Dr Meera Iyer · Cardiology</span></div>
          <div className="flex flex-col gap-1 rounded-2xl bg-cream-50 p-4"><b className="text-[28px]">Glycomet 500</b><span className="text-[21px] text-muted">metformin 500 mg · twice daily</span><span className="text-[17px] text-subtle">Dr Arjun Rao · Diabetology</span></div>
        </div>
        <div data-k="rx-card" className={`flex flex-col gap-4 rounded-[28px] border-[3px] border-brand-600 bg-white p-7 ${SHADOW}`}>
          <span className="text-[18px] font-extrabold tracking-[0.15em] text-brand-600 uppercase">New prescription</span>
          <div className="flex flex-col gap-1 rounded-2xl bg-brand-50 p-4"><b className="text-[28px]">Telma-AM 40/5</b><span className="text-[21px] text-muted">telmisartan 40 mg + {mark('amlodipine')} 5 mg</span><span className="text-[17px] text-subtle">Different brand name, same active ingredient</span></div>
          <div data-k="dup-badge" className="flex items-center gap-3 self-start rounded-2xl bg-brand-600 px-5 py-3 text-white"><span className="text-[30px] font-black">2×</span><span className="text-[19px] leading-tight font-bold">amlodipine<br />5 mg + 5 mg</span></div>
        </div>
        <span data-k="dup-link" className="absolute top-[170px] left-[calc(50%-64px)] h-[6px] w-[128px] rounded-full bg-brand-600" />
      </div>
      <p data-k="dup-quote" className="m-0 mt-10 text-center text-[30px] font-semibold text-muted italic">“I can’t remember which prescription changed last.” · Ramesh</p>
    </div>
  )
}
function Fit() {
  const asks = [
    ['Unified medication record', 'Brand + generic, strength, dose, timing, prescriber'],
    ['Duplicate-ingredient detection', 'Same ingredient under another brand is flagged'],
    ['Interaction and safety checks', 'Fixed rules for interactions and unsafe swaps'],
    ['Smart schedule', 'Phone + watch reminders, missed doses logged'],
    ['Prescription reconciliation', 'New Rx checked against the current list before signing'],
    ['Shared clinical access', 'Doctor, pharmacy, departments; decisions recorded'],
    ['Patient-friendly design', 'Plain language, caregiver ladder, large controls'],
  ]
  const levers = [
    ['Easy capture', 'Photo of a strip, checked against his list'],
    ['Explainable, ranked flags', 'Severity + reason, and the prescriber is asked if it is intentional'],
    ['Verification loop + audit trail', 'Open until a named professional decides; SHA-256 chain'],
  ]
  const Row = ({ t, d, n }: { t: string; d: string; n: string }) => (
    <div data-k="fit-row" className="flex items-start gap-3">
      <span data-k="fit-tick" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-sage-700 text-white"><Check size={18} /></span>
      <div className="flex flex-col"><b className="text-[21px] leading-tight"><span className="text-subtle">{n} </span>{t}</b><span className="text-[17px] text-muted">{d}</span></div>
    </div>
  )
  return (
    <div className="absolute grid grid-cols-[1.15fr_1fr] gap-7" style={{ left: 740, top: 120, width: 1100 }}>
      <div data-k="fit-col" className="flex flex-col gap-3.5 rounded-[28px] bg-white p-7">
        <b className="text-[18px] font-extrabold tracking-[0.15em] text-subtle uppercase">The 7 asks</b>
        {asks.map(([t, d], n) => <Row key={t} t={t!} d={d!} n={`${n + 1}.`} />)}
      </div>
      <div className="flex flex-col gap-7">
        <div data-k="fit-col" className="flex flex-col gap-3.5 rounded-[28px] bg-white p-7">
          <b className="text-[18px] font-extrabold tracking-[0.15em] text-subtle uppercase">Innovation levers</b>
          {levers.map(([t, d]) => <Row key={t} t={t!} d={d!} n="★" />)}
        </div>
        <div data-k="fit-col" className="flex flex-col gap-2 rounded-[28px] bg-sage-700 p-7 text-white">
          <b className="text-[18px] font-extrabold tracking-[0.15em] text-sage-100 uppercase">Safety guardrail</b>
          <span className="text-[22px] leading-snug font-semibold">Never stops, substitutes or alters a medicine. Every flag goes to a professional, and intentional combinations are kept apart from errors.</span>
        </div>
      </div>
    </div>
  )
}
