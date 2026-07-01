# AAR — NAICS Lookup UX Enhancement

Branch: `feature/naics-lookup-ux` (from `integration/all-work-20260630d`). Branch only; not pushed.

## What shipped (adapted to this codebase)
The spec assumed a Next.js-style server API (`GET /api/reference/naics/:code`, "don't call Dataverse
from the browser"). This is a **Power Apps code app** (Vite/React + the generated typed Dataverse
SDK, vitest) with **no Node server** — Dataverse access runs in the app via the generated
`Cr664_naicscodesService`, authenticated by the Power Apps host, so **tokens are never in app code**.
The security intent ("no token in the browser, no third-party API") is therefore already satisfied by
the existing `naicsSearch` loader. A full NAICS field surface also already existed (`NaicsTypeahead`
+ `naicsSearch` + `naicsSectorMap`). So this work **extended** that surface rather than inventing a
parallel `NaicsCodeField` / server endpoint.

### Files changed
| File | Change |
|---|---|
| `src/crm/naics/validateNaicsCode.ts` (new) | Pure helpers: `normalizeNaicsCode` (strip non-digits, cap at 6), `isSixDigitNaicsCode`, `validateNaicsCode(input, rows)` → `{ code, title, validFormat, found, valid }`, fail-closed against the internal reference rows (never fabricates a title). |
| `src/crm/naics/validateNaicsCode.test.ts` (new) | 8 helper tests. |
| `src/crm/naics/NaicsLookupLinks.tsx` (new) | Reusable external-lookup aid: help copy + Census (`https://www.census.gov/naics/`) and NAICS.com (`https://www.naics.com/search/`) links, `target="_blank" rel="noopener noreferrer"`, "Third-party lookup" tag. Static links — no scrape/iframe/API/runtime dependency. |
| `src/crm/naics/NaicsLookupLinks.test.tsx` (new) | 3 tests (labels, exact hrefs, security attrs). |
| `src/crm/naics/NaicsTypeahead.tsx` | Renders `<NaicsLookupLinks/>` + a direct-entry validation line: a typed six-digit code that exists confirms `✓ code — title`; an unknown six-digit code shows "not found in the internal reference table"; a short/ill-formed numeric entry shows "Enter a valid six-digit NAICS code." Existing typeahead/search/save behaviour preserved. |
| `src/crm/naics/NaicsTypeahead.test.tsx` | +4 tests (AC1 links, AC3 found→title, AC4 unknown→warning, bad-format). |

Because `NaicsTypeahead` is already mounted in the Add-Company form (`CrmWriteActions`), the lookup
links + validation wire into the live form automatically — no borrower/deal flow was touched.

## Acceptance criteria
- **AC1** links render with exact labels, hrefs, `target=_blank`, `rel=noopener noreferrer` — ✅ (component + typeahead tests).
- **AC2** input normalizes to six digits — ✅ (`normalizeNaicsCode`; the typeahead stays free-text for industry search, normalization applies at the validation/storage layer per the field convention).
- **AC3** valid code → internal title displayed — ✅.
- **AC4** unknown code → "not found in the internal reference table" — ✅.
- **AC5** no external runtime dependency (links are static; validation is the internal table) — ✅.
- **AC6** no schema mutation — ✅ (see below).
- **AC7** tests + TypeScript pass — ✅.

## Confirmation: no Dataverse writes, no schema mutation
- No table/column created, renamed, deleted, or altered. No `.d.ts`/model change. Validation is
  **read-only** against `cr664_naicscodes` via the existing loader.
- No live Dataverse write in tests — every test uses injected loaders/mocks; no governed write, no
  gate touched (`AUTO_STAGE_ADVANCE`, CRM persistence, borrower-send, boarding, checklist all
  untouched). `verify:launch-evidence` stays honest-red.
- No new runtime dependency; no third-party script/iframe/scrape/API.

## Test-environment note (not part of the feature)
Mid-work, the shared `node_modules` was thrashed by concurrent automation (documented worktree
instability), and the `@microsoft/power-apps/dist/data` module stopped resolving under vitest (its
dist re-exports are extensionless, which Node's strict ESM resolver rejects). This broke **4 test
files that load the generated SDK unmocked** — `naicsSearch`, `CrmWriteActions`, `CrmHubWorkspace`,
`phase258BankerSystemsAcceptance` — none of which my feature changed (they passed ~an hour earlier).
A global vitest `deps.inline` was tried and rejected: broad inlining transformed
`@microsoft/power-apps/app` too and broke 14 workspace-entitlement tests; narrow inlining didn't
catch the module. The clean fix was the repo's own idiom — a one-line, behaviour-free
`vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }))` per affected file (as in
`featureSurfaces.test.tsx`) — since those tests already drive their components through injected
loaders and never issue a real query. No config, product, route, or assertion was changed.

## Gate
`tsc 0 · vitest 10,613 passed / 2 skipped · lint 0 · audit:reachability 0 · build 0 ·
verify:launch-evidence exit 1 (honest-red)`. New feature tests: 15. Branch not pushed.

## Compliance position (unchanged)
NAICS lookup links are user aids; final NAICS selection stays banker-entered and is validated only
against the internal `cr664_naicscodes` reference table — the app does not certify a company's NAICS.
