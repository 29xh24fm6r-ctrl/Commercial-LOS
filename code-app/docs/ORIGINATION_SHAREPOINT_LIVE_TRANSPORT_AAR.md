# Origination SharePoint live transport AAR

## Verdict

**SERVER IMPLEMENTATION READY / LIVE BLOCKED.** The authenticated server boundary for the four semantic operations is implemented and tested. Immutable Graph identifiers and permissions are not evidenced, the Power Apps connector has not been generated or bound, configuration is not certified, and no real-file smoke has run. The active connector factory therefore remains unavailable and `VITE_DEAL_DOCUMENT_STORAGE_MODE` remains `DRY_RUN`.

## Verified starting state

- Production Dataverse document-storage schema and generated Dataverse sources are present.
- The Business Lending SharePoint Documents library is registered.
- Generated `DocumentsService` exposes generic list-item CRUD only.
- `DocumentsService.create` is not a supported or used binary upload mechanism.

## Implemented

- Four semantic operations: `ensureFolder`, binary `upload`, `verifyFolder`, and `verifyFile`.
- Immutable target validation for the Business Lending site, library ID, and `(a) Loans` root.
- Exact response-envelope, correlation, deal, borrower, path, URL, item-ID, MIME, byte-length, and requirement-mapping validation.
- Idempotent existing-folder handling without rename-on-collision.
- Cross-deal and malformed-response rejection.
- Ambiguous/partial upload failures report `fileMayExist=true` so the requirement remains unsatisfied and orphan reconciliation is mandatory.
- Configuration readiness requires a pinned SHA-256 configuration hash plus verified actor resolution, server authorization, Graph readback, and orphan reconciliation.

## Validation

- Phase SP-A1 focused matrix: 37/37 passed across four files.
- TypeScript (`npx tsc -b`): passed.
- Scoped lint: passed.
- Production build: passed with existing chunk-size and ineffective-dynamic-import warnings.
- Reachability audit: existing baseline failure, 45 unexpected orphans; not rewritten.
- Full Vitest suite: 14,577 total; 14,357 passed; 200 failed; 20 pending. All Phase SP-A1 files passed. The 200 failures are in unrelated historical baseline files, including stale Teams app-ID and old gate/readiness expectations.

No live connector call, SharePoint write, Dataverse write, deployment, or `LIVE` mode change occurred.

## External operator steps before LIVE

1. Run `powershell -File scripts/microsoft365/resolve-origination-sharepoint-identifiers.ps1 -EvidenceOutputPath <approved-evidence-path>` with an operator-supplied Microsoft Graph token and review the read-only JSON output.
2. Provision `microsoft365/sharepoint-transport/host/sharePointTransportHost.ts` behind an Entra-authenticated Azure Function or equivalent approved boundary. Anonymous HTTP and browser-held Graph credentials are prohibited.
3. Resolve the Business Lending site to its immutable Graph site ID and the library ID `c1a62131-7946-44b9-bb4c-b4637a16f83c` to its immutable Graph drive ID. Pin both in server configuration and verify readback; do not infer that list ID and drive ID are interchangeable.
4. Grant the runtime identity only the approved Business Lending site scope (prefer `Sites.Selected` where supported) and verify it cannot read or write another site.
5. Enforce server-side authenticated-user resolution and deal authorization. Do not accept client-supplied role or access assertions.
6. Configure correlation-ledger idempotency, collision rejection (`fail`, never `rename`), durable audit, and an orphan-file reconciliation queue.
7. Add the configured custom connector/flow to the Code App, regenerate the SDK, and record the exact generated service and operation signatures.
8. Implement a thin `DealSharePointNativeClient` wrapper over only those inspected signatures. Thenâ€”and only thenâ€”change `buildDealSharePointConnectorAdapter` to return `createDealSharePointNativeTransport` with the verified configuration.
9. Calculate and pin the immutable configuration SHA-256 covering tenant, site ID, drive ID, root, connector/flow IDs, runtime identity, permission grant, and contract version. Set all readiness attestations only after readback.
10. Run configuration-negative tests, focused tests, TypeScript, production build, full suite, and an approved real-file certification using a harmless PDF.
11. Verify folder and file directly in SharePoint/Graph, retry the identical correlation ID, test a collision and cross-deal request, force post-upload persistence failure, reconcile the orphan candidate, and verify audit/timeline evidence.
12. Confirm rollback independently disables folder creation, upload, metadata persistence, and requirement writes.
13. Only after every check passes may an authorized release set `VITE_DEAL_DOCUMENT_STORAGE_MODE=LIVE` and deploy. This branch does not perform that action.

## Current external state

| Gate | State |
|---|---|
| SharePoint list data source | Registered |
| Generic DocumentsService | Generated |
| Server binary transport implementation | Ready in repository |
| Immutable Graph IDs | Unresolved |
| Generated connector signatures | Not available |
| Certified configuration hash/readback | Not available |
| Real folder/file smoke | Not performed |
| `VITE_DEAL_DOCUMENT_STORAGE_MODE` | `DRY_RUN` |
| Deployment | Not performed |

