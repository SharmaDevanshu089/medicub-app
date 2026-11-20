# Medicub — Stage script (Hinglish)

**Problem Statement 4: One Patient, One Medication Record.**

The slides stay in English (the judges read them). You **speak** in simple Hinglish.
Medical words (duplicate, prescription, interaction, audit) stay in English, because doctors use them anyway.

**Setup:** `npm run dev` → `http://localhost:5173/show` → press **F** for full screen.
**Enter** = next slide, **Backspace** = previous slide.
Total: the show takes about **6 min**, then the live demo about **5 min**, then Q&A.

> Tip: say the first word as you press Enter. Let each slide's animation finish while you speak, don't rush.

---

## Part 1 — Show slides (`/show`)

### 1 · Title *(15 sec)*
"Good morning sabko. Humne **Problem Statement 4** choose kiya hai: *one patient, one medication record.* Ye hai **Medicub**. Doctor se patient tak, aur patient se pharmacy tak, ek safe aur connected system."

### 2 · Problem *(25 sec)*
"Socho ek patient ko diabetes bhi hai aur BP bhi. Wo do-teen doctors ke paas jaata hai, alag-alag jagah. Har doctor ki apni list hai. Cardiologist ko nahi pata diabetologist ne kya likha, aur pharmacy ko dono ka nahi pata. List purani ho jaati hai, aur yahin se **duplicate dawai, galat dose aur interactions** ka risk aata hai."

### 3 · Our answer *(20 sec)*
"Isliye humne banaya **ek shared medication record.** Doctor, patient aur pharmacy, teeno same list dekhte hain aur update karte hain. Brand naam, generic naam, strength, dose, timing, sab ek jagah. Aur har change record hota hai."

### 4 · Consent *(25 sec)*
"Sabse pehle, control patient ke haath mein hai. Doctor ki table pe ek QR code hai. Ramesh ji phone se scan karte hain aur *hold to share* dabate hain. Data copy nahi hota. Bas doctor ko **kuch ghanton ka access** milta hai, aur Ramesh ji jab chahein band kar sakte hain. Aur doctor tabhi login kar sakta hai jab DigiLocker aur NMC se verify ho."

### 5 · Doctor *(40 sec)* — sabse important slide
"Doctor nayi prescription type karti hain, Telma-AM. Turant flag aata hai: **HIGH, duplicate therapy, amlodipine**, aur reason simple bhasha mein likha hai. Ab Sign button dekhiye: **sign block ho gaya.** System khud decide nahi karta. Wo doctor se poochta hai: *kya ye combination jaan-boojh kar diya hai?* Doctor apna decision aur reason likhti hain, tabhi sign hota hai. Jab tak ek **named doctor** decide nahi karta, flag open rehta hai."

### 6 · Context *(30 sec)*
"Dose badhane se pehle doctor ko sochna chahiye: dawai kaam nahi kar rahi, ya patient dawai miss kar raha hai? Yahan 14 din ki doses hain, saath mein watch ka BP estimate. Ramesh ji ne **78%** doses li. Jis din dose miss hui, BP average **143** tha. Jis din saari doses li, **130.** Ye sirf context hai doctor ke liye. Ye estimate hai, diagnosis nahi."

### 7 · Patient *(25 sec)*
"Ramesh ji ke liye sab simple hai. Phone pe aur watch pe reminder aata hai. Ek bada button: **I've taken it.** Miss hui dose bhi record hoti hai, toh pata rehta hai ki actually kya liya gaya. Aur doubt ho toh app hamesha kehta hai: *agli dose se pehle doctor ya pharmacist se poochiye.* App kabhi nahi kehta ki dawai band karo."

