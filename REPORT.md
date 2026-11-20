# Medicub — overnight progress report (20 Nov 2026)

Work stopped at ~03:20 IST because the usage limit was reached. All code typechecks and all 25 tests pass.
**Not yet run together in the browser** (server + new clients) — that is the first thing to do.

## How to run
```
npm install
npm run server      # API on :8787 (SQLite at server/data/medicub.db)
npm run dev         # apps on :5173, /api is proxied to the server
npm test
```
Demo sign-ins: doctor "Sign in as Dr Meera Iyer"; patient "Continue as Ramesh Kumar" (+91 98450 00001);
pharmacy PH-DEMO-01 / 4321; console admin key `medicub-admin-demo`; department any name.

## What's new tonight
**Real backend** (`server/`, Node built-ins only + `tsx`)
- SQLite persistence (state, append-only audit table, logs, sessions) via `node:sqlite`.
- Sign-in per role (doctor / patient / pharmacy / department / admin), bearer tokens, sessions survive restarts.
- Live updates over a streaming response; each app receives **only its role's view** (`src/core/view.ts`):
  pharmacy never sees medical history, patients see only their own record, doctors only patients they can access.
- Every write is a validated, permission-checked action (`src/core/actions.ts`), run one at a time.
- **Safety rules now enforced on the server**: signing refused while a HIGH/CRITICAL flag is undecided; only the
  flag owner can decide, reason required; NFC consent / check-in / accepting a doctor require being inside that
  clinic's geofence; blocked substitutions cannot be attested; doctor verification runs server-side.
- **Audit for everything**: actions, logins, failed logins, logouts, record views, denied access, pharmacy
  online/offline, onboarding failures — SHA-256 hash chain, now also stamped with the patient it concerns.
  `/api/audit/verify` checks what is actually stored in the database.
- **Logs**: structured JSON lines (stdout + SQLite), request ids on every error, client crashes reported to
  `/api/client-log`. Rate limits on login, onboarding, actions and client logs.

**Clients**
- New client store (`src/store/store.ts`): sign-in, auto-reconnect with backoff, "reconnecting" banner that keeps
  last data, friendly error toasts for every failure, error boundary per app.
- **Pharmacy web panel** rebuilt (sign-in, redeem → scan → verdict → attest/send, inventory + CSV file import,
  escalations with doctor decisions). Offline mode: checks run on the device, work is queued on the device and
  synced automatically on reconnect; prescriptions opened earlier stay usable offline.
- Patient phone + watch: phone-number sign-in; watch pairs with the phone account.
- Doctor: sign-in via server; draft checks run on the server; record openings audited.
- Department desk and doctor onboarding (4-step wizard) rebuilt in the new design.
- Ops console: server health, counts, audit log, verify/tamper, live server logs with level filter.

## Version control & deploys
- Code: private GitHub repo **https://github.com/SharmaDevanshu089/medicub-app** (branch `main`), owned by the same
  person as the Vercel account. (A first copy also exists at github.com/SEARIG/medicub, git remote `searig`.)
  The older public repo SharmaDevanshu089/medicub is a different codebase and was left untouched.
- Vercel's Git integration is connected: **every push to `main` deploys to https://medicub.vercel.app**, other
  branches and pull requests get preview URLs. No manual deploys.
- GitHub Actions (`.github/workflows/checks.yml`) runs install → typecheck → tests on every push and pull request.
- Workflow: change code → `git commit` → `git push` → Vercel builds and goes live in about a minute.

## Live deployment (20 Nov, ~09:15)
- **https://medicub.vercel.app** — Vercel project `medicub` on account sharmadevanshu089-5884 (Hobby), functions in Mumbai (bom1).
  Apps: `/doctor`, `/onboard`, `/patient`, `/watch`, `/pharmacy`, `/department`, `/console`; API under `/api`.
- Data: private Vercel Blob store `medicub-data` (one JSON snapshot, conditional writes with retry/backoff).
  Tested: 6 simultaneous sign-ins + actions, nothing lost, audit chain verifies.
- Live updates are polling (every 2 s, immediately after your own action), since serverless can't hold connections.
- Redeploy: `npx vercel deploy --prod --yes` (CLI is signed in on this PC; build = `npm run build:vercel`).
- Local dev (`npm run dev`) now talks to the live server by default; `MEDICUB_API=http://localhost:8787 npm run dev`
  together with `npm run server` uses a local SQLite server instead.
- Logs: `npx vercel logs medicub.vercel.app` (JSON lines), plus the ops console's recent-log view (per instance).

## Presenter page (20 Nov, ~09:20) — https://medicub.vercel.app/present (Demo admin)
- Send a notification (title, message, Info/Important, all patients or one) with ready-made templates and a live preview.
  Patient apps show it as a banner ("Got it" / read aloud); the Android app also posts a system notification.
  The page shows "Read x/y" per notification. Due doses also become Android notifications.
