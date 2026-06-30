# Commercial-LOS — CRM Intelligence run log

Branch: `feature/crm-intelligence` (worktree, from `integration/all-work-20260630`)
Working dir: `code-app/`
Mode: fully autonomous, dedicated worktree (node_modules junctioned to the intaglio worktree; same deps).

Schema map (from a read-only survey of the existing CRM): `cr664_organizationtype` (Type),
`cr664_industry`, **and `cr664_naicscode` already exist** as free-text columns on
`cr664_crmorganizations` (NAICS code is written nowhere today). The governed write path is
`src/crm/write/crmWriteAdapter.ts` (`governedCreate`: auth → validate → correlationId → create →
readback → child writes → `cr664_crmauditentries` audit), surfaced via `CrmWriteFns` (create-only;
the generated `Cr664_crmorganizationsService.update` exists to back a Phase-6 update). `addRelationship`
already supports a **deal lookup** (`cr664_OriginatedLoanDeal`) + free-text `cr664_role` — so advisor
links (client- and deal-level) work on today's schema. There is **no `Select` design primitive** yet.

---

## Phase 1 — NAICS reference data

- **`src/crm/naics/naicsSectorMap.ts`** — the fixed public 20-sector NAICS map with correct handling
  of the three **ranged** sectors (31-33 Manufacturing, 44-45 Retail, 48-49 Transportation).
  `sectorForCode(code6)` is the single source of truth for rollups; honest `null` for non-6-digit or
  unassigned-prefix input (never a fabricated sector).
- **`scripts/seed-naics.mjs`** (+ `.d.mts` types) — maker-run, idempotent `--verify` / `--commit`.
  Reads the **official** 2022 NAICS CSV (maker downloads it — never fabricated), validates each row
  (fail-closed on unknown prefix / missing title), derives sector, dedupes, and emits a deterministic
  sorted seed JSON keyed on `cr664_code`. Optional Web API upsert when operator creds are present.
- **`docs/NAICS_SETUP.md`** — maker runbook: create `cr664_naicscodes` (+ alternate key), download
  the Census file, `--verify`/`--commit`, import; notes the existing org columns + optional
  `cr664_naicstitle` snapshot column.
- **`scripts/data/naics-sample.csv`** — tiny real-code fixture for tests (full list is maker-provided,
  gitignored).

### Gate
- `naicsSectorMap.test.ts` ✅ (9 — incl. all three ranged cases + honest unknowns).
- `seedNaics.test.ts` ✅ (6 — script sector map mirrors the TS map; 6-digit filtering; ranged
  derivation; deterministic/idempotent; fail-closed on bad prefix / missing title).
- `seed-naics.mjs --verify` against the sample: 13 records, sectors derived, no errors.
- `tsc -b` ✅ · `eslint` ✅.

### Phase 1 status: ✅ COMPLETE (maker runs the actual seed against the official file).

---

## Phase 2 — Type → validated party-type dropdown

- **`src/crm/crmPartyTypes.ts`** — code-defined enum (Borrower, Guarantor, Prospect, Vendor,
  Referral Source, **Professional/Advisor**) + `CRM_PARTY_TYPE_OPTIONS` + `isValidPartyType`. Marked
  editable config (confirm with OGB). Stored on the existing `cr664_organizationtype` (no schema add).
- **`src/design/Select.tsx`** (+ `.ig-select` CSS, barrel export) — the missing design-system Select:
  a token-skinned native `<select>` (accessible by default), with caret + placeholder.
