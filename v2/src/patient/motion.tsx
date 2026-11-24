import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Draggable } from 'gsap/Draggable'
import { useRef, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react'

gsap.registerPlugin(useGSAP, Draggable)
// GSAP runs on requestAnimationFrame, so 90/120/144 Hz screens get every frame. Never cap ticker fps;
// lag smoothing keeps a dropped frame from making animations jump.
gsap.ticker.lagSmoothing(500, 33)
gsap.defaults({ ease: 'power3.out', duration: 0.45 })

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
export { gsap, useGSAP }

/** Button that squashes under the finger and springs back on release. */
export function Pressable({ className = '', children, style, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null)
  const down = () => !reducedMotion() && gsap.to(ref.current, { scale: 0.95, duration: 0.12, ease: 'power2.out', overwrite: 'auto' })
  const up = () => gsap.to(ref.current, { scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' })
  return (
    <button
      ref={ref}
      {...p}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', willChange: 'transform', ...style }}
      className={`cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onPointerDown={(e) => { down(); p.onPointerDown?.(e) }}
      onPointerUp={(e) => { up(); p.onPointerUp?.(e) }}
      onPointerLeave={(e) => { up(); p.onPointerLeave?.(e) }}
      onPointerCancel={up}
    >
      {children}
    </button>
  )
}

/** Fades/slides every [data-anim] child in, staggered, whenever `key` changes. */
export function useStaggerIn(scope: RefObject<HTMLElement | null>, key: unknown) {
  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from('[data-anim]', { y: 18, autoAlpha: 0, duration: 0.5, stagger: 0.06, clearProps: 'transform,opacity,visibility' })
    },
    { scope, dependencies: [key] },
  )
}

/** Collapse an element (height + fade) then run `done`. Used before removing list items. */
export function collapse(el: HTMLElement | null, done: () => void) {
  if (!el || reducedMotion()) return done()
  gsap.to(el, { height: 0, autoAlpha: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.35, ease: 'power2.inOut', onComplete: done })
}

/**
 * Sheet: a bottom sheet (phone) or right-side drawer (web). Drag it back toward its edge to dismiss
 * (flick, or past 120 px). `onClose` runs after the exit animation.
 */
export function Sheet({ open, onClose, label, side = 'bottom', children }: { open: boolean; onClose: () => void; label: string; side?: 'bottom' | 'right'; children: ReactNode | ((close: (after?: () => void) => void) => ReactNode) }) {
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const axis = side === 'right' ? 'x' : 'y'
  const size = () => (axis === 'x' ? panel.current?.offsetWidth : panel.current?.offsetHeight) ?? 800

  /** Animate out, then run `after` (e.g. the store action) and tell the parent. */
  const close = (after?: () => void) => {
    gsap.to(backdrop.current, { autoAlpha: 0, duration: 0.25 })
    gsap.to(panel.current, { [axis]: size(), duration: reducedMotion() ? 0 : 0.35, ease: 'power3.in', overwrite: true, onComplete: () => { after?.(); onClose() } })
  }

  useGSAP(
    () => {
      if (!open || !panel.current) return
      gsap.fromTo(backdrop.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 })
      // Pixel offsets only: Draggable converts percent transforms to px, which would fight a percent tween.
      gsap.fromTo(panel.current, { [axis]: size() }, { [axis]: 0, duration: reducedMotion() ? 0 : 0.6, ease: 'expo.out' })
      let last = 0
      let lastT = 0
      let vel = 0
      const pos = (d: Record<string, unknown>) => Number(d[axis])
      const [d] = Draggable.create(panel.current, {
        type: axis,
        bounds: axis === 'x' ? { minX: 0, maxX: 2000 } : { minY: 0, maxY: 2000 },
        edgeResistance: 0.85,
        dragClickables: false, // buttons inside stay tappable
        minimumMovement: 6,
        onPress() { gsap.killTweensOf(panel.current); last = pos(this); lastT = performance.now(); vel = 0 },
        onDrag() {
          const t = performance.now()
          vel = (pos(this) - last) / Math.max(1, t - lastT) // px per ms
          last = pos(this)
          lastT = t
          gsap.set(backdrop.current, { autoAlpha: Math.max(0.2, 1 - pos(this) / 500) })
        },
        onRelease() {
          if (pos(this) > 120 || vel > 0.6) close()
          else {
            gsap.to(panel.current, { [axis]: 0, duration: 0.5, ease: 'elastic.out(1, 0.6)' })
            gsap.to(backdrop.current, { autoAlpha: 1, duration: 0.2 })
          }
        },
      })
      const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
      panel.current.addEventListener('keydown', esc)
      return () => d?.kill()
    },
    { scope: root, dependencies: [open] },
  )

  if (!open) return null
  const right = side === 'right'
  return (
    <div ref={root} className={right ? 'fixed inset-0 z-40 flex justify-end' : 'absolute inset-0 z-30 flex flex-col justify-end'}>
      <div ref={backdrop} className="absolute inset-0 bg-[#2a2620]/50" onClick={() => close()} aria-hidden="true" />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={right ? 'relative h-full w-[min(560px,94vw)] overflow-y-auto bg-cream-50 px-6 py-6 shadow-[-20px_0_60px_rgba(40,30,10,0.18)]' : 'relative max-h-[92%] overflow-y-auto rounded-t-[32px] bg-cream-50 px-6 pt-3 pb-8'}
        style={{ willChange: 'transform', touchAction: right ? 'pan-y' : 'none' }}
      >
        {!right && <div className="mx-auto mb-4 h-[5px] w-11 rounded-full bg-line" aria-hidden="true" />}
        {typeof children === 'function' ? children(close) : children}
        <button className="sr-only" onClick={() => close()}>Close</button>
      </section>
    </div>
  )
}

/**
 * Press-and-hold confirmation (prevents accidental consent). Fills over `ms`; releasing early rewinds.
 * Keyboard users activate it instantly with Enter/Space.
 */
export function HoldButton({ onConfirm, children, ms = 900 }: { onConfirm: () => void; children: ReactNode; ms?: number }) {
  const fill = useRef<HTMLSpanElement>(null)
  const tween = useRef<gsap.core.Tween | null>(null)
  const start = () => {
    tween.current?.kill()
    tween.current = gsap.fromTo(fill.current, { scaleX: 0 }, { scaleX: 1, duration: ms / 1000, ease: 'none', onComplete: () => { navigator.vibrate?.(20); onConfirm() } })
  }
  const cancel = () => {
    if (!tween.current || tween.current.progress() === 1) return
    tween.current.kill()
    gsap.to(fill.current, { scaleX: 0, duration: 0.25, ease: 'power2.out' })
  }
  return (
    <Pressable
      className="relative h-[60px] w-full overflow-hidden rounded-[18px] bg-sage-700 text-lg font-bold text-white"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onClick={(e) => { if (e.detail === 0) onConfirm() }}
    >
      <span ref={fill} className="absolute inset-0 origin-left bg-sage-900" style={{ transform: 'scaleX(0)' }} aria-hidden="true" />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </Pressable>
  )
}
