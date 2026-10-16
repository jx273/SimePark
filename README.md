# SimePark

Affordability-first Malaysian home discovery. A React + TypeScript + Vite single-page
application that estimates what a first-time buyer can afford, then filters and ranks real
property records against that estimate — with an optional AI assistant, accounts, saved
homes, comparison, and multilingual support.

> **Every figure is an illustrative planning estimate.** None of it is a loan approval, a
> loan offer, an eligibility decision, or financial advice.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Manual Supabase setup](#manual-supabase-setup)
- [Cloudflare deployment](#cloudflare-deployment)
- [Testing](#testing)
- [Security and privacy](#security-and-privacy)
- [Project layout](#project-layout)
- [Known limitations](#known-limitations)

---

## What it does

| Area | Detail |
| --- | --- |
| Affordability | Estimates a maximum property price as the **lower** of two ceilings: what the monthly repayment budget can service, and what available cash supports at a 10% down payment. Both are always shown, and the binding one is named. |
| Debt service ratio | Illustrative 40%-of-gross-income cap, minus existing commitments. A product assumption, not a bank rule. |
| Scenario simulator | Adjust extra cash, a target price, income, commitments, tenure and interest rate. Recalculated deterministically; never by the AI. |
| Property explorer | Filters by location, type, minimum bedrooms, max price and affordability; sorts by match, price or repayment. |
| Budget status | **Within budget**, **Over monthly budget**, or **Insufficient down-payment cash** — a cash shortfall is never mislabelled as "too expensive". |
| Provenance labels | **Example listing**, **Source provided**, **Verified on [date]**. "Verified" appears only when the record carries a genuine verification date. |
| Accounts (optional) | Saved homes, up to three-way comparison, saved budget scenarios, preferences, activity, account settings, password reset. |
| Admin | Create, edit, publish/unpublish and remove property records, with missing-field review. Authorisation is enforced by the database. |
| Languages | English, Bahasa Melayu, Simplified Chinese. Persisted, and the AI assistant replies in the selected language. |
| Voice input | Optional browser speech recognition for English and Bahasa Melayu. |
| Themes | Light, dark, and follow-system. Persisted, with the OS preference respected on a first visit. |
| Guests | Visitors can calculate, browse, filter, favourite and compare **without an account**. Registration is requested only to persist data across devices. |

### Financial rules preserved

The affordability engine was already correct and was not rewritten. It enforces:

- monthly repayment capacity and down-payment cash are **both** limits;
- `preferredMaxMonthlyPayment` is a user preference and is never confused with the
  calculated `estimatedMortgageBudget`;
- unknown values stay `NULL` and are never fabricated;
- demonstration records are never presented as verified listings.

All arithmetic lives in `src/utils/` as pure TypeScript. The AI model explains those
figures; it never computes or overrides them.

---

## Architecture

```
Browser (React SPA)
  │  POST /api/assistant   { message, history, context, language }
  ▼
/api/assistant                        ← the only place GEMINI_API_KEY is read
  ├─ functions/api/assistant.ts         Cloudflare Pages Function (production)
  └─ server/assistantDevMiddleware.ts   Vite dev middleware  (npm run dev, same handler)
  │
  └─ shared/server/handler.ts           validation, prompt, provider call, errors
                                        └─ shared/server/prompt.ts

Browser → Supabase (Postgres + Auth)
  └─ publishable key only, protected by Row Level Security
```

Key decisions:

- **One handler, two runtimes.** `shared/server/handler.ts` is written against the Web
  `Request`/`Response` standard. Cloudflare passes secrets on `context.env`; the dev
  middleware passes `process.env`. The handler never reads a global itself, because
  Cloudflare does **not** expose secrets through `process.env`.
- **Hash routing.** Cloudflare Pages serves the SPA from one `index.html`; a deep link such
  as `/property/demo-001` would need a rewrite rule. Hash routes work on any static host
  with no server configuration.
- **Guests are first-class.** Without Supabase configured the app runs on the bundled
  demonstration dataset with browser-local favourites, and sign-in explains that it is
  unavailable. Nothing crashes.
- **Supabase is lazy-loaded.** The client is ~228 kB and is imported dynamically, so a
  guest browsing properties never downloads it.

---

## Requirements

- **Node.js 18 or newer** (developed on 24). Node 18+ provides the global `fetch`,
  `Request` and `Response` the server handler uses.
- npm (a `package-lock.json` is committed).
- Optional, only for the AI assistant: a Google AI Studio API key.
- Optional, only for accounts and saving: a Supabase project (free tier).
- Optional, only for deployment: a Cloudflare account (free tier).

---

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

- App: <http://localhost:5173>
- Assistant endpoint: `POST http://localhost:5173/api/assistant`

`npm run dev` is all you need. The Vite plugin mounts the same handler the Pages Function
uses, so there is no second process. On startup the terminal reports whether a Gemini key
was detected.

**Use `localhost`, not `127.0.0.1`** — Vite binds IPv6 `::1`.

Verify the endpoint without a browser:

```bash
curl -s -X POST http://localhost:5173/api/assistant \
  -H 'Content-Type: application/json' \
  -d '{"message":"hi"}' | head -c 200
```

With no key you get `{"ok":false,"reason":"not_configured",...}` — an explanation, not a
crash.

### Environment variables

Two strictly separated groups. `.env` and `.dev.vars` are git-ignored; only the
`*.example` files are committed.

| Variable | Group | Where | Notes |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | **server-only secret** | `.env` locally; encrypted Secret on Cloudflare | Never `VITE_`-prefixed. Without it the assistant explains that it is unconfigured. |
| `GEMINI_MODEL` | server-only, optional | same as above | Defaults to `DEFAULT_GEMINI_MODEL` in `shared/contract/assistant.ts` (currently `gemini-3.5-flash-lite`, verified working). Only set it for a specific model your key can use. |
| `VITE_SUPABASE_URL` | **public** | `.env` / Cloudflare build variables | Inlined into the browser bundle. Public by design. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **public** | same | The publishable (older projects: anon) key. Protected by RLS, not by secrecy. |

**Never** put a Supabase secret key or a legacy `service_role` key in a `VITE_*` variable.
Those bypass Row Level Security. The app detects three forms of that mistake (a
`sb_secret_` prefix, a bare `service_role` value, or a legacy JWT whose decoded `role`
claim is `service_role`) and refuses to use the key rather than shipping it. Do not rely on
that guard.

### Optional: the real Cloudflare runtime locally

```bash
npm run cf:preview     # build, then wrangler pages dev dist
```

Requires `npx wrangler login` once. This exercises the actual Pages Function. It is **not**
needed for normal development.

---

## Manual Supabase setup

You must do these steps yourself. Nothing here was executed automatically, and no project
was created.

1. **Create a project** at <https://supabase.com> (free tier is sufficient). Note the
   project URL.
2. **Run the migrations.** Open **SQL Editor** in the dashboard and run these files, in
   order, from `supabase/migrations/`:
   - `0001_core_schema.sql` — tables, constraints, indexes, triggers, RLS policies
   - `0002_seed_demo_properties.sql` — the same 15 demonstration records the app bundles
   - `0003_admin_setup.sql` — **a template with commented statements**, not an automatic
     change. Read it; it explains how to grant the first administrator.
3. **Get the API keys.** Project Settings → **API keys**. Copy the **publishable** key
   (older projects label it "anon"). Put it in `VITE_SUPABASE_PUBLISHABLE_KEY`, and the
   project URL in `VITE_SUPABASE_URL`, in `.env`.
4. **Configure authentication redirect URLs.** Authentication → **URL Configuration**:
   - Site URL: `http://localhost:5173` for local work, and your production URL later.
   - Redirect URLs: add `http://localhost:5173/#/auth/callback` and
     `https://your-project.pages.dev/#/auth/callback`.
5. **Decide the email confirmation behaviour.** Authentication → Providers → Email:
   - **Confirm email ON** (default): after signing up, the UI says a confirmation link was
     sent and the user cannot sign in until they click it. This is what the app's
     "check your email" state describes.
   - **Confirm email OFF**: sign-up returns an active session immediately and the user goes
     straight to the dashboard. Useful for a demo, but it means anyone can register with an
     address they do not own.
6. **Test password reset.** Sign in, sign out, choose "Forgot your password?", and follow
   the emailed link. It returns to `/#/auth/reset`, where the user sets a new password.
7. **Grant the first administrator** — see below.

### Granting the first administrator safely

Administrator rights are stored in `public.admin_user_ids`, which has RLS enabled and **no
policies at all**. Consequently no API request from any signed-in user can read or write it,
and nothing in the application inserts into it. There is no "make me admin" button,
endpoint, or client function anywhere in this codebase.

1. Sign up normally through the app and confirm your email.
2. In Supabase, open **Authentication → Users** and copy your user's UUID.
3. Uncomment the `insert into public.admin_user_ids ...` statement at the top of
   `0003_admin_setup.sql`, replace the placeholder UUID, and run it in the SQL Editor.
4. Reload the app. The **Admin** entry appears in the header.
5. Verify the security property: as a signed-in non-admin, attempt
   `insert into public.admin_user_ids (user_id) values (auth.uid());`. Expect
   `ERROR: new row violates row-level security policy`. That error is the guarantee.

To revoke, delete the row. To delete an account entirely, delete the user in
**Authentication → Users**; private data is removed by cascade. The app deliberately holds
no `service_role` key, so it cannot delete accounts itself.

---

## Cloudflare deployment

The repository is already structured for Cloudflare Pages. **No deployment has been
performed or verified from this environment.**

### What is already in place

- `functions/api/assistant.ts` — the Pages Function for `POST /api/assistant`. Pages picks
  up the `functions/` directory automatically; no routing configuration is needed, because
  Pages serves a static asset when one matches and only invokes a Function otherwise.
- `wrangler.toml` — minimal config with `pages_build_output_dir = "dist"`. It declares no
  secrets, because it is committed.
- `npm run build` → `dist/` — the Vite static output.

### Steps you must perform

1. **Sign in** to <https://dash.cloudflare.com> (free account).
2. **Open Workers & Pages** in the sidebar.
3. **Create a Pages project** → *Connect to Git*.
4. **Connect the GitHub repository** containing this project. Authorise the Cloudflare
   GitHub app if prompted.
5. **Set the production branch** (for example `main`) under *Build settings*.
6. **Configure the build**:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
7. **Configure variables and secrets.** Open the project → **Settings → Variables and
   Secrets**. Add these for **Production** (and Preview, if you use it):

   | Name | Type | Value |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | **Secret (encrypted)** | your Google AI Studio key |
   | `GEMINI_MODEL` | Plain text, optional | leave unset for the shipped default |
   | `VITE_SUPABASE_URL` | Plain text | your project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Plain text | your **publishable** key |

   `GEMINI_API_KEY` must be a **Secret**, not a plain-text variable. `VITE_*` values are
   inlined at build time and are public; the non-`VITE_` secret is read at request time by
   the Function and never reaches the browser.
8. **Deploy.** Push to the production branch, or use *Create deployment* in the dashboard.
9. **Verify the frontend** at the assigned `*.pages.dev` URL.
10. **Verify `/api/assistant`** by sending one chat message and confirming a real answer
    rather than the "not configured" message.
11. **Verify authentication and database permissions.** Add the production
    `/#/auth/callback` URL to Supabase's redirect list (step 4 of the Supabase section),
    then sign up, confirm, sign in, save a home, reload, and confirm it is still there.

Optional CLI alternative to steps 3–8:

```bash
npx wrangler login
npx wrangler pages project create simepark
npx wrangler pages secret put GEMINI_API_KEY --project-name simepark
npm run cf:deploy
```

### Free-tier honesty

- Cloudflare Pages and Supabase both have free tiers that are sufficient for this project.
- **Gemini model availability, rate limits and free-tier eligibility change over time and
  must be checked by you in Google AI Studio.** This project does not assume any model is
  permanently free.
- The assistant makes **one** request per question with a 700-token output cap and **no
  automatic retries**, deliberately, to keep usage predictable. Quota exhaustion and
  provider outages are reported to the user instead of being retried.
- Do not assume the API is free indefinitely, and do not send automated traffic through a
  demo deployment.

---

## Testing

```bash
npm test          # 367 tests
npm run typecheck # tsc -b
npm run build     # typecheck + production build
```

Coverage includes the affordability ceilings and edge cases (zero income, commitments above
the cap, insufficient cash, invalid and non-finite input), the scenario simulator, property
enrichment/filtering/ranking, row-to-domain mapping and data-integrity rules, provenance
labelling, the router round trip, translation completeness and placeholder parity across all
three languages, theme resolution, auth error classification, the secret-key guard, the
assistant request contract, prompt construction, and the chat and voice UIs.

UI tests run under `happy-dom` via a per-file `@vitest-environment happy-dom` docblock.

### What was and was not verified

**Verified in this environment:**

- the full test suite and the production build;
- the `/api/assistant` endpoint locally, including a **real Gemini reply** with the
  project's own key, and a live check that replies come back in English, Bahasa Melayu and
  Simplified Chinese;
- the "not configured" path, request validation, and provider error mapping;
- that no server-only credential value appears in the browser bundle;
- that the Supabase client is loaded lazily and not preloaded.

**Not verified:**

- **any deployment**, Cloudflare or otherwise;
- the real Supabase integration end to end (no project or credentials were available). The
  SQL migrations, RLS policies, and admin procedure were written and reviewed but have not
  been executed against a live database;
- email confirmation and password-reset delivery, which need a configured project and a
  mailbox;
- `npm run cf:preview`, which needs `wrangler login`;
- physical-device testing. Responsiveness was implemented and reviewed but only exercised in
  a desktop browser at narrow viewport widths.

---

## Security and privacy

- The Gemini key is read server-side only, is never `VITE_`-prefixed, and never appears in
  the browser bundle. The client calls only `/api/assistant`.
- Only the Supabase **publishable** key reaches the browser, protected by RLS. Secret and
  `service_role` keys are refused by a guard that decodes the legacy JWT `role` claim.
- Request bodies are size-capped, messages length-limited, history trimmed, and the whole
  assistant context is re-validated and rebuilt field-by-field on the server.
- Provider error bodies are never forwarded to the browser; diagnostics are redacted and
  capped before logging.
- No logging of API keys, authorization headers, income/debt values, full prompts, or full
  request payloads.
- Private user tables are all RLS-protected and scoped to `auth.uid()`. Public property data
  is a separate table with separate policies.
- The `/privacy` page describes exactly what is stored and what is sent to Gemini, and
  states plainly that it is **not** a legal compliance assessment.

---

## Project layout

```
functions/api/assistant.ts     Cloudflare Pages Function entry point
shared/contract/assistant.ts   Runtime-agnostic request/response contract
shared/server/                 Validation, prompt, provider call, diagnostics
shared/server/__tests__/       Server-side tests
server/assistantDevMiddleware.ts  Vite dev adapter (same handler)
supabase/migrations/           SQL: schema, seed, admin template
src/
  auth/                        Auth context and session persistence
  components/                  Chat, voice, cards, explorer, simulator, chrome
  hooks/                       Scroll reveal, animated figures
  i18n/                        i18next setup and en/ms/zh resources
  lib/                         Supabase client, repositories, mappers, error mapping
  pages/                       Home, property detail, dashboard, admin, auth, privacy
  router/                      Hash router
  state/                       Favourites and comparison selection
  theme/                       Light/dark/system theme provider
  types/                       Domain types
  utils/                       Deterministic financial arithmetic
```

---

## Known limitations

- Property records are **demonstration data** (`is_example: true`, no source URL, no
  verification date). They are not real listings, and the UI labels them as such.
- Only the down payment and the mortgage repayment are modelled. Stamp duty, legal fees,
  valuation fees, insurance and maintenance are excluded from every calculation. The
  assistant describes those categories in general terms without quoting specific rates,
  because no verified current source is bundled.
- Comparison is capped at three properties, held in the browser, with each set recorded to
  account history.
- No analytics, no advertising trackers, no payments, no scraping, and no paid data
  providers.
- The assistant requires a third-party API. When it is unavailable, rate limited, or
  unconfigured, the chat panel explains that; the rest of the application is unaffected.
- The 404 route is client-side only. A hard request for an unknown path is answered by
  Cloudflare Pages' own 404 behaviour rather than the SPA.
