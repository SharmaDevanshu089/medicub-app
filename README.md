# Medicub v2 — Ambient Consultation Scribe (Wispr Flow Powered)

> [!IMPORTANT]
> **Active Product Scope (`v2/` Only):** All product features, Ambient Consultation Scribe UI, Wispr Flow integration, server APIs, and automated test suites are developed **exclusively inside the [`v2/`](./v2/) folder**. Root-level `src/` and `server/` directories are untouched legacy v1 scaffolding retained only for reference; root `package.json`, `Dockerfile`, `docker-compose.yml`, and all GitHub Actions CI/CD workflows run **`v2/`** directly.

> [!NOTE]
> **Web & Docker Showcase Preview Notice (Under Development):** The containerized web build (`docker compose up` on port `3000`) is an **interactive showcase preview** of Medicub v2. Building and bundling the full native mobile/desktop applications (Capacitor Android SDK, Wear OS companion, native hardware NFC/OCR layers, and Windows desktop packaging) requires extensive multi-platform toolchains beyond a lightweight Docker container. Native unification and additional clinical hardware integrations are actively under development and will be finalized in upcoming releases (native Android APK and Windows bundles are compiled separately via GitHub Actions).

---

## Why Medicub v2? (The Hackathon Pitch)

### The Clinical Problem
- **Doctors lose up to 40% of consultation time** typing EHR notes and clicking drop-downs instead of maintaining eye contact during 4–7 minute outpatient visits.
- **Patients forget 40%–80% of verbal medical instructions** the moment they walk out of the clinic—and nearly half of what they recall is inaccurate, driving non-adherence and preventable readmissions.
- **Follow-up clinicians restart from scratch** because symptom onset timelines, subtle side-effect discussions, and drug titration reasons are lost between visits.

### The Voice-First Solution (`v2/`)
Medicub v2 embeds **Wispr Flow's Voice Interface API** directly at the clinical point of care:
1. **Rotating Desk QR Check-In:** The patient scans the doctor's rotating 3-minute clinic QR (`ScanSheet.tsx`), verifying physical arrival.
2. **Bilateral Informed Consent (`ConsentPrompt.tsx`):** Zero audio is captured until the patient opts in. Wispr Flow asynchronously pings `/warmup_dash` to eliminate cold-start latency.
3. **Dual-Device Recording Bar (`RecordingBar.tsx`):** A floating recorder syncs live across both the **Patient Mobile App** and **Doctor Console** with real-time Web Audio `AnalyserNode` waveforms and shared **Pause / Resume / Stop** controls for private moments.
4. **Wispr Flow Medical STT (`v2/src/ai/wispr.ts`):** Injects a curated **40+ term regional drug & pathology dictionary** (*Amlong*, *Telma-AM*, *Glycomet*, *Pantocid*, *Ecosprin*, *Lasix*, *pedal edema*, *HbA1c*), supports **bilingual English + Hindi/Hinglish (`['en', 'hi']`)**, strips conversational fillers (`"um"`, `"uh"`), and normalizes spoken vitals (`"134 over 84"` → **`134/84 mmHg`**).
5. **Immutable 4-Tab Consultation Card (`ConsultationCardView.tsx`):** Extracts Chief Complaint, chronological Symptoms Timeline with severity, Medication Actions (`prescribed`, `adjusted`, `continued`, `stopped`), Care Plan, Verbatim Transcript, and a **jargon-free Plain-Language Patient Summary**.
6. **Clinical Safety & Zero Leakage (`viewFor` + SHA-256 Audit Chain):** Transcripts and Consultation Cards are strictly scoped to the patient and consented doctor—never exposed to pharmacy counters or caregiver dose monitors—and every access is stamped into a SHA-256 hash chain.

---

## Quick Start (One Command via Docker — No `.env` or Secret Keys Required)

```bash
docker compose up --build
```

Then open **http://localhost:3000** in your browser.
- **Works out of the box with zero API keys:** Medicub boots cleanly without any `.env` file or OpenAI/Wispr secret keys, displaying a clear status notice (`"Wispr Flow / AI API key not set — running in built-in offline clinical fallback mode"`) while every clinical consultation workflow remains interactive.
- Optional configuration variables are documented in [`.env.example`](./.env.example).

### Showcase URLs (Once Running on Port `3000`)
| Experience | URL | Sign-In |
|---|---|---|
| **Main Showcase Launcher** | `http://localhost:3000/` | Entry hub & API key status |
| **Patient Mobile App** | `http://localhost:3000/patient` | One-tap **Continue as Ramesh Kumar** (`+91 98450 00001`) |
| **Doctor Desktop Console** | `http://localhost:3000/doctor` | One-tap **Dr Meera Iyer** (`Cardiology`) |
| **Clinic Desk QR Display** | `http://localhost:3000/qr` | Rotating 3-min desk QR for patient check-in |
| **Pharmacy / Caregiver / Dept** | `/pharmacy`, `/caregiver`, `/department` | Demonstrates strict transcript & card isolation |
| **API Health & Wispr Status** | `/api/health`, `/api/wispr/status` | Live diagnostics & dictionary inspection |

---

## Verified Engineering & Testing

All checks target **`v2/`** exclusively:

```bash
# 1. Run all 83 unit, React SSR & HTTP integration tests (11 suites)
npm test

# 2. Typecheck & build Medicub v2 production bundle
npm run build

# 3. Run live Docker / server E2E smoke suite against http://localhost:3000
npm run docker:smoke
```

| Verification Metric | Result |
|---|---|
| **Unit, UI & Server Integration Tests** | **83 / 83 passed** across 11 Vitest suites (`~2.0s`) |
| **TypeScript Strict Compilation (`tsc --noEmit`)** | **0 errors** |
| **Production Vite Build (`v2/dist/`)** | Built in **~310ms** |
| **Docker Compose E2E Smoke Suite** | Verified on every GitHub push & PR ([`checks.yml`](./.github/workflows/checks.yml)) |

---

## Repository Layout (`v2/` is the Product)

```text
medicub-app/
├── v2/                        # <-- ACTIVE PRODUCT (Everything developed lives here)
│   ├── src/
│   │   ├── ai/                # Wispr Flow Voice Interface adapter & Clinical LLM extractor
│   │   ├── consultation/      # ConsentPrompt, RecordingBar, useRecorder, ConsultationCardView
│   │   ├── core/              # Action state machine, strict role-scoped viewFor, validation
│   │   ├── doctor/            # Patient360, 14-day adherence vs BP chart, Prescribe, FlagCard
│   │   ├── patient/           # Today, Records (Visits), ScanSheet QR, StripSheet, Me
│   │   └── screens/           # Launcher, Doctor, Patient, ClinicQr, Caregiver, Pharmacy, etc.
│   ├── server/                # Node.js HTTP API + Static SPA serving + SQLite persistence
│   └── package.json
├── Dockerfile                 # Multi-stage Docker build strictly for v2/ (port 3000)
├── docker-compose.yml         # One-command showcase startup (ports: 3000:3000)
├── .env.example               # Placeholder env vars (optional; runs without .env)
├── scripts/
│   ├── docker-smoke-test.mjs  # Automated Docker E2E test suite
│   └── package-windows.mjs    # Portable Windows v2 packager
└── .github/workflows/         # Automated CI checks, Docker E2E, Android APK & Windows builds
```

For deep architecture notes, benchmarks, and deployment details, see [**`v2/REPORT.md`**](./v2/REPORT.md).
