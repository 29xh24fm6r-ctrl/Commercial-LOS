# Production audit remediation — 2026-07-29

This record maps the production audit findings to the remediation implemented
on `remediation/production-audit-2026-07-29`. It does not claim that production
has changed until this build is deployed and the post-deployment checks below
are completed.

## Remediated in code

- Banker, team, and manager totals now use the same governed deal population.
  Test, smoke, and QA deals are excluded by default.
- Banker activity summaries reuse the work-queue snapshot instead of loading a
  second, potentially different population.
- Calendar-only due dates are parsed and formatted without UTC date drift.
- Blocker counts, summaries, and drill-through details now come from the same
  authoritative stage-exit blocker set.
- Credit memo readiness now evaluates the persisted risk rating and
  underwriting recommendation facts.
- Final risk ratings and recommendations cannot be saved without their required
  rationale, actor, timestamp, and exact deal link. Draft facts remain allowed.
- New-deal entry warns about likely duplicates and blocks an exact normalized
  deal-name duplicate before any record write.
- Work-queue tasks show a stable short deal reference to distinguish repeated
  task titles.
- Team ownership uses the authoritative formatted lookup before the legacy
  shadow field.
- Admin screens use operator-facing business language; schema mappings remain
  available in collapsed technical-detail sections.

## Verified as already present in the current source

- Stage advancement applies the verified new stage and stage-entry date to the
  local deal snapshot before dependent panels refresh.
- CRM industry projection preserves exact NAICS code, title, sector, and
  provenance independently from the coarse legacy industry choice.
- Document requirements, status classification, and stage blockers share one
  reconciled model, with waived and not-applicable items excluded.
- Document upload writes the actual Dataverse file column, enforces the
  configured size/type limits, verifies readback, and records audit/timeline
  evidence.

These items must still be included in the deployed artifact because the audited
production runtime may have been behind the current source.

## Production gates

1. Deploy the reviewed artifact through the normal governed Power Apps release
   workflow.
2. Re-run banker, team, and manager count reconciliation against the same user
   and deal population.
3. Verify one stage advancement without a manual browser refresh.
4. Verify one complete and one incomplete risk/recommendation workflow,
   including credit memo output and blocker drill-through.
5. Upload and download an approved non-sensitive test document, then confirm
   its audit and timeline entries.
6. Have an independent authorized user perform the second-approver test.
7. Review existing duplicate and test-named production records before any
   cleanup. No records are deleted by this remediation.

Production acceptance evidence should include the deployed version identifier,
test identities/roles, timestamps, screenshots or logs, and pass/fail results
for each gate.
