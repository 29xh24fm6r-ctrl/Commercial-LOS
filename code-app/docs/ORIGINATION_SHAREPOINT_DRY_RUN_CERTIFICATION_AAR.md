# Origination SharePoint governed DRY_RUN certification AAR

## Decision

**LOCAL IMPLEMENTATION COMPLETE / RUNTIME CERTIFICATION BLOCKED BY PLATFORM-GENERATED INTEGRATION.**

The repository now contains the complete application-side v2 contract, cryptographic request identity, deterministic durable-ledger engine, fail-closed generated-runner seam, DRY_RUN-aware document actions, truthful operator UI, inactive workflow source, inactive read-only reconciliation source, and an inspected narrow solution package. The checked-in flow intentionally still returns `ACTOR_IDENTITY_CONTEXT_UNAVAILABLE`; Power Platform has not generated and exported the authenticated-caller, Dataverse authorization/ledger action definitions or the Code App `Run` client. Consequently the UI button remains unavailable and no runtime DRY_RUN success is claimed.

No flow was activated, no application was deployed, no environment value was changed to LIVE, no SharePoint call or mutation occurred, and no canary ran.

## Architecture and execution path

1. `DealDocuments` renders `SharePointLoanFolderCard` and derives the annual/company path only from the authorized deal snapshot.
2. The validation-only button asks `dealSharePointDryRunRuntime` for a registered generated runner.
3. Runtime registration is unavailable by default and cannot silently substitute memory or a guessed generated service.
4. Once Power Apps emits an inspected runner, `createGeneratedPowerAutomateDryRunPort` sends the v2 request and accepts only `validationOnly=true`, `success=false`, `DRY_RUN_COMPLETED` evidence with no SharePoint IDs, URL, ETag, or created flag.
5. `executeGovernedDryRun` is the platform-independent reference behavior for request/path/binary validation, trusted authorization facts, SHA-256 fingerprinting, atomic ledger reservation, replay/collision, durable completion/readback, and durable failure.
6. LIVE remains a separate adapter and still requires SharePoint readback plus reconciliation certification.

## Contract and security controls

- Contract: `ogb-deal-sharepoint/v2`.
- Configuration: ten exact `cr664_OGBSharePoint*` definitions; `LibraryId`, never `ListId`; stale `new_OGBSharePoint*` is rejected.
- Root: `/(a) Loans`; traversal, encoded traversal, invalid characters, absolute URLs, controls, empty segments, and target overrides fail closed.
- Upload identity includes SHA-256 of exact bytes, MIME type, exact filename, expected size, operation, deal, and governed path.
- Authorization accepts only trusted server/flow facts: unique active platform user, unique active banker, active deal, and assigned-banker equality.
- Ledger: `cr664_sharepointtransportledger`, atomic `cr664_idempotencykey`, `STARTED -> DRY_RUN_COMPLETED|FAILED`, immutable request fingerprint, transition evidence, exact replay, and collision rejection.
- The in-memory ledger is named `TestOnlyInMemoryDryRunLedger` and is not composed into runtime code.
- DRY_RUN never persists folder identity, pending/stored document metadata, satisfied requirements, SharePoint URLs/IDs, or a created/uploaded result.

## Workflow behavior

- Transport ID: `9448ac11-f490-f111-8076-7ced8d3bafd4`.
- Reconciliation ID: `f4637494-69f5-4d79-9f8b-0be46a36e71f`.
- Both package metadata records are inactive: `StateCode=1`, `StatusCode=2`.
- Read-only Developer Dataverse readback on 2026-08-06 confirmed both workflow rows remain `statecode=1`, `statuscode=2`.
- Read-only environment-variable readback confirmed `cr664_OGBSharePointTransportMode` has default and active current value `DRY_RUN`.
- Transport source loads the exact v2 configuration declaration, validates the governed contract/path, declares trusted actor/deal resolution and atomic ledger semantics, routes all four operations, and contains no SharePoint mutation action.
- It remains deliberately blocked until Power Platform exports supported authenticated-caller and Dataverse action definitions. No connector operation name was invented.
- Reconciliation starts in 2099, inspects unresolved states as a read-only plan, disallows delete/overwrite/rename/fabricated completion, and terminates cancelled.

## Principal files changed

- `microsoft365/sharepoint-transport/power-automate/{activationContract,transportContract,dryRunEngine}.ts`
- `microsoft365/sharepoint-transport/tests/{dryRunEngine,powerAutomateActivationContract,powerAutomateContract,powerAutomateWorkflowSource}.test.ts`
- `src/deals/documentStorage/dealSharePoint{DryRunPort,DryRunRuntime,PowerAutomateTransport,FolderAction,UploadAction}.ts`
- `src/deals/DealDocuments.tsx`
- `src/deals/documentIntake/{DocumentIntakeWorkspace,SharePointLoanFolderCard}.tsx`
- both `power-platform/solutions/CommercialLendingLOS/Workflows/OGBOriginationSharePointTransport*.json`
- `power-platform/solutions/CommercialLendingLOS/PowerAutomateOwned/activation-manifest.json`
- `scripts/power-platform/Invoke-OGBSharePointTransportSolution.ps1`

