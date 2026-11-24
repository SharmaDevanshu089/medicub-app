import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import Caregiver from './screens/Caregiver'
import ClinicQr from './screens/ClinicQr'
import Department from './screens/Department'
import Doctor from './screens/Doctor'
import Launcher from './screens/Launcher'
import Onboard from './screens/Onboard'
import Patient from './screens/Patient'
import Pharmacy from './screens/Pharmacy'
import Watch from './screens/Watch'
import { initClient, type AppName } from './store/store'
import { ErrorBoundary, installGlobalErrorHandlers, Toaster } from './ui/AppFrame'

type Page = () => React.JSX.Element | null

const ROUTES: Record<string, [Page, AppName | null]> = {
  '/doctor': [Doctor, 'doctor'],
  '/onboard': [Onboard, 'doctor'],
  '/patient': [Patient, 'patient'],
  '/watch': [Watch, 'patient'],
  '/pharmacy': [Pharmacy, 'pharmacy'],
  '/department': [Department, 'department'],
  '/qr': [ClinicQr, 'doctor'],
  '/caregiver': [Caregiver, 'caregiver'],
}

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
