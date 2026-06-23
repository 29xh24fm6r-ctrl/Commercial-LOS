# Full System Launch — Evidence Package

This package is the structure the Phase 224 aggregator
(`deriveFullSystemActivation`) consumes to render the final launch decision. It is
intentionally **empty of asserted passes**: every smoke outcome and rollback flag
must be supplied as real operator evidence through the Phase 211 registry. No value
here is fabricated, and the code currently evaluates to **NO_GO** until evidence is
recorded and environment prerequisites are wired.

## Enabled feature matrix (live write flags)

All launch write flags ship **OFF**. A capability is enabled only when its flag is
intentionally set true per environment, all gates pass, and a passed smoke with a
verified rollback exists.

| Capability | Flag(s) | Default |
|---|---|---|
| Admin grant | `ADMIN_ENTITLEMENT_WRITE_ENABLED` | off |
| Admin revoke | `ADMIN_ENTITLEMENT_REVOKE_ENABLED` | off |
| New Deal create | `NEW_DEAL_CREATE_ADAPTER_ENABLED` + `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` + `BANKER_NEW_DEAL_CREATE_ENABLED` | off |
| Advance Stage | `ADVANCE_STAGE_WRITE_ENABLED` | off |
| CRM writeback | `CRM_LIVE_PERSISTENCE_ENABLED` | off |
| Portfolio boarding | `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + `PORTFOLIO_BOARDING_ROUTE_ENABLED` | off |
| Checklist generation | `CHECKLIST_WRITE_ENABLED` | off |
| Borrower communication | certified `liveMode` (e.g. `EMAIL_MODE=LIVE`) | off |
| Document upload | `DOCUMENT_UPLOAD_ENABLED` | off |

## Gated / deferred feature matrix (documented exclusions)

These remain gated and are **out of internal full-system activation** unless
separately certified — they may justify `CONDITIONAL_GO` only when documented:

- Borrower portal (external auth, invitation/magic-link schema, external role
  model, borrower-safe messaging schema, binary upload, notifications).
- External CRM sync (Salesforce / nCino live sync).
- Broad/bulk portfolio import.

## Smoke evidence package (Phase 211)

One `OperatorSmokeEvidence` record per capability, recorded out-of-band until a
Dataverse evidence table exists:

```
capability, outcome (passed|failed|partial|not-run), actorUpn,
actorPlatformUserId, timestamp, correlationId, environmentName,
evidenceNote, rollbackVerified
```

A capability blocks GO unless its latest evidence is `passed` **and**
`rollbackVerified === true`.

## Rollback plan (per live write class)

Each write capability rolls back by setting its flag false; future writes return
the capability's `disabled` outcome. The 208/209 entitlement adapters and every
Phase 212–224 adapter honor their flag as the single off-switch. Rollback
verification is recorded as `rollbackVerified` on the smoke evidence.

## Operator activation checklist (per environment, one capability at a time)

1. Confirm tenant/environment name and current deployed commit.
2. Confirm Dataverse schema for the capability (services / columns / relationships).
3. Confirm generated SDK service(s) and any required ordering/File columns.
4. Confirm Power Apps data source registration.
5. Confirm required reference rows (e.g. exactly one active production Stage +
   Status).
6. Enable exactly one feature flag.
7. Run one single-record smoke.
8. Record `OperatorSmokeEvidence` (Phase 211).
9. Verify rollback (flag off → `disabled`); set `rollbackVerified`.
10. Move to the next capability. **No bulk activation.**

## Final decision inputs (Phase 224)

- per-capability readiness (each encodes its own schema/audit/reference/flag blockers);
- Phase 211 smoke readiness (passed + rollback) per capability;
- `buildVerified`, `fullSuiteGreen`, `deployedFromMaster`, `operatorSignoffCaptured`;
- `documentedDeferrals` (non-critical only).

`GO` requires all of the above. `CONDITIONAL_GO` requires all critical capabilities
satisfied with only documented non-critical deferrals. Otherwise `NO_GO`.

## Version / commit / deploy reference

- Branch: `phase212-224-full-system-activation`.
- Deploy from `master` only, after merge (`pac code push` is the operator step;
  not run here).
- Record the deployed commit hash alongside the operator signoff at activation time.
