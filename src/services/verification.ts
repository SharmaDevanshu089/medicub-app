// Doctor onboarding verification adapters — ALL MOCKED for the prototype.
//
// Real integration must run on a backend (secrets never ship to the browser):
// - DigiLocker: OAuth 2.0 authorization-code + PKCE "requester" flow via API Setu. Needs partner
//   registration/approval and a client id/secret. Returns the doctor's identity from issued documents.
// - NMC: registration lookup against the Indian Medical Register / a State Medical Council
//   (directly or through a licensed verification vendor).
// - AskMyDoc: no public API documentation was found. The contract below is a placeholder until
//   the endpoint, auth and response format are supplied.
// Swap each function body for a call to your backend; keep the CheckResult shape.

export type CheckSource = 'DigiLocker' | 'NMC registry' | 'AskMyDoc'

export interface CheckResult {
  source: CheckSource
  status: 'pass' | 'fail'
  detail: string
  mock: true
}

export interface NmcRecord {
  regNo: string
  council: string
  name: string
  qualification: string
  year: number
}

// Synthetic register used by the mock. Not real doctors.
const MOCK_REGISTER: NmcRecord[] = [
  { regNo: 'KMC-2009-31415', council: 'Karnataka Medical Council', name: 'Meera Iyer', qualification: 'MBBS, MD, DM (Cardiology)', year: 2009 },
  { regNo: 'KMC-2011-27182', council: 'Karnataka Medical Council', name: 'Arjun Rao', qualification: 'MBBS, MD (Medicine)', year: 2011 },
  { regNo: 'KMC-2015-55821', council: 'Karnataka Medical Council', name: 'Kavya Nair', qualification: 'MBBS, MD (General Medicine)', year: 2015 },
]

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Name comparison tolerant of titles, case, punctuation and extra spaces. */
export function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\b(dr|doctor)\b\.?/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).join(' ')
  return norm(a) !== '' && norm(a) === norm(b)
}

/** Mock: DigiLocker consent → name on the government ID. Needs an uploaded ID document. */
export async function digilockerVerifyIdentity(input: { typedName: string; idFileName?: string }): Promise<CheckResult & { nameOnId?: string }> {
  await wait(600)
  if (!input.idFileName) return { source: 'DigiLocker', status: 'fail', detail: 'No ID document uploaded', mock: true }
  // Mock returns the typed name as if read from the issued document.
  const nameOnId = input.typedName.replace(/^dr\.?\s+/i, '').trim()
  return { source: 'DigiLocker', status: 'pass', detail: `Consent granted (simulated). Name on ID: ${nameOnId}`, nameOnId, mock: true }
}

/** Mock: look up registration number and match the name from DigiLocker. */
export async function nmcLookup(regNo: string, council: string, nameOnId: string): Promise<CheckResult & { record?: NmcRecord }> {
  await wait(600)
  const record = MOCK_REGISTER.find((r) => r.regNo.toLowerCase() === regNo.trim().toLowerCase())
  if (!record) return { source: 'NMC registry', status: 'fail', detail: `Registration ${regNo || '(blank)'} not found`, mock: true }
  if (record.council !== council) return { source: 'NMC registry', status: 'fail', detail: `Registered with ${record.council}, not ${council}`, record, mock: true }
  if (!namesMatch(record.name, nameOnId)) return { source: 'NMC registry', status: 'fail', detail: `Register name “${record.name}” does not match ID name “${nameOnId}”`, record, mock: true }
  return { source: 'NMC registry', status: 'pass', detail: `${record.name} · ${record.qualification} · ${record.council} since ${record.year}`, record, mock: true }
}

/** Mock placeholder for AskMyDoc cross-verification. */
export async function askMyDocVerify(regNo: string, name: string): Promise<CheckResult> {
  await wait(500)
  const known = MOCK_REGISTER.some((r) => r.regNo.toLowerCase() === regNo.trim().toLowerCase() && namesMatch(r.name, name))
  return known
    ? { source: 'AskMyDoc', status: 'pass', detail: 'Cross-check matched (mock adapter — real API contract not yet provided)', mock: true }
    : { source: 'AskMyDoc', status: 'fail', detail: 'No matching record (mock adapter)', mock: true }
}

export const COUNCILS = ['Karnataka Medical Council', 'Maharashtra Medical Council', 'Delhi Medical Council', 'Tamil Nadu Medical Council', 'Kerala Medical Council']
