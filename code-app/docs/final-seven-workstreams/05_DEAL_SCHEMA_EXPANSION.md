# Workstream 5 — Deal Purpose/Term/Ownership Schema Expansion

**Status: Phase 5A COMPLETE. Phase 5B BLOCKED — SCHEMA AUTHORIZATION.**

## Phase 5A (this pass — no live change)

Prepared, but did NOT execute:

- `scripts/dataverse/create-deal-purpose-term-ownership-fields.ps1` — exact, dry-run-by-default
  provisioning script for three additive `cr664_loandeal` columns:
  - `cr664_loanpurpose` — Picklist, 9 options (Acquisition, Refinance, Working Capital, Expansion,
    Equipment, Real Estate Purchase, Construction, Debt Consolidation, Other).
  - `cr664_loanterm` — Whole number, months, range [1, 480]. **480 (40 years) is a technical
    ceiling this script defaults to — the real business maximum is a credit-policy decision**;
    confirm with credit policy and adjust `$LoanTermMaxMonths` before `-Apply` if different.
  - `cr664_ownershipstatus` — Picklist, 5 options (Owner-Occupied, Investment, Mixed Use, Not
    Applicable, Other).
  - Follows this repo's established schema-script safety model exactly: create-missing-only,
    environment/solution verification before any mutation, publish only if something was actually
    created, post-create metadata verification.
- `src/deals/dealPurposeTermOwnershipSchema.ts` — the prepared client-side shape (option constants +
  pure validators, 5 tests) mirroring the script's proposed option-set numbering exactly, so client
  and schema stay in lockstep once Phase 5B applies the columns. Deliberately NOT imported by any
  component — the columns don't exist yet; wiring it in would fabricate a capability the schema
  doesn't back. Allow-listed in `src/navigation/intentionallyUnrouted.ts`.

All three fields are proposed as schema-level OPTIONAL (`RequiredLevel=None`) — whether they become
INTAKE stage-exit-required criteria is a separate, later, business-approved change to
`src/workflow/loanWorkflowStages.ts`, not decided by this script.

## Phase 5B (blocked — requires Matthew's explicit authorization)

1. Confirm the real business-policy maximum for `cr664_loanterm` (this pass's 480-month default is a
   placeholder ceiling, not a policy decision).
2. Run `create-deal-purpose-term-ownership-fields.ps1` (dry-run first, review output, then `-Apply`).
3. Regenerate the SDK: `pac code add-data-source -a dataverse -t cr664_loandeal`.
4. Wire the three fields into `BankerNewDealCreate.tsx`, the Deal Profile edit modal, and the
   underwriting summary surface.
5. Decide with the business whether any/all become INTAKE `requiredFields` exit criteria.
6. Add corresponding tests for the newly-wired UI paths.

## Classification

**Phase 5A: COMPLETE.** **Phase 5B: BLOCKED — SCHEMA AUTHORIZATION** (requires Matthew's explicit
sign-off on the schema change and the real business term-length ceiling before any live mutation).
