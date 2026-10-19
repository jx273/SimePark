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
| Property explorer | Independent search with location, type, price, minimum bedrooms, facilities and affordability filters; switches between list and coordinate-backed map view. |
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
- **Supabase is the production catalogue.** When configured, published property and media
  records are read from Supabase; database errors are shown rather than masked by stale
  local records. The bundled four-property source fixture is used only when Supabase is not
  configured for local development.
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
2. **Inspect the current database before applying migrations.** Back up the project and
    review the IDs in `0004_property_catalogue.sql`. It only removes the explicit legacy
    `demo-001`–`demo-015` property rows, and only if there are no saved-home, comparison,
    activity, or media rows referencing them. It aborts if any other property IDs are
    present. It never deletes user-owned records. If the guard stops, review the affected
    rows and decide separately how to retain or remove them; do not weaken the guard to
    force the migration through.
3. **Apply only pending migrations** from `supabase/migrations/`. For a fresh project, run
   `0001_core_schema.sql`, `0002_seed_demo_properties.sql`, then
   `0004_property_catalogue.sql` and `0005_prototype_public_media.sql`. File
   `0003_admin_setup.sql` is a commented provisioning
   template, not an executable migration. For an existing project, do not blindly rerun
   already-applied files: check migration history and apply `0004_property_catalogue.sql`
   and `0005_prototype_public_media.sql` if they are pending. `0002_seed_demo_properties.sql`
   is a no-op and cannot re-seed demo properties. `0004` adds the metadata/media schema,
   safely removes known legacy rows, and imports SP-001–SP-004. Its `ON CONFLICT DO NOTHING`
   import cannot overwrite later Admin edits and does not run at app startup. `0005` allows
   public gallery metadata reads for published properties even when image permission is
   unknown; it is for prototype display only and is not a grant of redistribution rights.
4. **Get the API keys.** Project Settings → **API keys**. Copy the **publishable** key
   (older projects label it "anon"). Put it in `VITE_SUPABASE_PUBLISHABLE_KEY`, and the
   project URL in `VITE_SUPABASE_URL`, in `.env`.
5. **Configure authentication URLs.** Authentication → **URL Configuration**:
   - Set **Site URL** to the canonical deployed SimePark URL (for example,
     `https://your-project.pages.dev`). This is Supabase's default/fallback, not a
     per-environment setting.
   - Add the exact app callback URLs to **Redirect URLs**:
     `http://localhost:5173/auth/callback`, `http://localhost:5173/auth/reset`,
     `https://your-project.pages.dev/auth/callback`, and
     `https://your-project.pages.dev/auth/reset`. Add `http://localhost:5174/auth/callback`
     and `/auth/reset` only when deliberately using the temporary 5174 development port.
     Signup passes the current app origin plus `/auth/callback` as `emailRedirectTo`;
     password reset uses `/auth/reset`. Cloudflare Pages rewrites these clean paths to
     the SPA through `public/_redirects`, preserving Supabase's authorization code.
6. **Disable email confirmation for this prototype.** In Supabase Dashboard →
   Authentication → Sign In / Providers → Email, turn off **Confirm email**. Supabase
   returns an active session immediately after sign-up; no custom SMTP is required. If the
   setting remains on, the app explicitly says that confirmation is blocking sign-in and
   asks the operator to change the project setting. No email delivery is claimed or tested.
   The app's callback page reports accepted and expired/error links instead of showing a
   blank page. A link already sent to `localhost:5174` still needs that local server running
   and `http://localhost:5174/auth/callback` allow-listed; prefer the deployed URL for a
   link that must be opened on another device.
7. **Test password reset.** Sign in, sign out, choose "Forgot your password?", and follow
   the emailed link. It returns to `/#/auth/reset`, where the user sets a new password.
8. **Grant the first administrator** — see below.

