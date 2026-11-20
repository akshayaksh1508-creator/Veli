# Veil: Architecture and 3-Day Build Guide

**One-line pitch:** Use powerful cloud AI on documents you'd never paste into a chatbot.

**Competition:** #BuildHybridAI (Firebase AI Logic Hybrid Inference SDK), Web (Chrome) track.
**Budget:** 3 days x 8 hours = 24 hours.

> **Verify-first note.** I wrote the SDK snippets below from memory of the Firebase AI Logic web SDK. Names such as `getAI`, `getGenerativeModel`, and the inference mode values may differ in the current docs. Treat every snippet marked **(VERIFY)** as a sketch and copy the real calls from the official "Firebase AI Logic hybrid inference" guide on the Resources page. Task D1-T4 exists to settle this on day 1.

---

## 1. What Veil does

Cloud models are better on long, complex documents, but people won't paste contracts, medical notes, or HR threads into them. On-device models are private but small.

Veil uses both in one pipeline:

1. **On-device: Redact.** Regex rules plus Gemini Nano replace personal details with placeholders such as `[PERSON_1]`. The mapping stays in browser memory only.
2. **Cloud: Analyze.** Only redacted text is sent to the cloud model for summary, risks, deadlines, and action items.
3. **On-device: Restore.** Placeholders in the answer are swapped back to real values locally.

A **Routing Inspector** panel proves what ran where and shows the exact payload that left the device.

### Routes

| Route | Condition | What happens |
|---|---|---|
| **A: On-device only** | Short input (below `SHORT_LIMIT`), or offline | Whole analysis runs on Nano. Nothing leaves the device. |
| **B: Cloud direct** | Long input and no sensitive data detected | Sent to the cloud as is. |
| **C: Redact, Cloud, Restore** | Long input and sensitive data detected | Full Veil pipeline. |

Edge cases are specified in section 5 (router).

---

## 2. Scope

**Must have (MVP)**
- Text input, "Analyze" button, sample-document buttons
- Regex redaction plus Nano entity detection
- Review-before-sending step (user can add or remove redactions)
- Cloud analysis on redacted text, placeholder restore
- Routing Inspector (steps, payload, "cloud saw" vs "you see")
- On-device / Cloud / Local badges
- App Check, hosted URL, public repo with license, demo video, description

**Stretch (only if ahead of schedule)**
- Remote Config for `SHORT_LIMIT`
- Auth + Firestore to save redacted results

**Explicitly out of scope**
- PDF/image input, multi-user features, huge documents (cap at `MAX_CHARS`)

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite, plain JavaScript (ES modules) | Fastest setup, no framework overhead |
| AI | Firebase AI Logic web SDK (hybrid inference) | Required by the competition |
| Security | Firebase App Check | Required by Firebase AI Logic |
| Hosting | Firebase Hosting | One URL for judges |
| Tests | Vitest for pure functions, manual checklist for AI | Quick, no browser needed for logic |
| License | Apache 2.0 | Preferred by organizers |

---

## 4. Repository layout

```
veil/
├── index.html
├── package.json
├── vite.config.js
├── .env.example                 # Firebase config keys (no secrets committed)
├── firebase.json                # Hosting config
├── LICENSE                      # Apache 2.0
├── README.md
├── Architecture.md              # this file
├── src/
│   ├── main.js                  # UI wiring, orchestrates the pipeline
│   ├── firebase.js              # init app, App Check, AI Logic
│   ├── config.js                # constants: limits, defaults, flags
│   ├── router.js                # chooses route A / B / C
│   ├── redact.js                # regex + merge + placeholder map
│   ├── nano-entities.js         # on-device entity detection via AI Logic
│   ├── restore.js               # placeholder -> real value, validation
│   ├── ai.js                    # on-device and cloud model calls
│   ├── prompts.js               # all prompt templates in one place
│   ├── inspector.js             # step log + rendering
│   ├── samples.js               # fake demo documents
│   └── styles.css
└── tests/
    ├── redact.test.js
    ├── restore.test.js
    └── router.test.js
```

