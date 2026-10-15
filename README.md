# SimePark

Affordability-first property discovery for Malaysian first-time homebuyers. A React +
TypeScript + Vite single-page app that estimates what you can afford, then filters and
ranks properties against that estimate.

> **All figures are illustrative planning estimates.** They are not a loan approval, loan
> offer, eligibility decision, or financial advice.

---

## Features

| Area | What it does |
| --- | --- |
| Affordability estimate | Estimates a maximum property price as the **lower** of two ceilings: what your monthly repayment budget can service, and what your available cash can support under a 10% down payment assumption. |
| Debt service ratio | Applies an illustrative 40%-of-gross-income DSR cap, minus existing commitments. |
| Property explorer | Filters by location, type, minimum bedrooms, max price and affordability; sorts by match, price or monthly repayment. |
| Budget badges | Marks each property **Within Budget**, **Over Budget**, or **Cash Short** so a down payment shortfall is never mislabelled as "too expensive". |
| AI Home-Buying Assistant | A chat panel that explains your estimate, why specific properties matched, and common Malaysian upfront costs. |

### How the affordability maths works

Implemented in plain TypeScript with no network dependency:

- `src/utils/mortgage.ts` — amortisation and its inverse, input guards, formatting
- `src/utils/dsr.ts` — DSR, mortgage budget, and the cash-backed price ceiling
- `src/utils/affordability.ts` — input sanitisation and the two-ceiling result
- `src/utils/propertyFilter.ts` — enrichment, filtering, scoring, ranking

Key assumptions are documented in one place at the top of `src/utils/affordability.ts`
and rendered in the UI from `AFFORDABILITY_ASSUMPTIONS` in `src/types/affordability.ts`.

### How the AI assistant works

The assistant **explains** the app's numbers; it never computes or overrides them.

```
Browser (AssistantChat)
  │  POST /api/assistant   { message, history, context }
  ▼
/api/assistant  ──────────  the only place GEMINI_API_KEY is read
  │  ├─ Vercel Serverless Function (production)
  │  └─ Vite dev middleware       (local, same handler)
  ▼
Google Gemini Interactions API
```

- The affordability figures sent to the model are produced by the deterministic utilities
  above and injected as read-only facts, with rules forbidding recalculation.
- Property details come from `src/data/properties.json` via the app's own enrichment, so
  the assistant cannot invent a listing, price, or source URL.
- The prompt separates the three kinds of information in play — figures the app
  **calculated**, values the **user entered**, and the assistant's own **general knowledge**
  — and requires provenance to be stated in plain language rather than by tagging
  sentences. In particular, a user's `preferredMaxMonthlyPayment` is always described as a
  preference they chose, never as something the app calculated from their income.
- The assistant is instructed not to state specific statutory rates, live bank rates, or
  eligibility rules, and to say what it cannot verify instead.

Provenance is expressed in prose, not tags. An earlier revision required every claim to be
prefixed `(Verified)`, `(Estimate)` or `(Unknown)`; that read like debugging output and has
been removed. Labels are now reserved for the one case where they add something: advice the
user should independently confirm, such as current statutory rates.

---

## Requirements

- **Node.js 18 or newer** (developed on Node 24). Node 18+ is needed for the global
  `fetch`, `Request` and `Response` used by the serverless handler.
- npm (the repo has a `package-lock.json`).
- A **Google AI Studio API key** — only if you want the AI assistant to answer. Everything
  else works without one.

---

## Setup

```bash
npm install
```

### Configure the API key (server-side only)

```bash
cp .env.example .env
```

Then edit `.env` and replace the placeholder with your real key:

```dotenv
GEMINI_API_KEY=your_real_key_here
```

Get a key from <https://aistudio.google.com/apikey>.

**Read this before changing anything about the variable name:**

- `GEMINI_API_KEY` is read **only** by server code — `api/_lib/handler.ts` and
  `server/assistantDevMiddleware.ts`.
- It is intentionally **not** prefixed with `VITE_`. Vite inlines every `VITE_*` variable
  into the public browser bundle. Renaming this to `VITE_GEMINI_API_KEY` would publish your
  key to every visitor.
- `.env` and all `.env.*` files are git-ignored. Only `.env.example` (placeholders) is
  committed. Verify with:

  ```bash
  git check-ignore -v .env      # should print a match
  ```

### Optional: choose a model