The supplied photographs and floor plans are shown in the prototype gallery, with
attribution and the original `unknown` permission status preserved. This display is not a
claim of redistribution permission. Files under `public/media/` are directly fetchable if
deployed, regardless of database policies. Confirm you have permission to publish them
before a public deployment; otherwise remove them from `public/`. Review the Admin
permission status before publishing future uploads. Admin uploads are stored in the
private `property-media` bucket.

### Granting the first administrator safely

Administrator rights are stored in `public.admin_user_ids`, which has RLS enabled and **no
policies at all**. Consequently no API request from any signed-in user can read or write it,
and nothing in the application inserts into it. There is no "make me admin" button,
endpoint, or client function anywhere in this codebase.

1. Confirm the schema migrations are applied and `public.admin_user_ids` and
   `public.is_admin()` exist.
2. Sign up through the app after applying the prototype's email-confirmation setting above.
3. In Supabase, open **Authentication → Users** and copy your own user's UUID.
4. In the SQL Editor, run the administrator grant statement documented in
   `0003_admin_setup.sql`, replacing the placeholder with your UUID. Never use a
   service-role key in the frontend.
5. Reload the app. The Admin link appears for the authorized account; the route is
   `/#/admin`.
6. Verify the security property: as a signed-in non-admin, attempt
   `insert into public.admin_user_ids (user_id) values (auth.uid());`. Expect
   `ERROR: new row violates row-level security policy`. That error is the guarantee.

### Hackathon demo accounts

Create two separate accounts using **Create account** after the email-confirmation switch
above is disabled: one ordinary Demo User and one Demo Admin. Use demo-controlled email
addresses and credentials chosen by the event organiser; never commit passwords, put them
in `VITE_*` variables, or publish them in the demo UI. Password recovery requires a
deliverable email address.

Optionally set `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_ADMIN_EMAIL` to the respective
addresses. These public build-time values only add clearly labelled sign-in buttons that
prefill the email field; visitors must still enter the privately distributed password.
They do not grant or suggest roles. Only grant the Demo Admin user's UUID using the
SQL-Editor procedure above (also documented in `supabase/migrations/0003_admin_setup.sql`).
Do not add the Demo User to `admin_user_ids`. The Admin page is `/#/admin`; a signed-in
non-admin sees access denied, and Supabase RLS remains the authority for every write.
No demo accounts were provisioned or live-tested in this workspace.

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
    `/auth/callback` and `/auth/reset` URLs to Supabase's redirect list (step 5 of the
    Supabase section), disable **Confirm email** as directed, then create both demo
    accounts, grant only the Demo Admin UUID, and test each role. Save a home, reload, and
    confirm it is still there.

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
npm test          # 385 tests in the latest verified run
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

- the full test suite (385 tests) and the production build;
- the `/api/assistant` endpoint locally, including a **real Gemini reply** with the
  project's own key, and a live check that replies come back in English, Bahasa Melayu and
  Simplified Chinese;
- the "not configured" path, request validation, and provider error mapping;
- that no server-only credential value appears in the browser bundle;
- that the Supabase client is loaded lazily and not preloaded.

**Not verified:**

- **any deployment**, Cloudflare or otherwise;
- the real Supabase integration end to end. The database was inspected read-only and
  exposed 15 published legacy demo IDs; no database write or migration was executed.
  Signup, profile creation, email delivery, authorized Admin CRUD, and media upload remain
  untested against a live authorized project. An authorized operator must review and apply
  `0004_property_catalogue.sql` before the production catalogue contains only SP-001–SP-004;
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

- The four supplied records retain source-based listing details, but their availability is
  unknown, their coordinates are missing, and image redistribution permission is unknown.
  Those states are preserved. Source listing URLs do not grant image redistribution rights.
- The supplied photographs and floor plans are displayed in the prototype with their
  permission status still marked `unknown`. **The files in `public/media/` are directly
  fetchable as static assets if deployed, regardless of database gallery policy.** Confirm
  redistribution rights before public deployment or remove these files from `public/`.
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
