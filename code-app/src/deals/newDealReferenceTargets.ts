/**
 * Phase 170D / 170D-R -- Canonical Stage/Status reference lookup targets.
 *
 * SINGLE SOURCE OF TRUTH for the two `cr664_loandeal` reference lookups.
 * Both the admin New Deal panel (display) and the fail-closed New Deal
 * reference resolver (src/deals/newDealReferenceResolver.ts) consume this
 * module, so the live metadata is declared exactly ONCE here.
 *
 * Source of truth: read-only Dataverse Web API metadata inspection run on
 * 2026-06-15 via
 *
 *   node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references
 *
 * against the script's pinned environment (solution LoanOpsExport,
 * publisher prefix cr664). That command performs metadata GETs only -- it
 * read and wrote NO records.
 *
 * Phase 163 / 169C / 170C could not name the lookup targets. The Phase
 * 170D inspection resolves that gap: both `cr664_loandeal` lookups point
 * at a single custom reference table each, with a stable id/name and an
 * `cr664_activeflag` + `cr664_code` selector pair.
 *
 * IMPORTANT: this module records ONLY metadata *names* (logical names,
 * entity-set names, primary id/name attributes, selector field names). It
 * contains NO record GUIDs, resolves NO default, registers NO data source,
 * adds NO typed service, and enables NO create. `cr664_loandeal` create
 * stays blocked until the targets are registered in power.config.json, the
 * SDK is regenerated, and a fail-closed resolver is wired. See
 * docs/PHASE_170D_STAGE_STATUS_REFERENCE_REGISTRATION_RESOLVER.md and
 * docs/PHASE_170D_NEW_DEAL_REFERENCE_TARGETS_CONFIRMED.md.
 */

/** The read-only operator command whose output this module records. */
export const NEW_DEAL_REFERENCE_TARGETS_SOURCE_COMMAND =
  'node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references';

/** The date the live metadata was confirmed (read-only inspection). */
export const NEW_DEAL_REFERENCE_TARGETS_CONFIRMED_ON = '2026-06-15';

/**
 * The targets are now identified from live metadata. They are NOT yet
 * registered as an app data source and NO resolver is wired, so create
 * stays blocked. These flags let the UI and tests state the exact posture
 * without overclaiming.
 */
export const NEW_DEAL_REFERENCE_TARGETS_IDENTIFIED = true as const;
export const NEW_DEAL_REFERENCE_TARGETS_REGISTERED = false as const;
export const NEW_DEAL_REFERENCE_RESOLVER_AVAILABLE = false as const;

/** One confirmed lookup target (Stage or Status), metadata names only. */
export interface NewDealReferenceTarget {
  /** Human label for the reference (Stage / Status). */
  readonly label: string;
  /** The `cr664_loandeal` lookup attribute logical name. */
  readonly lookupAttribute: string;
  /** The lookup attribute schema name. */
  readonly lookupSchemaName: string;
  /** The `@odata.bind` key a future governed create payload must set. */
  readonly odataBindKey: string;
  /** Confirmed target table logical name. */
  readonly targetTableLogicalName: string;
  /** Confirmed target entity-set name (for OData paths). */
  readonly targetEntitySetName: string;
  /** Target table primary id attribute. */
  readonly primaryIdAttribute: string;
  /** Target table primary name attribute. */
  readonly primaryNameAttribute: string;
  /** Least-privilege fields a future fail-closed resolver may read. */
  readonly selectorFields: readonly string[];
  /** Required-for-create fields confirmed on the target table. */
  readonly requiredFields: readonly string[];
}

// --- Canonical per-reference records (declared once) ------------------------

const STAGE_TARGET: NewDealReferenceTarget = Object.freeze({
  label: 'Stage',
  lookupAttribute: 'cr664_stagereference',
  lookupSchemaName: 'cr664_StageReference',
  odataBindKey: 'cr664_StageReference@odata.bind',
  targetTableLogicalName: 'cr664_dealstagereference',
  targetEntitySetName: 'cr664_dealstagereferences',
  primaryIdAttribute: 'cr664_dealstagereferenceid',
  primaryNameAttribute: 'cr664_name',
  selectorFields: Object.freeze(['cr664_code', 'cr664_activeflag', 'cr664_name']),
  requiredFields: Object.freeze([
    'cr664_activeflag',
    'cr664_code',
    'cr664_dealstagereferenceid',
    'cr664_name',
    'ownerid',
    'owneridtype',
  ]),
});

const STATUS_TARGET: NewDealReferenceTarget = Object.freeze({
  label: 'Status',
  lookupAttribute: 'cr664_statusreference',
  lookupSchemaName: 'cr664_StatusReference',
  odataBindKey: 'cr664_StatusReference@odata.bind',
  targetTableLogicalName: 'cr664_dealstatusreference',
  targetEntitySetName: 'cr664_dealstatusreferences',
  primaryIdAttribute: 'cr664_dealstatusreferenceid',
  primaryNameAttribute: 'cr664_name',
  selectorFields: Object.freeze(['cr664_code', 'cr664_activeflag', 'cr664_name']),
  requiredFields: Object.freeze([
    'cr664_activeflag',
    'cr664_code',
    'cr664_dealstatusreferenceid',
    'cr664_name',
    'ownerid',
    'owneridtype',
  ]),
});

/**
 * The two confirmed lookup targets behind `cr664_loandeal` create
 * (admin-facing). Frozen, metadata-only, GUID-free.
 */
