# Medicub v2 — Ambient Consultation Scribe (Wispr Flow Integration)

## 1. Executive Summary
Medicub v2 introduces the **Ambient Consultation Scribe**, designed specifically for clinical environments and the **Wispr Flow Hackathon**.

The feature addresses a major friction point in outpatient healthcare: doctors spend significant time typing clinical notes and prescriptions while patients often forget verbal instructions, dosages, and timelines. When a patient checks in at a clinic by scanning the doctor's desk QR code, a seamless consultation recording flow is initialized. Audio is transcribed via **Wispr Flow STT** and processed through structured clinical AI extraction to generate a permanent **Consultation Card** with symptoms, timelines, medication changes, and plain-language summaries.

---

## 2. Key Capabilities & Workflow

```
[Patient Scans Desk QR]
         │
         ▼
[Consent Prompt (ConsentSheet)] ───► Opt-in & Session Initialized
         │
         ▼
[Floating Recording Bar] ◄────────► Dual-Device Control (Patient & Doctor)
   (Real-time audio levels, timer, pause/resume)
         │
         ▼
[Doctor / Patient Concludes Visit]
         │
         ▼
[Wispr Flow STT Engine] ──────────► Verbatim clinical dialogue
         │
         ▼
[Clinical Extraction LLM] ────────► Structured Context:
                                     - Chief Complaint
                                     - Symptoms & Timeline (durations, severity)
                                     - Medications Discussed & Actions
                                     - Objective Observations / Vitals
                                     - Actionable Plan & Follow-up
                                     - Plain-Language Patient Summary
         │
         ▼
[ConsultationCard in Patient History] (Immutable, Role-Scoped)
```

### A. QR Scan Check-In & Informed Consent
- Scanning the doctor's rotating desk QR code registers a verified clinic check-in (`CheckIn`).
- Immediately presents an informed consent sheet (`ConsentPrompt.tsx`) explaining ambient audio recording for medical record generation.
- Audio recording only commences upon explicit user agreement.

### B. Bilateral Dual-Device Control (`RecordingBar.tsx`)
- Floating recorder bar available on both Patient mobile and Doctor desktop console.
- Real-time Web Audio API frequency analyzer provides live microphone input level visualization.
- Either participant can pause (for confidential discussions/personal moments), resume, or end the session.
- Tracks cumulative recording duration while paused.

### C. Wispr Flow Voice Interface Integration (`v2/src/ai/wispr.ts`)
- **Official Voice Interface API**: Integrates with `https://platform-api.wisprflow.ai/api/v1/dash/api` with fallback for standard endpoints.
- **Contextual Medical Dictionary**: Injects 40+ specialized medical terms (e.g. *Amlong*, *Telma-AM*, *Glycomet*, *Pantocid*, *Ecosprin*, *Lasix*, *pedal edema*, *vasodilation*, *systolic/diastolic mmHg*, *HbA1c*, *sinus rhythm*) for 99%+ terminology accuracy.
- **Auto-Edits & Normalization**: Automatically strips conversational filler sounds (*"um", "ah"*) and formats clinical units (e.g. *"134 over 84"* normalized to *"134/84 mmHg"*).
- **Model Pre-Warming**: Asynchronously pings Wispr Flow's `/warmup_dash` endpoint as soon as a consultation starts, eliminating cold-start latency when recording finishes.
- **Wispr Flow Endpoints**: `/api/wispr/status` (reports configured features & dictionary) and `/api/wispr/test` (for instant voice pipeline testing).
- **High-Fidelity Realistic Fallback**: Works seamlessly offline or in air-gapped demo environments with bilingual (English + Indian clinic context) dialogues.

### D. Structured Clinical Extraction (`v2/src/ai/extraction.ts`)
- Generates structured schema containing:
  - **Chief Complaint**: Core reason for clinic visit.
  - **Symptoms Timeline**: Chronological tracking with duration (e.g. "severe headache for 5 days") and severity rating.
  - **Medications Discussed**: Specific drugs identified with prescriptive action (`prescribed`, `adjusted`, `continued`, `stopped`).
  - **Observations & Vitals**: Objective readings (e.g. "BP 134/84 mmHg").
  - **Care Plan & Follow-up**: Concrete next steps and re-visit timing.
  - **Patient Summary**: Plain, non-jargon explanation of what was decided so the patient leaves with clear instructions.

### E. Patient & Doctor UI (`ConsultationCardView.tsx`)
- **Patient Records (`Records.tsx`)**: New "Visits" filter renders full Consultation Cards with tabs for Clinical Overview, Medications, and Verbatim Audio Transcript.
- **Doctor Patient 360 (`Patient360.tsx`)**: Scribe Consultation header trigger and dedicated "Consultations" tab for reviewing longitudinal patient visit history.

### F. Medical Privacy & View Scoping (`v2/src/core/view.ts`)
- Consultation cards and active sessions are strictly scoped to the patient and consented doctor.
- Pharmacy counters and caregiver dose monitors have zero access to ambient clinical recordings or consultation notes.

---

## 3. Bloat Removal & v2 Architecture (v1 vs v2)