**Rule:** `redact.js`, `restore.js`, and `router.js` must be **pure functions** (no network, no DOM). That makes them testable without a browser.

---

## 5. Module specifications

### 5.1 `config.js`
```js
export const CONFIG = {
  SHORT_LIMIT: 1500,      // chars: at or below this, use route A (tunable via Remote Config)
  MAX_CHARS: 12000,       // hard cap for MVP; show a message above this
  CHUNK_SIZE: 1200,       // chars per chunk for Nano entity detection
  CLOUD_RETRY: 1,         // retries if placeholders come back mangled
};
```

### 5.2 `router.js`

**Input:** `{ length, sensitiveFound, onDeviceAvailable, online }`
**Output:** `{ route: 'A'|'B'|'C', reason: string, warnings: string[] }`

Decision table (evaluate top to bottom):

| # | Condition | Result |
|---|---|---|
| 1 | `length > MAX_CHARS` | Reject with message: input too long |
| 2 | `!online` and `onDeviceAvailable` | Route A (reason: offline). If `length > SHORT_LIMIT`, add warning: quality may be reduced, input truncated or chunked |
| 3 | `!online` and `!onDeviceAvailable` | Reject: offline and no on-device model |
| 4 | `length <= SHORT_LIMIT` and `onDeviceAvailable` | Route A |
| 5 | `sensitiveFound` | Route C |
| 6 | otherwise | Route B |

Special case: sensitive input, long, `!onDeviceAvailable` and online: run **regex-only redaction** and use Route C with a warning "On-device model unavailable: only pattern-based redaction applied. Names may not be hidden." Ask the user to confirm in the review step. Never silently send possibly sensitive text.

### 5.3 `redact.js`

**Public API**
```js
detectRegex(text)            -> Match[]        // {start,end,text,type}
mergeMatches(matchLists[])   -> Match[]        // resolves overlaps
buildRedaction(text, matches) -> { redactedText, map }   // map: placeholder -> original
```

**Regex rules** (tune on your fake data):

| Type | Pattern | Notes |
|---|---|---|
| EMAIL | `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` | |
| PHONE_IN | `/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g` | Indian mobile |
| PHONE_INTL | `/\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g` | |
| CARD | `/\b(?:\d[ -]?){13,19}\b/g` | Keep only if Luhn check passes |
| AADHAAR | `/\b\d{4}\s\d{4}\s\d{4}\b/g` | |
| PAN | `/\b[A-Z]{5}\d{4}[A-Z]\b/g` | |
| IFSC | `/\b[A-Z]{4}0[A-Z0-9]{6}\b/g` | |
| SSN | `/\b\d{3}-\d{2}-\d{4}\b/g` | |
| ACCOUNT | `/\b\d{4}[- ]\d{4}[- ]\d{4}\b/g` plus `/(?:a\/c|account)\D{0,15}(\d{9,18})/gi` | The second form captures only the digits |
| AMOUNT | `/(?:₹|Rs\.?|INR|\$|€|£)\s?\d[\d,]*(?:\.\d+)?/g` | |
| URL | `/https?:\/\/[^\s]+/g` | |

Dates are **not** redacted by default, because deadlines are needed for analysis.

**Overlap resolution:** sort by `start`; when two matches overlap, keep the longer one; on a tie, keep the higher-priority type (CARD > ACCOUNT > PHONE > others).

**Placeholder rules**
- Format: `[TYPE_N]`, with N counting per type starting at 1.
- Same normalized value (trimmed, lowercased, collapsed whitespace) always gets the same placeholder.
- Map lives in a JS `Map` in memory. **Never** write it to localStorage, Firestore, console logs, or network requests.
- Replace from the end of the string to the start so indices stay valid.

### 5.4 `nano-entities.js`

Detects what regex can't: **PERSON, ORG, ADDRESS** (and optionally LOCATION).

