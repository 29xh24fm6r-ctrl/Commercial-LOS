# Origination Document Intake — SharePoint activation

## Current state

- Storage mode defaults to `DRY_RUN`.
- The SharePoint Documents list data source is registered and `DocumentsService` is generated, but it exposes list-item CRUD only—not folder creation or binary upload.
- Folder creation and file upload fail closed.
- The existing Dataverse File-column path remains visible as legacy history and does not satisfy the SharePoint-native readiness model.

## Operator sequence

1. Preserve the registered Business Lending `DocumentsService`; do not use its generic `create` method as binary upload.
2. Configure the approved authenticated Microsoft-native boundary described in `microsoft365/power-automate/origination-sharepoint-file-transport-contract.json`.
3. Resolve and pin the real Graph site ID and drive ID, verify server-side user/deal authorization, and configure idempotency plus orphan reconciliation.
4. Add the resulting connector/flow data source and regenerate the Code App SDK. Do not edit `src/generated` manually.
5. Record the exact generated service and operation signatures, then implement the thin `DealSharePointNativeClient` wrapper without guessing names.
6. Pin the verified configuration hash and complete configuration/readback checks in `dealSharePointNativeTransport.ts`.
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
