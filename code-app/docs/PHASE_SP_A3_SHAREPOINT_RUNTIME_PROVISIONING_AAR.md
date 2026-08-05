# Phase SP-A3 â€” SharePoint runtime provisioning AAR

## Decision

**RUNTIME SOURCE READY / INFRASTRUCTURE NOT APPLIED / LIVE BLOCKED.**

Phase SP-A3 defines a production-shaped, authenticated Azure Functions boundary around the governed SP-A1 host. It does not deploy resources, grant permissions, register a connector, regenerate a Power Apps SDK, write SharePoint or Dataverse content, deploy the Code App, or enable LIVE document storage.

## Architecture

- Four HTTP operations only: `ensureFolder`, `upload`, `verifyFolder`, and `verifyFile`.
- Entra Easy Auth claims are decoded server-side; missing, malformed, duplicated, or mismatched object identity fails closed.
- Client-supplied roles, identities, emails, authorization booleans, and deal assertions remain prohibited by the SP-A1 HTTP boundary.
- Microsoft Graph access uses `DefaultAzureCredential` and the narrow SP-A1 `SharePointGraphClient` seam. Upload uses a conflict-fail upload session and never rename.
- A certified, read-only Dataverse authorization adapter must be injected. The repository placeholder always fails.
- Azure Table-backed idempotency and orphan stores are provided. Production composition performs health checks and contains no in-memory fallback.
- Configuration pins the resolved tenant, site, drive, governed root, path, site URL, list/library ID, and contract version. It also requires the deployed Function resource/hostname, connector/runtime identities, permission evidence, configuration version, durable tables, and Dataverse adapter.

## Infrastructure defined, not applied

`microsoft365/sharepoint-transport/azure-function/infra/main.bicep` defines:

- Linux Azure Function App on a supported consumption plan
- system-assigned or parameterized user-assigned managed identity
- Functions storage and separate idempotency/orphan Azure Tables
- Application Insights
- Entra App Service Authentication with unauthenticated requests returning 401
- HTTPS-only, TLS 1.2 minimum, FTP disabled, and parameterized restricted CORS
- immutable deployment settings and outputs for identity, hostname, and resource IDs

No real secrets exist in Bicep, the OpenAPI definition, or the example local settings. Unresolved values intentionally prevent startup.

## Permission model

The intended permission is Microsoft Graph `Sites.Selected`, separately granted to the Function enterprise application for only:

`oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48`

The grant script defaults to read-only proposal mode, requires both `-Apply` and `-Force` to mutate, verifies site URL/ID before any proposal or grant, and reads the resulting permission back. It was not executed.

## Connector status

The OpenAPI 3 definition is ready and contains exactly four authenticated semantic operations. It carries base64 binary bytes and correlation IDs, documents collisions and `fileMayExist`, and exposes no credentials. It is not registered. Generated SDK inspection remains false and the existing unavailable Code App adapter remains authoritative.

## Truthful evidence state

- `infrastructureDefined`: true
- `connectorDefinitionReady`: true
- `infrastructureApplied`: false
- `runtimeIdentityResolved`: false
- `permissionGrantApplied`: false
- `permissionGrantReadBack`: false
- `functionAuthenticationVerified`: false
- `durableLedgerConfigured`: false
- `connectorRegistered`: false
- `generatedSdkInspected`: false
- `configurationHashPinned`: false
- `realFileSmokeVerified`: false
- `liveActivated`: false

## Unresolved operator inputs

- Azure subscription, resource group, region, names, and approved origins
- Function/connector Entra application identity
- deployed managed identity object/client ID
- site-scoped permission grant evidence ID
- certified Dataverse read-only authorization adapter ID and identity permissions
- Functions storage account/table RBAC readback
- final Function resource ID and hostname
- configuration version and deterministic final hash
- connector registration and generated SDK signatures
- real-file, replay, collision, cross-deal, orphan, rollback, and end-to-end certification

## Safe operator commands (what-if/readback only)