**Flow**
1. Split text into chunks of about `CHUNK_SIZE` on paragraph or sentence boundaries.
2. For each chunk, call the on-device model with the entity prompt (section 5.8).
3. Parse the JSON reply defensively (strip code fences, try/catch).
4. Locate each returned string in the original text with `indexOf` (loop for all occurrences). **Do not trust any offsets from the model.**
5. Discard entities that aren't found verbatim in the text (hallucinations).
6. Return `Match[]` for merging with regex results.

**Failure behavior:** on any error or invalid JSON, return `[]` and log a warning in the Inspector ("Nano entity detection failed: regex-only redaction"). The pipeline must keep working.

### 5.5 `restore.js`

```js
restore(text, map)              -> string
validatePlaceholders(text, map) -> { ok, missing[], unknown[] }
```

- Replace `[TYPE_N]` using the map.
- Be tolerant: also match placeholders without brackets (`PERSON_1`) and with different case, but only if they exactly equal a known key.
- `missing`: placeholders present in what was sent but absent from the answer. This is informational (the model may legitimately drop one).
- `unknown`: placeholder-looking tokens in the answer that aren't in the map, such as invented `[PERSON_9]`. These indicate a problem and must be shown to the user unrestored.

### 5.6 `ai.js`

Two functions:

```js
runOnDevice(prompt)  -> { text, ms }
runCloud(prompt)     -> { text, ms }
```

Behavior to implement and **VERIFY** against the docs:
- On-device call must be forced to local-only (no silent cloud fallback), for the Route A and entity-detection steps.
- Cloud call must be forced to cloud-only for Route B/C analysis.
- Provide `isOnDeviceAvailable()` that reports whether the local model can be used right now.
- Return timing for the Inspector.

Sketch **(VERIFY)**:
```js
import { getAI, getGenerativeModel /* , InferenceMode */ } from "firebase/ai";

const ai = getAI(app);
const localModel = getGenerativeModel(ai, { mode: /* only on-device */ });
const cloudModel = getGenerativeModel(ai, { mode: /* only in cloud */ });
```

If the SDK cannot force a path, see the pivot plan in section 10.

### 5.7 `inspector.js`

**Data model**
```js
{
  id: "s3",
  label: "Cloud analysis",
  where: "cloud" | "on-device" | "local-code",
  leftDevice: true | false,
  startedAt: 1712345678901,
  durationMs: 1840,
  payload: "text that was sent or processed",
  highlights: [{ start, end, placeholder }],   // for redacted payload display
  note: "optional message or warning"
}
```

**UI sections**
1. **Timeline:** one row per step, with a badge (On-device / Cloud / Local) and duration.
2. **Payload viewer:** for the cloud step, show the exact text sent, with placeholders highlighted.
3. **Side-by-side:** "What the cloud saw" (left) vs "What you see" (right).
4. **Summary line:** e.g. "12 values hidden, 0 sensitive values left your device."

**Rule:** the payload shown must be the *same string variable* that is passed to the cloud call, not a re-built copy. Otherwise the panel could lie.

### 5.8 `prompts.js`

**Entity detection (on-device)**
```
You find personal information in text.
Return ONLY valid JSON, no explanation, in this exact shape:
{"entities":[{"text":"<exact text from input>","type":"PERSON|ORG|ADDRESS"}]}
Rules:
- "text" must be copied exactly from the input.
- Include people's names, organization names, and street or postal addresses.
- Do not include dates, amounts, or generic words.
- If there are none, return {"entities":[]}.

TEXT:
"""
{{chunk}}
"""
```

**Cloud analysis (Route B/C)**
```
You are a careful document analyst.
The text may contain placeholders like [PERSON_1], [AMOUNT_2], [ACCOUNT_1].
Treat each placeholder as an opaque value. Never guess what it is.
Copy placeholders EXACTLY as written, including the square brackets.

Return these sections in plain text:
1. Summary (3 to 5 sentences)
2. Key risks or concerns
3. Deadlines and dates
4. Action items (who, what, when) 

TEXT:
"""
{{redactedText}}
"""
```

