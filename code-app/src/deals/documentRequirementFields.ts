/**
 * Document requirement lifecycle — STOPGAP type augmentation.
 *
 * `cr664_documentchecklist` gets eight new columns via
 * scripts/dataverse/create-document-requirement-lifecycle-fields.ps1:
 * `cr664_requirementstatus` (Choice), `cr664_required` (Boolean),
 * `cr664_acknowledged` (Boolean), `cr664_acknowledgedby` (Lookup ->
 * cr664_user), `cr664_acknowledgeddate` (DateTime), `cr664_revieweddate`
 * (DateTime), `cr664_waived` (Boolean), `cr664_waiverreason` (String). None of
 * these are yet part of the generated `Cr664_documentchecklistsModel.ts` —
 * same stopgap situation as `documentChecklistFileFields.ts`, which this
 * mirrors exactly (see that file's header for why a hand-written bridge type
 * is safe here: `getAll()`/`.get()` fetch full records with no `$select`
 * today, so these fields already come back in the raw Dataverse JSON once the
 * columns exist, regardless of what the generated TS model declares).
 *
 * DELETE THIS FILE once a real SDK regeneration makes these fields part of
 * `Cr664_documentchecklistsModel.ts` directly, and read them from the
 * generated type instead.
 */
export interface DocumentRequirementFields {
  /** Raw persisted cr664_requirementstatus option-set value (see REQUIREMENT_STATUS_CODES). */
  readonly cr664_requirementstatus?: number;
  readonly cr664_required?: boolean;
  readonly cr664_acknowledged?: boolean;
  readonly _cr664_acknowledgedby_value?: string;
  readonly cr664_acknowledgeddate?: string;
  readonly cr664_revieweddate?: string;
  readonly cr664_waived?: boolean;
  readonly cr664_waiverreason?: string;
}
