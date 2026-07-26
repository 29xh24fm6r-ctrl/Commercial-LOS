# PR 138 — CRM-to-Deal NAICS and Industry Projection

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 7
**Findings addressed:** N-22, N-23
**Branch:** `phase7-crm-industry-naics-projection`

## Problem statement

The July 25 audit found that a CRM company's exact NAICS classification (e.g. NAICS 722511,
a restaurant) never durably reached the deal — the deal's borrower facts stayed missing, the banker
had to enter Industry manually, and the credit memo showed "Other" (N-22). Separately, the deal's
Industry field is a fixed six-value choice list that cannot represent every real CRM industry, so a
deal in an unmapped sector (like Accommodation/Food Services) had no durable classification at all,
coarse or exact (N-23).

## Investigation

A dedicated investigation found substantially more existing infrastructure than a fresh finding might
suggest, and the real, narrower gap within it:

- A full NAICS reference table (`cr664_naicscodes`), a sector-derivation module
  (`naicsSectorMap.ts`), an admin-managed NAICS→industry mapping table
  (`cr664_naicsindustrymap`), and a projection/hydration/apply pipeline
  (`dealIndustryProjection.ts` → `dealIndustryHydration.ts` → `hydrateDealIndustryFromCrm.ts`) already
  exist and are wired into two live UI surfaces (`CrmRelationshipPanel.tsx`,
  `DealProfileEditModal.tsx`).
- **The gap N-22 found is real**: that whole pipeline only ever persists the coarse, six-value
  `cr664_industry` label — the exact NAICS code, exact NAICS title, sector, source CRM organization
  id, and a last-verified timestamp were computed in memory and then discarded. Nothing durable was
  ever written for them.
- **N-23's restaurant example is real and deliberate-by-design, not a bug**: only 5 of 20 NAICS
  sectors are seeded in the mapping table (`docs/final-seven-workstreams/03_RESIDUAL_REMEDIATION.md`
  documents this explicitly, including the exact 722511 example); sector 72 (Accommodation/Food
  Services) has no mapping. Expanding the mapping table or the six-value choice list itself are
  maker/admin policy decisions (which mappings are "defensible" — see
  `docs/DEAL_INDUSTRY_CRM_NAICS_SETUP.md`) — this PR does not make that call. It implements N-23's
  own third, evidence-backed option instead: **persist the exact CRM-derived facts separately** and
  stop the coarse six-value column from being the only source of truth.
- **A real, additional defect**: a provenance-aware refresh function
  (`refreshDealIndustryFromCrm`, P1-7) already existed, fully tested, but was never actually called —
  `CrmRelationshipPanel.tsx`'s own local function of the same name called the provenance-BLIND
  `hydrateDealIndustryFromCrm` instead. This meant a "re-check CRM industry" click could never
  correctly distinguish "this was auto-derived earlier and should track a NAICS change" from "the
  banker typed this manually" — because nothing persisted which one a stored value actually was.

## Fixes in this PR

### N-22/N-23 — a durable, deal-scoped CRM/NAICS projection record
A new pure module, `crmIndustryProjectionRecord.ts`, defines `CrmIndustryProjectionRecord` (exact
NAICS code, exact NAICS title, sector code/title, source CRM organization id, the coarse deal
industry label if one was ever mapped, its provenance, and a last-verified timestamp) with fail-closed
serialize/parse functions, persisted to a new Memo/JSON column, `cr664_crmindustryprojection` (same
convention as `cr664_riskratinginputs` from Factory Arc Phase 5). It is built whenever the CRM/NAICS
projection carries a NAICS fact at all — `derived`, `no-sector`, **and `no-mapping`** — so a deal in
an unmapped sector (the restaurant example) now gets its exact classification recorded even though
the coarse `cr664_industry` column is never touched. `dealIndustryProjection.ts` was extended with a
`readNaicsTitle` dependency (via the existing `findNaicsByCode` exact-lookup) to carry the NAICS
title, not just the sector title, through the projection.

