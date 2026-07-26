# Adversarial Retest Report — Template

## Purpose

A prior adversarial audit (`docs/factory-arc/FINAL_ADVERSARIAL_AUDIT.md`) already probed this
codebase's governance boundaries and found real gaps (e.g. finding S3: true two-person dual control
for credit-committee approval "does not exist" as a built/verified capability at that time). This
retest re-runs an adversarial lens specifically against **this remediation arc's changes**, once
deployed — it does not re-run that entire prior audit.

**This is a template.** It is not a completed report. Every row below must be filled in with an
actual attempted bypass and its actual observed result, against the real deployed environment —
not filled in from assumption.

## Bypass attempts to run

| # | Attempted bypass | Targets which fix | Expected (if fix holds) | Actual result | Evidence |
|---|---|---|---|---|---|
| 1 | Persona A (document receiver) attempts to review the same document via a direct Dataverse Web API call (not through the app UI) | N-16 segregation of duties | **Will succeed** — this is a known, documented gap (client-side only enforcement). Record it as confirmed, not as a surprise. | | |
| 2 | Persona A (deal's assigned banker) attempts to advance CREDIT_APPROVAL→COMMITMENT via a direct Dataverse Web API call, bypassing the client UI | Credit approval segregation of duties | Should be **blocked** — this rule has both a client-side guard AND a write-seam guard (`stageAdvanceWriteDependency.ts`), independent of the UI | | |
| 3 | Attempt to advance a deal's stage with the Dataverse governance plugin's precondition intentionally violated (reuse the existing `attempt-governance-bypass-smoke.ps1` script) | Server-side stage-transition enforcement (pre-existing, not this arc's own work, but a regression check) | Should be **blocked** by the plugin, per `docs/operator-runbooks/DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md`'s own bypass smoke test | | |
| 4 | Trigger a raw transport failure on one of the 6 write families PR A added error mapping to (e.g. disconnect network mid-write, or point `DATAVERSE_URL` at an invalid host temporarily in a non-prod test) | N-21 error-mapping widening (PR A) | The banker-facing message should be the generic safe message, never a raw OData/.NET string — confirm for at least 2 of the 6 families live | | |
| 5 | Attempt to set `cr664_istestrecord` to an unexpected value (e.g. via a direct API PATCH with a non-boolean value) | N-17 schema | Dataverse's own Boolean type validation should reject it; confirm the app doesn't crash or misclassify on an unexpected read | | |
| 6 | Attempt to generate a closing document without authorization (`authorized: false`) via the app | Closing document generation gate | Should be **blocked** before ever touching storage (`generateClosingDocument`'s own authorization check, unit-tested; confirm it holds live) | | |

## Rules for this report

- Every "Actual result" cell must be filled from a real attempt, not inferred from source-reading
  the code again — that was already done during development; this retest's value is confirming the
  DEPLOYED, LIVE behavior matches.
- Row 1 is expected to demonstrate a real, known gap. Recording that gap here is the honest
  outcome — do not mark it "N/A" or omit it.
- If any row marked "should be blocked" is NOT blocked in the live environment, this is a
  **NO-GO** finding for `08_GO_NO_GO_DECISION.md` regardless of how many other things pass.

## Report metadata (fill in when executed)

- Environment tested: `_____`
- Date/time (UTC): `_____`
- Operator: `_____`
- Deployed commit / PR merge SHA: `_____`