export const NEW_DEAL_REFERENCE_TARGETS: readonly NewDealReferenceTarget[] =
  Object.freeze([STAGE_TARGET, STATUS_TARGET]);

// --- Resolver-facing projection (derived from the same canonical records) --

/** Compact metadata shape the fail-closed resolver consumes. */
export interface ReferenceTargetMetadata {
  readonly logicalName: string;
  readonly entitySetName: string;
  readonly primaryId: string;
  readonly primaryName: string;
  readonly bindAttribute: string;
}

function toResolverMetadata(t: NewDealReferenceTarget): ReferenceTargetMetadata {
  return Object.freeze({
    logicalName: t.targetTableLogicalName,
    entitySetName: t.targetEntitySetName,
    primaryId: t.primaryIdAttribute,
    primaryName: t.primaryNameAttribute,
    bindAttribute: t.odataBindKey,
  });
}

/** Stage reference metadata (derived from the canonical Stage target). */
export const STAGE_REFERENCE: ReferenceTargetMetadata = toResolverMetadata(STAGE_TARGET);

/** Status reference metadata (derived from the canonical Status target). */
export const STATUS_REFERENCE: ReferenceTargetMetadata = toResolverMetadata(STATUS_TARGET);

// ---------------------------------------------------------------------------
// Phase 170E -- target SELECTION config (code/name, never IDs)
// ---------------------------------------------------------------------------
//
// A future fail-closed reader (once the data sources are registered as
// typed services) selects the Stage/Status rows by these stable code/name
// values -- NEVER by a record GUID. The values below are the codes/names
// of the single ACTIVE rows observed in the CURRENT TEST environment via
// the read-only `--inspect-stage-status-values` inspection (2026-06-15).
//
// These are TEST-environment reference rows (note the "Phase 121" labels),
// NOT approved production labels. + New Deal therefore stays disabled
// until production Stage/Status reference rows are seeded/approved and a
// reader is wired. The inspected record GUIDs are deliberately NOT stored
// here; resolution happens by unique active code/name only.

/** True: the selection below targets the current TEST environment rows. */
export const REFERENCE_SELECTION_IS_TEST_ENVIRONMENT = true as const;
/** False: production Stage/Status labels are not yet seeded/approved. */
export const REFERENCE_SELECTION_PRODUCTION_APPROVED = false as const;

export interface ReferenceSelection {
  readonly code: string;
  readonly name: string;
}

/** TEST-environment Stage selector (code preferred; name for reference). */
export const STAGE_REFERENCE_SELECTION: ReferenceSelection = Object.freeze({
  code: 'PHASE121_STAGE',
  name: 'TEST - Stage Phase 121',
});

/** TEST-environment Status selector (code preferred; name for reference). */
export const STATUS_REFERENCE_SELECTION: ReferenceSelection = Object.freeze({
  code: 'PHASE121_STATUS',
  name: 'TEST — Status Phase 121',
});

// ---------------------------------------------------------------------------
// Phase 181B -- approved PRODUCTION selection profile (code/name, never IDs)
// ---------------------------------------------------------------------------
//
// The production banker create path resolves the Stage/Status rows by these
// stable, production-safe code/name values -- NEVER by a GUID. A new deal opens
// at the "Intake" stage with an "Open" status. These rows do NOT exist in the
// environment yet (only the TEST PHASE121 rows are active), so the production
// resolver fails closed until an authorized operator seeds/approves them
// (Phase 181A). Adjust to the environment's actual production naming if it
// already has equivalents -- but never point at a TEST/PHASE/demo row.

/** Approved production Stage selector (a newly opened / intake deal). */
export const PRODUCTION_STAGE_REFERENCE_SELECTION: ReferenceSelection = Object.freeze({
  code: 'INTAKE',
  name: 'Intake',
});

/** Approved production Status selector (an active / open deal). */
export const PRODUCTION_STATUS_REFERENCE_SELECTION: ReferenceSelection = Object.freeze({
  code: 'OPEN',
  name: 'Open',
});

/** Whether the production selection rows are approved + present. False until seeded. */
export const PRODUCTION_REFERENCES_APPROVED = false as const;

/**
 * A reference row label is production-UNSAFE when its code/name looks like a
 * TEST / PHASE / demo / sample / temporary fixture. The production resolver
 * filters these out so they can never back a production create, even if one
 * happened to match a production code.
 */
export function isProductionUnsafeReferenceLabel(
  code: string | undefined,
  name: string | undefined,
): boolean {
  const code0 = (code ?? '').trim();
  const blob = `${code0} ${name ?? ''}`.toLowerCase();
  if (/\b(test|demo|sample|fake|temp|temporary|placeholder|dummy)\b/.test(blob)) return true;
  if (/phase\s*\d+/.test(blob)) return true;
  if (code0.toUpperCase().startsWith('PHASE')) return true;
  return false;
}

export type NewDealReferenceProfile = 'test' | 'production';

/** Resolve the Stage+Status selection pair for a profile. */
export function selectNewDealReferenceProfile(profile: NewDealReferenceProfile): {
  readonly stage: ReferenceSelection;
  readonly status: ReferenceSelection;
  readonly productionApproved: boolean;
} {
  if (profile === 'production') {
    return {
      stage: PRODUCTION_STAGE_REFERENCE_SELECTION,
      status: PRODUCTION_STATUS_REFERENCE_SELECTION,
      productionApproved: PRODUCTION_REFERENCES_APPROVED,
    };
  }
  return {
    stage: STAGE_REFERENCE_SELECTION,
    status: STATUS_REFERENCE_SELECTION,
    productionApproved: false,
  };
}
