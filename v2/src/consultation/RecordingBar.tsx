import { useEffect, useRef, useState } from 'react'
import { I } from '../ui/icons'
import { Pressable, reducedMotion } from '../ui/motion'
import { useRecorder } from './useRecorder'

export interface RecordingBarProps {
  sessionId: string
  patientName: string
  doctorName: string
  role: 'patient' | 'doctor'
  onCompleted?: (cardId: string) => void
  onClose?: () => void
}

function fmtDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function RecordingBar({
  sessionId,
  patientName,
  doctorName,
  role,
  onCompleted,
  onClose,
}: RecordingBarProps) {
  const { status, elapsedMs, audioLevel, error, start, pause, resume, stop } = useRecorder(
    sessionId,
    onCompleted,
  )
  const [confirmStop, setConfirmStop] = useState(false)
  const startedRef = useRef(false)

  // Automatically start recording when this component mounts with a fresh session
  useEffect(() => {
    if (!startedRef.current && sessionId) {
      startedRef.current = true
      void start()
    }
  }, [sessionId, start])

  const isPaused = status === 'paused'
  const isProcessing = status === 'processing'
  const isCompleted = status === 'completed'

  if (isCompleted) {
    return (
      <aside aria-label="Consultation recorder" className="fixed bottom-6 left-1/2 z-50 flex w-[min(540px,94vw)] -translate-x-1/2 items-center justify-between gap-3 rounded-3xl bg-sage-900 p-4 text-white shadow-2xl ring-1 ring-sage-700 animate-enter">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-sage-700 text-white">
            <I n="check" size={20} stroke={2.5} />
          </span>
          <div>
            <b className="block text-sm font-extrabold">Consultation Card Compiled</b>
            <span className="text-xs text-sage-200">AI summary & timeline ready in records</span>
          </div>
        </div>
        {onClose && (
          <Pressable
            onClick={onClose}
            className="h-10 rounded-xl bg-sage-800 px-4 text-xs font-bold text-white hover:bg-sage-700"
          >
            Dismiss
          </Pressable>
        )}
      </aside>
    )
  }

  return (
    <aside aria-label="Consultation recorder" className="fixed bottom-6 left-1/2 z-50 flex w-[min(560px,94vw)] -translate-x-1/2 flex-col gap-2 rounded-3xl bg-ink p-4 text-white shadow-[0_20px_60px_rgba(31,32,21,0.35)] ring-1 ring-white/10 backdrop-blur-md animate-enter">
      <div className="flex items-center justify-between gap-3">
        {/* Status indicator & timer */}
        <div className="flex items-center gap-3">
          <div className="relative grid size-10 place-items-center">
            {isProcessing ? (
              <span className="size-6 animate-spin rounded-full border-2 border-sage-300 border-t-white" />
            ) : isPaused ? (
              <span className="size-3.5 rounded-full bg-amber-400 ring-4 ring-amber-400/20" />
            ) : (
              <>
                <span className="size-3.5 rounded-full bg-red-500" />
                <span className="absolute size-6 animate-ping rounded-full bg-red-500/40" />
              </>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-black tracking-wider">
                {fmtDuration(elapsedMs)}
              </span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-sage-200">
                {isProcessing
                  ? 'Compiling Notes…'
                  : isPaused
                    ? 'Paused'
                    : 'Listening'}
              </span>
            </div>
            <span className="block truncate text-xs text-cream-200/80">
              {role === 'doctor' ? `With ${patientName}` : `With ${doctorName}`}
            </span>
          </div>
        </div>

        {/* Live Audio Visualizer Bars */}
        {!isProcessing && !isPaused && (
          <div className="hidden h-7 items-center gap-1 sm:flex" aria-hidden="true">
            {[0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8].map((mult, idx) => {
              const h = Math.max(
                4,
                Math.round(24 * (reducedMotion() ? 0.3 : Math.min(1, (audioLevel + 0.15) * mult))),
              )
              return (
                <span
                  key={idx}
                  style={{ height: `${h}px` }}
                  className="w-1 rounded-full bg-sage-400 transition-[height] duration-150"
                />
              )
            })}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2">
          {!isProcessing && (
            <>
              {isPaused ? (
                <Pressable
                  onClick={() => void resume()}
                  className="flex h-11 items-center gap-1.5 rounded-2xl bg-white/15 px-3.5 text-xs font-bold text-white hover:bg-white/25"
                  title="Resume Recording"
                >
                  <I n="play" size={16} />
                  <span className="hidden sm:inline">Resume</span>
                </Pressable>
              ) : (
                <Pressable
                  onClick={() => void pause()}
                  className="flex h-11 items-center gap-1.5 rounded-2xl bg-white/15 px-3.5 text-xs font-bold text-white hover:bg-white/25"
                  title="Pause Recording"
                >
                  <I n="pause" size={16} />
                  <span className="hidden sm:inline">Pause</span>
                </Pressable>
              )}

              {confirmStop ? (
                <div className="flex items-center gap-1">
                  <Pressable
                    onClick={() => void stop()}
                    className="h-11 rounded-2xl bg-brand-600 px-3 text-xs font-extrabold text-white shadow-lg"
                  >
                    Confirm End
                  </Pressable>
                  <Pressable
                    onClick={() => setConfirmStop(false)}
                    className="grid size-11 place-items-center rounded-2xl bg-white/15 text-xs text-white"
                  >
                    <I n="x" size={16} />
                  </Pressable>
                </div>
              ) : (
                <Pressable
                  onClick={() => setConfirmStop(true)}
                  className="flex h-11 items-center gap-1.5 rounded-2xl bg-sage-700 px-4 text-xs font-extrabold text-white hover:bg-sage-600"
                  title="End Consultation and Compile Notes"
                >
                  <I n="stop" size={16} />
                  <span>End & Scribe</span>
                </Pressable>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-950/80 px-3 py-1.5 text-xs font-semibold text-red-200">
          {error}
        </div>
      )}
    </aside>
  )
}
