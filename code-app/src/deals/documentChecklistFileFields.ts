/**
 * Dataverse remediation (document-checklist file upload) — STOPGAP type augmentation.
 *
 * `cr664_documentchecklist` gets six new columns via
 * scripts/dataverse/create-document-checklist-file-columns.ps1: `cr664_documentfile` (File),
 * `cr664_originalfilename` (String), `cr664_mimetype` (String), `cr664_filesizebytes` (Whole
 * Number), `cr664_uploadedon` (DateTime), `cr664_uploadedby` (Lookup -> cr664_user). None of these
 * are yet part of the generated `Cr664_documentchecklistsModel.ts` — that requires re-running
 * `pac code add-data-source -a dataverse -t cr664_documentchecklists` (see
 * scripts/dataverse/regenerate-powerapps-sdk.ps1), which this sandbox cannot run (no `pac` CLI /
 * Dataverse credentials here — see the Dataverse schema remediation AAR).
 *
 * `src/generated/` must never be hand-edited (see docs/CANONICAL_SOURCES.md rule 4), so this file
 * is a small, NON-GENERATED bridge instead: `Cr664_documentchecklistsService.getAll()`/`.get()`
 * fetch full records with no `$select` today, so these fields will already come back in the raw
 * Dataverse JSON once the columns exist, regardless of what the generated TS model declares — this
 * file only adds the TypeScript type for reading them safely (`undefined`, not a crash, if a
 * record predates the columns or the columns don't exist yet).
 *
 * `cr664_documentfile` itself is NOT modeled here — Dataverse File-column content is read/written
 * via the SDK client's `downloadFileFromRecord`/`uploadFileToRecord` (see
 * `src/deals/documentUploadLiveDeps.ts`), not as an ordinary JSON field value, so there is no
 * scalar TS shape for it to stand in for.
 *
 * DELETE THIS FILE once a real SDK regeneration makes these fields part of
 * `Cr664_documentchecklistsModel.ts` directly, and read them from the generated type instead.
 */
export interface DocumentChecklistFileFields {
  readonly cr664_originalfilename?: string;
  readonly cr664_mimetype?: string;
  readonly cr664_filesizebytes?: number;
  readonly cr664_uploadedon?: string;
  readonly _cr664_uploadedby_value?: string;
}