`hydrateDealIndustryFromCrm.ts`'s `hydrateDealIndustryFromCrm`/`refreshDealIndustryFromCrm` now
persist this record via a new `persistCrmIndustryProjection` dependency, in the same governed write
(`updateDealProfile`: validate → write → readback → audit) whenever one applies — independent of
whether the coarse industry label itself gets written.

### N-22 — the refresh gap: real provenance instead of a live-session guess
`CrmRelationshipPanel.tsx` now calls the real, imported `refreshDealIndustryFromCrm` — not the
provenance-blind `hydrateDealIndustryFromCrm` its own identically-named local wrapper used to call —
using the durable `source` field read back from the deal's own persisted projection record as
`priorSource`. A value this panel previously CRM-derived now correctly tracks a later NAICS change on
refresh; an actual manual entry is still never overwritten. `DealProfileEditModal.tsx`'s independent
"Apply CRM/NAICS industry" action was also updated to persist the same durable record in its own
governed write, so both live UI surfaces produce the same durable fact.

### N-22 — the credit memo shows the real classification, not just "Other"
`creditMemoDraft.ts`'s Borrower Overview section now adds a `NAICS classification:` line whenever a
durable projection record exists — showing the exact code/title/sector even when the coarse Industry
field is "Other" or blank because no mapping exists. This is the concrete fix for "the memo showed
Other": the real classification is now visible in the memo regardless of the coarse taxonomy's
limits.

### Schema migration (operator-run)
A new migration script set, `scripts/schema-migrations/pr138-crm-industry-projection/` (mirroring the
PR106 pattern exactly), adds the single new Memo column. Until an operator runs it and the SDK is
regenerated, the application degrades exactly like the existing PR105/106 columns do: reads return
`undefined`, writes to the raw column name still succeed against Dataverse once the column exists,
and nothing is fabricated in the interim.

## Files changed

- `src/crm/dealIndustryProjection.ts` / `.test.ts` — `naicsTitle` field + `readNaicsTitle` dependency
- `src/deals/crmIndustryProjectionRecord.ts` (new) / `.test.ts` (new) — the durable record + serialize/parse/build
- `src/deals/dealQueries.ts` — `crmIndustryProjectionJson` field (PR138-provisioned Memo column)
- `src/deals/write/updateDealProfile.ts` / `.test.ts` — `crmIndustryProjectionInputs` field spec
- `src/deals/hydrateDealIndustryFromCrm.ts` / `.test.ts` — `persistCrmIndustryProjection` dependency wired into both hydrate and refresh
- `src/crm/CrmRelationshipPanel.tsx` — real provenance-aware refresh wiring + projection persistence
- `src/crm/CrmRelationshipPanel.industry.test.tsx`, `CrmRelationshipPanelIndustryAutoHydration.test.tsx`, `CrmRelationshipPanelSiblingDeals.test.tsx`, `CrmRelationshipPanel.link.test.tsx` — updated to mock the real `refreshDealIndustryFromCrm` boundary
- `src/deals/DealProfileEditModal.tsx` / `.test.tsx` — persists the projection record in the same governed write as its own Apply action
- `src/deals/creditMemoDraft.ts` / `.test.ts` — NAICS classification line in Borrower Overview
- `scripts/schema-migrations/pr138-crm-industry-projection/` (new) — `columns.mjs`, `create-columns.mjs`, `verify-columns.mjs`, `rollback-columns.mjs`

## Schema impact

One new, additive Memo/JSON column: `cr664_crmindustryprojection` on `cr664_loandeal`. Operator steps
below. No existing column is modified, renamed, or removed. The six-value `cr664_industry` choice
column is untouched — expanding it or seeding additional NAICS→industry mappings remain separate,
explicitly-reviewed maker/admin decisions this PR does not make.

## Runtime behavior before / after

| | Before | After |
|---|---|---|
| A CRM company with a mapped NAICS (e.g. Manufacturing) | Coarse label applied; exact code/title/sector/provenance discarded | Coarse label applied AND the exact facts persisted durably |
| A CRM company with an unmapped NAICS (e.g. 722511, restaurants) | No durable fact at all — Industry stays blank/"Other", memo shows the same | The exact NAICS code/title/sector is now durably recorded and shown in the memo, even though the coarse label still can't represent it |
| "Re-check CRM industry" after the CRM record's NAICS changed | Provenance-blind — could never distinguish a stale auto-derived value from a real manual entry | Provenance-aware — a previously CRM-derived value updates; a real manual override still never gets overwritten |
| Credit memo Industry line | Only ever "Other" / the coarse label / Missing | Same coarse line, plus an exact NAICS classification line when one has been recorded |

