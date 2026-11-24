# Veil

**Use powerful cloud AI on documents you'd never paste into a chatbot.**

Veil is a web app built for the #BuildHybridAI challenge (Chrome web track). It hides personal details on-device, sends only the redacted text to a cloud model through Firebase AI Logic, and restores the real values locally in your browser.

> Demo video: `https://youtu.be/u5FnHmjIgyk` · Live app: `https://veil-e5e74.web.app` · Devpost: `<Devpost link>`

## Quick start for judges

**Fastest path (about 2 minutes), no login and no API key needed:**

1. Open the live app in **desktop Chrome** (version 148 or newer): `https://veil-e5e74.web.app`
2. Click **2. Contract (Route C: Hybrid)** and press **Analyze Document**. Veil detects names on-device (this can take 10 to 20 seconds), then shows the review screen.
3. Check what is hidden, then press **Approve & Send to Cloud AI**. Open the **Side-by-Side Inspector** to compare *what the cloud saw* (placeholders only) with *what you see* (restored).
4. Click **3. Tech Article (Route B: Cloud)** to see direct cloud analysis of public text. This works even without Gemini Nano.
5. Click **1. Loan Note (Route A: On-Device)** and press Analyze. With Wi-Fi switched off, this still works on-device.

To check the privacy claim yourself, open DevTools, go to the **Network** tab, and run step 2: no request to `firebasevertexai.googleapis.com` appears until you press Approve, and the one request after it contains only placeholders.

If you cannot run it, the **demo video** shows the full flow, including the Network tab check, offline mode, and a cloud failure.

### Browser and hardware requirements

Veil's on-device features use Gemini Nano through Chrome's built-in Prompt API. Per Chrome's documentation at the time of writing (check <https://developer.chrome.com/docs/ai/prompt-api> for current details):

- **Desktop Chrome** on Windows, macOS, Linux, or Chromebook Plus. Chrome for Android and iOS are not supported for these APIs.
- About **22 GB of free disk space** on the volume that holds the Chrome profile.
- A **GPU with more than 4 GB of VRAM**, or a CPU with **16 GB of RAM and 4 or more cores**.
- The model **downloads on first use**, which can take a few minutes. The status chip at the top of the page shows `Nano: Downloading...`, then `Nano: Ready`.
- Text in English (the Prompt API also accepts Spanish, Japanese, German, and French).

### What works without Gemini Nano

| Situation | What Veil does |
|---|---|
| Public, non-sensitive text, online | **Route B** works: sent directly to the cloud. |
| Sensitive text, online, Nano unavailable | Routed as **Route C with pattern-based redaction only**. The router warns that names may not be hidden, the Inspector shows entity detection as skipped, and the review step lets you hide names by hand before anything is sent. |
| Offline, Nano unavailable | Veil explains that it cannot process the text and nothing is sent. |
| Route A (short text, or offline) | Needs Gemini Nano. |

### Notes on free-tier limits

Veil runs on Firebase's free Spark plan and a free-tier Gemini model. If many people test at once, the cloud service may return a rate-limit error. Veil then shows a message saying cloud analysis is temporarily unavailable and never shows a made-up result. Wait a minute and try again, or watch the demo video.

## The problem

Cloud models handle long, messy documents far better than small on-device models. But the documents people most need help with (contracts, loan emails, medical notes, HR threads) are full of names, account numbers and addresses. Today you choose between private but weak, or powerful but risky.

## How it works

1. **Redact (on-device).** Pattern rules and Gemini Nano in Chrome find emails, phones, account and card numbers, PAN/Aadhaar/IFSC, amounts (including spelled-out amounts), names, organizations and addresses, and replace them with placeholders such as `[PERSON_1]`. The placeholder map lives in browser memory only.
2. **Review.** You see exactly what is hidden and can add or remove redactions. Nothing is sent until you press **Approve & Send to Cloud AI**.
3. **Analyze (cloud).** Only the redacted text goes to the cloud model via Firebase AI Logic, which returns a summary, risks, deadlines and action items.
4. **Restore (on-device).** Placeholders in the answer are swapped back to the real values locally.

### Routing

| Input | Route | What happens |
|---|---|---|
| Short (at or below 1,500 characters), or offline | **A** | Runs fully on-device. Nothing is sent. |
| Long, nothing sensitive detected | **B** | Sent directly to the cloud model. |
| Long and sensitive | **C** | Redact on-device, review, cloud analysis, restore on-device. |

The 1,500 character threshold is synchronized through Firebase Remote Config, with a built-in default.

### Routing Inspector

