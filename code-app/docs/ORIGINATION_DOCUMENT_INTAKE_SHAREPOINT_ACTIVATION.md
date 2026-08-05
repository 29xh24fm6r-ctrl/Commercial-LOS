# Origination Document Intake â€” SharePoint activation

## Current state

- Storage mode defaults to `DRY_RUN`.
- The SharePoint Documents list data source is registered and `DocumentsService` is generated, but it exposes list-item CRUD onlyâ€”not folder creation or binary upload.
- The server source and SP-A3 Azure Function/IaC/custom-connector definitions are implemented. Infrastructure is not applied; runtime identity, site-scoped permission evidence, durable-store and Dataverse-authorization certification, connector registration, generated SDK inspection, final configuration hash, and real-file smoke evidence remain unresolved. Browser folder creation and file upload continue to fail closed.
- The existing Dataverse File-column path remains visible as legacy history and does not satisfy the SharePoint-native readiness model.

## Operator sequence

1. Preserve the registered Business Lending `DocumentsService`; do not use its generic `create` method as binary upload.
2. Run the read-only `scripts/microsoft365/resolve-origination-sharepoint-identifiers.ps1` discovery and approve its machine-readable evidence.
3. Provision the implemented `microsoft365/sharepoint-transport` boundary with Entra authentication and least-privilege Graph site access.
4. Resolve and pin the real Graph site ID and drive ID, verify server-side user/deal authorization, and configure idempotency plus orphan reconciliation.
5. Add the resulting connector/flow data source and regenerate the Code App SDK. Do not edit `src/generated` manually.
6. Record the exact generated service and operation signatures, then implement the thin `DealSharePointNativeClient` wrapper without guessing names.
7. Pin the verified configuration hash and complete configuration/readback checks in `dealSharePointNativeTransport.ts`.
8. Configure the independent gates only after readback:
   - `VITE_DEAL_DOCUMENT_STORAGE_MODE=LIVE`
   - `DEAL_SHAREPOINT_FOLDER_CREATION_ENABLED=true`
   - `DEAL_SHAREPOINT_FILE_UPLOAD_ENABLED=true`
   - `DEAL_DOCUMENT_METADATA_PERSISTENCE_ENABLED=true`
   - `DEAL_DOCUMENT_REQUIREMENT_WRITES_ENABLED=true`
   - `DEAL_DOCUMENT_EXCEPTION_WORKFLOW_ENABLED=true`
9. Run TypeScript, focused document/SharePoint tests, the full Vitest suite, and the production build.
10. Deploy through a controlled `pac code push` to the intended app/environment.
11. Using an approved test deal, create/resolve one company folder, upload one harmless PDF against one requirement, and directly verify the real SharePoint item.
12. Read back the folder identity, file identity, mapping, requirement status, audit, and timeline. Retry folder creation and confirm no duplicate.
13. Do not certify LIVE if any URL/item ID is missing, any reference crosses deals, a metadata-only row clears readiness, or rollback cannot disable the independent gates.

The complete external activation and orphan-reconciliation checklist is in `ORIGINATION_SHAREPOINT_LIVE_TRANSPORT_AAR.md`.
