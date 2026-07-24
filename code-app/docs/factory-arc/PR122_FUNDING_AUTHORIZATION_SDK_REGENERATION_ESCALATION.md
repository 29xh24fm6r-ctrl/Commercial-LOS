# PR122 — Funding Authorization SDK Regeneration: Investigation + Operator Escalation

Factory Arc Phase 10 of the Post-PR111 Live Activation and Audit Remediation Factory Arc:
"Funding Authorization Dataverse adapter."

## What this phase found

The mission flagged PR 112's prior hand-authored work as needing reconciliation with the "do not
hand-edit generated SDK files" rule. Direct inspection confirms this was **already done correctly at
the time**, not a silent violation:

- `src/generated/models/Cr664_fundingauthorizationsModel.ts`'s own header discloses, in full, that it
  was hand-authored to mechanically match
  `scripts/schema-migrations/pr107-funding-authorization/entity.mjs` — **not** produced by a real
  `pac code add-data-source` regeneration, because no live Dataverse credentials exist in this
  sandbox.
- `docs/factory-arc/PR112_FUNDING_DATAVERSE_INTEGRATION.md` discloses the same fact prominently, plus
  the specific discrepancy it found (the task's "current state" claimed this table already existed
  live; a full repo check found it did not).
- `src/deals/DealFundingAuthorizationPanel.tsx`'s doc comment discloses it a third time.
- `src/shared/governance/platformInventory.ts`'s `funding-authorization-persistence` NOT_WIRED entry
  captures the same caveat and correctly keeps `blockerKind: 'schema'`.
- Every write/read path in `fundingAuthorizationDataverseStore.ts` fails closed with a visible error
  rather than a silent fallback if a live call doesn't behave as expected (verified by reading the
  adapter directly, not just trusting the doc).

No drift was found: the adapter, its 23 tests, the panel's loading/error states, and the dual-control
policy are all still exactly as PR 112 left them. **No `src/` code change was needed for this part.**

## The gap this phase closes

Phase 2 of this arc (`docs/factory-arc/PR114_LOAN_DEAL_SDK_REGENERATION_ESCALATION.md`) produced the
operator runbook for regenerating the SDK against a live org — but it is scoped entirely to
`cr664_loandeals`. It never mentions `cr664_fundingauthorizations`, the *second* table in this repo
with hand-authored "generated" files standing in for a real `pac code` regeneration. An operator who
runs PR114's §3 procedure, regenerates the Loan Deal SDK, and calls SDK regeneration "done" would have
no way to know from that document alone that this table also needs the identical treatment.

This document is that missing second runbook, reusing the migration scripts PR 107 already built and
never previously wired into an escalation doc.

## Operator procedure

```bash
# 1. Confirm the cr664_fundingauthorization table and all 18 columns actually exist on the live org
#    before regenerating (this script already exists — scripts/schema-migrations/pr107-funding-
#    authorization/ — it was simply never referenced from an escalation runbook until now):
DATAVERSE_URL=https://org3a57b8d4.crm.dynamics.com DATAVERSE_ACCESS_TOKEN=... \
  node scripts/schema-migrations/pr107-funding-authorization/verify-entity.mjs

# If step 1 reports the table or any column missing, run create-entity.mjs first (or apply via
# Maker Portal), then re-run verify-entity.mjs until it reports all present.
```

```powershell
# 2. Regenerate the SDK for cr664_fundingauthorizations only (power.config.json already registers
#    this data source under the "fundingauthorizations" key — see power.config.json:255 — so this
#    refreshes it in place rather than adding a new one):
pac code add-data-source -a dataverse -t cr664_fundingauthorizations
```

```bash
# 3. Diff the regenerated Cr664_fundingauthorizationsModel.ts / Cr664_fundingauthorizationsService.ts
#    against the hand-authored versions currently in src/generated/. The field-level contract should
#    not differ — both are derived from the same entity.mjs column list (18 columns + the
#    cr664_recordid primary attribute) — but this diff is the actual confirmation, not an assumption.
#    Specifically confirm:
#      - No field was mis-typed as a multi-select picklist (this table has none defined in entity.mjs,
#        so Cr664_fundingauthorizationsService.ts's multiSelectPicklistFields should stay empty for it).
#      - cr664_recordid, cr664_dealid, and the JSON-text columns (cr664_exceptionsjson,
#        cr664_supportingdocumentidsjson, cr664_auditeventidsjson) are all plain string properties,
#        matching what fundingAuthorizationDataverseStore.ts already reads/writes.

# 4. Run the adapter's own test suite against the regenerated SDK to confirm the row<->record mapping
#    still holds:
npx vitest run src/funding/fundingAuthorizationDataverseStore.test.ts src/deals/DealFundingAuthorizationPanel.test.tsx

# 5. Run the full gate before committing the regenerated files:
npm run verify

# 6. Commit ONLY the regenerated SDK files (src/generated/models/Cr664_fundingauthorizationsModel.ts,
#    src/generated/services/Cr664_fundingauthorizationsService.ts, and any .power/ schema cache the
#    tooling updates) on a dedicated branch/PR, per the working model's one-branch-per-phase rule. Once
#    merged, update this table's header comment and platformInventory.ts's
#    funding-authorization-persistence reason to drop the "hand-authored, not yet regenerated" caveat
#    (the record-keeping and dual-control behavior do not otherwise change).
```

## Status

**Still NOT_WIRED, unchanged from PR 112 — the honest caveat is schema-verification, not a missing
capability.** The dual-control policy, durable persistence, and fail-closed behavior are all real and
already live-wired; the only thing pending operator action is confirming the hand-authored SDK files
match a genuine `pac code` regeneration byte-for-byte.

Full validation run in this sandbox before closing out this phase:

- `npx tsc -b` — 0 errors
- `npx vitest run src/shared/governance/platformInventory.test.ts` — 88 passed (includes the new
  regression test pinning this doc's cross-reference)
- Full `vitest run` / `npm run build` / `npm run audit:reachability` deferred to a later batched
  checkpoint per the current speed-up directive; nothing in `fundingAuthorizationDataverseStore.ts`,
  `DealFundingAuthorizationPanel.tsx`, or any generated file was touched, so no regression is expected
  there.
