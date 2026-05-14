/**
 * Phase 49: schema-verified audit outcome enum values.
 *
 * The cr664_AuditEvent.cr664_outcomestatus column uses two values
 * across every governed write in this app:
 *   - Succeeded = 788190000
 *   - Failed    = 788190001
 *
 * Before Phase 49 these two constants were duplicated inline in every
 * action module (dealTaskActions, documentActions, creditMemoActions,
 * alertActions, dataQualityActions). Phase 49 consolidates them here
 * because the values are truly cross-cutting — the same Dataverse
 * column accepts the same enum regardless of which entity the audit
 * row is about.
 *
 * What is INTENTIONALLY not extracted:
 *   - cr664_eventcategory values (Lifecycle vs Alert vs Exception)
 *   - cr664_eventtype values     (StatusChange vs ExceptionResolved)
 *   - cr664_entitytype values    (LoanDeal vs Configuration)
 *   Those vary by domain and the action module is the right home for
 *   them — they belong next to the action that interprets them.
 *
 * Discipline:
 *   - This module is pure data. No I/O, no SDK import, no role-module
 *     import. The Phase 48 isolation sweep enforces both.
 *   - Update these values only via deliberate edit if the upstream
 *     Power Apps option set changes. Any change here cascades to
 *     every governed write at once.
 */

/** cr664_AuditEvent.cr664_outcomestatus → "Succeeded". */
export const AUDIT_OUTCOME_SUCCEEDED = 788190000;

/** cr664_AuditEvent.cr664_outcomestatus → "Failed". */
export const AUDIT_OUTCOME_FAILED = 788190001;