- Demo controls: demo clock (−1 h / +15 min / +1 h / real), fire any of Ramesh's doses, move Ramesh's phone (home or any
  clinic → check-in, NFC, "new doctor" prompt), open-app links, live activity feed, full screen, reset, and a QR code to
  install the APK (served at /medicub-patient.apk).
- Limit: no Firebase push yet, so a fully closed Android app gets notifications when it is next opened.

## Clinic QR + Logs (20 Nov, ~09:35)
- **Clinic QR** https://medicub.vercel.app/qr (doctor sign-in): a screen for the doctor's desk. Shows a QR that rotates
  every 3 min (valid 4 min) plus the typed code. Patient: Share/Me → "Scan QR" (in-app camera, or type the code, or
  scan with the phone camera → opens /patient?scan=…) → sees the verified doctor → press and hold to share → the
  doctor gets 8 h access and a "Scanned your QR" arrival. Replaces the old "patient shows a QR" flow.
- **Logs** https://medicub.vercel.app/logs (Demo admin): full audit trail with search, category and patient filters,
  expandable rows (hash chain), Verify chain, CSV/JSON export; plus live server logs with level filter and search.
- Android app needs the camera permission for scanning (added; the app asks on first scan).

## Android patient app (rebuilt 20 Nov, 09:02 — talks to https://medicub.vercel.app)
- APK: `medicub-patient-debug.apk` (project root; also `android/app/build/outputs/apk/debug/app-debug.apk`), debug-signed.
- Capacitor 8 wraps a patient-only build (`.env.patient`: `VITE_APP=patient`), full-screen with no mock bezel.
- The app talks to `VITE_API_URL` in `.env.patient` = `https://medicub.vercel.app`, so any phone with internet works
  (no PC, no Wi-Fi setup).
- Rebuild after changing the URL or any patient code: `npm run android:apk` (build → `cap sync` → Gradle).
- Install: copy the APK to the phone and open it (allow "install unknown apps"), or `adb install -r medicub-patient-debug.apk`.
- Not in the APK yet: real NFC reading (tap is simulated), native push notifications, Wear OS watch app, release signing.

## Four new features (20 Nov, ~10:30)
- **Adherence vs vitals (doctor)** — Patient → "Adherence & vitals": a 14-day dose grid (taken / missed / skipped / not yet due, with a dot when a caregiver confirmed it) lined up with the wearable BP estimate. Days with a missed dose are shaded, and one plain sentence compares the average BP on those days with fully-taken days. It only describes; it never says whether the medicine works. A "% doses taken" chip also shows on Overview.
- **Caregiver escalation ladder** — https://medicub.vercel.app/caregiver (demo: Sunita, daughter, +919845000002; Anita Devi, ASHA, +919845000003). The steps: phone and watch at dose time → a second reminder after 15 min → family after 30 min → the ASHA worker the next morning at 09:00. "He's taken it" records the dose (with the caregiver's name, audited); "I'll handle it" / "I'll visit" stops the ladder. The patient can turn each caregiver on or off in Me. Caregivers see doses only, never records. The timings are marked CLINICIAN-REVIEW in `src/engine/care.ts`.
- **Jan Aushadhi generic at the pharmacy** — after redeeming, the selected line shows the cheapest same-ingredient/strength/form option and the saving (demo prices). "Offer to patient" fills the scan; the substitution check still runs. Attesting an EQUIVALENT now **requires** the "patient agreed" tick (the server rejects it otherwise). The saving is recorded and shown on the patient's Me screen.
- **Strip photo check (patient)** — Today / Me → "Check a medicine strip": a photo is read on the phone (tesseract.js, loaded only when used; it needs internet the first time), or the patient types the name. The server compares it with the patient's list: *this is your X* / *same medicine as your X* / *not on your list → Ask your doctor or pharmacist before taking it* / *couldn't read*.
- Tests: 40 passing (new `src/engine/care.test.ts`, plus action tests for caregivers, savings and strip checks).

## Not done (next steps, in order)
1. Run server + apps together and click through every flow; fix whatever breaks.
2. **Android app**: Android SDK + Java 21 are installed; plan is Capacitor wrapping the patient build
   (`VITE_APP=patient`, `VITE_API_URL=http://10.0.2.2:8787` for the emulator) — not started.
3. Patient "Me" sign-out button; remove remaining old `ui/kit` styles.
4. Production gaps (documented, intentionally not built): real OTP/SSO auth, real DigiLocker / NMC / AskMyDoc
   (need partner credentials; AskMyDoc has no public API), department access scoped to a care team, per-pharmacy
   scoping, image storage outside the database, HTTPS.
