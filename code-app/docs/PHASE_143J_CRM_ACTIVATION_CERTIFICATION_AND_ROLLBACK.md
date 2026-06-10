# Phase 143J — CRM Activation Certification and Rollback Plan

> **Certification / governance only.** Certifies that the Phase 143A–143I CRM
> activation arc is a controlled, **no-uncontrolled-live-write** stack: inventory +
> source-of-truth, connector readiness (no live writes), entity matching (read-only),
> sync preview (no writes), writeback policy gate (disabled), controlled writeback
> (dry-run only), activity timeline (read-only), relationship intelligence cockpit
> (read-only), and an allowlisted live-write pilot scaffold (disabled by default).

## 1. Executive certification summary

The Phase 143 CRM activation stack is **release-review ready as a controlled,
disabled / dry-run / read-only Salesforce + nCino activation layer**. There are
**no uncontrolled live writes**, no live Salesforce/nCino calls, no credentials,
and no external side effects. It is **NOT certified** for live Salesforce/nCino
writes, live exports, credit decisioning, committee voting, money movement, or
borrower/deal lifecycle mutation — those remain disabled behind the §10
prerequisites.

## 2. Phase 143A–143I inventory table

| Phase | Surface / model | Posture | Live write? | External call? |
|---|---|---|---|---|
| 143A | Source-of-truth map | Inventory / disabled_by_default | No | No |
| 143B | Connector readiness audit | No live writes | No | No |
| 143C | Entity matching model | Read-only | No | No |
| 143D | Sync preview plan | Preview only | No | No |
| 143E | Writeback policy gate | Disabled by default | No | No |
| 143F | Controlled writeback adapter | Dry-run only | No | No |
| 143G | Activity timeline model | Read-only | No | No |
| 143H | Relationship intelligence cockpit | Read-only | No | No |
| 143I | Allowlisted live-write pilot scaffold | Disabled by default | No | No |

## 3. Salesforce activation posture

Salesforce is read-only / disabled in this arc. Connector readiness can reach at
most `ready_for_dry_run`; entity matching is human-review decision support; sync
preview is `would_*` only; writeback policy is disabled; the controlled writeback
adapter is dry-run only (`salesforceWritePerformed: false`). No Salesforce call,
token, secret, env var, or endpoint URL exists in the source.

## 4. nCino activation posture

nCino is read-only / disabled in this arc, identically to Salesforce. The
controlled writeback adapter keeps `ncinoWritePerformed: false` in every outcome.
No nCino call, token, secret, env var, or endpoint URL exists in the source.

## 5. Cross-stack invariants

- No uncontrolled live writes.
- No live Salesforce/nCino calls.
- No credentials / secrets / env vars.
- No Dataverse writes.
- No schema migration.
- No permission widening.
- No fake sync success.
- No fake CRM data.
- No credit decisioning.
- No committee voting.
- No money movement.
- No external side effects.
- No executable payload path; no eval / Function constructor.

## 6. Disabled / dry-run / read-only guarantees

Every result keeps its safety booleans pinned: `liveConnectionAttempted: false`,
`liveWritePerformed: false`, `credentialsStored: false`, `externalSystemChanged: false`,
`readOnly: true`, `crmRecordLinked: false`, `previewOnly: true`,
`crmRecordCreated: false`, `crmRecordUpdated: false`, `allowedForLiveWriteNow: false`,
`dryRunOnly: true`, `salesforceWritePerformed: false`, `ncinoWritePerformed: false`,
`liveCrmLookupPerformed: false`, `liveWritePilotEnabled: false`.

## 7. Writeback policy and allowlist summary

The writeback policy gate (143E) only ever reaches `ready_for_dry_run` and blocks
stage/status/lifecycle/amount/pricing/credit/sensitive fields. The allowlisted
pilot scaffold (143I) permits only four non-authoritative candidate fields
(relationship-intelligence note, CRM external-reference label, non-authoritative
task note, preview-only status label) and still performs no write.

## 8. Explicit non-certifications

Phase 143J does **NOT** certify: live Salesforce writes; live nCino writes; live
exports; credit decisions; committee voting; loan boarding / servicing sync; money
movement; borrower/deal lifecycle or stage/status mutation; or any live provider
call.

## 9. Rollback / kill-switch plan

Because nothing is live, rollback today is trivial: the stack performs no external
action to undo. For any FUTURE activation, the kill switch is: (a) the
disabled-by-default mode flags, (b) the writeback policy gate (set to
`blocked_disabled`), (c) the allowlist (emptied), and (d) removal of any injected
transport. A future live phase must wire a single documented disable switch that
forces every adapter back to disabled and blocks the policy gate.

## 10. Live activation prerequisites

Provider contracts / API approach; secret storage (no client-side token);
Dataverse audit / schema model; security role model; DLP / security review;
compliance review (GLBA / FCRA / ECOA / OFAC / KYC as applicable); data retention
policy; consent / permissible-purpose model; versioning / immutability model for
credit packages; rollback / kill switch; production observability and audit
logging.

## 11. Demo checklist

- [x] Build green.
- [x] Full suite green.
- [x] Release candidate snapshot green.
- [x] Governance tests green.
- [ ] No dirty working tree (verify after commit).
- [ ] origin/master pushed (operator-performed when authorized).
- [x] UI copy says disabled / read-only / dry-run / no-live where applicable.
- [x] No live credentials or env vars introduced.
- [x] No new routes or permissions introduced (mounting deferred).

## 12. Acceptance commands

```
npm test -- crm CRM salesforce nCino ncino sourceOfTruth connector matching syncPreview writeback activityTimeline relationshipIntelligence governance releaseCandidateSnapshot
npm run build
npm test
git status --short
git log --oneline -8
```
