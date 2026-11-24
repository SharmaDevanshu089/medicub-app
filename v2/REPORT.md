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

### C. Wispr Flow STT Integration (`v2/src/ai/wispr.ts`)
- Streams audio chunks or complete consultation buffers to Wispr Flow speech-to-text API.
- Handles bilingual dialogues (English + Indian clinical terminology) gracefully.
- Includes deterministic mock fallback for offline and local testing environments.

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

### Full Test Suite (Vitest — 39/39 Tests Passing)
```
✓ v2/src/engine/rules.test.ts (8 tests)
✓ v2/src/engine/care.test.ts (7 tests)
✓ v2/src/lib/csv.test.ts (1 test)
✓ v2/src/core/actions.test.ts (6 tests)
✓ v2/src/core/consultation.test.ts (11 tests)
✓ v2/server/app.test.ts (3 tests)
✓ v2/src/lib/lib.test.ts (3 tests)

Test Files:  7 passed (7)
Tests:       39 passed (39)
Duration:    ~2.0s
```

### Production Build
```
vite v8.3.8 building client environment for production...
✓ 126 modules transformed.
dist/index.html                                   0.41 kB
dist/assets/index-BWFDJ1Pa.css                   51.13 kB
dist/assets/index-BuHOGt_f.js                   727.51 kB
✓ built in 868ms
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

# 3. Run all 39 Unit & Integration Tests
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