**On-device analysis (Route A)**
Same structure as the cloud prompt, shortened, with the note: "Keep it brief."

### 5.9 `main.js` (orchestration)

```
onAnalyze():
  text = input.value
  inspector.reset()
  onDevice = await isOnDeviceAvailable()
  regexMatches = detectRegex(text)
  decision = route({ length, sensitiveFound: regexMatches.length > 0, onDeviceAvailable: onDevice, online: navigator.onLine })

  if route A: runOnDevice(analysisPrompt) -> show result
  if route B: runCloud(analysisPrompt) -> show result
  if route C:
     nanoMatches = await detectEntities(text)           // on-device
     matches = mergeMatches([regexMatches, nanoMatches])
     { redactedText, map } = buildRedaction(text, matches)
     reviewed = await showReviewStep(text, matches)     // user may edit
     rebuilt = buildRedaction(text, reviewed)
     answer = await runCloud(prompt(rebuilt.redactedText))
     check = validatePlaceholders(answer, rebuilt.map)
     if unknown placeholders and retries left: retry once
     final = restore(answer, rebuilt.map)
     show final + inspector
```

Note on route A with sensitive data: sensitive values are fine, since nothing leaves the device.

---

## 6. Test data (fake only)

Create these in `samples.js`. Use only fictional data in the repo and video.

### Sample 1: Loan email (short, sensitive, Route A)
```
Hi Priya, the loan of ₹4,50,000 for account 5021-8834-2210 must be repaid by 15 Jan.
Rahul Mehta at 98450 12345 will confirm. Email him at rahul.mehta@example.com.
```

### Sample 2: Freelance contract (long, sensitive, Route C)
Write about 2,500 to 3,500 characters containing:
- Two company names and two person names
- One postal address
- An email, a phone number, a bank account number, an IFSC code
- Three amounts and two deadlines
- A termination clause and a payment-delay penalty clause

### Sample 3: Public article (long, not sensitive, Route B)
Any 2,000+ character neutral paragraph about a public topic, with no names, numbers, or contacts.

### Sample 4: Tricky text (edge cases)
```
Call me on +91 98450 12345 or (080) 4455 6677. Card: 4111 1111 1111 1111.
PAN ABCDE1234F. Order number 123456 is not an account. Dr. Anita Rao of Rao & Sons, 12 MG Road, Bengaluru 560001.
```
Expected: the order number is **not** redacted; the card passes Luhn and is; names and address are caught by Nano.

---

## 7. Day-by-day plan with tests

Every task has: **What**, **How**, **Test**, and **Done when**. Do not start the next task until the current test passes.

### DAY 1: Foundation and the risky parts (8 hrs)

#### D1-T1: Project and Firebase setup (1 hr)
**What:** Scaffold the app and connect it to a Firebase project.
**How:**
1. `npm create vite@latest veil -- --template vanilla`, then `cd veil && npm install firebase`.
2. In the Firebase console create a project, register a **Web app**, and copy the config into `.env` (`VITE_FIREBASE_API_KEY`, etc.). Commit only `.env.example`.
3. Enable **Firebase AI Logic** in the console and follow its setup prompts (VERIFY which Gemini API provider and billing options it requires).
4. Create `src/firebase.js` that initializes the app from `import.meta.env`.
5. Add the Apache 2.0 `LICENSE` and a stub `README.md`. `git init`, create the public GitHub repo, push.

**Test:**
- `npm run dev` serves a page with no console errors.
- `console.log(app.name)` prints `[DEFAULT]`.
- GitHub repo About section shows "Apache-2.0".

**Done when:** page loads, Firebase initializes, repo is public with a license.

