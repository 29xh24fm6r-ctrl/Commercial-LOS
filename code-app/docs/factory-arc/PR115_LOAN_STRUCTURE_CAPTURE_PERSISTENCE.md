# PR115 — Loan Structure Capture / Persistence

Phase 3 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "Loan structure
capture/persistence."

## What this closes

Loan Purpose, Loan Term (months), and Ownership Structure are now real, governed, durable deal
fields — captured in the Deal Profile modal, written through the existing
`updateDealProfile.ts` authorize → validate → update → readback → audit pipeline, and read back
into the Deal Cockpit on every load. Nothing here is local-only or session-scoped.

This closes `platformInventory.ts`'s `origination-loan-structure-fields` NOT_WIRED gap (see
`platformInventory.test.ts`'s `expect(ids.has('origination-loan-structure-fields')).toBe(false)`).

## Why this didn't wait on Phase 2's SDK regeneration

Phase 2 (PR114) found that genuine `pac code` regeneration of the Loan Deal SDK is blocked in
this sandbox (no `pac` CLI, no Dataverse credentials) and escalated it to the operator. Phase 3
investigation found that the three fields this phase needs — `cr664_loanpurpose` (String, ≤200),
`cr664_loantermmonths` (Integer), `cr664_ownershipstructure` (String, ≤100), all specced in
`scripts/schema-migrations/pr105-loan-structure/columns.mjs` — do not need the generated SDK to
declare them to round-trip correctly:

- `Cr664_loandealsService.update(id, changedFields)` passes `changedFields` straight through
  `serializeMultiSelectPicklistFields` (a no-op for non-multi-select keys) into
  `client.updateRecordAsync(dataSourceName, id, body)` — the body is typed
  `Record<string, unknown>` at the call site in `updateDealProfile.ts` (via an `as unknown as`
  cast already present for every field this adapter writes), so an extra raw column key reaches
  the live Dataverse PATCH regardless of whether the generated model declares it.
- `Cr664_loandealsService.get(id)` returns the full retrieved row; `dealQueries.ts`'s
  `mapDealDetail` already reads several fields off the raw annotated row (`raw['...']`) rather
  than the typed accessor for exactly this kind of case (see the existing
  `getLookupFormattedValue(raw, ...)` pattern), so the three new columns are read the same way.

This was a deliberate decision, not an assumption: if the live table did not actually carry these
columns, the write fails honestly through the existing `write-failed` outcome and the sanitized,
audited error path — nothing here fabricates success. See `updateDealProfile.test.ts`'s new
"loan structure fields" describe block for the write/reject/readback-mismatch/clear tests, and
`loadDealForBanker.test.ts`'s new describe block for the read-mapping tests, including the case
where the columns aren't present (fields map to `undefined`, not a crash).

The generated SDK model still does not declare these three fields — that gap is real and stays
tracked by Phase 2's escalation. Once an operator runs the `pac code` regeneration there, these
three fields gain proper generated types; this phase's raw-key approach continues to work
unchanged (the generated model gaining a declaration doesn't change the wire format).

## What changed

- `src/deals/write/updateDealProfile.ts` — added `loanPurpose` (text, ≤200 chars),
  `loanTermMonths` (integer), `ownershipStructure` (text, ≤100 chars) to `DealProfileField` /
  `DEAL_PROFILE_FIELD_SPECS` / `VerifiedProfilePatch`. Added a `maxLength` option to `FieldSpec`
  and enforced it in `prepareField`'s `'text'` case — the same class of unbounded-field bug Phase
  1 fixed for the credit memo, guarded here before it could ever reach Dataverse's real column
  ceiling.
- `src/deals/dealQueries.ts` — added `loanPurpose` / `loanTermMonths` / `ownershipStructure` to
  `DealDetail` (optional, matching the existing Phase 189D precedent so hand-built test fixtures
  keep compiling) and to `mapDealDetail`, read off the raw retrieve row.
- `src/deals/DealProfileEditModal.tsx` — added the three fields to the modal's form (after
  Collateral, before the reference-lookup group), each with its own "Missing" chip. Deliberately
  NOT folded into the modal's top-level "Complete vs. Edit" label heuristic or into
  `dealCockpitMetrics.ts`'s `PROFILE_COMPLETENESS_FIELDS` — that catalog documents itself as
  requiring its own deliberate reviewer decision per field; extending it is left to a separate,
  explicitly-reviewed follow-up once these three have live signal for how bankers actually use
  them.
- `src/shared/governance/platformInventory.ts` — removed the now-resolved
  `origination-loan-structure-fields` NOT_WIRED entry.
- Updated the NOT_WIRED count (14 → 13) and its doc citations in
  `docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md`, `docs/PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md`,
  `releaseCandidateSnapshot.test.ts`, and `phase129AMicrosoftVibeScopeAudit.test.ts` to keep the
  doc/code snapshot pins in sync, following the exact precedent already established when
  `email-delivery` was removed from NOT_WIRED in Phase 105.

## What did NOT change

- No generated SDK file was touched.
- `cr664_financialspreadinputs` (Global Cash Flow, Phase 4) and `cr664_riskratinginputs` /
  `cr664_underwritingrecommendationinputs` (risk rating, Phase 5) are untouched — separate PR105
  / PR106 columns, out of scope for this phase.
- The superseded Workstream 5A proposal (`src/deals/dealPurposeTermOwnershipSchema.ts`,
  option-set-typed, different field names) is untouched and still explicitly disclosed as
  not-wired in its own file header.

## Validation

- `npx tsc -b` — 0 errors
- `npx vitest run` — 905 test files, 13211 passed / 2 skipped (pre-existing), 0 failed
- `npm run audit:reachability` — unchanged (1062 non-test sources / 775 reachable / 287
  allow-listed / 0 unexpected)
- `npm run build` — succeeds