## Tests added

- `dealIndustryProjection.test.ts` — 6 new tests (exact title carried through `derived`/`no-mapping`,
  failed/throwing title lookup never blocks the projection, live-dep smoke test)
- `crmIndustryProjectionRecord.test.ts` — new file, 15 tests (build for each projection kind including
  the restaurant no-mapping case, serialize/parse round-trip, fail-closed on corrupt JSON)
- `hydrateDealIndustryFromCrm.test.ts` — 5 new tests (projection persisted alongside/independently of
  the coarse label, no-mapping persists the exact facts, manual-override refresh still re-verifies
  NAICS facts, no persistence attempt when the projection has no NAICS fact at all)
- `updateDealProfile.test.ts` — 5 new tests for the new field spec
- `creditMemoDraft.test.ts` — 4 new tests for the NAICS classification line (present, absent, fail-closed on corrupt JSON, partial data)
- `DealProfileEditModal.test.tsx` — updated to assert the projection record is included in the governed write
- `CrmRelationshipPanel.industry.test.tsx`, `CrmRelationshipPanelIndustryAutoHydration.test.tsx` — updated to mock and assert against the real provenance-aware refresh function

## Validation results

- `npx tsc -b` — 0 errors
- `npx vitest run` — 915 test files, 13419 passed, 2 skipped, 0 failed
- `npm run build` — succeeded (only pre-existing-pattern INEFFECTIVE_DYNAMIC_IMPORT warnings, including
  one new instance of the same harmless pattern for the new `naicsSearch.ts` import path)
- `npm run audit:reachability` — 0 unexpected orphans (1071 total sources, 786 reachable, 285
  allow-listed orphans, consistent with prior phases' baseline)

## Operator steps

1. Run `scripts/schema-migrations/pr138-crm-industry-projection/create-columns.mjs` against the
   target Dataverse environment (`DATAVERSE_URL` / `DATAVERSE_ACCESS_TOKEN`) to create
   `cr664_crmindustryprojection` on `cr664_loandeal`.
2. Publish customizations in the Maker Portal.
3. Run `verify-columns.mjs` to confirm.
4. No SDK regeneration is required for this PR to function — the column is read/written via the raw
   column name through `dealQueries.ts`/`updateDealProfile.ts`, the same technique already used for
   the Phase 5 risk-rating/recommendation columns.

## Rollback considerations

Additive column + application code; no data migration of existing rows. `rollback-columns.mjs`
(`--confirm`) deletes the column. The application degrades honestly if rolled back: reads return
`undefined`, the NAICS classification line simply stops appearing in the memo, and the coarse
Industry hydration/refresh behavior (which does not depend on this column) is unaffected.

## Remaining limitations

- The six-value `cr664_industry` choice list itself is unchanged — N-23's restaurant example still
  shows no coarse Industry value (this is unchanged, deliberate, and documented pre-existing behavior,
  not something this PR alters). This PR closes the "no durable exact fact at all" gap, not the
  "coarse taxonomy is too small" gap — that remains a maker/admin decision.
- `DealProfileEditModal.tsx`'s "Apply CRM/NAICS industry" action now persists the projection record on
  apply, but does not itself run a provenance-aware refresh (it has no equivalent "re-check" button)
  — only `CrmRelationshipPanel.tsx`'s auto-run/re-check surface exercises the full
  hydrate-then-refresh lifecycle today.
- Population reconciliation between CRM Hub's company count and the New Deal picker's eligible-client
  count is architecturally guaranteed (both already read the same `loadClientLinkTargetOptions` union
  as of Workstream D) but has no explicit "N of M eligible, here's why" reporting surface — this was
  investigated as part of N-22/N-23 but is a separate near-miss, not the finding's core defect, and is
  left for a future phase if a reporting surface is wanted.
