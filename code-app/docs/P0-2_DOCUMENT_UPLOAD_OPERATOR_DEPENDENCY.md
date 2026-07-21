# P0-2 — Document Upload: exact operator dependency

**Status: code-complete, fail-closed.** The binary document-upload path (validate → upload →
mark-received → audit) is fully implemented and tested, but stays **disabled** until an operator
provisions one Dataverse **File** column and regenerates the SDK. Nothing below deploys the app or
mutates business data on its own; every step is a deliberate, evidence-backed operator act.

This document is the single authoritative statement of that dependency. The schema names are pinned
in code (`src/deals/documentUploadSchema.ts`, tested by `documentUploadSchema.test.ts`) so this
runbook and the wiring cannot drift.

> Naming note: an older scoping doc (`docs/PHASE_51_DOCUMENT_UPLOAD_SCOPE.md` §7) *suggested* the
> name `cr664_filedocument`. The **canonical, wired, and provisioned** name is **`cr664_documentfile`**
> — that is what `documentUploadLiveDeps.ts` calls and what the provisioning script creates. Ignore
> the older suggested name.

## 1. Exact schema to provision

Table (singular logical): **`cr664_documentchecklist`** — entity set **`cr664_documentchecklists`**.

| Column | Type | Purpose |
| --- | --- | --- |
| **`cr664_documentfile`** | **File** (MaxSizeInKB default 25600 = 25 MB) | The binary content. **This is the blocker.** |
| `cr664_originalfilename` | String (260) | Uploaded filename |
| `cr664_mimetype` | String (200) | Browser-reported content type (recorded honestly, never inferred) |
| `cr664_filesizebytes` | Whole Number | Byte count at upload time |
| `cr664_uploadedon` | DateTime | When the file was uploaded (distinct from `cr664_receiveddate`) |
| `cr664_uploadedby` | Lookup → **`cr664_user`** (NOT `systemuser`) | Uploading actor. Mirrors the `cr664_ChangedBy` pattern — binding a required actor lookup to `/systemusers` was rejected live in a real incident. |

`cr664_receiveddate` and `cr664_uploadstatus` already exist (Phase 51 metadata-only flow) and are
reused; they are not created by the script.

## 2. Provisioning command (creates the columns)

```
# dry-run (default; prints what it would create, mutates nothing)
powershell -File scripts/dataverse/create-document-checklist-file-columns.ps1

# apply (create-missing-only + publish; never overwrites/renames/deletes)
powershell -File scripts/dataverse/create-document-checklist-file-columns.ps1 -Apply
```

The script confirms the target org (`pac org who` + host match, default
`org3a57b8d4.crm.dynamics.com`; override with `-ExpectedOrgHost`), confirms the CommercialLendingLOS
solution exists, existence-checks every column, publishes only if it created something, and
re-verifies each column's `AttributeType` afterward. It does **not** flip any application flag.

## 3. SDK regeneration (surfaces the column to typed code)

```
# dry-run
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1

# apply — pac code add-data-source + scripts/sync-datasourcesinfo.mjs (NO pac code push / deploy)
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1 -Apply
```

Generated changes to expect after regen:

- `src/generated/models/Cr664_documentchecklistsModel.ts` gains **`cr664_documentfile`** (plus the
  metadata columns if not already present).
- `Cr664_documentchecklistsService` already exists (CRUD); the binary upload uses the underlying
  data client's `uploadFileToRecord(entitySet, recordId, fileColumn, fileName, content)` —
  file upload is on the client, not the per-entity service.
- The `.power/schemas/appschemas/dataSourcesInfo` manifest refreshes.

## 4. Flags to flip AFTER provisioning + regen + a captured upload smoke

Both default `false`; arm only with evidence:

- `DOCUMENT_FILE_UPLOAD_ENABLED` — `src/deals/dealOriginationFeatureFlags.ts`
- `DOCUMENT_UPLOAD_ENABLED` — `src/activation/documentUploadActivation.ts`

The runtime gate also requires the per-request config flag to be exactly `true`
(`isDocumentFileUploadEnabled`), an authorized actor, audit wired, and a passed upload smoke with
rollback verified (`deriveDocumentUploadActivation`).

## 5. Fail-closed diagnostics (already in code)

- `deriveDocumentUploadSchemaGate({ fileColumnPresent, uploadMethodAvailable })` →
  `uploadTargetReady=false` + remediation strings until the File column and SDK method both exist.
  (`src/activation/documentUploadActivation.ts`, tested in `documentUploadActivation.test.ts`.)
- `deriveDocumentUploadActivation(...)` rolls the schema gate + flag + actor + audit + smoke into one
  `CapabilityReadiness` (fails closed on any gap).
- `uploadDocumentFile` returns `dependency_not_ready` when `DOCUMENT_FILE_UPLOAD_ENABLED` is false
  (`src/deals/documentUploadAction.ts`), and `uploadDocument` returns `disabled` when the target /
  transport is not ready — a failed binary upload **never** marks the document received.

## 6. Operator sequence (ordered)

1. Run `create-document-checklist-file-columns.ps1` (dry-run, then `-Apply`).
2. Run `regenerate-powerapps-sdk.ps1` (dry-run, then `-Apply`); confirm `cr664_documentfile` appears
   in `Cr664_documentchecklistsModel.ts`.
3. Perform a real upload smoke against a non-production checklist item; confirm the file lands, the
   item marks received, and the audit row writes. Capture the evidence (smoke registry).
4. Only then set `DOCUMENT_FILE_UPLOAD_ENABLED` / `DOCUMENT_UPLOAD_ENABLED` (+ config flag) `true`,
   with a named approver.
5. Verify `deriveDocumentUploadActivation` reports go/ready.

Until step 1 lands, no further app-side work is productive — the code is complete.

## 7. Verification by tests (no live upload)

- `src/deals/documentUploadSchema.test.ts` — pins the exact File/table/entity-set + metadata names.
- `src/activation/documentUploadActivation.test.ts` — the schema gate blocks with remediation when
  the File column / SDK method is missing and is ready when both are present; the adapter is
  disabled/fail-closed until the target and transport are ready.
- `src/deals/documentUploadAction.test.ts` — the pure action's validation, fail-closed gate, and
  upload-before-mark-received ordering.

**No deployment is performed by any step in this document; `pac code push` is never run.**
