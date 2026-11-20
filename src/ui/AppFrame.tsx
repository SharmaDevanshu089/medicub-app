// Shared app chrome: error boundary, connection gate, offline banner and toasts.
import { Component, useRef, type ErrorInfo, type ReactNode } from 'react'
import { I } from '../patient/icons'
import { gsap, reducedMotion, useGSAP } from '../patient/motion'
import { dismissToast, reportClient, useClient, useToasts } from '../store/store'

/** Catches render crashes: shows a calm recovery screen and reports the error to the server log. */
export class ErrorBoundary extends Component<{ children: ReactNode; name: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClient('error', 'render.crash', `${this.props.name}: ${error.message}`, `${error.stack ?? ''}\n${info.componentStack ?? ''}`)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center bg-cream-50 p-6 text-ink" style={{ fontFamily: 'var(--font-app)' }} role="alert">
        <div className="flex max-w-md flex-col gap-4 rounded-3xl bg-white p-8">
          <h1 className="m-0 text-2xl font-extrabold">Something went wrong on this screen</h1>
          <p className="m-0 text-muted">Your data is safe — nothing was lost. The problem has been reported. Reload to continue.</p>
          <button onClick={() => location.reload()} className="h-12 cursor-pointer rounded-2xl bg-sage-700 font-bold text-white">Reload</button>
        </div>
      </div>
    )
  }
}

/**
 * Renders `signIn` when signed out, a splash while the first data arrives, and `children` once live.
 * While reconnecting it keeps showing the last data with a banner, so work never disappears mid-task.
 */
export function Gate({ signIn, children, dark = false }: { signIn: ReactNode; children: ReactNode; dark?: boolean }) {
  const { status, state } = useClient()
  if (status === 'signed-out') return <>{signIn}</>
  if (!state)
    return (
      <div className={`grid h-full min-h-[inherit] place-items-center p-6 ${dark ? 'text-white' : 'text-ink'}`} style={{ fontFamily: 'var(--font-app)' }} role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="size-10 animate-spin rounded-full border-4 border-sage-200 border-t-sage-700" aria-hidden="true" />
          <b>Connecting to Medicub…</b>
          {status === 'reconnecting' || status === 'connecting' ? <span className={dark ? 'text-white/70' : 'text-muted'}>If this takes long, check that the server is running.</span> : null}
        </div>
      </div>
    )
  return (
    <>
      {status === 'reconnecting' && (
        <div className="fixed top-0 right-0 left-0 z-50 flex items-center justify-center gap-2 bg-[#FCEFD3] px-4 py-2 text-sm font-bold text-[#5C3B00]" role="status" style={{ fontFamily: 'var(--font-app)' }}>
          <I n="clock" size={16} /> Connection lost — reconnecting. You're seeing the last known data.
        </div>
      )}
      {children}
    </>
  )
}

export function Toaster() {
  const toasts = useToasts()
  const box = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (!reducedMotion()) gsap.from('[data-toast]:last-child', { y: 20, autoAlpha: 0, duration: 0.4, ease: 'back.out(1.6)' })
  }, { scope: box, dependencies: [toasts.at(-1)?.id] })
  return (
    <div ref={box} className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-[min(460px,92vw)] -translate-x-1/2 flex-col gap-2" aria-live="assertive" style={{ fontFamily: 'var(--font-app)' }}>
      {toasts.map((t) => (
        <div key={t.id} data-toast role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-2xl p-4 shadow-xl ${t.kind === 'error' ? 'bg-red-50 text-red-900 ring-1 ring-red-300' : t.kind === 'success' ? 'bg-sage-50 text-sage-900 ring-1 ring-sage-200' : 'bg-ink text-white'}`}>
          <span className="mt-0.5 shrink-0"><I n={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'bell'} size={20} /></span>
          <span className="flex-1 font-semibold">{t.text}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="shrink-0 cursor-pointer opacity-70"><I n="x" size={18} /></button>
        </div>
      ))}
    </div>
  )
}

/** Global safety net: uncaught errors and promise rejections go to the server log. */
export function installGlobalErrorHandlers() {
  addEventListener('error', (e) => reportClient('error', 'window.error', e.message, (e.error as Error | undefined)?.stack))
  addEventListener('unhandledrejection', (e) => reportClient('error', 'unhandled_rejection', String((e.reason as Error | undefined)?.message ?? e.reason), (e.reason as Error | undefined)?.stack))
}
