# Origination SharePoint governed DRY_RUN certification AAR

## Decision

**DRY_RUN IMPLEMENTATION COMPLETE; LIVE AND CANARY REMAIN NO-GO.**

The existing Developer transport flow now has a supported Power Apps V2 trigger, authenticated caller lookup, active platform-user/banker/deal authorization, exact configuration loading, durable Dataverse ledger reservation/readback, deterministic replay/collision handling, and a strict response envelope. Power Apps generated the real Code App client and production composition registers that exact client only while document storage mode resolves to `DRY_RUN`.

Neither flow was activated. No application was deployed. `cr664_OGBSharePointTransportMode` remains `DRY_RUN`. No SharePoint connector or Graph mutation action exists in either workflow, no SharePoint request ran, and no canary ran.

## Exact platform-generated integration

- Solution workflow entity ID: `9448ac11-f490-f111-8076-7ced8d3bafd4`.
- Generated runtime workflow name: `964787a4-83dc-ab3d-8625-bfe042ccd470`.
- Generated service: `OGBOriginationSharePointTransportService`.
- Generated method: `Run`.
- Generated response field: `transportresponse`.
- Generated trigger keys, in order: `text`, `text_1`, `text_2`, `text_3`, `text_4`, `text_5`, `text_6`, `text_7`, `text_8`, `text_9`, `text_10`, `number`, `file`, `text_11`.
- Business mapping: operation, deal ID, correlation ID, idempotency key, annual folder, borrower folder, file name, MIME type, content SHA-256, expected SharePoint item ID, expected unique ID, expected size, file content, request fingerprint.
- Office 365 Users connection reference: `new_sharedoffice365users_27e91`.
- Code App logic-flow data source: `ogboriginationsharepointtransport`.

`dealSharePointGeneratedRuntime.ts` maps the governed request into the generated trigger contract, checks `IOperationResult.success`, requires a non-empty `transportresponse`, parses JSON, and otherwise throws. The existing response parser then rejects missing fields, mismatched deal/correlation/idempotency/operation values, invalid fingerprints, or any DRY_RUN response that claims a SharePoint ID, URL, ETag, creation, or possible orphan.

## Actual inactive transport workflow actions

1. Power Apps V2 request trigger.
2. `Get_my_profile_(V2)` under invoker identity.
3. `Resolve_active_platform_user` and exactly-one condition.
4. `Resolve_active_banker`.
5. `Resolve_assigned_active_deal` and exactly-one authorization condition.
6. `Load_exact_cr664_environment_configuration` for all ten exact definitions.
7. `Governed_target_path` rooted at `/(a) Loans`.
8. `Read_durable_transport_ledger` by idempotency key.
9. Numeric zero-row branch.
10. `Reserve_durable_DRY_RUN_ledger` with `STARTED`, correlation, actor-authorized deal, operation, target, size, and immutable request fingerprint.
11. `Complete_durable_DRY_RUN_ledger` with `DRY_RUN_COMPLETED`.
12. `Read_back_durable_DRY_RUN_ledger`.
13. Strict Power Apps response, or deterministic replay / `IDEMPOTENCY_COLLISION` response.

Unauthorized, ambiguous, missing-identity, missing-deal, connector, configuration, and ledger failures have no permissive branch and therefore fail closed. The application validates governed segments and the canonical SHA-256 request material before invocation. The active Dataverse alternate key on `cr664_idempotencykey` provides the concurrency boundary.

## Durable and no-write controls

- Ledger: `cr664_sharepointtransportledger`, 22 verified columns, auditing enabled, active unique idempotency key.
- Exact ten `cr664_OGBSharePoint*` definitions and current values verified in Developer.
- Current transport mode read back as `DRY_RUN`.
- Transport live readback: state `0`, status `1` (Draft/inactive).
- Reconciliation live readback: state `0`, status `1` (Draft/inactive).
- Reconciliation remains a blocked compose followed by failed termination; it has no delete, overwrite, rename, update, or SharePoint operation.
- Static source/package scan found zero SharePoint mutation actions.
- The LIVE document port still requires separately certified SharePoint readback and reconciliation and is not registered by this phase.

## Exported package

- Platform export: `artifacts/OGBSharePointTransport_platform-current.zip`.
- Repacked source-controlled artifact: `artifacts/OGBSharePointTransport_unmanaged.zip`.
- Solution: `OGBSharePointTransport`.
- Version: `1.0.0.0`.
- Platform export size/hash: 24,420 bytes / `A26D1E32B8D2214C6E5D0723F20C3F266B06D90C1DC1C3C17BF91DE3BFA58F7E`.
- Repacked artifact size/hash: 24,484 bytes / `1EE440E8471869322180DE313321330B5036CBAF349DB91A66EECAABCA0E11BD`.
- Package verification: two exact workflows, both inactive; ten environment variables; durable ledger table; zero SharePoint mutation actions.

## Verification

- Focused transport/storage/UI suite: 25 files, 132/132 tests passed.
- TypeScript `npx tsc -b --pretty false`: passed.
- Production build: passed; only existing chunk/dynamic-import warnings were emitted.
- Scoped ESLint: passed.
- Narrow solution source validation: passed.
- Exact platform-export and repacked-package verification: passed.
- Developer Dataverse read-only verifier: 55 present, 0 planned, 0 created, 0 updated, 0 registered, 0 failed.
- Live workflow readback: both exact flows inactive.
- Full repository test command was executed; the broad baseline remains red on pre-existing release-governance/baseline assertions and existing ASCII-safety findings outside this change set. The complete focused SharePoint certification surface is green.
- `git diff --check`: passed.

## Remaining LIVE-only prerequisite

LIVE remains fail-closed. A separately authorized Developer canary must first add and certify supported SharePoint mutation/readback operations, keep collision and cross-deal controls intact, prove orphan handling and non-destructive reconciliation, temporarily activate only the reviewed transport flow, execute a controlled authorized canary, reconcile SharePoint and ledger readback, and return the flow to inactive. This phase does not authorize that action.

## Rollback

No runtime rollback is required because nothing was activated or deployed. Preserve both inactive workflow records, keep both application and Dataverse modes at `DRY_RUN`, and retain the ledger and exported package as immutable evidence.