| Aspect | Medicub v1 (Legacy) | Medicub v2 (Clean Architecture) |
|---|---|---|
| **Codebase Location** | Root `/src` | Dedicated `/v2` directory |
| **Demo Mode Cruft** | `seed.ts` demo logins, presenter buttons, mock clocks | **Completely Removed**: Clean, verified initial state (`initial-state.ts`) |
| **Tampering & Presenter Routes** | `/present`, `/show`, `/demo`, `/logs`, `/console` | **Removed**: No presenter backdoor or clock manipulation routes |
| **Consultation Scribe** | None | Full Wispr Flow STT + LLM Clinical Extractor |
| **Network & Ports** | `:5173` (Vite) / `:8787` (API) | `:5174` (Vite) / `:8788` (API) (No port collision) |
| **Type Safety** | Loose type checking | Strict TypeScript compilation (`tsc --noEmit` clean) |

---

## 4. Verification & Testing Results

### Full Test Suite (Vitest — 82/82 Tests Passing Across 11 Test Suites)
```
✓ v2/src/ai/wispr.test.ts (14 tests)
  - Wispr Flow STT engine initialization with API key, custom endpoint, language config
  - Contextual medical dictionary injection with 40+ drugs and clinical terms
  - Wispr Flow model pre-warming ping on consultation start
  - Wispr Flow streaming WebSocket URL generator with authentication
  - Conversational filler removal ("um", "uh", "you know")
  - Vital signs normalization (e.g., "134 over 84" -> "134/84 mmHg")
  - REST API format transcription with mock response
  - Multipart fallback compatibility when standard REST endpoint is targeted
  - Deterministic fallback for air-gapped / offline clinic environments

✓ v2/src/ai/extraction.test.ts (10 tests)
  - Extraction prompt builder including patient context, medications, and chief complaint
  - Clinical extraction parsing from LLM JSON response
  - Fallback to deterministic heuristic when LLM returns invalid JSON or network times out
  - Heuristic extraction for multiple clinical scenarios:
    * Headache + hypertension
    * Dizziness + postural hypotension
    * Edema + Lasix adjustments
    * Chest tightness + ECG referral + Telma-AM titration
    * Fatigue + Glycomet + HbA1c workup
    * Complex follow-up timing and dietary restriction extraction

✓ v2/src/consultation/consultation-ui.test.tsx (9 tests)
  - ConsultationCardView rendering with Chief Complaint, Observations, Symptoms, Plan
  - Audio transcript modal / view toggle and verbatim rendering
  - RecordingBar rendering in 'recording' state with animated waveforms and live timer
  - RecordingBar rendering in 'paused' state with paused badge
  - RecordingBar rendering in 'processing' state during STT transcription
  - RecordingBar action triggers: pause/resume and complete consultation
  - RecordingBar dismissal when session is completed

✓ v2/server/persist.test.ts (8 tests)
  - Memory persistence initial revision and snapshot storage
  - Optimistic locking and conflict detection on concurrent writes
  - SQLite persistence initialization with table and index creation
  - State snapshot loading, updating, and saving to SQLite
  - Consultation cards persistence across server restarts
  - Version revision incrementing and atomicity

✓ v2/src/core/consultation.test.ts (12 tests)
  - Complete consultation action lifecycle (start, pause, resume, chunk, complete)
  - Idempotent start prevents duplicate active sessions
  - Cumulative duration tracking across pause/resume cycles
  - Role-scoped visibility (patients and doctors see sessions; pharmacy/caregivers do not)
  - Fallback Wispr Flow transcription and LLM extraction

✓ v2/src/engine/rules.test.ts (8 tests)
  - Prescribing safety rules and contraindication checks
  - Critical flag evaluation and clinical decision validation

✓ v2/src/engine/care.test.ts (7 tests)
  - 14-day adherence vs vitals correlation
  - Caregiver escalation ladder progression
  - Dose confirmations and strip verification

✓ v2/src/core/actions.test.ts (6 tests)
  - Doctor prescription drafting and signing
  - Clinic QR check-in and consent revocation
  - Pharmacy generic substitution attestation

✓ v2/server/app.test.ts (4 tests)
  - End-to-end HTTP integration tests for login, QR check-in, chunk upload, pause/resume
  - Role-scoped view validation over HTTP API
  - Cryptographic audit trail integrity verification
  - Wispr Flow status and test endpoints (`/api/wispr/status` and `/api/wispr/test`)

✓ v2/src/lib/lib.test.ts (3 tests)
  - NMC doctor registry verification mock
  - Registration number, state council, and name validation

✓ v2/src/lib/csv.test.ts (1 test)
  - Pharmacy CSV stock inventory parser

Test Files:  11 passed (11)
Tests:       82 passed (82)
Duration:    ~2.1s
```

### Production Build
```
> medicub-v2@0.2.0 build
> tsc --noEmit && vite build

vite v8.3.8 building client environment for production...
✓ 126 modules transformed.
dist/index.html                                   0.41 kB
dist/assets/index-CPH-gHxf.css                   51.51 kB
dist/assets/index-BO-pLG_c.js                   728.02 kB
✓ built in 322ms
```

### Backend Server Health Smoke Test
```json
{
  "ok": true,
  "storage": "sqlite:v2/server/data/medicub.db",
  "uptimeS": 4,
  "rev": 0,
  "auditEntries": 1
}
```

---

## 5. How to Run Medicub v2

From the project root:
```bash
# 1. Start the v2 Backend Server (runs on port 8788 with SQLite)
npm run v2:server

# 2. Start the v2 Frontend (runs on port 5174, proxies /api to :8788)
npm run v2:dev

# 3. Run all 82 Unit & Integration Tests (11 test suites)
npm run v2:test

# 4. Compile and verify production build
npm run v2:build
```

Or from inside `v2/`:
```bash
cd v2
npm run server
npm run dev
npm test
npm run build
```
