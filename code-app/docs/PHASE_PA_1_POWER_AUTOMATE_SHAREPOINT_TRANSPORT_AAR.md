# Phase PA-1 — Power Automate SharePoint Transport AAR

## Outcome

PA-1 establishes a source-controlled, solution-aware Power Apps V2 flow boundary for the four document operations while preserving a fail-closed launch posture. Power Automate is the immediate Microsoft-native path because the standard SharePoint connector can be governed through solution connection references without operating the separately retained Azure Function runtime. No import, connection binding, tenant write, Code App deployment, SharePoint write, or LIVE activation occurred.

## Workflows

- Transport: `9448ac11-f490-f111-8076-7ced8d3bafd4` — `OGB Origination SharePoint Transport`.
- Reconciliation: `f4637494-69f5-4d79-9f8b-0be46a36e71f` — `OGB Origination SharePoint Transport Reconciliation`.
- Both workflow metadata records remain inactive (`StateCode=1`, `StatusCode=2`). Reconciliation additionally starts in 2099 and terminates without mutation.

## Connection references

- `new_sharedsharepointonline_b8f0b` — standard SharePoint connector, existing solution reference.
- `new_commondataserviceforapps_ogblos` — Microsoft Dataverse connector for actor/deal authorization and durable ledgering.

Neither reference contains a connection ID. An operator must bind both to approved operational identities after import. Personal connection ownership is not approved for LIVE.

## Immutable configuration contract

This historical PA-1 section is superseded by the exported narrow solution. The current non-secret definitions use the exact `cr664_OGBSharePoint*` schema names, including `cr664_OGBSharePointLibraryId` (never `ListId`), contract `ogb-deal-sharepoint/v2`, and mode `DRY_RUN`. The ten definitions are present in the inspected `OGBSharePointTransport` export; stale `new_OGBSharePoint*` names are rejected.

## Request and response

Required Power Apps V2 inputs: `operation`, `dealId`, `correlationId`, `idempotencyKey`. Optional operation-dependent inputs: `folderName`, `fileName`, `mimeType`, `fileContent`, `expectedSize`, `expectedSharePointItemId`, `expectedUniqueId`. The caller cannot supply the site, library, governed root, authorization result, role, caller identity, overwrite, or rename behavior.

The stable response fields are `success`, `operation`, `status`, `correlationId`, `idempotencyKey`, `dealId`, `errorCode`, `errorMessage`, `fileMayExist`, `reconciliationRequired`, `targetPath`, `fileName`, `sharePointItemId`, `sharePointUniqueId`, `size`, `etag`, `webUrl`, `completedOn`, and `contractVersion`. Raw connector errors and tokens are prohibited.

## Authorization and path behavior

The actual schema confirms Loan Deal `cr664_loandeal` and its assigned-banker lookup `cr664_assignedbanker`. A Power Apps V2 trigger alone did not provide reviewed evidence for a stable authenticated-object claim mapped through the existing user/banker chain. The flow therefore never trusts caller identity fields and returns `AUTHORIZATION_ADAPTER_UNRESOLVED` before any connector action. It never defaults to authorized.

The final folder must be derived from trusted deal data as `/(a) Loans/{YYYY} Loans/{Borrower Legal Name}`. Traversal, encoded traversal, absolute URLs, backslashes, controls, empty segments, invalid SharePoint characters, or caller-controlled roots are rejected. Material names are never silently sanitized.

## Idempotency, collision, and reconciliation

The current narrow solution contains `cr664_sharepointtransportledger` and its unique `cr664_idempotencykey`. DRY_RUN uses `STARTED`, `DRY_RUN_COMPLETED`, and `FAILED`; same-key/different-fingerprint is a collision and completed/same-fingerprint is an exact replay. Reconciliation remains read-only and may not delete, overwrite, rename, or fabricate completion.

`ensureFolder`, `upload`, `verifyFolder`, and `verifyFile` are routed explicitly. Their SharePoint actions remain blocked pending generated authorization/ledger integration. The current v2 successor verifies SHA-256 over exact upload bytes and includes that hash in request fingerprint material. LIVE upload still requires exact bytes/name, nonzero permitted content, `overwrite=false`, and exact readback.

## Code App status

`dealSharePointPowerAutomateTransport.ts` adds the governed selection seam. `DRY_RUN` remains the storage default. `POWER_AUTOMATE` cannot activate without the exact generated service name, Run method, parameter list, connection binding, immutable configuration, authenticated actor, server authorization, ledger, SharePoint readback, and reconciliation evidence. No generated service or operation name was guessed. The existing Azure implementation remains available and inactive.

## Operator sequence before LIVE

1. Review this changeset and packed unmanaged ZIP.
2. In Developer, verify the ten exported EnvironmentVariableDefinition components and `cr664_sharepointtransportledger` unique idempotency-key alternate key; do not recreate them.
3. Complete authenticated actor resolution from trusted runtime context and transactional Dataverse authorization/ledger actions.
4. Implement standard SharePoint connector/REST actions using exact-name lookup, `overwrite=false`, and readback; map sanitized errors.
5. Import only with the explicit Developer URL and `-Apply`; bind SharePoint and Dataverse references to approved operational identities.
6. Add the imported flow to the Code App through supported Power Apps integration; inspect generated TypeScript and wire only the exact emitted `Run` signature.
7. Certify success, failure, replay, collision, ambiguous-create/orphan, cross-deal isolation, timeout/throttle, and reconciliation in a non-production environment.
8. Record immutable evidence, then separately approve LIVE. Until then the adapter and both flows remain unavailable/inactive.

## Commands

```powershell
powershell -File scripts/power-platform/Invoke-CommercialLosPowerAutomateSolution.ps1 -Action Validate
powershell -File scripts/power-platform/Invoke-CommercialLosPowerAutomateSolution.ps1 -Action Pack -PackagePath C:\tmp\commercial-los-sharepoint-activation\artifacts\CommercialLendingLOS_PA1_unmanaged.zip
npx vitest run src/deals/documentStorage/dealSharePointPowerAutomateTransport.test.ts microsoft365/sharepoint-transport/tests/powerAutomateContract.test.ts
npx tsc -b
npm run build
npm test
```

Import and publish require `-Apply`. The target URL is pinned to `https://org3a57b8d4.crm.dynamics.com`; the selected PAC profile is never trusted implicitly.