## Package evidence

- Path: `artifacts/OGBSharePointTransport_unmanaged.zip`
- Solution: `OGBSharePointTransport`
- Version: `1.0.0.0`
- Size: 22,578 bytes
- SHA-256: `D531277632187D19AFA2474C793B9788157AF2BCA6DDB71C08217A01A8300699`
- Contents verified: ledger table, ten environment-variable definitions, required solution dependencies/connection references, two exact current workflow JSON files, both inactive, zero SharePoint mutation actions.

## Verification results

- Focused transport/UI/workflow suite: **52/52 passed** across 11 files.
- TypeScript `npx tsc -b --pretty false`: **passed**.
- Scoped ESLint for every changed TS/TSX file: **passed**.
- Production build: **passed**; existing chunk-size and ineffective-dynamic-import warnings remain.
- Narrow solution source/package validation: **passed**.
- Full Vitest suite: completed; **14,416 passed, 207 failed, 20 skipped; 2 worker errors** across 1,069 files. All SharePoint transport tests passed. Failures are existing broad release-governance/baseline assertions outside this changeset.
- Full ESLint: existing baseline **77 errors and 6 warnings**; changed-file scoped lint is clean.
- Reachability audit: existing baseline **43 unexpected orphans**. The new DRY_RUN runtime is reachable from `DealDocuments`.
- `git diff --check`: recorded at final commit verification.

## No-write evidence

- Static solution verifier rejects SharePoint `Create file`, `Create new folder`, delete, move, copy, or update actions.
- Package inspection reports `sharePointMutationActions=0`.
- Both workflow metadata records are inactive in source and package.
- The app runtime is unavailable until an inspected generated client is registered.
- DRY_RUN response parsing rejects any claimed SharePoint identity or `created=true`.
- No SharePoint token, access token, connection instance ID, URL fabrication, file ID, or successful storage result is stored in source.

## Remaining platform-generated integration gate

The single blocking dependency is a supported Power Platform-generated export. An authorized maker must edit the existing inactive transport flow in Developer, configure the Dataverse connection as an approved invoker/trusted identity design, add designer-generated actions for authenticated caller resolution, unique actor/banker/deal authorization, atomic ledger create/read/update and durable readback, save without activation, add the existing flow to the Code App, regenerate the SDK, and export the narrow solution. The exported operation names, parameter order, caller claims, and connection behavior must then be inspected and wired to `registerGeneratedDealSharePointDryRunRuntime`. The CLI available in this repository cannot add a Power Automate flow as a Code App data source, and `power.config.json` currently targets the Production app, so attempting automated generation here would risk an unauthorized deployment.

## Supervised DRY_RUN canary commands after separate authorization

Before any canary, replace the candidate package with the reviewed platform-generated export and re-run:

```powershell
pac auth select --name OGB-LOS-DEV
powershell -File scripts/power-platform/Invoke-OGBSharePointTransportSolution.ps1 -Action Validate
powershell -File scripts/power-platform/Invoke-OGBSharePointTransportSolution.ps1 -Action Pack -Apply
powershell -File scripts/power-platform/Invoke-OGBSharePointTransportSolution.ps1 -Action Verify
npx vitest run microsoft365/sharepoint-transport/tests/dryRunEngine.test.ts microsoft365/sharepoint-transport/tests/powerAutomateWorkflowSource.test.ts src/deals/documentStorage/dealSharePointPowerAutomateTransport.activation.test.ts src/deals/documentStorage/dealSharePointDryRunRuntime.test.ts
```

An authorized maker must then import only to Developer, bind the reviewed connection references, confirm `cr664_OGBSharePointTransportMode=DRY_RUN`, activate only the transport workflow for the supervised window, invoke `Validate SharePoint Setup (No Write)` against an authorized controlled deal, verify the durable ledger transition and absence of any SharePoint object, and immediately return the workflow to inactive. There is intentionally no repository command that silently activates a flow or deploys the Production-targeted Code App.

## Rollback

1. Disable the transport workflow; reconciliation stays disabled.
2. Keep `cr664_OGBSharePointTransportMode=DRY_RUN` and the application storage mode DRY_RUN.
3. Remove the generated runtime registration/data source from the application and republish only after ordinary change approval.
4. Preserve ledger/audit evidence; do not delete, overwrite, rename, or mark unresolved operations complete.
5. Re-run package state/no-write checks and confirm both workflow records are inactive.

## Final state

The non-live repository and package work that can be completed without designer-generated Power Platform artifacts is complete. LIVE is **NO-GO**. DRY_RUN runtime certification is **BLOCKED** until the single platform-generation action above is completed; this is not a request to activate, deploy, or write to SharePoint.