### 8 · Caregivers *(30 sec)*
"Bahut patients phone theek se use nahi kar paate, toh family important hai. Agar dose mark nahi hui toh ek ladder chalti hai. Dose time pe reminder, 15 minute baad doosra reminder, 30 minute baad beti Sunita ko alert, aur agli subah ASHA worker ko. Sunita ne confirm kiya, *He's taken it*, aur alerts ruk gaye. Caregiver ko sirf doses dikhti hain, **medical record nahi.** Aur Ramesh ji kisi ko bhi pause kar sakte hain."

### 9 · Pharmacy *(30 sec)*
"Ab pharmacy counter. Pharmacist pack scan karta hai. Galat pack, ingredient match nahi kiya: **BLOCKED.** Pharmacy bhi khud decide nahi karti. Ek click mein case wapas prescriber ke inbox mein chala jaata hai. Aur internet na ho tab bhi chalta hai, baad mein sync ho jaata hai."

### 10 · Savings *(25 sec)*
"Jahan sasta equivalent available hai, Medicub **Jan Aushadhi generic** suggest karta hai. Same ingredient, same strength, same form, aur price ek-tihaai. Demo mein ₹30 ki jagah ₹10 ki strip. Lekin dawai tabhi badalti hai jab **patient haan bole**, aur saving record hoti hai."

### 11 · Easy capture *(20 sec)*
"Patient ko type karna na pade. Ramesh ji strip ki photo lete hain, phone padh leta hai aur list se match karta hai. Ye strip unki list mein **nahi hai**, toh app kehta hai: *lene se pehle doctor ya pharmacist se poochiye.*"

### 12 · Trust *(25 sec)*
"Har action, har insaan ka, ek **tamper-proof chain** mein jaata hai, SHA-256 hashing se. Agar koi ek bhi entry badle, jaise ye prescription, toh chain wahin toot jaati hai aur dikh jaata hai ki kahan gadbad hui. Brief mein jo *verification loop with audit trail* maanga tha, wo yahi hai."

### 13 · Every requirement *(30 sec)*
"Toh brief ke against dekhein: unified record, duplicate-ingredient detection, interaction checks, smart schedule, sign se pehle reconciliation, shared access, aur patient-friendly design. **Saaton** cover hain. Teeno innovation levers bhi hain: photo se capture, explainable ranked flags, aur audit trail ke saath verification loop. Aur safety guardrail: Medicub **kabhi dawai band, change ya substitute nahi karta.** Har flag ek professional ke paas jaata hai."

### 14 · What's next *(25 sec)*
"Hum honest rehna chahte hain. Prototype mein kuch cheezein simulated hain: DigiLocker aur NMC checks mock hain, vitals synthetic hain, aur drug list chhoti hai. Funding aur partners ke saath agla step hai: **voice call aur SMS reminders**, **ABDM integration**, ek **medical language model**, iOS app, national drug database, aur sabse zaroori, **aap jaise doctors ke saath clinical validation.**"

### 15 · Thank you *(10 sec)*
"Yahi hai Medicub: **decision support, not a decision.** Ye live hai medicub.vercel.app pe. Live demo se pehle, ek aakhri slide: brief ka scenario."

### 16 · Defining scenario *(30 sec)*
"Ye brief ka hi scenario hai. Ramesh ji, 62 saal, diabetes aur hypertension. Do specialists ko dikhate hain. Wo pehle se **Amlong 5** le rahe hain, jo hai **amlodipine**. Ab ek nayi prescription aati hai: **Telma-AM**. Naam alag hai, lekin isme bhi **amlodipine** hai. Matlab same dawai, do brand naam se, double dose ka risk. Aur Ramesh ji ko yaad bhi nahi ki last prescription kisne badli. Ab yahi scenario main aapko live app mein dikhata hoon."

**3 minute mein khatam karna ho:** sirf slides **1, 5, 7, 9, 13, 15, 16** bolo. Baaki pe chupchaap Enter dabao.

---

## Part 2 — Live demo (real apps, about 5 min)

Pehle se taiyaar rakho (DEMO.md, sections 1-2): tabs open, sab logged in, data reset.

