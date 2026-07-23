/**
 * Phase 169C / 170J -- Admin New Deal Intake truth model.
 *
 * Reconciled in Phase 170J. The Stage/Status reference data sources are
 * now registered and the fail-closed resolver reads them at runtime:
 * resolver readiness is Ready (TEST) -- see
 * docs/PHASE_170J_NEW_DEAL_READINESS_TRUTH_RECONCILIATION.md. + New Deal
 * stays disabled for three remaining, accurately-stated reasons:
 *   - the active reference rows are TEST-environment labels, not
 *     production-approved;
 *   - no governed, audited create adapter is wired;
 *   - the public + New Deal control is intentionally disabled until both.
 *
 * This is distinct from Advance Stage / stage-progression ordering, which
 * remains a SEPARATE blocker (see NOT_WIRED `stage-progression-advance`).
 * This module is static, GUID-free, and performs no writes.
 */

/** Whether this phase enables a live deal create (public + New Deal). */
export const NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false as const;

/** Phase 170I: the typed Stage/Status resolver reads at runtime (Ready/TEST). */
export const NEW_DEAL_RESOLVER_READY_IN_TEST = true as const;
/** Production Stage/Status reference rows are not yet seeded/approved. */
export const NEW_DEAL_PRODUCTION_REFERENCES_APPROVED = false as const;
/** No governed, audited New Deal create adapter is wired yet. */
export const NEW_DEAL_GOVERNED_CREATE_ADAPTER_WIRED = false as const;

/** The accurate, reconciled blocker for + New Deal create. */
export const NEW_DEAL_INTAKE_BLOCKER =
  'Stage/Status reference resolution is READY in TEST: the cr664_dealstagereferences / cr664_dealstatusreferences data sources are registered, typed services exist, and the fail-closed resolver reads one active Stage + Status at runtime. + New Deal create stays disabled because the active reference rows are TEST-environment labels (not production-approved), and no governed, audited create adapter is wired. This is separate from Advance Stage / stage-progression ordering, which remains its own blocker.';

/** Operator-only metadata command added in Phase 170C. Pure GET; no writes. */
export const NEW_DEAL_REFERENCE_INSPECT_COMMAND =
  'node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references';

/** One row of the reconciled New Deal create readiness truth model. */
export interface NewDealReadinessItem {
  readonly label: string;
  readonly value: string;
  /** True when this dimension is satisfied. */
  readonly done: boolean;
}

/**
 * The single source of truth for + New Deal create readiness -- for the
 * PUBLIC / GLOBAL create path only. Renders as a small status table so the
 * admin sees exactly what is proven vs pending -- no stale "data source
 * missing" claim.
 *
 * This table does NOT describe the separate, already-live banker pilot path
 * (BankerNewDealCreate.tsx, gated by BANKER_CREATE_PILOT_ENABLED) -- see
 * adminNewDealCreateCapabilityTruth.ts / NEW_DEAL_BANKER_PILOT_TRUTH for
 * that path's own truth, computed from the pilot's own runtime inputs. The
 * "Governed create adapter" row below is scoped to public/global explicitly
 * so it is never misread as the banker pilot's status.
 */
export const NEW_DEAL_READINESS_TRUTH: readonly NewDealReadinessItem[] = Object.freeze([
  Object.freeze({ label: 'Stage/Status resolver readiness', value: 'Ready (TEST)', done: NEW_DEAL_RESOLVER_READY_IN_TEST }),
  Object.freeze({ label: 'Production reference approval', value: 'Pending', done: NEW_DEAL_PRODUCTION_REFERENCES_APPROVED }),
  Object.freeze({ label: 'Governed create adapter (public/global)', value: 'Not wired', done: NEW_DEAL_GOVERNED_CREATE_ADAPTER_WIRED }),
  Object.freeze({ label: 'Public + New Deal', value: 'Gated', done: NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED }),
]);

/** A required field a future governed intake form would collect. */
export interface NewDealIntakeField {
  readonly label: string;
  /** The cr664_loandeal column / bind this maps to. */
  readonly field: string;
  readonly required: boolean;
  /**
   * True when the field is still blocked by a missing/unresolved reference.
   * Phase 170J: Stage/Status are no longer reference-blocked (they resolve
   * in TEST); create is gated by production approval + the create adapter,
   * not by a missing reference data source.
   */
  readonly blockedByReference: boolean;
  readonly note?: string;
}

/**
 * Fields a future governed New Deal intake would collect. Stage/Status
 * now resolve in TEST (no longer reference-blocked).
 */
