# Phase 212–224 — Full System Launch Activation

This arc delivers the launch-readiness package for the OGB LOS internal system. It
is **fail-closed by construction**: every live write is gated, every readiness
claim is evidence-based, and where a Dataverse/SDK environment prerequisite is not
yet wired, the capability reports an exact blocker rather than claiming readiness.

All activation code lives under [src/activation/](../src/activation/) and is **pure**
(no `process.env`, no SDK in the static graph, no real Dataverse writes, no
connector sends). Each capability exposes a readiness model and, where it writes, a
governed adapter seam over an **injected** transport + audit (+ timeline) sink. The
Phase 211 smoke-evidence registry is the single source of smoke truth; nothing
infers a pass from green tests.

## Shared primitive

`launchReadiness.ts` — `evaluateLaunchGates(capability, requirements[])` reduces a
list of named gate requirements to `launch-ready` or `blocked` with the **exact**
unmet blockers. A capability is launch-ready only when every requirement holds.

## Capability matrix

| Phase | Module | Write seam (default-off flag) | Key fail-closed outcomes |
|---|---|---|---|
| 212 | `adminEntitlementActivation.ts` | grant/revoke via 208/209 (`ADMIN_ENTITLEMENT_WRITE_ENABLED`, `ADMIN_ENTITLEMENT_REVOKE_ENABLED`) | Dataverse transport seam; **deactivate-not-delete**; LOS app-level scope notice |
| 213/214 | `newDealCreateActivation.ts` | `NEW_DEAL_CREATE_ADAPTER_ENABLED`, `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`, `BANKER_NEW_DEAL_CREATE_ENABLED` | TEST vs PRODUCTION refs; duplicate/inactive/ambiguous/missing fail closed; no hardcoded GUIDs |
| 215/216 | `stageProgressionActivation.ts` | `ADVANCE_STAGE_WRITE_ENABLED` | `resolver_not_ready`, `no_next_stage`, `stale_stage`, audit/timeline partial-success |
| 217/218 | `crmActivation.ts` | `CRM_LIVE_PERSISTENCE_ENABLED` (+contact/vendor/timeline) | schema gate; `schema_not_verified`; no Salesforce/nCino sync implied |
| 219/220 | `portfolioBoardingActivation.ts` | `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`, `PORTFOLIO_BOARDING_ROUTE_ENABLED` | single-record; child groups written/skipped/failed; no bulk import |
| 221 | `checklistGenerationActivation.ts` | `CHECKLIST_WRITE_ENABLED` | deterministic preview = written items; `duplicate_blocked` w/o override; no AI |
| 222 | `borrowerCommsActivation.ts` | certified `liveMode` | no name-inferred recipient; connector acceptance ≠ delivery |
| 223 | `documentUploadActivation.ts` | `DOCUMENT_UPLOAD_ENABLED` | File-column gate; metadata marks received **only after** upload succeeds |
| 224 | `fullSystemActivation.ts` | — (aggregator) | `GO` / `CONDITIONAL_GO` / `NO_GO`; NO_GO default |

## Environment prerequisites (operator-owned, not done in code)

These capabilities stay **blocked with exact diagnostics** until the operator wires
the environment; the code is launch-ready and flips on when the facts become true:

- **213** — seed/approve exactly one active production Stage and one active
  production Status row (the resolver consumes caller-supplied rows; no GUID is
  hardcoded). TEST rows can never authorize a production create.
- **215** — register the stage reference data source and regenerate the SDK so a
  generated stage service + deterministic order field exist.
- **217 / 219** — verify the CRM / portfolio generated services, columns, and
  relationships.
- **223** — add a File column to the document checklist table and regenerate the
  SDK so an upload method can target the record.

## Governance guarantees (pinned by
`src/shared/governance/phase212_224FullSystemActivationContract.test.ts`)

- every write flag is `= false` in source (no gate flip without a governed write);
- no `process.env` / config write in any activation source;
- no `/generated/` SDK in the static graph (only `adminEntitlementActivation`
  touches it, via **dynamic import** inside the runtime transport seam);
- no real SDK/fetch/connector calls in any test;
- no hardcoded Dataverse GUIDs;
- revoke calls `update`/`statecode: 1` (deactivate), never `delete`;
- borrower comms rejects name-inferred recipients and never claims delivery;
- document upload only marks received after a successful upload;
- the full-system aggregator defaults to `NO_GO`;
- smoke readiness is always derived from the Phase 211 registry, never a literal pass.

## Final decision (Phase 224)

`deriveFullSystemActivation` returns `GO` only when **every** capability is
launch-ready, **every** smoke is passed + rollback-verified, and the infrastructure
gates (build verified, full suite green, deployed from master, operator signoff
captured) all hold. `CONDITIONAL_GO` is allowed only for explicitly documented,
**non-critical** deferrals; a critical capability can never be deferred. Anything
else is `NO_GO`.

See [FULL_SYSTEM_LAUNCH_EVIDENCE_PACKAGE.md](./FULL_SYSTEM_LAUNCH_EVIDENCE_PACKAGE.md)
for the evidence package and operator activation checklist.
