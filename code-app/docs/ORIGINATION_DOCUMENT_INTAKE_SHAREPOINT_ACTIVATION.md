# Origination Document Intake — SharePoint activation

## Current state

- Storage mode defaults to `DRY_RUN`.
- No generated SharePoint Online service exists.
- Folder creation and file upload fail closed.
- The existing Dataverse File-column path remains visible as legacy history and does not satisfy the SharePoint-native readiness model.

## Operator sequence

1. In the Commercial Lending LOS Code App, add the standard **SharePoint Online** data source using the approved Production connection reference.
2. Select the `Business Lending` site and `Shared Documents` library. The governed root is `(a) Loans`; do not select or create a different root.
3. Regenerate the Code App SDK through the same supported Power Apps process used for Outlook. Do not edit `src/generated` manually.
4. Confirm a generated SharePoint service appears under `src/generated/services` and record its exact operations/signatures.
5. Replace the unavailable implementation in `dealSharePointConnectorAdapter.ts` with a thin wrapper over only those generated signatures.
6. Run `scripts/dataverse/provision-origination-document-storage.ps1` without `-Apply` and review the dry-run inventory.
7. With approved schema authority, rerun it with `-Apply -Force`, then regenerate Dataverse models.
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
