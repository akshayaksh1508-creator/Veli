# Veil

> Use powerful cloud AI on documents you'd never paste into a chatbot.

Veil is a privacy-first hybrid document analysis application built for the **#BuildHybridAI** competition (Web / Chrome track). It pairs Chrome's on-device Gemini Nano with cloud models to analyze contracts, medical records, and financial reports without leaking personal or confidential data.

---

## How It Works

1. **On-Device Redaction:** Fast regex rules and Gemini Nano detect sensitive entities (names, accounts, cards, amounts, addresses) and replace them with opaque tokens (`[PERSON_1]`, `[ACCOUNT_1]`).
2. **Review Step:** Users inspect and adjust what gets hidden before anything leaves the machine.
3. **Cloud Analysis:** Only redacted text is transmitted to cloud AI for analysis (summaries, risk factors, deadlines, action items).
4. **On-Device Restoration:** Tokens in the cloud's response are mapped back to their original values locally in the browser. The mapping table is stored strictly in memory and is never logged or transmitted.

### Routes

- **Route A (On-Device Only):** Used when offline or for short documents. Processed entirely locally.
- **Route B (Cloud Direct):** Used for long, non-sensitive public documents.
- **Route C (Redact → Cloud → Restore):** Used for long documents containing sensitive information.

---

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES modules) + Vite
- **AI Framework:** Firebase AI Logic SDK (Hybrid Inference)
- **Security:** Firebase App Check
- **Testing:** Vitest
- **Hosting:** Firebase Hosting

---

## Setup & Development

1. **Clone repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Firebase:**
   Copy `.env.example` to `.env` and fill in your Firebase configuration values.

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

---

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.
