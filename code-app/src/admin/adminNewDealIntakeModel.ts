/**
 * Phase 169C -- Admin New Deal Intake model (blocker/preview only).
 *
 * Investigation outcome: CASE B (deal-create SDK exists; Stage/Status
 * reference data source is missing). See
 * docs/PHASE_169C_ADMIN_NEW_DEAL_INTAKE_BLOCKER.md and
 * docs/PHASE_163_STAGE_STATUS_REFERENCE_UNBLOCK.md.
 *
 * `Cr664_loandealsService.create` exists, but `cr664_loandeal` create
 * requires non-optional `cr664_StageReference@odata.bind` and
 * `cr664_StatusReference@odata.bind` lookups whose target reference
 * table is NOT registered (no generated model/service, not in
 * power.config.json / dataSourcesInfo, no schema file). There is no safe,
 * deterministic, GUID-free way to resolve a default Stage/Status, so no
 * create is enabled here. This module is static, GUID-free, and performs
 * no writes.
 */

/** Whether this phase enables a live deal create. Always false. */
export const NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false as const;

/** The exact blocker, carried from Phase 163. */
export const NEW_DEAL_INTAKE_BLOCKER =
  'Stage/Status reference data source registration is missing. cr664_loandeal create requires cr664_StageReference and cr664_StatusReference lookup binds, but the target reference table is not registered (no generated model/service, not in power.config.json / dataSourcesInfo, no schema file). No default Stage/Status can be resolved without hardcoding a GUID, which is prohibited (Phase 163).';

/** A required field a future governed intake form would collect. */
export interface NewDealIntakeField {
  readonly label: string;
  /** The cr664_loandeal column / bind this maps to. */
  readonly field: string;
  readonly required: boolean;
  /** True when the field is blocked by the Stage/Status reference gap. */
  readonly blockedByReference: boolean;
  readonly note?: string;
}

/**
 * Fields a future governed New Deal intake would collect. Stage and
 * Status are flagged as blocked-by-reference: they map to required
 * lookup binds that cannot be resolved today.
 */
export const NEW_DEAL_INTAKE_FIELDS: readonly NewDealIntakeField[] = Object.freeze([
  Object.freeze({ label: 'Deal Name', field: 'cr664_dealname', required: true, blockedByReference: false, note: 'Must be non-blank.' }),
  Object.freeze({ label: 'Client / Borrower', field: 'cr664_Client@odata.bind', required: false, blockedByReference: false, note: 'Optional lookup; resolved by stable identifier.' }),
  Object.freeze({ label: 'Assigned Banker', field: 'cr664_AssignedBanker@odata.bind', required: true, blockedByReference: false, note: 'Required lookup; resolved by stable identifier.' }),
  Object.freeze({ label: 'Amount', field: 'cr664_amount', required: false, blockedByReference: false }),
  Object.freeze({ label: 'Stage', field: 'cr664_StageReference@odata.bind', required: true, blockedByReference: true, note: 'Blocked: no registered Stage reference data source.' }),
  Object.freeze({ label: 'Status', field: 'cr664_StatusReference@odata.bind', required: true, blockedByReference: true, note: 'Blocked: no registered Status reference data source.' }),
  Object.freeze({ label: 'Product Type', field: 'cr664_ProductTypeReference@odata.bind', required: false, blockedByReference: false, note: 'Optional reference lookup if available.' }),
  Object.freeze({ label: 'Loan Structure', field: 'cr664_LoanStructureTypeReference@odata.bind', required: false, blockedByReference: false, note: 'Optional reference lookup if available.' }),
  Object.freeze({ label: 'Pricing', field: 'cr664_PricingTypeReference@odata.bind', required: false, blockedByReference: false, note: 'Optional reference lookup if available.' }),
]);

/** One step in the Stage/Status data-source registration checklist. */
export interface NewDealIntakeChecklistStep {
  readonly order: number;
  readonly title: string;
  readonly detail: string;
  /** Phase 169C status: nothing is done yet -- all steps are pending. */
  readonly done: false;
}

/**
 * The exact, ordered registration checklist that must be completed
 * (outside this app's allowed delta) before a governed create can be
 * enabled. Every step is pending in Phase 169C.
 */
export const NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST: readonly NewDealIntakeChecklistStep[] =
  Object.freeze([
    Object.freeze({
      order: 1,
      title: 'Identify live target tables / entity sets',
      detail:
        'Confirm the live Dataverse reference table(s) behind cr664_StageReference and cr664_StatusReference, and their exact entity-set and logical names, from environment metadata (not guessed).',
      done: false,
    }),
    Object.freeze({
      order: 2,
      title: 'Register the data sources',
      detail:
        'Add the reference table(s) to power.config.json database references and to .power/schemas/appschemas/dataSourcesInfo.ts, with their .power/schemas/dataverse/<table>.Schema.json.',
      done: false,
    }),
    Object.freeze({
      order: 3,
      title: 'Regenerate the SDK / schema',
      detail:
        'Regenerate so a typed Cr664_<reference>Service and model exist under src/generated/.',
      done: false,
    }),
    Object.freeze({
      order: 4,
      title: 'Add a fail-closed default resolver',
      detail:
        'Resolve exactly one default Stage and one default Status by stable code/name/order; fail closed on zero or multiple matches. No hardcoded GUIDs.',
      done: false,
    }),
    Object.freeze({
      order: 5,
      title: 'Enable a governed, audited create',
      detail:
        'Only then wire a governed New Deal create: admin/banker write entitlement, the two resolved binds, a cr664_AuditEvent, a typed outcome union, and tests proving payload discipline.',
      done: false,
    }),
  ]);