```powershell
powershell -File scripts/microsoft365/provision-origination-sharepoint-runtime.ps1 -SubscriptionId <subscription> -ResourceGroupName <resource-group> -ParametersFile <reviewed-parameters.json>

powershell -File scripts/microsoft365/inspect-origination-sharepoint-runtime.ps1 -SubscriptionId <subscription> -ResourceGroupName <resource-group> -FunctionAppName <function-app>

powershell -File scripts/microsoft365/grant-origination-sharepoint-sites-selected.ps1 -EnterpriseApplicationObjectId <object-id> -SiteId "oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48"
```

The first command performs Azure deployment what-if without `-Apply`; the third emits a read-only permission proposal without `-Apply -Force`. The readback command performs no mutation.

## Safety confirmation

No Azure deployment, Graph permission grant, SharePoint write, Dataverse write, Code App deployment, connector registration, `.env.production` modification, generated SDK edit, or LIVE activation occurred in SP-A3. `VITE_DEAL_DOCUMENT_STORAGE_MODE` remains `DRY_RUN` by default.

## Changed-file inventory

- `docs/ORIGINATION_DOCUMENT_INTAKE_SHAREPOINT_ACTIVATION.md`
- `docs/PHASE_SP_A3_SHAREPOINT_RUNTIME_PROVISIONING_AAR.md`
- `microsoft365/sharepoint-transport/authorization/productionDealAuthorization.ts`
- `microsoft365/sharepoint-transport/azure-function/README.md`
- `microsoft365/sharepoint-transport/azure-function/host.json`
- `microsoft365/sharepoint-transport/azure-function/infra/main.bicep`
- `microsoft365/sharepoint-transport/azure-function/infra/main.parameters.example.json`
- `microsoft365/sharepoint-transport/azure-function/local.settings.example.json`
- `microsoft365/sharepoint-transport/azure-function/package.json`
- `microsoft365/sharepoint-transport/azure-function/tsconfig.json`
- `microsoft365/sharepoint-transport/azure-function/src/authenticationClaims.ts`
- `microsoft365/sharepoint-transport/azure-function/src/azureDependencies.ts`
- `microsoft365/sharepoint-transport/azure-function/src/functions/{common,ensureFolder,upload,verifyFolder,verifyFile}.ts`
- `microsoft365/sharepoint-transport/azure-function/src/{runtimeConfiguration,runtimeRegistry}.ts`
- `microsoft365/sharepoint-transport/contract/immutable-configuration-evidence.json`
- `microsoft365/sharepoint-transport/contract/immutable-configuration-evidence.template.json`
- `microsoft365/sharepoint-transport/graph/managedIdentityGraphClient.ts`
- `microsoft365/sharepoint-transport/index.ts`
- `microsoft365/sharepoint-transport/openapi/origination-sharepoint-transport.openapi.json`
- `microsoft365/sharepoint-transport/openapi/README.md`
- `microsoft365/sharepoint-transport/production/{durableLedgers,productionHostFactory}.ts`
- `microsoft365/sharepoint-transport/tests/{runtimeAssets,runtimeProvisioning}.test.ts`
- `microsoft365/sharepoint-transport/tsconfig.json`
- `scripts/microsoft365/{get-origination-sharepoint-configuration-hash,grant-origination-sharepoint-sites-selected,inspect-origination-sharepoint-runtime,provision-origination-sharepoint-runtime,test-origination-sharepoint-runtime-health}.ps1`

## Verification results

- Focused SP-A1/SP-A3 transport tests: **55/55 passed** across 4 files.
- New SP-A3 assertions: **21/21 passed** across 2 files.
- TypeScript (`npx tsc -b`): **passed**.
- Scoped ESLint: **passed**.
- Production build (`npm run build`): **passed**; 1,130 modules transformed.
- Reachability audit: **historical baseline failure** — 45 unexpected orphans; no SP-A3 server/package path is part of the browser reachability graph.
- Full Vitest: **14,598 total; 14,378 passed; 200 failed; 20 pending**. Suites: **3,989 total; 3,775 passed; 214 failed**. Both SP-A3 suites passed; failure counts remain the pre-SP-A3 historical baseline and include the existing Teams manifest app-ID mismatch (`63858e09-...` expected versus authoritative app `7870515e-...`).
- `git diff --check`: **passed**.
- Azure Bicep CLI compile: **not run** because `az` is not installed in this execution environment. The Bicep security and no-secret invariants are covered by focused repository tests; operator what-if remains mandatory before apply.