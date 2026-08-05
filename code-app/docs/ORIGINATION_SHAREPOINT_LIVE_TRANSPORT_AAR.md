# Origination SharePoint live transport AAR

## Verdict

**REPOSITORY READY / LIVE BLOCKED.** The narrow semantic transport satisfying `DealSharePointDocumentPort` is implemented and tested behind explicit configuration verification. The active connector factory remains unavailable and `VITE_DEAL_DOCUMENT_STORAGE_MODE` remains `DRY_RUN` because no authenticated binary transport has yet been configured or certified.

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

- Focused document-storage/native-transport suite: 34/34 passed across 12 files after the final response-field tightening.
- TypeScript (`npx tsc -b`): passed.
- Scoped lint: passed.
- Production build: passed with existing chunk-size and ineffective-dynamic-import warnings.
- Full Vitest suite: completed and failed with 215 existing governance/release-evidence assertions. Representative failures require historical feature flags to remain disabled, require an obsolete evidence commit (`0d5f303` instead of `54906ce`), and prohibit an existing `Patch` operation in a production-remediation script. The focused transport suite passed; these unrelated baselines were not rewritten.

No live connector call, SharePoint write, Dataverse write, deployment, or `LIVE` mode change occurred.

## External operator steps before LIVE

1. Implement the four-operation contract in `microsoft365/power-automate/origination-sharepoint-file-transport-contract.json` using an Entra-authenticated Power Automate custom connector backed by an Azure Function or another approved Microsoft Graph server boundary. Anonymous HTTP and browser-held Graph credentials are prohibited.
2. Resolve the Business Lending site to its immutable Graph site ID and the library ID `c1a62131-7946-44b9-bb4c-b4637a16f83c` to its immutable Graph drive ID. Pin both in server configuration and verify readback; do not infer that list ID and drive ID are interchangeable.
3. Grant the runtime identity only the approved Business Lending site scope (prefer `Sites.Selected` where supported) and verify it cannot read or write another site.
4. Enforce server-side authenticated-user resolution and deal authorization. Do not accept client-supplied role or access assertions.
5. Configure correlation-ledger idempotency, collision rejection (`fail`, never `rename`), durable audit, and an orphan-file reconciliation queue.
6. Add the configured custom connector/flow to the Code App, regenerate the SDK, and record the exact generated service and operation signatures.
7. Implement a thin `DealSharePointNativeClient` wrapper over only those inspected signatures. Then—and only then—change `buildDealSharePointConnectorAdapter` to return `createDealSharePointNativeTransport` with the verified configuration.
8. Calculate and pin the immutable configuration SHA-256 covering tenant, site ID, drive ID, root, connector/flow IDs, runtime identity, permission grant, and contract version. Set all readiness attestations only after readback.
9. Run configuration-negative tests, focused tests, TypeScript, production build, full suite, and an approved real-file certification using a harmless PDF.
10. Verify folder and file directly in SharePoint/Graph, retry the identical correlation ID, test a collision and cross-deal request, force post-upload persistence failure, reconcile the orphan candidate, and verify audit/timeline evidence.
11. Confirm rollback independently disables folder creation, upload, metadata persistence, and requirement writes.
12. Only after every check passes may an authorized release set `VITE_DEAL_DOCUMENT_STORAGE_MODE=LIVE` and deploy. This branch does not perform that action.

## Current external state

| Gate | State |
|---|---|
| SharePoint list data source | Registered |
| Generic DocumentsService | Generated |
| Binary transport | Not configured |
| Exact generated binary signatures | Not available |
| Configuration hash/readback | Not available |
| Real folder/file smoke | Not performed |
| `VITE_DEAL_DOCUMENT_STORAGE_MODE` | `DRY_RUN` |
| Deployment | Not performed |

