# Origination Document Intake forensic inventory

## Existing paths retained

- `DealDocuments.tsx` owned the rendered checklist, borrower requests, manual receipt, review, file-column upload/download, task creation, and refresh orchestration in one 1,074-line component.
- `documentRequirementDerivation.ts` provided product, collateral, SBA, and stage-derived requirements. Its broad tax-return and financial-statement definitions were not granular enough for period-level proof.
- `documentRequirementLifecycle.ts`, `documentRequirementActions.ts`, and their live dependencies own the existing acknowledged/requested/received/reviewed states, actor binding, audit, and timeline evidence.
- `documentUploadAction.ts` and `documentUploadLiveDeps.ts` provide verified Dataverse File-column upload/readback. That route is retained as `DATAVERSE_FILE_LEGACY`; it is not treated as verified SharePoint evidence.
- `documentRequirementBlockerMerge.ts` is the asynchronous bridge into the existing stage blocker. The new canonical core requirements continue through that bridge.
- Portfolio boarding has a useful port/adapter/DRY_RUN pattern, but its loan types and persistence are not imported into origination.

## Generated SDK finding

The current generated service directory contains Dataverse, Outlook, and Copilot services but no SharePoint Online service. No generated file was edited and no SharePoint operation name was guessed. The origination connector adapter therefore remains deliberately unavailable and LIVE operations fail closed.

## Compatibility decision

- Verified SharePoint record: `SHAREPOINT_NATIVE` and eligible for new readiness.
- Existing Dataverse binary: `DATAVERSE_FILE_LEGACY`, preserved and downloadable, but not sufficient for SharePoint-native readiness.
- Existing received status without a real binary/reference: `METADATA_ONLY_LEGACY`, never sufficient for readiness.
- Incomplete SharePoint metadata: `MIGRATION_REQUIRED` or `STORAGE_REFERENCE_INVALID`.
- Existing requests, reviews, manual requirements, audit rows, and timeline history are preserved.

## Release gates

The repository implementation is safe in `DRY_RUN`. LIVE requires the generated SharePoint service, inspected signatures, the additive Dataverse schema, connector consent, and an approved real upload smoke. Until then the UI states `Configuration Required` and does not fabricate folder or file URLs.