#### D1-T2: App Check with debug token (1.5 hrs)
**What:** Firebase AI Logic requires App Check. Get it working locally.
**How:**
1. In the console: App Check, register the web app with a provider (reCAPTCHA Enterprise or the one the docs recommend, VERIFY).
2. In dev, set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` **before** initializing App Check (VERIFY). Open the console, copy the printed debug token, and register it under App Check, Manage debug tokens.
3. Initialize with `initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true })` (VERIFY).
4. Do not commit debug tokens to the repo. Put them in your notes or `.env`.

**Test:**
- In the browser console, no App Check errors on load.
- A simple cloud call (see D1-T4) succeeds.
- Temporarily remove the debug token: the call is rejected. Restore it.

**Done when:** authenticated calls pass and unauthenticated calls fail.

#### D1-T3: Get Gemini Nano running in Chrome (2 hrs)
**What:** Confirm your machine and browser can run the on-device model. This is the most common blocker, so do it early.
**How:**
1. Use current desktop Chrome (stable, or Canary/Dev if the docs require it).
2. Check Chrome's on-device AI requirements in the docs (hardware, storage, OS), VERIFY them.
3. Enable the required flags if the docs say so (for example under `chrome://flags`), restart Chrome.
4. Inspect model status at `chrome://on-device-internals` (VERIFY the page name) and trigger the model download.
5. Write a tiny page that checks availability and runs one prompt through the SDK's on-device path.

**Test:**
- Availability check returns "available" (or the SDK equivalent).
- Prompt "Reply with the word OK" returns a response with Wi-Fi **off**.
- Record the first-response latency. Note it for the README.

**Done when:** one prompt runs fully on-device with the network disabled.

**If blocked for more than 90 minutes:** ask in the Devpost Discord `#hackathon-help`, and consider the pivot plan in section 10.

#### D1-T4: Prove you can control the route (1 hr) **(GO / NO-GO)**
**What:** Verify that you can force on-device-only and cloud-only, and observe which one ran. Veil depends on this.
**How:**
1. Read the hybrid inference guide's section on modes.
2. Create `localModel` (on-device only) and `cloudModel` (cloud only) in `ai.js` (VERIFY the mode names).
3. Add a debug button for each that sends "Say hello" and prints the result and the timing.
4. Check whether the SDK tells you which backend answered (a response field or event). If not, infer it: on-device only should work offline; cloud only should fail offline.

**Test:**
- Offline: local call succeeds, cloud call fails with a network error.
- Online: both succeed, and local latency is clearly different from cloud latency.
- Local-only mode never falls back to the cloud (check the Network tab: no request to the AI endpoint).

**Done when:** all three checks pass. **If not, stop and use the pivot plan in section 10.**

#### D1-T5: Regex redaction engine (1.5 hrs)
**What:** Build `detectRegex`, `mergeMatches`, `buildRedaction`, plus Luhn check.
**How:**
1. Implement the rules in section 5.3.
2. Implement overlap resolution and placeholder numbering.
3. Write `tests/redact.test.js` with Vitest (`npm i -D vitest`, script `"test": "vitest run"`).

**Tests (automated):**

| Input | Expected |
|---|---|
| `Mail a@b.com and a@b.com` | One placeholder `[EMAIL_1]` used twice |
| `Pay ₹4,50,000 and Rs. 2,000` | `[AMOUNT_1]`, `[AMOUNT_2]` |
| `4111 1111 1111 1111` | `[CARD_1]` |
| `1234 5678 9012 3456` (fails Luhn) | Not marked as a card |
| `Order number 123456` | Unchanged |
| `ABCDE1234F` | `[PAN_1]` |
| Overlap: card number that also matches the phone rule | Single `[CARD_1]` |
| `buildRedaction` then `restore` | Round trip equals the original text |

**Done when:** `npm test` is green.

#### D1-T6: Basic UI (1 hr)
**What:** One page with the input box, sample buttons, Analyze button, result area, and empty Inspector panel.
**How:** Plain HTML and CSS in `index.html` and `styles.css`. Two-column layout on desktop, stacked on mobile.

