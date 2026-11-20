# Medicub — stage demo plan

About 8 minutes of live demo, plus questions. Everything runs on **https://medicub.vercel.app** with synthetic data.

---

## 1. The night before / morning of

- [ ] Run the full check: `node scripts/e2e-demo.mjs`. It should print **21 passed, 0 failed**. It resets the demo data at the end.
- [ ] Install the APK on the demo phone (`/present` → Download APK). Open it once and sign in as **Ramesh Kumar**. Allow notifications.
- [ ] Charge everything. Bring a phone hotspot in case the venue Wi-Fi fails.
- [ ] Rehearse once with a timer, then **Reset demo data** again (`/present` → Reset demo data).

## 2. What's on which screen

| Screen | Open this | Sign in as |
|---|---|---|
| Laptop (projected) | `/present` in one tab, then the doctor app at `/doctor` | Demo admin · **Dr Meera Iyer** |
| Laptop, tab 2 | `/qr` (the rotating QR on the doctor's desk) | Dr Meera Iyer |
| Laptop, tab 3 | `/pharmacy` | Demo: Demo Pharmacy, MG Road |
| Laptop, tab 4 | `/caregiver` | Demo: **Sunita** (daughter) |
| Laptop, tab 5 | `/logs` | Demo admin |
| Demo phone | Medicub Android app | Ramesh Kumar |
| Opening / backup | `/show`: an animated 14-step walkthrough. **Enter** = next, **Backspace** = back, **F** = full screen. Works offline once loaded | — |
| Backup | `/demo` shows doctor + phone + watch side by side, if the phone fails | — |

Tip: open all the tabs and sign in **before** you walk on stage. Mirror the phone to the projector (Vysor or scrcpy), or hold it up to a document camera.

## 3. The story (say this first, 30 s)

> "Ramesh is 62, with diabetes and high blood pressure. He sees a cardiologist and a diabetologist, and neither can see the other's prescriptions. His pharmacy can't either. Medicub gives all three **one shared medication record**. The software flags and explains risks, and routes them to a named person. **It never prescribes or decides.**"

## 4. Live demo, step by step

| # | Time | Do this | Say this / what judges should notice |
|---|---|---|---|
| 1 | 45 s | **Phone:** Me → **Scan QR**, then point at the `/qr` tab on the laptop. **Press and hold** to share. (Or use **Tap a tag** for the NFC flow.) | "The patient authorises the doctor by scanning the QR on the doctor's desk. No data moves; the scan only grants access. It's time-limited and he can stop it any time." The doctor's screen shows Ramesh has arrived. |
| 2 | 60 s | **Doctor:** open Ramesh. Show **Overview** → **AI summary**: every line has a source, and it makes no decisions. Then open **Adherence & vitals**. | "Before raising a BP dose: is it the medicine, or the missed doses? He took 78% of doses. On days he missed one, his BP averaged **143**. On full days, **130**. This is context for the doctor, not a diagnosis." |
| 3 | 75 s | **Doctor → Prescribe:** add **Telma-AM 40/5** → **Sign**. It's **blocked**: a duplicate amlodipine, because he already takes Amlong 5. Open the flag, read the explanation, choose a decision, type a reason → **Sign** again. | "HIGH flags block signing until a **named doctor records a decision and a reason**. The engine is fixed rules, not AI, so every flag is explainable." |
| 4 | 45 s | **Phone:** the new medicine appears in plain language. **Presenter → Demo clock → Fire** a dose reminder. The phone (and watch) buzz → **I've taken it**. | Patient wording is always "Ask your doctor or pharmacist before your next dose." The software never tells him to stop anything. |
| 5 | 60 s | **Caregiver tab (Sunita):** an unmarked morning dose shows "Family told". Show the ladder → **He's taken it**. | "Phone and watch at dose time, a second reminder at 15 minutes, family at 30 minutes, the ASHA worker the next morning. Caregivers see **doses only, never records**, and the patient can pause any of them." *(Before 8:30 am there are no missed doses yet: use **Demo clock +1 h**.)* |
| 6 | 75 s | **Pharmacy:** **Demo: scan latest Rx QR** → pick **Telma-AM 40/5** → click the **Telma 40** demo barcode → **Check** → **BLOCKED** → **Send to prescriber**. Then scan **Telma-AM 40/5** → EXACT → **Confirm dispense**. | "Wrong pack, wrong strength: blocked, and routed back to the prescriber, never decided by the pharmacy." Say it works **offline** too: actions queue and sync later. |
| 7 | 45 s | **Pharmacy:** type **RX-1004** → Redeem → pick **Glycomet 500** → green **Jan Aushadhi** box → **Offer to patient** → Check → tick **"The patient agreed"** → attest. | "Same ingredients, strength and form, checked by the rules: ₹10 instead of ₹30 a strip, **save 67%**. Only with the patient's agreement, and the saving is recorded." |
| 8 | 30 s | **Phone:** Today → **Check a medicine strip** → photograph a strip, or type **Telma 40**. | "Not on your list: ask your doctor or pharmacist before taking it." It also recognises the same medicine under another brand. |
| 9 | 30 s | **Logs tab:** **Verify chain** → green. **Tamper (demo)** → Verify again → shows which entry was altered. | "Every action is in a hash-chained log. Any edit is detected. That matters for medico-legal trust." |
| 10 | 15 s | Back to the deck: **Roadmap** slide. | Close with what's next (section 6). |

**If you're short on time**, cut steps 8 and 9, then 4. Never cut step 3: it's the core of the pitch.

**Presenter extras (use only if there's time):**
- `/present` → **Send a notification**: every patient app gets a banner live.
- **Simulated GPS** → "Near clinic": shows the check-in prompt.
- `/onboard` → **Fill demo doctor**: shows a new doctor being verified through DigiLocker, NMC and AskMyDoc.

## 5. If something goes wrong

| Problem | Do this |
|---|---|
| Venue Wi-Fi down | Switch the laptop and phone to the hotspot. The pharmacy still works offline (show that as a feature). |
| Phone or APK misbehaves | Use `/demo` on the laptop. It has the same phone and watch, side by side with the doctor. |
| Data looks messy from a rehearsal | `/present` → **Reset demo data** (takes 2 s). |
| A flag doesn't appear | Make sure you prescribed **Telma-AM 40/5** for **Ramesh** (he already takes Amlong 5). |
| QR scan fails | Type the code printed under the QR, or tap **Tap a tag** instead. |
| Caregiver page shows "All fine" | It's before 8:30 am, or the dose was marked. Use **Demo clock +1 h** or **Fire**. |

## 6. Be upfront: what's simulated and what's not built yet

Doctors respect honesty. Say this plainly when asked, or on the roadmap slide.

**Working, but simulated in this prototype:**
- **DigiLocker, NMC and AskMyDoc checks**: mock adapters with the real flow. They need official API access.
- **AI summary**: generated from the record with sources. No language model yet.
- **NFC tag**: simulated tap in the app. Real tags need hardware at clinics.
- **Watch and vitals**: synthetic BP estimates, labelled as estimates.
- **Location / geofence**: simulated GPS.
- **Medicine catalogue and prices**: a small synthetic list. The strip reader (OCR) is real, but the catalogue is not.
- **Caregiver alerts**: in-app only, no SMS.

**Left out for now: needs funding or partners:**

| Feature | Why it's not built yet |
|---|---|
| **Voice calls and SMS reminders** (feature phones, elderly users) | Paid telecom gateway plus DLT template registration |
| **ABDM integration** (ABHA ID, linked health records, consent manager) | HFR/HPR registration, sandbox and certification |
| **Purpose-trained medical language model** for medicine matching | Data, compute and clinical validation |
| **iOS app and Apple Watch** | Apple developer program and Mac hardware |
| **Full national drug database and interaction knowledge base** | Licensing |
| **Real pharmacy inventory integration** | Partner pharmacies |
| **Indian languages** (Hindi and others) | Translation and clinical review of the wording |
| **Clinical validation** of rules and escalation timings | Partner doctors and a pilot (timings are marked CLINICIAN-REVIEW in the code) |
| **Security audit and DPDP Act compliance review** | External audit |

## 7. Likely questions from doctors

- **"Who's liable if a flag is wrong?"** The doctor decides. Medicub only flags and explains, and every decision is recorded with a name and reason. The rules are fixed and testable, not a black box.
- **"Won't this cause alert fatigue?"** Only HIGH and CRITICAL flags block signing. Lower ones inform. Rules will be tuned with clinicians in the pilot.
- **"Is the BP comparison causal?"** No. It's descriptive context from wearable estimates. The slide and the app both say "not a diagnosis".
- **"Can the pharmacist swap brands?"** Only an equivalent (same ingredients, strength and form), only with the patient's agreement, and it's recorded. Anything else is blocked and sent to the prescriber.
- **"Privacy?"** The patient grants time-limited access and can revoke it. Caregivers see doses only. Every view and action is audited.
- **"What if there's no internet?"** The pharmacy works offline and syncs later. The patient app keeps local reminders.
- **"Why not let AI decide?"** By design. In medicine, a named professional must own every decision. AI can summarise and explain, never decide.
