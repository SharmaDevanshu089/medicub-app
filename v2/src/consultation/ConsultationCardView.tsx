import { useState } from 'react'
import { fmtDateTime } from '../lib/time'
import type { ConsultationCard } from '../store/types'
import { I } from '../ui/icons'

export interface ConsultationCardViewProps {
  card: ConsultationCard
  isDoctorView?: boolean
}

export function ConsultationCardView({ card, isDoctorView: _isDoctorView = false }: ConsultationCardViewProps) {
  const [showTranscript, setShowTranscript] = useState(false)
  const { summary } = card

  return (
    <article className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-cream-200">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cream-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
              <I n="sparkle" size={12} /> Wispr Flow Scribe
            </span>
            <span className="text-xs font-semibold text-subtle">
              {fmtDateTime(card.consultedAt)}
            </span>
          </div>
          <h3 className="mt-1 mb-0 text-xl font-extrabold tracking-tight text-ink">
            Consultation with {card.doctorName}
          </h3>
          <span className="text-xs font-semibold text-muted">{card.doctorSpecialty}</span>
        </div>

        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="cursor-pointer text-xs font-bold text-brand-700 hover:underline"
        >
          {showTranscript ? 'Hide Raw Audio Transcript' : 'View Full Transcript'}
        </button>
      </div>

      {/* Chief Complaint */}
      <div className="rounded-2xl bg-cream-50 p-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
          Primary Concern / Chief Complaint
        </span>
        <p className="mt-1 mb-0 text-base font-extrabold text-ink">
          {summary.chiefComplaint}
        </p>
      </div>

      {/* Symptoms & Timelines */}
      {summary.symptoms.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Reported Symptoms & Timelines
          </span>
          <div className="flex flex-wrap gap-2">
            {summary.symptoms.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-2xl bg-cream-100 px-3.5 py-2 text-sm text-ink"
              >
                <span className="size-2 rounded-full bg-brand-600" />
                <span className="font-semibold">{s.description}</span>
                {s.duration && (
                  <span className="rounded-md bg-white px-2 py-0.5 text-xs font-extrabold text-muted">
                    ⏱ {s.duration}
                  </span>
                )}
                {s.severity && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                      s.severity === 'severe'
                        ? 'bg-red-100 text-red-900'
                        : s.severity === 'moderate'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-sage-100 text-sage-900'
                    }`}
                  >
                    {s.severity}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clinical Observations */}
      {summary.observations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Observations & Vitals Noted
          </span>
          <ul className="m-0 flex flex-col gap-1 p-0 pl-4 text-sm text-ink">
            {summary.observations.map((obs, idx) => (
              <li key={idx} className="font-medium">
                {obs}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Medications Discussed */}
      {summary.medicationsDiscussed.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Medications Discussed in Audio
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {summary.medicationsDiscussed.map((med, idx) => {
              const actionColors = {
                adjusted: 'bg-amber-100 text-amber-900 ring-amber-300',
                prescribed: 'bg-brand-50 text-brand-700 ring-brand-200',
                continued: 'bg-sage-100 text-sage-900 ring-sage-300',
                stopped: 'bg-red-100 text-red-900 ring-red-300',
                discussed: 'bg-cream-200 text-ink ring-cream-300',
              }[med.action]

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-cream-50 px-3.5 py-2 ring-1 ring-cream-200"
                >
                  <span className="font-bold text-ink">{med.name}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold capitalize ring-1 ${actionColors}`}
                  >
                    {med.action}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Treatment Plan & Follow-up */}
      <div className="grid gap-3 rounded-2xl bg-cream-50 p-4 text-sm sm:grid-cols-[1fr_auto]">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Agreed Plan
          </span>
          <ul className="m-0 mt-1 flex flex-col gap-1 p-0 pl-4 text-ink">
            {summary.plan.map((p, idx) => (
              <li key={idx} className="font-medium">
                {p}
              </li>
            ))}
          </ul>
        </div>
        {summary.followUp && (
          <div className="border-t border-cream-200 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Follow-up
            </span>
            <span className="block mt-1 font-bold text-sage-800">
              📅 {summary.followUp}
            </span>
          </div>
        )}
      </div>

      {/* Plain Language Patient Summary */}
      <div className="rounded-2xl bg-sage-50 p-4 ring-1 ring-sage-200">
        <div className="flex items-center gap-1.5 text-xs font-bold text-sage-900">
          <I n="speaker" size={16} /> Plain-Language Visit Summary
        </div>
        <p className="mt-1.5 mb-0 text-sm leading-relaxed text-sage-950 font-medium">
          {summary.patientSummary}
        </p>
      </div>

      {/* Collapsible Raw Transcript */}
      {showTranscript && (
        <div className="mt-2 rounded-2xl bg-cream-100 p-4 ring-1 ring-cream-300 animate-enter">
          <div className="flex items-center justify-between text-xs font-bold text-muted mb-2">
            <span className="flex items-center gap-1.5 text-brand-700">
              <I n="sparkle" size={14} /> Wispr Flow Voice Interface Transcript
            </span>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-sage-800 shadow-xs">
              Auto-edited · Medical Vocabulary
            </span>
          </div>
          <div className="rounded-xl bg-white p-3 font-mono text-xs leading-relaxed text-ink/80 whitespace-pre-wrap ring-1 ring-cream-200">
            {card.transcript}
          </div>
        </div>
      )}
    </article>
  )
}
