import { Card, Footer } from '../ui/kit'
import { I } from '../ui/icons'

const APPS = [
  { href: '/doctor', title: 'Doctor Console', sub: 'Patient 360, safety rules, interactive consultation recording & notes', badge: 'Ambient Scribe' },
  { href: '/patient', title: 'Patient Mobile App', sub: 'Medication schedule, clinic check-in via QR, strip check, consultation consent & controls', badge: 'Client App' },
  { href: '/qr', title: 'Clinic Desk QR', sub: 'Rotating QR code on doctor’s desk for instant check-in & audio scribe consent', badge: 'Clinic Terminal' },
  { href: '/caregiver', title: 'Caregiver Portal', sub: 'Daughter / ASHA escalation ladder for missed doses', badge: 'Care Team' },
  { href: '/pharmacy', title: 'Pharmacy Panel', sub: 'Prescription redemption, barcode verification, Jan Aushadhi substitution', badge: 'Dispensary' },
  { href: '/department', title: 'Department Desk', sub: 'Hospital departments (Radiology, Pathology) upload reports and notes', badge: 'Clinical' },
  { href: '/onboard', title: 'Doctor Onboarding', sub: 'DigiLocker, NMC Registry & AskMyDoc identity verification', badge: 'Verification' },
  { href: '/watch', title: 'Smartwatch Companion', sub: 'Dose countdown and wearable pulse check', badge: 'Wearable' },
]

export default function Launcher() {
  return (
    <div className="mx-auto max-w-4xl p-6 text-[17px]" style={{ fontFamily: 'var(--font-app)' }}>
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
          <I n="sparkle" size={16} /> Medicub v2 · Wispr Flow Hackathon
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-ink">
          Medicub <span className="text-brand-600">Ambient Scribe</span>
        </h1>
        <p className="mt-1 text-lg leading-relaxed text-muted">
          A tamper-evident, multi-role clinical platform for India. Now featuring an{' '}
          <b>Ambient Consultation Scribe</b>: scan doctor’s desk QR to check in, start hands-free
          audio recording on mobile or desktop, transcribe with <b>Wispr Flow</b>, and compile
          structured consultation notes into the shared record.
        </p>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {APPS.map((item) => (
          <a key={item.href} href={item.href} className="group transition-transform hover:-translate-y-0.5">
            <Card className="h-full border border-cream-200 bg-white p-5 shadow-sm transition-all group-hover:shadow-md group-hover:ring-2 group-hover:ring-sage-700">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-bold text-muted">
                  {item.badge}
                </span>
                <span className="font-mono text-xs font-semibold text-subtle">{item.href}</span>
              </div>
              <h2 className="mt-2 text-xl font-extrabold text-ink">{item.title}</h2>
              <p className="mt-1 text-sm leading-normal text-muted">{item.sub}</p>
            </Card>
          </a>
        ))}
      </div>

      <Footer />
    </div>
  )
}
