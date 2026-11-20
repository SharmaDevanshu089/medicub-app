import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Console from './screens/Console'
import Demo from './screens/Demo'
import Department from './screens/Department'
import Doctor from './screens/Doctor'
import Caregiver from './screens/Caregiver'
import ClinicQr from './screens/ClinicQr'
import Launcher from './screens/Launcher'
import Logs from './screens/Logs'
import Onboard from './screens/Onboard'
import Patient from './screens/Patient'
import Pharmacy from './screens/Pharmacy'
import Present from './screens/Present'
import Watch from './screens/Watch'
import { initClient, type AppName } from './store/store'
import { ErrorBoundary, installGlobalErrorHandlers, Toaster } from './ui/AppFrame'

type Page = () => React.JSX.Element | null
// Each route is one app signed in as one role. Phone and watch share the patient sign-in.
const ROUTES: Record<string, [Page, AppName | null]> = {
  '/doctor': [Doctor, 'doctor'],
  '/onboard': [Onboard, 'doctor'],
  '/patient': [Patient, 'patient'],
  '/watch': [Watch, 'patient'],
  '/pharmacy': [Pharmacy, 'pharmacy'],
  '/department': [Department, 'department'],
  '/console': [Console, 'admin'],
  '/present': [Present, 'admin'],
  '/logs': [Logs, 'admin'],
  '/qr': [ClinicQr, 'doctor'],
  '/caregiver': [Caregiver, 'caregiver'],
  '/demo': [Demo, null],
}
// The Android build ships only the patient app (VITE_APP=patient).
const forced = import.meta.env.VITE_APP as string | undefined
const path = forced === 'patient' ? '/patient' : location.pathname.replace(/\/$/, '')
const [Page, app] = ROUTES[path] ?? [Launcher, null]

installGlobalErrorHandlers()
if (app) initClient(app)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary name={path || '/'}>
      <Page />
    </ErrorBoundary>
    <Toaster />
  </StrictMode>,
)
