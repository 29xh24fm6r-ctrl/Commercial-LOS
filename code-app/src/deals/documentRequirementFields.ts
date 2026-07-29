/**
 * Document requirement lifecycle compatibility projection.
 *
 * `cr664_documentchecklist` gets nine new columns via
 * scripts/dataverse/create-document-requirement-lifecycle-fields.ps1:
 * `cr664_requirementstatus` (Choice), `cr664_required` (Boolean),
 * `cr664_acknowledged` (Boolean), `cr664_acknowledgedby` (Lookup ->
 * cr664_user), `cr664_acknowledgeddate` (DateTime), `cr664_receivedby`
 * (Lookup -> cr664_user, Production Remediation Factory Arc Phase 1 / N-16 —
 * the segregation-of-duties fact `review` checks against), `cr664_revieweddate`
 * (DateTime), `cr664_waived` (Boolean), `cr664_waiverreason` (String).
 * The fields are now present in the regenerated SDK model. This narrow,
 * readonly projection remains so query modules share one lifecycle view
 * without coupling their raw-record narrowing to the complete SDK model.
 */
export interface DocumentRequirementFields {
  /** Raw persisted cr664_requirementstatus option-set value (see REQUIREMENT_STATUS_CODES). */
  readonly cr664_requirementstatus?: number;
  readonly cr664_required?: boolean;
  readonly cr664_acknowledged?: boolean;
  readonly _cr664_acknowledgedby_value?: string;
  readonly cr664_acknowledgeddate?: string;
  /** Resolved cr664_user row id of whoever ran `receive` (segregation-of-duties fact). */
  readonly _cr664_receivedby_value?: string;
  readonly cr664_revieweddate?: string;
  readonly cr664_waived?: boolean;
  readonly cr664_waiverreason?: string;
}
