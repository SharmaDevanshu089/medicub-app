import { useState } from 'react'
import { I } from '../ui/icons'
import { Pressable, Sheet } from '../ui/motion'

export interface ConsentPromptProps {
  doctorName: string
  doctorSpecialty: string
  clinicName?: string
  onAccept: () => Promise<void>
  onDecline: () => void
}

export function ConsentPrompt({
  doctorName,
  doctorSpecialty,
  clinicName,
  onAccept,
  onDecline,
}: ConsentPromptProps) {
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    setLoading(true)
    try {
      await onAccept()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open label="Consultation Audio Scribe" onClose={onDecline}>
      {() => (
        <div className="flex flex-col gap-5 text-ink">
          <div className="flex items-center gap-3.5">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <I n="mic" size={30} stroke={2.4} />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-bold text-sage-900">
                <I n="sparkle" size={14} /> Wispr Flow Scribe
              </span>
              <h2 className="m-0 text-xl font-extrabold tracking-tight">Record Consultation?</h2>
            </div>
          </div>

          <div className="rounded-2xl bg-cream-100 p-4 text-sm leading-relaxed text-muted">
            <p className="m-0 font-medium">
              You checked in with <b>{doctorName}</b> ({doctorSpecialty}
              {clinicName ? ` · ${clinicName}` : ''}).
            </p>
            <p className="mt-2 mb-0">
              With your permission, Medicub records the clinical discussion to capture your
              symptom timelines, discussed medications, and instructions into a structured visit
              note.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5 text-xs text-subtle">
              <I n="check" size={16} className="mt-0.5 shrink-0 text-sage-800" />
              <span>
                <b>Mutual Visibility:</b> Both you and {doctorName} immediately receive the visit summary.
              </span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-subtle">
              <I n="lock" size={16} className="mt-0.5 shrink-0 text-sage-800" />
              <span>
                <b>Patient Control:</b> You can pause or stop the recording at any moment from your phone.
              </span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-subtle">
              <I n="shield" size={16} className="mt-0.5 shrink-0 text-sage-800" />
              <span>
                <b>Tamper-Evident:</b> Summary hashes are verified on Medicub's cryptographic audit chain.
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2.5">
            <Pressable
              disabled={loading}
              onClick={() => void handleStart()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sage-700 text-base font-bold text-white shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <>
                  <I n="mic" size={20} />
                  <span>Start Audio Scribing</span>
                </>
              )}
            </Pressable>

            <Pressable
              disabled={loading}
              onClick={onDecline}
              className="h-12 w-full rounded-2xl border border-line text-sm font-bold text-muted hover:bg-cream-100"
            >
              Skip (Proceed without Audio)
            </Pressable>
          </div>
        </div>
      )}
    </Sheet>
  )
}