Every run shows which step ran where (local code, on-device, cloud), timings, the model name and token count for cloud calls, and a **Side-by-Side** view: *what the cloud saw* (placeholders only) next to *what you see* (restored). A verification line is shown only when the displayed redacted text is contained in the exact prompt that was dispatched to the cloud model.

If something fails, Veil shows a plain-language error and never produces a fabricated result. A failed run also reports that your original text never left the device.

## Where Firebase AI Logic is used

| What | Where |
|---|---|
| Firebase AI Logic initialization and model creation | `src/ai.js` (`getAI`, `getGenerativeModel` from `firebase/ai`) |
| Cloud analysis call (`cloudModel.generateContent`) | `src/ai.js` → `runCloud` |
| Prompt construction, placeholder validation, retry | `src/cloud-analysis.js`, `src/prompts.js` |
| App Check (reCAPTCHA Enterprise, debug token for development) | `src/firebase.js` |
| Remote Config (`SHORT_LIMIT`) | `src/firebase.js` |

**Honest note on on-device inference.** On-device inference currently runs on Chrome's built-in `LanguageModel` (Prompt API) with Gemini Nano. The Firebase SDK on-device path is implemented in `src/ai.js` but disabled by default (`CONFIG.ALLOW_SDK_ON_DEVICE = false`) because, in testing, it sent requests to the cloud endpoint instead of staying local. It will only be enabled after the browser Network tab shows zero requests for Route A and for entity detection. Cloud inference always goes through Firebase AI Logic.

## Privacy design

- Only redacted text is sent to the cloud. This was checked in the browser Network tab: no AI request is made before you approve, and the one request after approval carries placeholders only.
- The placeholder map is never logged, persisted or sent. Debug logging (`CONFIG.DEBUG_LOGS`, off by default) prints counts and placeholder-only text, never real values.
- A leak test asserts that known sensitive strings from each sample are absent from the dispatched prompt.
- Error text and model output are rendered with `textContent`, not `innerHTML`.

## Limitations (please read)

Veil reduces exposure. It does not guarantee that every sensitive value is caught, and it is not a compliance tool.

- Names, organizations and addresses depend on Gemini Nano. It can miss unusual names and mislabel entity types. Regex rules cover structured data (emails, phones, IDs, accounts, amounts), and the review step exists for what slips through.
- Redaction counts vary between runs (23 to 25 values on the sample contract, 20 to 22 unique tokens).
- On-device entity detection is slow on the sample contract: roughly 8 to 18 seconds.
- Redacted amounts stop the cloud model from checking sums. The review step lets you keep amounts visible.
- Cloud summaries are model output and can be wrong. Check important details.
- The on-device path needs recent desktop Chrome with Gemini Nano available (see Browser and hardware requirements above). Without it, Route A and entity detection are unavailable, and Veil says so. Sensitive text then gets pattern-based redaction only.
- Input is capped at 12,000 characters. Text only (no PDF or images).
- Firebase AI monitoring may sample requests. Only redacted text is sent, but check your project's monitoring and trace settings.

Measured on the sample contract (about 1,900 characters): cloud analysis 2.0 to 3.3 s and about 700 to 1,000 tokens; 17 regex matches plus 7 to 9 Nano entities.

## Run it locally

Requirements: Node 18+, desktop Chrome with Gemini Nano available (for the on-device parts), a Firebase project with Firebase AI Logic enabled.

```bash
npm install
cp .env.example .env      # then fill in your values
npm run dev
npm test
```

### App Check (required by Firebase AI Logic)

1. In the Firebase console, open **App Check**, register your web app with **reCAPTCHA Enterprise**, and put the site key in `VITE_RECAPTCHA_SITE_KEY`.
2. For local development, register a debug token under **Manage debug tokens** and set `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` to the same value.
3. Reload. The console should show `[AppCheck] Initialized successfully`, and the cloud step in the Inspector should read "App Check: token obtained".
4. Enable enforcement only after your hosted site shows "token obtained" in a fresh browser profile.

### Deploy

```bash
npm run build             # VITE_ variables are baked in here, so set them first
firebase deploy --only hosting
```

Add your Hosting domain to the reCAPTCHA key's allowed domains. Judges can also run locally with a debug token as above.

### Samples

Three fictional samples (loan note, contractor agreement, public article) demonstrate Routes A, C and B. All data in this repository is fake.

## Tech

Vite, plain JavaScript, Firebase (App, App Check, AI Logic, Remote Config, Hosting), Gemini Nano via Chrome's Prompt API, Vitest.

## License

Apache License 2.0. See `LICENSE`.
