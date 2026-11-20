# Medicub — spoken script for the stage show

> Hinglish version (show + live demo + Q&A): [SCRIPT-HINGLISH.md](SCRIPT-HINGLISH.md)

Problem Statement 4: **One Patient, One Medication Record — Building Safer, Connected Care.**

How to run it: `npm run dev`, open `http://localhost:5173/show`, press **F** for full screen.
**Enter** moves to the next step, **Backspace** goes back. About **6 minutes** at a calm pace. After that, switch to the live apps (see DEMO.md).

> Tip: press Enter on the first word of each block. Each step animates for 3 to 7 seconds. Let it finish while you talk.

---

### 1 · Title  *(15 s)*
"Good morning. We picked Problem Statement 4: **one patient, one medication record.** This is Medicub: safer, connected care from the doctor, to the patient, to the pharmacy."

### 2 · The problem  *(25 s)*
"Patients with several chronic conditions see many clinicians, in different places. Each one keeps their own list. The cardiologist doesn't see the diabetologist's prescription, and the pharmacy sees neither. Records go out of date, and that's where **duplicate therapy, dosing errors and interactions** happen."

### 3 · Our answer  *(20 s)*
"So we built **one shared medication record.** Doctors, the patient and the pharmacy all read and write the same list, with brand and generic names, strength, dose and timing. Every change is recorded."

### 4 · The defining scenario  *(30 s)*
"Here is the scenario from the brief. Ramesh is 62, with diabetes and hypertension, and he sees two specialists. He already takes **Amlong 5, which is amlodipine.** Now a new prescription arrives: **Telma-AM**. It sounds different, but it also contains **amlodipine**. That's the same ingredient twice, under two brand names. And Ramesh can't remember which prescription changed last. Let's see how Medicub handles it."

### 5 · Consent  *(25 s)*
"First, the patient stays in control. At the doctor's desk, Ramesh scans the clinic QR code and holds to share. No data is copied. The scan simply grants the doctor **time-limited access**, and he can stop it at any time. Doctors can only sign in after DigiLocker identity and NMC registration checks."

### 6 · The doctor  *(40 s)*
"The doctor types the new prescription. Our rules engine immediately flags it: **HIGH, duplicate therapy, amlodipine**, with the reason in plain words. Watch the Sign button: **signing is blocked.** The system doesn't decide. It asks the prescriber: *is this combination intentional?* The doctor records a decision and a reason, and only then can she sign. Every flag stays open until a **named professional** closes it."

### 7 · Context  *(30 s)*
"Before changing a dose, a doctor should ask: is it the medicine, or the missed doses? Here are 14 days of doses beside the wearable BP estimate. Ramesh took **78%** of his doses. On days he missed one, BP averaged **143**. On full days, **130**. It's context for the doctor, clearly labelled as an estimate, not a diagnosis."

### 8 · The patient  *(25 s)*
"For Ramesh, the schedule is simple. A reminder comes on his phone and on his watch. One big button: **I've taken it.** Missed doses are logged, so the record shows what was **actually taken**. And when in doubt, the app always says: *ask your doctor or pharmacist before your next dose.* It never tells him to stop a medicine."

### 9 · Caregivers  *(30 s)*
"Many patients have limited digital literacy, so families matter. If a dose isn't marked, there's a ladder: a reminder at dose time, a second at 15 minutes, his daughter at 30 minutes, and the ASHA worker the next morning. Sunita taps **He's taken it**, and the ladder stops. Caregivers see **doses only, never medical records**, and Ramesh can pause anyone."

### 10 · The pharmacy  *(30 s)*
"At the counter, the pharmacist scans the pack. Wrong pack, wrong ingredients: **blocked.** And the pharmacy doesn't decide either. One tap sends it back to the prescriber's inbox. It even works offline and syncs later."

### 11 · Savings  *(25 s)*
"Where a cheaper equivalent exists, Medicub offers the **Jan Aushadhi generic**: same ingredients, same strength, same form, at a third of the price. That's ₹10 instead of ₹30 a strip in our demo. It's only dispensed if **the patient agrees**, and the saving is recorded."

### 12 · Easy capture  *(20 s)*
"Patients shouldn't have to type. Ramesh photographs a strip, the phone reads it, and Medicub compares it with his list. This one is **not on his list**, so it tells him: ask your doctor or pharmacist before taking it."

### 13 · Trust  *(25 s)*
"Every action, by every person, goes into a **tamper-evident chain**, using SHA-256 hashing. If someone edits even one entry, like changing this prescription, the chain breaks and shows exactly where. That's the **verification loop with an audit trail** the brief asks for."

### 14 · Every requirement, covered  *(30 s)*
"So, against the brief: a unified record, duplicate-ingredient detection, interaction checks, a smart schedule, reconciliation before signing, shared clinical access, and patient-friendly design. That's all seven. The three innovation levers are here too: easy capture, explainable ranked flags, and the verification loop. And the guardrail: Medicub **never stops, substitutes or alters a medicine.** Every flag goes to a professional."

### 15 · What's next  *(25 s)*
"We want to be honest about what's simulated. The DigiLocker and NMC checks are mock adapters, the vitals are synthetic, and our drug list is small. With funding and partners, next come **voice and SMS reminders**, **ABDM integration**, a **purpose-trained medical language model**, iOS, a national drug database and, most importantly, **clinical validation with doctors like you.**"

### 16 · Thank you  *(10 s)*
"That's Medicub: **decision support, not a decision.** It's live at medicub.vercel.app, and we'd love your questions. Let me show you the real apps."

→ Now switch to the live demo (DEMO.md, section 4).

---

## If you have only 3 minutes
Use steps **1, 4, 6, 8, 10, 14 and 16**. Skip the others with Enter, without talking over them.

## Words to avoid on stage
- "The AI decides" or "the app prescribes". Say instead: *"it flags, explains and routes to a doctor."*
- "Diagnosis". The BP view is *context, not a diagnosis.*
- "Real DigiLocker or NMC data". Say: *"mock adapters with the real flow."*