export const NEW_DEAL_INTAKE_FIELDS: readonly NewDealIntakeField[] = Object.freeze([
  Object.freeze({ label: 'Deal Name', field: 'cr664_dealname', required: true, blockedByReference: false, note: 'Must be non-blank.' }),
  Object.freeze({ label: 'Client / Borrower', field: 'cr664_Client@odata.bind', required: false, blockedByReference: false, note: 'Optional lookup; resolved by stable identifier.' }),
  Object.freeze({ label: 'Assigned Banker', field: 'cr664_AssignedBanker@odata.bind', required: true, blockedByReference: false, note: 'Required lookup; resolved by stable identifier.' }),
  Object.freeze({ label: 'Amount', field: 'cr664_amount', required: false, blockedByReference: false }),
  Object.freeze({ label: 'Stage', field: 'cr664_StageReference@odata.bind', required: true, blockedByReference: false, note: 'Resolved in TEST via cr664_dealstagereferences (one active row); create enabled after production approval + create adapter.' }),
  Object.freeze({ label: 'Status', field: 'cr664_StatusReference@odata.bind', required: true, blockedByReference: false, note: 'Resolved in TEST via cr664_dealstatusreferences (one active row); create enabled after production approval + create adapter.' }),
  Object.freeze({ label: 'Product Type', field: 'cr664_ProductTypeReference@odata.bind', required: false, blockedByReference: false, note: 'Optional reference lookup if available.' }),
  Object.freeze({ label: 'Loan Structure', field: 'cr664_LoanStructureTypeReference@odata.bind', required: false, blockedByReference: false, note: 'Optional reference lookup if available.' }),
  Object.freeze({ label: 'Pricing', field: 'cr664_PricingTypeReference@odata.bind', required: false, blockedByReference: false, note: 'Optional reference lookup if available.' }),
]);

/** One step in the New Deal create enablement checklist. */
export interface NewDealIntakeChecklistStep {
  readonly order: number;
  readonly title: string;
  readonly detail: string;
  /** Whether the step is complete. */
  readonly done: boolean;
}

/**
 * The ordered enablement checklist for governed New Deal create. Phase
 * 170J marks the reference/resolver/runtime steps done; the remaining
 * steps are production approval, the governed create adapter, a controlled
 * create smoke, and finally enabling + New Deal.
 */
export const NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST: readonly NewDealIntakeChecklistStep[] =
  Object.freeze([
    Object.freeze({
      order: 1,
      title: 'Identify live target tables / entity sets',
      detail:
        `Done (Phase 170D): ${NEW_DEAL_REFERENCE_INSPECT_COMMAND} confirmed cr664_StageReference -> cr664_dealstagereferences and cr664_StatusReference -> cr664_dealstatusreferences (primary id cr664_dealstagereferenceid / cr664_dealstatusreferenceid, primary name cr664_name, selector cr664_code + cr664_activeflag) from live environment metadata.`,
      done: true,
    }),
    Object.freeze({
      order: 2,
      title: 'Register the Stage/Status data sources',
      detail:
        'Done (Phase 170F2 / 170I): native databaseReferences."default.cds" entries in power.config.json plus the runtime dataSourcesInfo manifest entries (repaired via scripts/sync-datasourcesinfo.mjs). No generic connector artifact.',
      done: true,
    }),
    Object.freeze({
      order: 3,
      title: 'Provide typed generated services',
      detail:
        'Done (Phase 170F2): typed Cr664_dealstagereferencesService / Cr664_dealstatusreferencesService + models exist under src/generated/.',
      done: true,
    }),
    Object.freeze({
      order: 4,
      title: 'Add a fail-closed default resolver',
      detail:
        'Done (Phase 170D / 170F2): resolveNewDealReferences resolves exactly one active Stage + Status by stable code/name; fails closed on zero/multiple/inactive/service-error. No hardcoded GUIDs.',
      done: true,
    }),
    Object.freeze({
      order: 5,
      title: 'Prove read-only runtime resolver readiness',
      detail:
        'Done (Phase 170H / 170I): the Admin readiness card shows Ready (TEST) -- one active Stage (PHASE121_STAGE) and one active Status (PHASE121_STATUS) resolve at runtime in the deployed app.',
      done: true,
    }),
    Object.freeze({
      order: 6,
      title: 'Approve / seed PRODUCTION Stage/Status reference rows',
      detail:
        'Pending: the only active rows are TEST-environment labels. Production reference rows must be seeded and approved before any real create.',
      done: false,
    }),
    Object.freeze({
      order: 7,
      title: 'Add a governed, audited create adapter',
      detail:
        'Pending: wire a governed New Deal create with admin/banker write entitlement, the two resolved binds, a cr664_AuditEvent, a typed outcome union, and payload-discipline tests.',
      done: false,
    }),
    Object.freeze({
      order: 8,
      title: 'Run a single-record controlled create smoke',
      detail:
        'Pending: create exactly one deal in a controlled run and verify the audit trail before any broad enablement.',
      done: false,
    }),
    Object.freeze({
      order: 9,
      title: 'Enable + New Deal (public/admin control)',
      detail:
        'Pending: the PUBLIC + New Deal control this checklist tracks stays disabled -- it still needs production-approved Stage/Status references (step 6) and a governed public-facing create adapter (step 7) before a controlled smoke (step 8). Separately, a BANKER-only create path (BankerNewDealCreate, gated by its own BANKER_CREATE_PILOT rollout) is live today -- that is a distinct surface from this checklist and does not by itself satisfy this step.',
      done: false,
    }),
  ]);
