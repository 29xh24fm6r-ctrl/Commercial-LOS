# Phase SP-A1 - authenticated SharePoint transport AAR

## Decision

**SERVER IMPLEMENTATION READY / LIVE BLOCKED.** Phase SP-A1 implements the
server-side Microsoft Graph boundary and read-only identifier discovery needed
for operator provisioning. It does not generate or bind a Power Apps connector,
certify tenant configuration, perform a real-file smoke, deploy, or enable LIVE.

## Files and architecture

- `microsoft365/sharepoint-transport/contract`: immutable configuration,
  deterministic SHA-256 calculation, request/response contracts, and an
  unresolved evidence template.
- `microsoft365/sharepoint-transport/graph`: a narrow Graph seam for site/drive
  and driveItem reads, exact-child lookup, collision-fail folder creation, and
  collision-fail binary upload.
- `microsoft365/sharepoint-transport/authorization`: Entra-claims actor
  resolution through an enabled Dataverse system-user lookup and per-operation
  deal authorization.
- `microsoft365/sharepoint-transport/idempotency`: correlation ledger keyed by
  contract, operation, deal, and correlation; exact replay returns the same
  verified result and changed-payload reuse fails closed.
- `microsoft365/sharepoint-transport/orphan-reconciliation`: unreconciled
  candidate evidence for ambiguous upload, failed/malformed readback, and
  downstream metadata failure.
- `microsoft365/sharepoint-transport/host`: four semantic operations plus an
  authenticated HTTP/custom-connector dispatch seam.
- `scripts/microsoft365/resolve-origination-sharepoint-identifiers.ps1`:
  read-only Graph discovery for the exact site, drive/list metadata, and one
  exact `(a) Loans` root.

The existing browser connector adapter remains unavailable. No generated SDK
file was changed and `DocumentsService.create` is not used for binary content.

## Security and operation behavior

The boundary accepts identity only from server-provided claims. It rejects
client role/authorization fields, tenant mismatch, unresolved or disabled actor,
negative/malformed deal authorization, malformed request bindings, and any
target readback mismatch. The future trigger must require Entra authentication;
no anonymous trigger descriptor is included.

Every operation verifies the pinned site and drive and re-authorizes the deal.
`ensureFolder` creates only the exact year and borrower folders with
`conflictBehavior=fail`; exact existing folders return `created=false`.
`upload` accepts exact bytes under a verified same-deal folder, rejects name
collisions, and verifies item ID, facet, parent, name, path, URL, size, and MIME.
`verifyFolder` and `verifyFile` repeat authorization and exact Graph readback.
Ambiguous or post-upload failures return `fileMayExist=true`, create an
`UNRECONCILED` orphan candidate, and never satisfy a requirement.

## Immutable configuration hash

The canonical hash covers, in deterministic key order: tenant ID, Graph site
ID, Graph drive ID, governed root item ID, verified root path, site URL,
library/list ID, contract version, connector identity, runtime identity,
permission-grant evidence ID, and configuration version. Missing fields,
malformed hashes, hash mismatch, or unapproved target values fail closed.

## Verification results

- Focused tests: **37/37 passed** across four files.
- TypeScript, `npx tsc -b`: **passed**.
- Scoped ESLint for changed TypeScript: **passed**.
- Production build: **passed**; existing chunk-size and ineffective dynamic
  import warnings remain.
- Reachability audit: **failed on the existing repository baseline of 45
  unexpected orphans**. The list includes the pre-existing document-storage
  subsystem and was not rewritten for this server-only phase.
- Complete Vitest suite: **14,577 total tests; 14,357 passed; 200 failed; 20
  pending. 3,982 suites/files were evaluated; 3,768 passed and 214 failed.**
  Representative existing failures include stale Teams app-ID expectations,
  historical disabled-by-default admin/readiness assertions, and old release
  evidence/gate expectations. All new and changed Phase SP-A1 test files passed;
  **no full-suite failure is in a Phase SP-A1 file**.

## Unresolved operator inputs and exact next commands

1. Obtain a Graph token without printing it, then run read-only discovery:

   ```powershell
   Connect-AzAccount
   $graphToken = (Get-AzAccessToken -ResourceUrl 'https://graph.microsoft.com').Token
   & scripts/microsoft365/resolve-origination-sharepoint-identifiers.ps1 `
     -AccessToken $graphToken `
     -EvidenceOutputPath '<approved evidence path>'
   ```

2. Review the JSON and populate a governed copy of
   `immutable-configuration-evidence.template.json`. Tenant ID, resolved site
   ID, resolved drive ID, root item ID, connector/runtime identities,
   permission evidence, configuration version, and computed hash remain
   unresolved in this commit.
3. Provision the host behind Entra authentication, grant the runtime identity
   least privilege to only the Business Lending site (prefer `Sites.Selected`),
   and verify it cannot reach another site.
4. Generate and bind the connector, inspect its exact operation signatures,
   implement only the thin browser `DealSharePointNativeClient`, and certify
   configuration/readback.
5. Run an approved harmless-file smoke, exact retry, collision, cross-deal,
   post-upload failure/orphan reconciliation, audit/timeline reconciliation,
   and independent rollback test.
6. Only a separately authorized release may change
   `VITE_DEAL_DOCUMENT_STORAGE_MODE` from `DRY_RUN` after every gate passes.

## Change-control confirmation

No Graph discovery script was executed. No SharePoint or Dataverse write, live
connector call, credential persistence, generated SDK edit, deployment,
environment change, gate enablement, or LIVE activation occurred. No fabricated
identifier, URL, item ID, actor, authorization, or smoke evidence was recorded.
