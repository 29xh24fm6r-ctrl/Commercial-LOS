# PR120 — CRM-to-Deal Fact Propagation

Phase 8 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "CRM-to-deal fact
propagation" (the July 24 audit's "CRM industry not propagating to deal" citation).

## Investigation

Traced the full CRM→deal Industry propagation chain: deal → `cr664_Client` (client relationship)
→ `cr664_Organization` (CRM organization) → `cr664_naicscode` → NAICS sector → mapped deal
industry. The feature is fully built and wired on the client side:

- `src/crm/dealIndustryProjection.ts` — the pure projection (governed, honest missing-hop states,
  never fabricates).
- `src/deals/dealIndustryHydration.ts` / `src/deals/hydrateDealIndustryFromCrm.ts` — decision logic
  + governed-write orchestration (auto-apply on link, provenance-aware refresh that never
  overwrites a manual override).
- `src/crm/CrmRelationshipPanel.tsx` — wires both the automatic hydration effect and a manual
  "Refresh from CRM" action.
- `src/deals/DealProfileEditModal.tsx` — the Industry field banner (derived/suggest/conflict
  states) and "Apply CRM/NAICS industry" action.

**Root cause of "not propagating":** `docs/DEAL_INDUSTRY_CRM_NAICS_SETUP.md` already documents
this exact gap — the reverse lookup `cr664_Organization` on `cr664_clientrelationship` has not
been applied. Confirmed independently: `Cr664_clientrelationshipsModel.ts` has no
`_cr664_organization_value` field. Every downstream hop the chain depends on (organization →
NAICS, NAICS → sector, sector → industry mapping table) is already live —
`cr664_naicsindustrymaps` has a real generated model/service and `cr664_naicscode` exists on
`Cr664_crmorganizationsModel.ts`. The single missing link at step 1 makes
`readClientOrganizationId` return no organization id for every deal, so the chain always resolves
`no-org-link` — never a fabricated result, but never a propagated one either.

This is not a new finding requiring new design work: `scripts/dataverse/create-deal-industry-crm-naics.ps1`
already proposes the exact missing lookup, dry-run by default, following this repo's established
schema-migration convention. It is operator-gated the same way Phase 2's SDK regeneration is — no
code change here can apply it.

## What changed

`src/crm/dealIndustryProjection.ts`'s `fetchMappingRows()` read the `cr664_naicsindustrymaps`
table through the generic Power Platform data client by data-source name, with a comment stating
"its generated service does not exist until the table is added + the SDK regenerated." That
service now exists (confirmed: `src/generated/services/Cr664_naicsindustrymapsService.ts` and its
model are both present, and the table is registered in `power.config.json`) — the workaround
predates the regeneration and was never updated. Swapped to the real generated
`Cr664_naicsindustrymapsService.getAll()`. Functionally identical (both were reading rows and
mapping the same three fields); this just removes a stale generic-client dependency and a
now-inaccurate comment, and gains real generated typing for this one read.

Added test coverage for the live dependency factory's `fetchMappingRows` (previously untested):
successful read + row mapping, and a failed-read case that surfaces the error honestly rather than
fabricating rows.

## What did NOT change

- No new migration script — one already exists and is correctly scoped
  (`scripts/dataverse/create-deal-industry-crm-naics.ps1` + `docs/DEAL_INDUSTRY_CRM_NAICS_SETUP.md`).
- No generated SDK file was touched.
- `hydrateDealIndustryFromCrm.ts` / `CrmRelationshipPanel.tsx` / `DealProfileEditModal.tsx` are
  untouched — already correct and ready to work the moment the `cr664_Organization` lookup lands.

## Status

Phase 8 is **blocked on the same class of operator action as Phase 2** — an operator needs to run
the existing `create-deal-industry-crm-naics.ps1` script (already written, already documented,
dry-run by default) and then regenerate the SDK for the two touched tables. No further client code
is needed once that lands; the full chain is already built, tested, and wired.

## Validation

Per the updated working-model directive, full `vitest run` / `build` are batched and deferred
rather than re-run after every phase. This phase's targeted validation:

- `npx tsc -b` — 0 errors
- `npx vitest run src/crm/dealIndustryProjection.test.ts` — 11 tests, 0 failed (9 existing + 2 new)
- `npm run audit:reachability` — 0 unexpected orphans
