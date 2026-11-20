import type { DecisionKind } from '../store/types'

/** Patient-facing status for a flag. Never tells the patient to stop a medicine. */
export const statusText: Record<'open' | DecisionKind, string> = {
  open: 'Doctor is reviewing',
  intentional: 'Doctor confirmed this is intended',
  'change-planned': 'Doctor is planning a change',
  dismissed: 'Doctor reviewed — no change',
  approved: "Doctor approved the pharmacy's request",
  rejected: 'Doctor declined the substitution',
}