`GEMINI_MODEL` overrides the model. If unset, the code default is
`DEFAULT_GEMINI_MODEL` in `src/types/assistant.ts`. Model availability and free-tier
quotas change over time — check the current model list and your own quota in
[Google AI Studio](https://aistudio.google.com/) before changing it. This feature does
**not** claim any free tier is permanent; it uses whatever quota your key has.

---

## Run locally

```bash
npm run dev
```

That single command serves the app **and** the assistant endpoint:

- App: <http://localhost:5173>
- Assistant: `POST http://localhost:5173/api/assistant`

The Vite plugin in `server/assistantDevMiddleware.ts` mounts the same handler the
serverless function uses, so there is no second process to manage. On startup the terminal
tells you whether a key was detected server-side.

Verify the endpoint without a browser:

```bash
curl -s -X POST http://localhost:5173/api/assistant \
  -H 'Content-Type: application/json' \
  -d '{"message":"hi"}' | head -c 300
```

With no key configured you get `{"ok":false,"reason":"not_configured",...}` — a friendly
explanation, not a crash.

### Optional: run the real serverless runtime locally

Only if you want to exercise Vercel's function runtime instead of the Vite middleware:

```bash
npx vercel dev
```

This requires the Vercel CLI (installed on demand by `npx`) and a one-time
`npx vercel login`. It is **not** required for normal development.

---

## Other commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server + assistant endpoint |
| `npm test` | Run the full Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | Typecheck (`tsc -b`) then build to `dist/` |
| `npm run preview` | Preview the production build |

`npm run preview` serves static files only and does **not** run `/api/assistant`. The chat
panel detects this and shows a friendly message pointing at the README instead of failing
silently.

---

## Deployment (Vercel)

The repository is already structured for Vercel:

- the Vite SPA builds to `dist/`
- `api/assistant.ts` is detected automatically as the `/api/assistant` Serverless Function

### Steps you must perform manually

These have **not** been done for you — no deployment has been run or verified from this
environment.

1. **Create a Vercel account** at <https://vercel.com/signup> if you do not have one.
   The free Hobby tier is sufficient for a demo.
2. **Install and authenticate the CLI** (or use the Vercel dashboard instead):

   ```bash
   npx vercel login
   ```

3. **Link the project** from the repository root and accept the detected settings
   (Framework Preset: Vite; Build Command: `npm run build`; Output Directory: `dist`):

   ```bash
   npx vercel link
   ```

4. **Add the environment variable** for Production, Preview and Development. Either in the
   dashboard under *Project → Settings → Environment Variables*, or via CLI:

   ```bash
   npx vercel env add GEMINI_API_KEY
   ```

   Paste the key when prompted. Optionally add `GEMINI_MODEL` the same way.
   Use the **server** variable store, never a `VITE_*` name.

5. **Deploy**:

   ```bash
   npx vercel deploy           # preview deployment
   npx vercel deploy --prod    # production deployment
   ```

6. **Verify** the deployment by opening the deployed URL, sending one chat message, and
   confirming you get a real answer rather than the "not configured" message.

If you use the dashboard instead of the CLI, connect the Git repository, set the same
environment variable, and let Vercel build on push.

### Cost and quota

The assistant makes **one** Gemini request per question, with no automatic retries and a
700-token output cap, to keep usage predictable. Free-tier limits are set by Google, change
over time, and can be checked in Google AI Studio. Do not assume the API is free
indefinitely, and do not send bulk or automated traffic through a demo deployment.

---

## Debugging a rejected Gemini request

If the chat panel reports that the AI service rejected the request, the **server terminal**
has the specific reason. The browser deliberately never receives Google's raw error, so the
terminal is the place to look.

### Reproduce it

```bash
# 1. Start the dev server and leave this terminal visible
npm run dev

# 2. In a second terminal, trigger one request
curl -s -X POST http://localhost:5173/api/assistant \
  -H 'Content-Type: application/json' \
  -d '{"message":"test","history":[],"context":{"hasAffordabilityResult":false}}'
```

Or simply open the app at <http://localhost:5173> and send any message in the chat panel.

Note: Vite binds IPv6 `::1`, so use `http://localhost:5173`, not `http://127.0.0.1:5173`.

### Read the terminal line

Look in the terminal running `npm run dev` for a line beginning `[ai-assistant]`:

```
[ai-assistant] Gemini request rejected. http_status=400 provider_code=400 \
  provider_status=INVALID_ARGUMENT provider_reason=API_KEY_INVALID \
  provider_message="API key not valid. Please pass a valid API key." model=gemini-3.5-flash-lite
```

| Field | What it tells you |
| --- | --- |
| `http_status` | The HTTP status Google returned. |
| `provider_code` | Google's numeric error code. |
| `provider_status` | Google's gRPC status, e.g. `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `UNAUTHENTICATED`. |
| `provider_reason` | Google's machine-readable reason from `error.details[]`, e.g. `API_KEY_INVALID`. This is usually the decisive field, because several causes share one HTTP status. |
| `provider_message` | Google's message, redacted and capped at 300 characters. |
| `model` | The model that was actually requested, after `GEMINI_MODEL` was resolved. |

### Common combinations
| `http_status` + `provider_reason` | Meaning | Fix |
| --- | --- | --- |
| `400` + `API_KEY_INVALID` | The key is not a valid credential. | Replace `GEMINI_API_KEY` in `.env` with a real key from <https://aistudio.google.com/apikey> and restart `npm run dev`. A placeholder value, a truncated paste, or a key from a deleted project all look like this. |
| `403` + `PERMISSION_DENIED` | The credential is understood but not allowed. | Enable the Generative Language API for that key's project, or use a key from a project that has it. |
| `400` + `INVALID_ARGUMENT` with a model complaint | The model name is not available to this key. | Set `GEMINI_MODEL` to a model your key offers. |
| `404` | The model name does not exist at all. | Fix the `GEMINI_MODEL` spelling. |
| `429` + `RESOURCE_EXHAUSTED` | Quota or rate limit hit. | Wait; check your quota in Google AI Studio. SimePark never retries automatically. |

### What is deliberately not logged

The `GEMINI_API_KEY` (redacted from log output even if Google echoes it in an error
message), request headers, and the request payload — including the system instruction and
the user's affordability figures. Only the five fields above plus the model name are
written. Browser responses stay generic and never contain upstream error text.

---

## Security notes

- The API key is read server-side only and is never included in the browser bundle. The
  client calls only `/api/assistant`.
- The browser sends the key to nobody: `src/utils/assistantClient.ts` has no credentials.
- Upstream error bodies are parsed for diagnosis, logged without the key, and never
  forwarded to the browser (`api/_lib/diagnostics.ts`).
- Request bodies are capped (`ASSISTANT_LIMITS.maxBodyBytes`), messages are length-limited,
  history is trimmed, and the whole context is re-validated and rebuilt field-by-field on
  the server before reaching the model.
- Provider error bodies are never forwarded to the client, and no secret is ever logged.
- Source URLs from property records are only passed through if they are `https://`.

---

## Testing

```bash
npm test
```

Coverage includes the affordability ceilings and edge cases (zero income, commitments above
the cap, insufficient cash, invalid and non-finite input), property enrichment, filtering
and ranking, the assistant request contract (missing configuration, invalid and oversized
input, provider 4xx/5xx mapping, rate limiting, timeouts, empty replies, success), prompt
construction (writing style, the two-monthly-figure distinction, and the present/absent
data notes), the client-side context builder, and the chat panel's own UI behaviour
(four starter questions, Enter to send, Shift+Enter newline, duplicate-submission guard,
error state and recovery, the context handed to the assistant, and that re-submitting the
form updates the figures sent on the next question).

UI tests run under `happy-dom`, declared per file with a
`@vitest-environment happy-dom` docblock, so the calculation suites stay on the faster
default Node environment.

### What has and has not been verified end to end

**Verified locally:** the full test suite, the production build, the `/api/assistant`
endpoint's validation and error paths, the "not configured" path, and a real request
reaching Google's endpoint. Diagnosing that live request produced
`http_status=400 provider_reason=API_KEY_INVALID`, which identified an invalid credential —
not a model problem.

**Not verified:** a successful answer, and any deployment. The `GEMINI_API_KEY` currently in
`.env` is rejected by Google as invalid, so no answer can be generated until it is replaced.
No deployment was performed.

---

## Project layout

```
api/
  assistant.ts              Vercel Serverless Function entry point
  _lib/handler.ts           validation, provider call, error mapping (platform-agnostic)
  _lib/prompt.ts            system rules + context serialisation
  _lib/__tests__/           handler and prompt tests
server/
  assistantDevMiddleware.ts Vite dev middleware adapter (same handler)
src/
  components/               AssistantChat, PropertyExplorer, AffordabilityForm, ...
  data/properties.json      demonstration property records
  types/                    affordability, property, assistant contracts
  utils/                    mortgage, dsr, affordability, propertyFilter, assistant*
```

---

## Known limitations

- Property records in `src/data/properties.json` are **demonstration data**
  (`isExample: true`), not verified live listings.
- The assistant depends on a third-party API. If it is unreachable, rate limited, or
  unconfigured, the chat panel says so; the rest of SimePark is unaffected.
- Only the down payment and mortgage repayment are modelled. Stamp duty, legal fees,
  valuation fees, insurance and maintenance are excluded from the estimate, and the
  assistant explains them only in general terms without quoting specific rates.
- Status is tracked per property, not per user or unit, and there is no database, no
  accounts, and no persistence of conversations beyond the browser session.
- The production build is typechecked with `tsc -b` against `src`, `api`, `server` and
  `vite.config.ts`. Vercel performs its own build of the function.
