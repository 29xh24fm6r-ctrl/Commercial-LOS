# Controlled E2E Production Test Script — Additions for the Post-PR143 Arc

## Relationship to the existing base script

`docs/E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md` and
`docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` already cover the full banker journey
(Intake through Boarding). **This document does not replace or repeat them.** It adds only the
specific checks needed to prove this remediation arc's fixes behave correctly live, keyed to the
finding each check maps back to.

Run this AFTER the base script, on the same controlled test deal(s), using a deal name clearly
marked as a test/smoke record (and, once Migration 3 is applied, `cr664_istestrecord = true`).

## Additions, by finding

### N-01 / N-16 — Document requirement lifecycle + segregation of duties

1. Create a document requirement on the test deal. Confirm `cr664_requirementstatus` is readable
   (not falling back to the `documentRequirementFields.ts` bridge type — confirms the SDK
   regeneration in `02_SCHEMA_VERIFICATION_AND_DEPLOYMENT_COMMANDS.md` actually landed).
2. Mark it received as Persona A. Confirm `cr664_receivedby` is populated with Persona A's id.
3. Attempt to review it as Persona A — confirm blocked (this duplicates
   `03_TWO_USER_TEST_REQUIREMENTS.md`'s Test 1; if already run, cross-reference that evidence
   instead of repeating it).

### N-22 / N-23 — CRM industry NAICS projection

1. On a CRM organization record with a specific NAICS code set (not "Other"), create a new deal
   linked to that organization.
2. Confirm the deal's credit memo renders the "NAICS classification:" line (per
   `creditMemoDraft.ts`'s `borrowerOverview()`) — this proves `cr664_crmindustryprojection` is both
   writable and readable live, not just schema-present.

### N-17 — Governed test/production classification

1. Set `cr664_istestrecord = true` on the test deal (via Maker Portal, since no admin UI exists yet
   — see `PR_A_REMAINING_PRODUCTION_REMEDIATION.md`'s deferred-items list).
2. Confirm the Banker pipeline (`loadBankerPipeline`) correctly classifies it using the new field.
3. Confirm Manager/Team/Executive/Admin surfaces still classify it by name only (expected, per the
   documented partial-fix scope — this is a confirmation the deferral is real, not a defect check).

### Portfolio term/purpose display (PR A)

1. Board a test loan whose originating deal had `loanTermMonths` and `loanPurpose` set.
2. Open the boarded loan's detail drawer in Portfolio. Confirm Term and Purpose rows show the real
   values, not "—".

### Business-label replacement (PR A)

1. Create a new deal via the banker New Deal flow.
2. Confirm the success banner shows the deal name alongside (not instead of) the raw id.

### Count reconciliation (PR A)

1. Create a task or document due "today" (the current calendar day at the operator's own local
   time). Confirm it does NOT show as overdue on the Banker work-queue card, the Team
   Document Needs / Task Load cards, and the credit-memo freshness signal — all three should agree.

### Closing document persistence (PR A)

Use Template D in `05_EVIDENCE_TEMPLATES.md` directly — it is this section's own test procedure.

## What NOT to test here (out of scope, covered elsewhere or not yet built)

- The activity cross-write extension (funding/closing/boarding/risk-rating events into the deal
  timeline) — explicitly deferred, not built (`PR_A_REMAINING_PRODUCTION_REMEDIATION.md`).
- The 12-item CREDIT_APPROVAL→BOARDED untracked-requirement backlog — explicitly deferred.
- Server-side (plugin) enforcement of document-review segregation of duties — does not exist
  (`04_SECURITY_PRIVILEGE_REQUIREMENTS.md`'s documented gap).
