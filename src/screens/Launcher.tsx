import { Card, Footer } from '../ui/kit'

const LINKS = [
  ['/doctor', 'Doctor', 'Web app — sign in, Patient 360, composer, flag inbox'],
  ['/pharmacy', 'Pharmacy', 'Web app — inventory, redeem, scan & attest, offline mode'],
  ['/caregiver', 'Caregiver', 'Family & ASHA worker — missed-dose alerts, confirm or call'],
  ['/patient', 'Patient phone', 'Mobile app in a 390×844 frame — geofence, records, reminders'],
  ['/watch', 'Patient watch', 'Round 396×396 watch face'],
  ['/present', 'Presenter', 'Send notifications to patient apps; demo clock, location, reset, install QR'],
  ['/qr', 'Clinic QR', 'Doctor’s desk screen: patients scan it to share their record'],
  ['/logs', 'Logs', 'Full audit trail (search, filter, verify, export) and server logs'],
  ['/console', 'Server console', 'Health, audit log, verify / tamper, reset'],
  ['/onboard', 'Doctor onboarding', 'ID upload, DigiLocker + NMC + AskMyDoc verification (mock)'],
  ['/department', 'Department desk', 'Radiology, pathology, nursing… add reports, X-rays, notes'],
] as const

export default function Launcher() {
  return (
    <div className="mx-auto max-w-3xl p-6 text-[17px]">
      <h1 className="text-4xl font-black text-brand-600">Medicub</h1>
      <p className="mt-2 text-lg text-slate-700">One record — medicines, reports, X-rays and notes — that follows the patient across doctors, departments and pharmacy. Rules flag, explain and route to a named human. Software and AI never prescribe, stop, substitute or decide.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="/demo" className="rounded-lg bg-accent-600 px-4 py-2 text-lg font-semibold text-white hover:bg-accent-700">Open demo layout</a>
        <a href="/console" className="rounded-lg px-4 py-2 font-semibold ring-1 ring-slate-300">Reset demo (console)</a>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {LINKS.map(([href, title, sub]) => (
          <a key={href} href={href} target="_blank" rel="noreferrer">
            <Card className="h-full hover:ring-accent-600">
              <h2 className="text-xl font-bold">{title} <span className="font-mono text-sm text-slate-500">{href}</span></h2>
              <p className="text-slate-600">{sub}</p>
            </Card>
          </a>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-600">Each link opens a new window. All windows share live state (localStorage + BroadcastChannel). Long-press the phone header to open the demo clock.</p>
      <Footer />
    </div>
  )
}