| # | Kya karna hai | Kya bolna hai |
|---|---|---|
| 1 | **Phone:** Me → Scan QR → laptop pe `/qr` tab scan karo → press and hold | "Ye real app hai. Ramesh ji ne QR scan kiya, aur doctor ki screen pe aa gaya ki wo aa gaye hain." |
| 2 | **Doctor:** Ramesh ko kholo → Overview → AI summary → **Adherence & vitals** tab | "Har line ka source hai, AI koi decision nahi leta. Yahan 78% adherence, aur 143 vs 130." |
| 3 | **Prescribe:** Telma-AM 40/5 → Sign → blocked → flag kholo → decision + reason → Sign | "Dekhiye, live block hua. Reason likha, ab sign hua. Ye sab audit log mein gaya." |
| 4 | **Present tab:** Demo clock → **Fire** → phone pe reminder → *I've taken it* | "Phone aur watch pe reminder aaya, ek tap mein mark ho gaya." |
| 5 | **Caregiver tab (Sunita):** missed dose card → *He's taken it* | "Beti ko sirf dose ki info dikhti hai, report nahi." *(8:30 se pehle demo ho toh Demo clock +1 h karo.)* |
| 6 | **Pharmacy:** *Demo: scan latest Rx QR* → Telma-AM → **Telma 40** scan → BLOCKED → Send to prescriber → phir sahi pack → Confirm | "Galat pack block, doctor ko bhej diya. Sahi pack confirm." |
| 7 | **Pharmacy:** RX-1004 → Glycomet → Jan Aushadhi → Offer → *patient agreed* tick → attest | "67% saving, patient ki marzi se." |
| 8 | **Logs tab:** Verify chain → Tamper → Verify | "Ek entry badli, aur system ne turant pakad liya." |

Kuch gadbad ho toh: Wi-Fi gaya toh hotspot. Phone ne dhokha diya toh `/demo` kholo. Data messy ho toh `/present` → Reset demo data.

---

## Part 3 — Doctors ke sawaal (short answers)

- **"Galat flag aaya toh zimmedaar kaun?"** → "Decision hamesha doctor ka hai. System sirf flag aur explain karta hai, aur har decision naam aur reason ke saath save hota hai. Rules fixed hain aur test kiye ja sakte hain, black box nahi."
- **"Itne alerts se doctor pareshaan ho jayega?"** → "Sirf HIGH aur CRITICAL flags sign rokte hain. Baaki sirf information hain. Pilot mein doctors ke saath rules tune karenge."
- **"BP wala comparison kya proof hai?"** → "Nahi, ye proof nahi hai. Ye watch ka estimate hai, sirf context ke liye. App mein bhi likha hai: *not a diagnosis.*"
- **"Pharmacist khud brand badal sakta hai?"** → "Sirf equivalent ho (same ingredient, strength, form) aur patient haan bole tabhi, aur record hota hai. Warna block hota hai aur doctor ke paas jaata hai."
- **"Privacy ka kya?"** → "Patient time-limited access deta hai, kabhi bhi band kar sakta hai. Caregiver ko sirf doses dikhti hain. Har view aur action audit hota hai."
- **"Internet na ho toh?"** → "Pharmacy offline chalti hai aur baad mein sync hoti hai. Patient app ke reminders phone pe locally chalte hain."
- **"AI ko decide kyun nahi karne dete?"** → "Jaan-boojh kar. Medicine mein har decision ka owner ek doctor hona chahiye. AI summary aur explanation de sakta hai, decision nahi."

## Stage pe ye mat bolna
- "AI decide karta hai" ya "app prescribe karta hai". Bolo: *"system flag karta hai, samjhata hai, aur doctor ke paas bhejta hai."*
- "Diagnosis". Bolo: *"context hai, diagnosis nahi."*
- "Real DigiLocker/NMC data". Bolo: *"mock adapters, flow real hai."*