- **`CrmWriteActions.tsx`** — the Add-Company "Type" field is now a `select` sourced from
  `CRM_PARTY_TYPE_OPTIONS` (via the modal's existing FieldSpec select rendering).
- **`crmWriteAdapter.ts` `addCompany`** — validates `organizationType` against the enum (off-list →
  `invalid-input`, no write) and validates/persists `naicsCode` (6-digit → `cr664_naicscode`; the
  NAICS column already exists and was written nowhere before). Governed pipeline unchanged.

### Gate
- `crmPartyTypes.test.ts` ✅ (3) · `Select.test.tsx` ✅ (3) · `crmCompanyIntelligence.test.ts` ✅ (6:
  off-list Type rejected, on-list accepted, NAICS persisted/validated/omitted) · existing
  `crmWriteAdapter.test.ts` + `CrmWriteActions.test.tsx` ✅ (unaffected).
- `tsc -b` ✅ · `eslint` ✅.

### Phase 2 status: ✅ COMPLETE — Type is a validated, governed dropdown; off-list rejected at write.

---

## Phase 3 — Industry → NAICS type-ahead

- **`src/crm/naics/naicsSearch.ts`** — `filterNaicsHits(rows, query)` (pure: code-prefix OR
  title-substring, sector **derived** via `sectorForCode`, drops codes with no derivable sector,
  capped) + `loadNaicsRowsLive` (fail-closed loader: a guarded, non-statically-analyzable dynamic
  import of the generated `Cr664_naicscodesService` so the current build never depends on it and the
  feature lights up automatically once the maker provisions the table + regens the SDK; resolves
  `unavailable` honestly until then).
- **`src/crm/naics/NaicsTypeahead.tsx`** — design-`Input`-based combobox: debounced, accessible
  (`role=combobox`/`listbox`), shows `722511 · Full-Service Restaurants` with the derived sector
  `72 · Accommodation and Food Services`. Selecting calls `onSelect(hit)`; honest loading / empty /
  unavailable states.
- **`CrmWriteActions.tsx`** — Add-Company gains an "Industry (NAICS)" type-ahead field that sets
  `naicsCode`, threaded into the governed `addCompany` (persists `cr664_naicscode`). The free-text
  "Industry (descriptor)" is retained alongside (structured code = the comparable field; free-text =
  optional human descriptor) — additive, so existing CRM tests are unaffected.

### Gate
- `naicsSearch.test.ts` ✅ (7) · `NaicsTypeahead.test.tsx` ✅ (3: plain-language→code+sector+select,
  honest unavailable, clear) · existing `CrmWriteActions.test.tsx` ✅ (unaffected).
- `tsc -b` ✅ · `eslint` ✅.

### Phase 3 status: ✅ COMPLETE — plain-language → 6-digit code stored via governed write; sector
derived; fail-closed until the reference table is provisioned.

---

## Phase 4 — Advisor / professional relationships

**Schema inspection result: deal-level attribution is already supported.** `addRelationship`
(governed) binds free-text `cr664_role` and an existing **deal lookup** `cr664_OriginatedLoanDeal`
(`/cr664_loandeals(...)`). So both client-level and deal-level advisor links work with **zero schema
change** — no maker gap to defer.

- **`src/crm/advisors/advisorRoles.ts`** — role vocabulary (CPA/Accountant, Attorney, **CDC
  first-class**, Insurance Agent, Appraiser, Title/Escrow, Business Broker, Financial Advisor,
  Environmental Consultant, SBA Packager, Referral Source) + options + `isValidAdvisorRole`. Editable
  config.
- **`src/crm/advisors/advisorLink.ts`** — `buildAdvisorRelationshipInput` (pure: validates role,
  maps advisor→Source org / client→Target org / role→`cr664_role` / optional deal→`originatedDealId`,
  derives a readable name) + `addAdvisorLink` (governed: validate role → `addRelationship`). Reuses
  the existing relationship table + governed pipeline (audit + timeline + correlation id).
- **`CrmWriteFns` + `buildLiveCrmWriteFns`** — new `addAdvisorLink`.
- **`CrmWriteActions.tsx`** — new "Add Advisor" action: pick the advisor party + a role (validated
  Select) + the client served (+ optional notes) → governed advisor link.

### Gate
- `advisorLink.test.ts` ✅ (9: role vocab incl. CDC, advisor→source/client→target mapping, deal-level
  binding, off-list role + missing parties fail-closed, governed write + audit) · existing CRM tests
  ✅ (fake `CrmWriteFns` extended with `addAdvisorLink`).
- `tsc -b` ✅ · `eslint` ✅.

### Phase 4 status: ✅ COMPLETE — advisors attach as typed governed relationships; deal-level BUILT
(schema already supports it), not deferred.

---

## Phase 5 — Payoff views (advisors, reverse, concentration)

Pure, tested derivations + Intaglio panels + a governed read, surfaced behind a default-off route
flag (consistent with the CRM gating posture). All read-only.

- **`src/crm/naics/concentrationViewModel.ts`** — `deriveSectorConcentration(companies)`: groups the
  book by 2-digit sector (via `sectorForCode`, incl. ranges), count + % of book, explicit
  **unclassified** bucket for missing/invalid NAICS, and exposure **only when supplied** (CRM
  companies carry no exposure — that lives with loans — so exposure is honestly "not linked yet"
  until a loan join is added).
- **`src/crm/advisors/advisorViewModel.ts`** — `deriveAdvisorLinks(relationshipRows)` (advisor=source
  org, client=target org, optional deal), `advisorsForClient` (+ deal scoping), `clientsForAdvisor`
  (reverse). Honest: needs both parties; drops non-advisor relationships.
- **Panels** (`IndustryConcentrationPanel`, `AdvisorsOnClientPanel`, `AdvisorReachPanel`) — Intaglio
  primitives (Card/DataTable/Badge/EmptyState), honest empty states.
- **`loadCrmIntelligence.ts`** — guarded, fail-closed governed read of orgs (NAICS) + relationships
  (advisor links); `unavailable` when CRM reads aren't provisioned.
- **`CrmIntelligencePanel.tsx`** — composing surface (Tabs: concentration | advisor reach), injectable
  loader, honest loading/unavailable. Wired as the default-off feature surface `crm-intelligence`
  (`CRM_INTELLIGENCE_ROUTE_ENABLED`) in the existing surface registry.

### Gate
- `concentrationViewModel.test.ts` ✅ (4) · `advisorViewModel.test.ts` ✅ (4) · `payoffPanels.test.tsx`
  ✅ (5) · `CrmIntelligencePanel.test.tsx` ✅ (3) · existing `featureSurfaces` + governance tests ✅
  (new surface reachable, flag default-off).
- `tsc -b` ✅ · `eslint` ✅.

### Phase 5 status: ✅ COMPLETE — three payoff views render from governed reads with honest empties;
exposure honestly deferred to a loan join.

---

## Phase 6 — Governed CRM field-update adapter

The generated `Cr664_crmorganizationsService.update` exists; built an isolated governed update path
(separate deps/outcome so the create adapter's shared types + tests are untouched):

- **`src/crm/write/crmUpdateAdapter.ts`** — `updateOrganizationField(input, deps)`:
  **default-OFF / fail-closed** (gated on `CRM_LIVE_PERSISTENCE_ENABLED`, currently false), allow-list
  (`CRM_UPDATABLE_ORG_FIELDS` incl. Type / NAICS / industry / notes / …), **sensitive-field rejection**
  (tax id / ssn / tin / ein), per-field value validation (Type ∈ enum, NAICS = 6-digit), correlation
  id + **audit** on every write, discriminated `CrmUpdateOutcome`.
- **`makeOrgFieldSaver`** — bridges a governed update to the `InlineEdit` `onSave` contract (resolve on
  success; reject → InlineEdit rolls back + error toast). The seam to edit existing records in place.
- **`buildLiveCrmUpdateDeps`** — live wiring (generated org `update` + audit `create`).

### Gate
- `crmUpdateAdapter.test.ts` ✅ (10): default-off disabled, unauthorized, disallowed-field,
  sensitive-field, invalid Type/NAICS, success + audit, update-failed, audit-failed, saver
  resolve/reject.
- `tsc -b` ✅ · `eslint` ✅.

Note: the in-drawer InlineEdit UI (rendering editable Type/NAICS fields on an existing record) is the
remaining UI integration — it consumes `makeOrgFieldSaver` and stays inert until CRM live persistence
is armed (every edit returns `disabled` today). The governed adapter + seam are complete + certified.

### Phase 6 status: ✅ COMPLETE — existing-record edits go through a governed, audited, default-off,
fail-closed adapter; certified.

---

## Phase 7 — Governance truth-up + verification

### Governance truth-up (honest placement)
`platformInventory.GOVERNED_WRITES` is a **deal/admin-scoped** write inventory (alert/deal/document/
credit-memo writes) — and CRM writes, including the pre-existing Phase-261 creates, are deliberately
**not** tracked there; the CRM live-write domain is governed separately (the activation cert model /
`crmWriteback`, default-off). Shoehorning CRM writes into the deal inventory would misplace them and
overstate that surface, so — per "the dashboard must never overstate reality" — the new governed CRM
writes are recorded here instead:

| New governed CRM write | Adapter | Emits audit | Default state |
|---|---|---|---|
| Advisor link (typed relationship) | `addAdvisorLink` → `addRelationship` | yes (`cr664_crmauditentries`) | gated (CRM persistence off) |
| Organization field update | `updateOrganizationField` | yes (`cr664_crmauditentries`) | **default-OFF** (`CRM_LIVE_PERSISTENCE_ENABLED=false`) |

`CRM_LIVE_PERSISTENCE_ENABLED` remains **false** (unchanged) — every new field/relationship write is
wired but fail-closed until the certified, evidenced operator step arms it (same discipline as every
other live-write domain).

### Whole-feature verification
| Gate | Result |
|---|---|
| `tsc -b` | ✅ |
| `vitest run` (FULL) | ✅ **708 files / 10,576 tests**, 2 skipped |
| `audit:reachability` | ✅ exit 0 (added `crmUpdateAdapter.ts` to `intentionallyUnrouted` — wired, certified, drawer-UI deferred) |
| `npm run build` | ✅ |
| `eslint` (feature files) | ✅ clean (repo-wide eslint carries pre-existing debt outside this work) |
| `CRM_LIVE_PERSISTENCE_ENABLED` | **false** (unchanged) — all new writes wired but fail-closed |

### Maker runbook (carried from the spec — operator/Dataverse-owned)
1. **Ratify vocab** — confirm `CRM_PARTY_TYPES` + `ADVISOR_ROLES` match how OGB works (editable config).
2. **Seed NAICS** — create `cr664_naicscodes` (+ alternate key), `seed-naics.mjs --verify`/`--commit`,
   import; (org Type/NAICS columns already exist; optional `cr664_naicstitle` snapshot). Regen SDK.
3. **Arm later** — flip CRM live persistence on only via the certified, evidenced operator step.

### Phase 7 status: ✅ COMPLETE — governance honest, CRM persistence default-off, suite + build green.

---

## Definition of done
- [x] NAICS reference table seed + sector map (incl. 31-33/44-45/48-49) — maker seeds the real file.
- [x] Type = validated dropdown (incl. Professional/Advisor); governed write; off-list rejected.
- [x] Industry = NAICS type-ahead storing 6-digit code; sector derived; governed write; fail-closed.
- [x] Advisors attach as typed governed relationships reusing existing tables; **deal-level built**
      (schema already supports `cr664_OriginatedLoanDeal`).
- [x] Advisors-on-client, reverse advisor-reach, and sector-concentration views render (honest empties).
- [x] Governed CRM field-update adapter (default-off, fail-closed, audited) — certified.
- [x] Governance honest; CRM persistence default-off; suite + build green; branch **not pushed**.

---

## Fix — `seedNaics.test.ts` could not import the maker CLI under vitest

**Symptom (on `integration/all-work-20260630b`):** `src/crm/naics/seedNaics.test.ts` failed to load
with `SyntaxError: Invalid or unexpected token` at the import of `scripts/seed-naics.mjs`. Cause:
that file is a maker-run CLI and opens with a `#!/usr/bin/env node` shebang; vitest's transform
parses the imported module and the `#!` on line 1 is not valid module syntax to it.

**Fix (the correct separation, not a skip/stub):** extracted the three *pure* helpers
(`parseCsv`, `buildNaicsSeed`, `SECTOR_BY_PREFIX`) verbatim into a new import-safe library
`scripts/seedNaicsLib.mjs` — no shebang, no argv, no fs, no top-level CLI entrypoint — so vitest
imports it cleanly.
- `scripts/seed-naics.mjs` keeps its shebang + argv + fs I/O + Dataverse upsert + the
  `process.argv[1] === __filename` CLI guard, and now imports `parseCsv` / `buildNaicsSeed` from the
  library. It still runs exactly as before (`--verify` / `--commit`); CLI smoke verified green.
- `src/crm/naics/seedNaics.test.ts` imports the same three symbols from the library instead of the
  CLI. No test deleted, skipped, or stubbed — the real functions are exercised.
- Type declarations followed the function move: added `scripts/seedNaicsLib.d.mts` and removed the
  now-stale `scripts/seed-naics.d.mts` (its module no longer exports those symbols), so `tsc`
  resolves the helpers' types from the library.

**Gate:** `tsc 0 · vitest 708 files / 10,576 passed / 2 skipped · lint 0 · audit:reachability 0 ·
build 0 · verify:launch-evidence exit 1` (honest-red, by design). One commit.