**Test:**
- Page is usable at 1280px and 390px widths.
- Sample buttons fill the textarea.
- Analyze button is disabled while running.

**Day 1 checkpoint:** (a) on-device prompt works offline, (b) cloud prompt works, (c) route control verified, (d) regex tests pass, (e) repo pushed.

---

### DAY 2: Core pipeline and the Inspector (8 hrs)

#### D2-T1: Nano entity detection (2 hrs)
**What:** Implement `nano-entities.js` per section 5.4.
**How:** Chunking, prompt, defensive JSON parsing, locate with `indexOf`, return matches.

**Tests:**
- Unit test the *parser and locator* with mocked model replies:
  - valid JSON, JSON wrapped in code fences, JSON with extra prose, invalid JSON (expect `[]`), entity not found in the text (expect it to be discarded).
- Manual test on Sample 2 and Sample 4: record which names, orgs, and addresses were caught and missed. Write the numbers in your notes (for the README's honest limitations).

**Done when:** at least about 80% of names in Sample 2 are caught and a failure never crashes the app.

#### D2-T2: Merge and placeholder map (1 hr)
**What:** Combine regex and Nano matches, resolve overlaps, build the final map.
**How:** Use `mergeMatches([regex, nano])`. If a Nano entity overlaps a regex match, keep the regex type.

**Tests:**
- Name inside an email (`priya@example.com` where Nano also returns "Priya"): result must be one `[EMAIL_1]`, not a broken string.
- Same person written as "Rahul Mehta" and "rahul mehta": one placeholder.
- Round trip on Sample 2 returns the original text exactly.

#### D2-T3: Restore and validation (1 hr)
**What:** Implement `restore.js` and `validatePlaceholders`.

**Tests (automated):**

| Answer text | Expected |
|---|---|
| `[PERSON_1] must pay [AMOUNT_1]` | Replaced with real values |
| `PERSON_1 must pay` (no brackets) | Replaced, since it exactly matches a key |
| `[PERSON_9] must pay` | Reported in `unknown`, left unreplaced |
| Answer omits `[ACCOUNT_1]` | Reported in `missing` (informational) |
| Answer has `[PERSON_1]'s` | Restored with the possessive intact |

#### D2-T4: Cloud analysis prompt and call (1.5 hrs)
**What:** Wire `runCloud` with the analysis prompt, plus retry on unknown placeholders.
**How:** Build the prompt from `prompts.js`. After the response, run `validatePlaceholders`. If `unknown.length > 0` and a retry is left, re-send with an extra line: "Use only the placeholders present in the text."

**Tests:**
- Run Sample 2 five times. Count how often placeholders come back mangled. Record it.
- Search the outgoing payload (log it in dev) for every real value from your fake data: **none** may appear. Automate this: after `buildRedaction`, assert that no map value appears in `redactedText`.

#### D2-T5: Router (1 hr)
**What:** Implement `router.js` from section 5.2.

**Tests (automated, `router.test.js`):**

| length | sensitive | onDevice | online | Expected |
|---|---|---|---|---|
| 500 | yes | yes | yes | A |
| 3000 | yes | yes | yes | C |
| 3000 | no | yes | yes | B |
| 3000 | yes | yes | no | A with warning |
| 3000 | yes | no | no | Rejected |
| 3000 | yes | no | yes | C with regex-only warning |
| 13000 | any | any | any | Rejected (too long) |

#### D2-T6: Review-before-sending step (0.5 hr)
**What:** After redaction, show the redacted text with highlighted placeholders. The user can click a highlight to un-redact it or select text and click "Hide this".

**Tests:**
- Un-redacting a value removes it from the outgoing payload.
- Adding a manual redaction creates a new placeholder and the payload updates.
- "Send" is the only path to the cloud call (no automatic send in Route C).

#### D2-T7: Routing Inspector (1 hr)
**What:** Implement `inspector.js` per section 5.7.

**Tests:**
- After a Route C run, the timeline shows: Regex detect (Local), Nano detect (On-device), Build placeholders (Local), Cloud analysis (Cloud), Restore (Local).
- The payload shown is byte-for-byte the string passed to `runCloud` (assert this in a test using a spy).
- Summary line count equals the number of map entries.
- For Route A, the timeline shows no Cloud step and the summary says "Nothing left your device."

**Day 2 checkpoint:** Sample 2 runs end to end through Route C; Samples 1 and 3 route to A and B correctly.

---

### DAY 3: Polish, deploy, submit (8 hrs)

#### D3-T1: Edge cases and failure handling (1.5 hrs)
**Test each and confirm there is a clear message and no crash:**

| Scenario | Expected behavior |
|---|---|
| Empty input | Button disabled or friendly message |
| Input above `MAX_CHARS` | Message explaining the cap |
| Wi-Fi off, short input | Route A works |
| Wi-Fi off, long input | Warning, or rejection per router table |
| Nano unavailable (use a browser without it) | Banner explaining; regex-only path with confirmation |
| Cloud call fails (block the domain in DevTools) | Error shown, no partial result presented as complete |
| Nano returns garbage | Regex-only fallback, note shown in Inspector |
| Double-click Analyze | Only one run starts |

#### D3-T2: Polish and first-run experience (1.5 hrs)
**What:** A judge should understand the value in 10 seconds.
**How:** Headline, one-line explanation, three sample buttons, status chips ("On-device model: ready / unavailable", "Online / Offline"), a short "How Veil protects you" line.

**Test:** Ask one person who hasn't seen it to try it for 2 minutes without help. Note where they get stuck and fix the top two issues.

#### D3-T3: Optional Remote Config (0.5 hr)
**What:** Read `SHORT_LIMIT` from Remote Config with a default fallback.
**How:** `fetchAndActivate`, then `getValue(rc, "short_limit").asNumber()` (VERIFY imports). Keep the hardcoded default in `config.js`.
**Test:** Change the value in the console, reload, and confirm the router changes behavior. With Remote Config unreachable, the default still works.
**Skip if behind schedule.**

#### D3-T4: Deploy to Firebase Hosting (1 hr)
**What:** Public URL that works for judges.
**How:**
1. `npm i -g firebase-tools`, `firebase login`, `firebase init hosting` (public dir `dist`, single-page app: no).
2. `npm run build`, `firebase deploy --only hosting`.
3. Make sure App Check works on the hosted domain. Add the hosting domain to your App Check provider config (VERIFY). Debug tokens are accepted for the submission, so document in the README how a judge can run locally with a debug token if the hosted version blocks them.

**Test:**
- Open the URL in a **fresh Chrome profile** and an Incognito window.
- Samples 1, 2, 3 each take the expected route.
- Mobile browser: loads, and shows a clear "on-device unavailable" state instead of breaking.

#### D3-T5: README and license check (1 hr)
**README sections:**
1. Problem and one-line pitch
2. How it works (the three steps and route table)
3. **Where Firebase AI Logic is used** (file and function names, for example `src/ai.js: runOnDevice, runCloud`)
4. Firebase products used (AI Logic, App Check, optional Remote Config)
5. Setup and run instructions (`.env`, debug token, Chrome requirements)
6. Demo link and video link
7. **Honest limitations** (redaction is not perfect, measured catch rate from D2-T1, input cap, Chrome-only on-device)
8. License

**Test:**
- Clone the repo into a new folder, follow the README exactly, and get the app running.
- `grep -r "firebase/ai" src` shows the SDK is imported and used in code, not only mentioned in docs.
- The license shows in the repo's About box.

#### D3-T6: Demo video (1.5 hrs)
**Requirements:** 3 minutes or less, public on YouTube, English or subtitles, footage of the app running on the target platform.

**Script**
| Time | Content |
|---|---|
| 0:00 | Problem in one sentence: "Cloud AI is powerful but you can't paste sensitive documents into it." |
| 0:20 | Paste the fake contract, click Analyze, show the three steps |
| 1:00 | Open the Routing Inspector: show the redacted payload that left the device |
| 1:40 | Show the restored result and the side-by-side |
| 2:10 | Turn Wi-Fi off, run a short note, show "On-device only" |
| 2:40 | Tech summary: Firebase AI Logic hybrid SDK, App Check, and the one-line pitch |

**Test:** Watch it once without sound to confirm the screen tells the story; confirm the length is under 3:00; open the YouTube link in a logged-out window.

#### D3-T7: Submission (1 hr, leave buffer)
**Devpost description template**
```
Problem: <2 sentences>
Solution: <2 sentences, mention redact -> cloud -> restore>
How we used Firebase AI Logic: <on-device for redaction and short notes, cloud for long analysis, forced routing via hybrid SDK, App Check>
Features: <bullets>
Value proposition: Use cloud AI on documents you'd never paste into a chatbot.
Limitations: <honest list>
```

**Final checklist**
- [ ] Hosted URL works in a fresh browser
- [ ] Public GitHub repo with Apache 2.0 visible in About
- [ ] Firebase AI Logic imported and called in the code
- [ ] App Check configured; debug token instructions in README
- [ ] Demo video public on YouTube, 3 minutes or less
- [ ] Description covers AI Logic usage, features, value
- [ ] Platform selected on the submission form: Web (Chrome)
- [ ] Submitted at least 1 hour before the deadline (check the Devpost page for it)

---

## 8. Test summary matrix

| Area | Type | Where |
|---|---|---|
| Regex rules, overlaps, round trip | Automated | `tests/redact.test.js` |
| Restore and validation | Automated | `tests/restore.test.js` |
| Router decision table | Automated | `tests/router.test.js` |
| Nano JSON parsing and locating | Automated (mocked) | `tests/redact.test.js` |
| No real value in outgoing payload | Automated assertion | `tests/redact.test.js` |
| Payload shown equals payload sent | Automated (spy) | `tests/inspector.test.js` |
| On-device really works offline | Manual | D1-T3, D1-T4 |
| Cloud-only really fails offline | Manual | D1-T4 |
| Full flow with Samples 1 to 4 | Manual | D2 checkpoint |
| Fresh profile and mobile | Manual | D3-T4 |

---

## 9. Privacy and safety rules (non-negotiable)

1. The placeholder map is never persisted, logged, or sent anywhere.
2. Route C never calls the cloud without the user pressing Send on the review step.
3. If redaction is degraded (Nano unavailable or failed), say so in the UI before sending.
4. Use only fake data in the repo, README, and video.
5. State limitations plainly: Veil reduces exposure; it does not guarantee that every sensitive value is caught.
6. Don't claim compliance (HIPAA, GDPR, etc.).

---

## 10. Risks and pivot plan

| Risk | Signal | Response |
|---|---|---|
| Can't force on-device or cloud path | D1-T4 fails | **Pivot** to an offline-first field assistant: automatic hybrid routing is enough. Keep the Inspector, reuse the UI and router skeleton. |
| Nano unavailable on your machine | D1-T3 stuck over 90 min | Ask on Discord; try another Chrome channel or machine; as a last resort build the regex-only redaction path and demo Nano on a second device |
| Nano misses names | Catch rate below 80% | Add a manual-redaction UX emphasis and a user-editable "always hide" list |
| Cloud mangles placeholders | More than 1 in 5 runs | Stronger prompt, retry once, show unrestored tokens |
| Time overrun | Behind at any checkpoint | Cut in this order: Remote Config, UI polish, Nano chunking (cap input smaller) |
| App Check blocks judges | Hosted URL fails for others | Document debug-token local run; verify the provider setup |

---

## 11. Commit plan

Commit at the end of every task with the task ID, for example `D1-T5: regex redaction engine with tests`. A clean history shows judges the work was done during the competition period.
