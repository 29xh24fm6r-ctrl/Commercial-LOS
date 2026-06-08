#!/usr/bin/env node
// @ts-check
/* eslint-disable no-console */
/**
 * Phase 122B — Automated Dataverse lookup repair (dry-run by default).
 *
 * Purpose:
 *   Replace the error-prone Maker Portal click-path for Phase 122 with
 *   a script that audits the live env, prints a complete plan, and only
 *   writes when --commit is explicitly passed AND every safety gate
 *   below holds. Even in --commit mode the script refuses to act unless
 *   prerequisites (rollback artifact, bearer token, publisher confirmation,
 *   pseudo-column NULL check) are all satisfied.
 *
 * Default behavior (dry-run):
 *
 *   node scripts/phase122-lookup-repair.mjs
 *   node scripts/phase122-lookup-repair.mjs --dry-run
 *
 * Commit behavior (requires every safety gate):
 *
 *   $env:DATAVERSE_BEARER_TOKEN="..."  # Windows PowerShell
 *   node scripts/phase122-lookup-repair.mjs --commit
 *
 * Hard non-goals:
 *   - No React or app code change.
 *   - No /cr664_deals(<id>) bind URL introduced.
 *   - No new_-prefixed column ever created.
 *   - No fake data; no governed-write or email-lane behavior changed.
 *   - No PII written to the output runbook (only schema identifiers).
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants — Phase 122 contract pins
// ---------------------------------------------------------------------------

const TARGET_ENVIRONMENT_ID = '5f2d77a5-de50-edeb-9d74-5b2400a2320d';
const SOLUTION_FOR_CR664 = 'LoanOpsExport';
const SOLUTION_FOR_REFERENCE = 'CommercialLendingLOS';
const CR664_PUBLISHER_UNIQUE_NAME = 'Crc0077';
const CR664_PUBLISHER_PREFIX = 'cr664';
const FORBIDDEN_PUBLISHER_PREFIX = 'new';

const CANDIDATE_CHILD_TABLES = Object.freeze([
  'cr664_documentchecklist',
  'cr664_dealtask1',
  'cr664_creditmemo1',
  'cr664_creditmemodraftsection',
  'cr664_dealtimelineevent',
]);

// Legacy cr664_deal child tables surfaced by the operator's 2026-06-01
// residual-refs check on form 653f9d5e-…. These are not part of the
// canonical Phase 122 5-table scope, but they are bound to the same
// cr664_deal pseudo-column via relationships whose names end in
// `_cr664_Deal_cr664_Deal`, so subgrids targeting them count as
// removable for the same cleanup loop.
const LEGACY_CR664_DEAL_CHILD_TABLES = Object.freeze([
  'cr664_vendorperformance',
  'cr664_approvaltracking',
  'cr664_dealstagehistory',
]);

const ALLOWED_SUBGRID_TARGET_TABLES = Object.freeze([
  ...CANDIDATE_CHILD_TABLES,
  ...LEGACY_CR664_DEAL_CHILD_TABLES,
]);

function isAllowedSubgridTarget(targetEntity) {
  const lower = String(targetEntity ?? '').toLowerCase();
  return ALLOWED_SUBGRID_TARGET_TABLES.includes(lower);
}

const LOOKUP_TARGET_LOAN_DEAL = 'cr664_loandeal';
const LOOKUP_TARGET_SYSTEMUSER = 'systemuser';

// Pseudo-column names found in the Phase 122 §10 audit. These are the
// non-standard pre-existing columns that must be deleted before the
// real cr664_Deal Lookup can be created (case-insensitive collision).
const PSEUDO_DEAL_COLUMN = 'cr664_deal'; // lowercase d
const PSEUDO_ASSIGNEDTO_COLUMN = 'cr664_assignedto';

const NEW_DEAL_COLUMN_SCHEMA_NAME = 'cr664_Deal'; // capital D — standard Lookup
const NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME = 'cr664_AssignedTo';

const DV_BEARER_TOKEN_ENV_VAR = 'DATAVERSE_BEARER_TOKEN';

// Component type codes used by the Dataverse dependency API.
// Source: solutioncomponent EntityMetadata `componenttype` global option set.
// We pin Attribute (2) since every pseudo-column the script wants to
// delete is an Attribute; the other entries are used only for the
// human-readable rendering of dependent component types.
const COMPONENT_TYPE_ATTRIBUTE = 2;

// Phase 122D Pt 2 — cr664_clientrelationship.cr664_borrowertype OptionSet.
// Pinned from the Pt 1 audit output the operator captured:
//   Required column: cr664_borrowertype  type=Picklist  ApplicationRequired
// The integer value the script POSTs MUST be one of these keys; the
// label is informational (printed in dry-run output / verify log).
const BORROWER_TYPE_LABELS = Object.freeze({
  788190000: 'Individual',
  788190001: 'LLC',
  788190002: 'Corporation',
  788190003: 'Partnership',
  788190004: 'Trust',
  788190005: 'Non-Profit',
});

// Phase 122E Pt 2 — fixed seed graph for the three cockpit-missing
// optional Loan Deal reference lookups. Pt 1 audit confirmed all
// three point at the SAME target table (cr664_producttypereference)
// with three ApplicationRequired columns:
//   cr664_name        String
//   cr664_code        String
//   cr664_activeflag  Boolean
// The names/codes below are the operator-approved values; the script
// POSTs nothing else.
const PRODUCT_REFERENCE_TABLE_LOGICAL = 'cr664_producttypereference';
const PRODUCT_REFERENCE_ENTITY_SET = 'cr664_producttypereferences';
const PRODUCT_REFERENCE_SEEDS = Object.freeze({
  productType: Object.freeze({
    label: 'Product type',
    bind: 'cr664_ProductTypeReference@odata.bind',
    name: 'SBA 7(a)',
    code: 'SBA_7A',
  }),
  loanStructure: Object.freeze({
    label: 'Loan structure',
    bind: 'cr664_LoanStructureTypeReference@odata.bind',
    name: 'Term Loan',
    code: 'TERM_LOAN',
  }),
  pricingType: Object.freeze({
    label: 'Pricing type',
    bind: 'cr664_PricingTypeReference@odata.bind',
    name: 'Variable',
    code: 'VARIABLE',
  }),
});
const COMPONENT_TYPE_NAMES = Object.freeze({
  1: 'Entity',
  2: 'Attribute',
  3: 'Relationship',
  9: 'OptionSet',
  10: 'EntityRelationship',
  14: 'EntityKey',
  16: 'Privilege',
  18: 'Role',
  20: 'Workflow',
  24: 'SystemForm',
  26: 'SavedQuery (View)',
  29: 'WebResource',
  31: 'SiteMap',
  35: 'ConvertRule',
  36: 'HierarchyRule',
  37: 'MobileOfflineProfile',
  60: 'SystemForm',
  61: 'WebResource',
  62: 'PluginAssembly',
  65: 'PluginType',
  66: 'SdkMessageProcessingStep',
  70: 'ServiceEndpoint',
  90: 'Report',
  91: 'ReportEntity',
  92: 'ReportCategory',
  93: 'ReportVisibility',
  95: 'FieldSecurityProfile',
  150: 'ConnectionRole',
});

// ---------------------------------------------------------------------------
// Phase 137G — Copilot Dataverse Custom API metadata plan (DRY-RUN FIRST).
//
// The future cr664_RunLosCopilotAssist Custom API (Phase 137B contract +
// Phase 137F registration runbook). Phase 137G only INSPECTS (read-only
// GET) or PLANS (dry-run, offline) the metadata — it creates NOTHING.
// Commit / live writes are intentionally NOT implemented in this phase;
// no plugin, no Azure resource, and no runtime enablement are touched.
// ---------------------------------------------------------------------------
const COPILOT_CUSTOM_API_NAME = 'cr664_RunLosCopilotAssist';
const COPILOT_CUSTOM_API_DISPLAY_NAME = 'Run LOS Copilot Assist';
// Expected request/response parameter names (Phase 137B request/response).
const COPILOT_CUSTOM_API_REQUEST_PARAM = 'RequestPayload';
const COPILOT_CUSTOM_API_CORRELATION_PARAM = 'CorrelationId';
const COPILOT_CUSTOM_API_RESPONSE_PROP = 'ResponsePayload';

// ---------------------------------------------------------------------------
// Phase 137J — Copilot audit-event table metadata plan (DRY-RUN FIRST).
//
// The future cr664_copilotauditevent Dataverse table (Phase 137I audit /
// event ledger design). Phase 137J only INSPECTS (read-only GET) or PLANS
// (dry-run, offline) the table metadata — it creates NOTHING. Commit / live
// table creation is intentionally NOT implemented in this phase; no
// attribute, no index, no publish, and no runtime enablement are touched.
// ---------------------------------------------------------------------------
const COPILOT_AUDIT_TABLE_LOGICAL_NAME = 'cr664_copilotauditevent';
const COPILOT_AUDIT_TABLE_DISPLAY_NAME = 'Copilot Audit Event';
const COPILOT_AUDIT_TABLE_PLURAL_DISPLAY_NAME = 'Copilot Audit Events';
const COPILOT_AUDIT_TABLE_PRIMARY_NAME = 'cr664_name';

// cr664_eventtype option values (Phase 137I lifecycle events).
const COPILOT_AUDIT_EVENT_TYPES = Object.freeze([
  'audit_start',
  'audit_completion',
  'audit_fail_closed',
  'proposal_confirmed',
  'governed_write_completed',
]);

// Required audit fields (Phase 137I §D). The PLAN prints these; nothing is
// created. Each is the logical column name only — no value or secret.
const COPILOT_AUDIT_FIELDS = Object.freeze([
  'cr664_correlationid',
  'cr664_eventtype',
  'cr664_eventtimestamp',
  'cr664_userupn',
  'cr664_userprofileid',
  'cr664_workspacename',
  'cr664_workspace',
  'cr664_surface',
  'cr664_dealid',
  'cr664_dealname',
  'cr664_promptkind',
  'cr664_redactedpromptsummary',
  'cr664_prompthash',
  'cr664_contextsummary',
  'cr664_contexthash',
  'cr664_mode',
  'cr664_policyversion',
  'cr664_modeldeployment',
  'cr664_modelversion',
  'cr664_responsemode',
  'cr664_islive',
  'cr664_failclosedcode',
  'cr664_warningsjson',
  'cr664_proposalsjson',
  'cr664_proposalcount',
  'cr664_confirmationstatus',
  'cr664_confirmedproposalid',
  'cr664_governedwritepath',
  'cr664_governedwriteid',
  'cr664_errorclass',
  'cr664_errorsummary',
  'cr664_payloadversion',
]);

// Recommended indexes for the future table (Phase 137I §F).
const COPILOT_AUDIT_RECOMMENDED_INDEXES = Object.freeze([
  'cr664_correlationid',
  'cr664_eventtimestamp',
  'cr664_userprofileid',
  'cr664_workspace',
  'cr664_dealid',
]);

// No-admin OAuth2 device-code fallback constants.
// PUBLIC_CLIENT_ID is the Microsoft Azure PowerShell public client —
// a multi-tenant first-party app registration that supports the
// device-code flow and is accepted as a Dataverse client. It needs no
// admin install: the script just hits login.microsoftonline.com over
// HTTPS with native fetch().
const PUBLIC_CLIENT_ID = '1950a258-227b-4e31-a9cf-717495945fc2';
const DEVICE_CODE_TENANT = 'organizations';

// Output paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT_DIR = resolve(REPO_ROOT, '.phase122');
const RUNBOOK_PATH = resolve(OUTPUT_DIR, 'phase122-runbook.json');
const ROLLBACK_DIR = resolve(REPO_ROOT, '.phase122', 'rollback');
const DV_BEARER_TOKEN_CACHE_PATH = resolve(OUTPUT_DIR, '.token-cache.json');

// ---------------------------------------------------------------------------
// Argument parsing — DEFAULT is dry-run. Any unknown flag is rejected.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = {
    dryRun: true,
    commit: false,
    skipRollback: false,
    inspectDependencies: false,
    cleanupFormId: null,
    commitFormCleanup: false,
    inspectFormId: null,
    inspectFormAttribute: null,
    cleanupSubgridFormId: null,
    cleanupSubgridControlId: null,
    commitSubgridCleanup: false,
    inspectViewId: null,
    cleanupViewId: null,
    commitViewCleanup: false,
    printRelationshipPayload: false,
    verifyLookups: false,
    inspectTableName: null,
    inspectAttributeItems: null,
    seedClientRelationship: false,
    seedDealName: null,
    seedClientName: null,
    seedBorrowerType: null,
    commitSeedClient: false,
    seedProductReferences: false,
    commitSeedProductReferences: false,
    // Phase 124D — guarded TEST manager-entitlement seed mode.
    seedManagerEntitlement: false,
    seedUpn: null,
    seedTeamName: null,
    commitSeedManagerEntitlement: false,
    // Phase 133C — guarded executive primary-workspace seed mode.
    seedExecutivePrimaryWorkspace: false,
    seedWorkspaceName: null,
    commitSeedExecutivePrimaryWorkspace: false,
    // Phase 137G — Copilot Custom API metadata inspect / dry-run plan.
    // Read-only inspect + offline dry-run plan only. Commit is NOT
    // implemented in this phase (no write path exists).
    inspectCopilotCustomApi: false,
    seedCopilotCustomApiMetadata: false,
    commitSeedCopilotCustomApiMetadata: false,
    // Phase 137J — Copilot audit-event table metadata inspect / dry-run plan.
    // Read-only inspect + offline dry-run plan only. Commit is NOT
    // implemented in this phase (no write path exists).
    inspectCopilotAuditTable: false,
    seedCopilotAuditTableMetadata: false,
    commitSeedCopilotAuditTableMetadata: false,
    // Phase 140I — portfolio boarding Dataverse schema inspect / plan.
    // Both modes are READ-ONLY (GET only). No commit / live create flag
    // exists in Phase 140I — schema seeding is intentionally disabled.
    inspectPortfolioBoardingSchema: false,
    planPortfolioBoardingSchema: false,
    // Phase 140J — guarded portfolio boarding schema SEED. Dry-run by
    // default; live metadata creation requires the explicit commit flag.
    // Never creates loan records, never enables app-runtime persistence.
    seedPortfolioBoardingSchema: false,
    commitSeedPortfolioBoardingSchema: false,
    // Phase 140K — narrow guarded repair of ONLY the optional
    // evidence→document lookup. Dry-run by default; commit flag required.
    repairPortfolioBoardingOptionalRelationships: false,
    commitRepairPortfolioBoardingOptionalRelationships: false,
    help: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--commit') {
      flags.commit = true;
      flags.dryRun = false;
    } else if (arg === '--skip-rollback-export') flags.skipRollback = true;
    else if (arg === '--inspect-dependencies') {
      // Read-only mode: audit + plan + dependency probes only. No
      // rollback exports, no DELETE, no POST. Token still required
      // because dependency probes hit the Web API.
      flags.inspectDependencies = true;
      flags.dryRun = false;
    } else if (arg === '--cleanup-form') {
      // Read-only by default; writing requires the explicit
      // --commit-form-cleanup flag.  Targets a single SystemForm GUID
      // supplied as the next argument — the operator is the source of
      // the form id, never the script.
      const next = args[i + 1];
      if (!next) bailParseArgs('--cleanup-form requires a SystemForm GUID');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next)) {
        bailParseArgs(`--cleanup-form expects a GUID; got "${next}"`);
      }
      flags.cleanupFormId = next.toLowerCase();
      flags.dryRun = false;
      i += 1; // consume the GUID
    } else if (arg === '--commit-form-cleanup') {
      flags.commitFormCleanup = true;
    } else if (arg === '--inspect-form') {
      // Broad read-only inspection of one SystemForm scoped to one
      // qualified attribute (table.column). Pairs with --attribute
      // for the qualified name. Never writes. Never publishes.
      const next = args[i + 1];
      if (!next) bailParseArgs('--inspect-form requires a SystemForm GUID');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next)) {
        bailParseArgs(`--inspect-form expects a GUID; got "${next}"`);
      }
      flags.inspectFormId = next.toLowerCase();
      flags.dryRun = false;
      i += 1;
    } else if (arg === '--attribute') {
      const next = args[i + 1];
      if (!next) bailParseArgs('--attribute requires a "<table>.<column>" value');
      if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/i.test(next)) {
        bailParseArgs(`--attribute expects "<table>.<column>"; got "${next}"`);
      }
      flags.inspectFormAttribute = next.toLowerCase();
      i += 1;
    } else if (arg === '--cleanup-subgrid') {
      // Targeted removal of one subgrid cell from one SystemForm,
      // identified by control id. Dry-run by default; writes require
      // --commit-subgrid-cleanup.
      const next = args[i + 1];
      if (!next) bailParseArgs('--cleanup-subgrid requires a SystemForm GUID');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next)) {
        bailParseArgs(`--cleanup-subgrid expects a GUID; got "${next}"`);
      }
      flags.cleanupSubgridFormId = next.toLowerCase();
      flags.dryRun = false;
      i += 1;
    } else if (arg === '--control-id') {
      const next = args[i + 1];
      if (!next) bailParseArgs('--control-id requires a control id string');
      // Dataverse control ids are identifier-shaped (letter, then
      // letters/digits/underscore). Refuse anything wider — protects
      // against accidentally treating an XML fragment as an id.
      if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(next)) {
        bailParseArgs(`--control-id expects an identifier-shape value; got "${next}"`);
      }
      flags.cleanupSubgridControlId = next;
      i += 1;
    } else if (arg === '--commit-subgrid-cleanup') {
      flags.commitSubgridCleanup = true;
    } else if (arg === '--inspect-view') {
      // Read-only inspection of one SavedQuery (Dataverse view). Pairs
      // with --attribute. Never writes.
      const next = args[i + 1];
      if (!next) bailParseArgs('--inspect-view requires a SavedQuery GUID');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next)) {
        bailParseArgs(`--inspect-view expects a GUID; got "${next}"`);
      }
      flags.inspectViewId = next.toLowerCase();
      flags.dryRun = false;
      i += 1;
    } else if (arg === '--cleanup-view') {
      // Targeted SavedQuery cleanup. Read-only by default; writes
      // require --commit-view-cleanup. Pairs with --attribute.
      const next = args[i + 1];
      if (!next) bailParseArgs('--cleanup-view requires a SavedQuery GUID');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next)) {
        bailParseArgs(`--cleanup-view expects a GUID; got "${next}"`);
      }
      flags.cleanupViewId = next.toLowerCase();
      flags.dryRun = false;
      i += 1;
    } else if (arg === '--commit-view-cleanup') {
      flags.commitViewCleanup = true;
    } else if (arg === '--print-relationship-payload') {
      // Pure diagnostic: print the buildLookupRelationshipPayload
      // output for every plan step that POSTs to RelationshipDefinitions,
      // then exit. No pac auth, no Web API call, no write.
      flags.printRelationshipPayload = true;
      flags.dryRun = false;
    } else if (arg === '--verify-lookups') {
      // Read-only Web API metadata verification. Queries
      // /api/data/v9.2/EntityDefinitions(.../Attributes(.../
      //   Microsoft.Dynamics.CRM.LookupAttributeMetadata
      // for every Phase 122 target attribute and prints whether it's
      // missing, a pseudo scalar, or a true Lookup (with Targets[]).
      // Does NOT use pac env fetch — the metadata source is the
      // Dataverse Web API only.
      flags.verifyLookups = true;
      flags.dryRun = false;
    } else if (arg === '--inspect-table') {
      // Read-only Dataverse table schema inspection (Phase 122D).
      // Takes one Dataverse logical-name argument and prints the
      // table's columns grouped by required-for-create level, with
      // lookup Targets + Picklist OptionSet values inlined.
      const next = args[i + 1];
      if (!next) bailParseArgs('--inspect-table requires a Dataverse table logical name');
      if (!/^[a-z][a-z0-9_]{1,79}$/i.test(next)) {
        bailParseArgs(
          `--inspect-table expects a Dataverse logical name (letters/digits/underscore); got "${next}"`,
        );
      }
      flags.inspectTableName = next.toLowerCase();
      flags.dryRun = false;
      i += 1;
    } else if (arg === '--inspect-attributes') {
      // Phase 122E Pt 1 — read-only targeted attribute inspection.
      // Takes a comma-separated list of <table>.<attribute> pairs.
      // For each lookup attribute, prints the resolved Targets[] AND
      // each target table's REQUIRED FOR CREATE columns (one level
      // deep). For each picklist attribute, prints the OptionSet.
      const next = args[i + 1];
      if (!next) {
        bailParseArgs(
          '--inspect-attributes requires a comma-separated list of <table>.<attribute>',
        );
      }
      const items = next.split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) {
        bailParseArgs('--inspect-attributes requires at least one <table>.<attribute>');
      }
      const logicalShape = /^[a-z][a-z0-9_]{1,79}$/i;
      const parsed = items.map((item) => {
        const parts = item.split('.');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          bailParseArgs(
            `--inspect-attributes item "${item}" must be exactly "<table>.<attribute>"`,
          );
        }
        if (!logicalShape.test(parts[0]) || !logicalShape.test(parts[1])) {
          bailParseArgs(
            `--inspect-attributes item "${item}" must use Dataverse logical-name shape (letters/digits/underscore, 2–80 chars per part)`,
          );
        }
        return { table: parts[0].toLowerCase(), attribute: parts[1].toLowerCase() };
      });
      flags.inspectAttributeItems = parsed;
      flags.dryRun = false;
      i += 1;
    } else if (arg === '--seed-client-relationship') {
      // Phase 122D Pt 2 — guarded TEST Client / Relationship seed.
      // Dry-run by default; writes require --commit-seed-client.
      // Requires --deal-name, --client-name, --borrower-type.
      flags.seedClientRelationship = true;
      flags.dryRun = false;
    } else if (arg === '--deal-name') {
      const next = args[i + 1];
      if (!next || next.length === 0) {
        bailParseArgs('--deal-name requires a non-empty Loan Deal primary-name value');
      }
      flags.seedDealName = next;
      i += 1;
    } else if (arg === '--client-name') {
      const next = args[i + 1];
      if (!next || next.length === 0) {
        bailParseArgs('--client-name requires a non-empty Client / Relationship primary-name value');
      }
      flags.seedClientName = next;
      i += 1;
    } else if (arg === '--borrower-type') {
      const next = args[i + 1];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || !BORROWER_TYPE_LABELS[parsed]) {
        const valid = Object.keys(BORROWER_TYPE_LABELS)
          .map((k) => `${k}=${BORROWER_TYPE_LABELS[k]}`)
          .join(', ');
        bailParseArgs(
          `--borrower-type expects one of {${valid}}; got "${next}"`,
        );
      }
      flags.seedBorrowerType = parsed;
      i += 1;
    } else if (arg === '--commit-seed-client') {
      flags.commitSeedClient = true;
    } else if (arg === '--seed-product-references') {
      // Phase 122E Pt 2 — guarded seed of the three optional Product /
      // Loan Structure / Pricing Type reference lookups on the Loan
      // Deal. Reuses --deal-name. Writes require
      // --commit-seed-product-references.
      flags.seedProductReferences = true;
      flags.dryRun = false;
    } else if (arg === '--commit-seed-product-references') {
      flags.commitSeedProductReferences = true;
    } else if (arg === '--seed-manager-entitlement') {
      // Phase 124D — guarded TEST manager-entitlement seed.
      // Dry-run by default; writes require
      // --commit-seed-manager-entitlement. Requires --upn,
      // --team-name, and --deal-name.
      flags.seedManagerEntitlement = true;
      flags.dryRun = false;
    } else if (arg === '--upn') {
      const next = args[i + 1];
      if (!next || next.length === 0) {
        bailParseArgs('--upn requires a non-empty user principal name');
      }
      // UPN shape sanity check — must contain exactly one '@'.
      // Not a strict email validator; we just refuse obviously
      // malformed inputs so the OData filter is well-formed.
      if (!/^[^@\s]+@[^@\s]+$/.test(next)) {
        bailParseArgs(
          `--upn expects a "<local>@<domain>" value; got "${next}"`,
        );
      }
      flags.seedUpn = next;
      i += 1;
    } else if (arg === '--team-name') {
      const next = args[i + 1];
      if (!next || next.length === 0) {
        bailParseArgs('--team-name requires a non-empty Team primary-name value');
      }
      flags.seedTeamName = next;
      i += 1;
    } else if (arg === '--commit-seed-manager-entitlement') {
      flags.commitSeedManagerEntitlement = true;
    } else if (arg === '--seed-executive-primary-workspace') {
      // Phase 133C — guarded Platform-User primary-workspace seed.
      // Dry-run by default; writes require
      // --commit-seed-executive-primary-workspace. Requires --upn and
      // --workspace-name. Patches ONLY the Platform User primary
      // workspace lookup — no other table or column is touched.
      flags.seedExecutivePrimaryWorkspace = true;
      flags.dryRun = false;
    } else if (arg === '--workspace-name') {
      const next = args[i + 1];
      if (!next || next.length === 0) {
        bailParseArgs('--workspace-name requires a non-empty Platform Workspace name value');
      }
      flags.seedWorkspaceName = next;
      i += 1;
    } else if (arg === '--commit-seed-executive-primary-workspace') {
      flags.commitSeedExecutivePrimaryWorkspace = true;
    } else if (arg === '--inspect-copilot-custom-api') {
      // Phase 137G — read-only metadata inspection of the future
      // cr664_RunLosCopilotAssist Custom API. Pure GET; never writes.
      flags.inspectCopilotCustomApi = true;
      flags.dryRun = false;
    } else if (arg === '--seed-copilot-custom-api-metadata') {
      // Phase 137G — DRY-RUN-ONLY metadata creation plan. Prints the
      // exact planned Dataverse payloads and exits before any write.
      // Offline (no auth, no Web API call). Commit is NOT implemented.
      flags.seedCopilotCustomApiMetadata = true;
      flags.dryRun = false;
    } else if (arg === '--commit-seed-copilot-custom-api-metadata') {
      // Accepted only alongside --seed-copilot-custom-api-metadata, but
      // it performs NO write — commit is explicitly not implemented in
      // Phase 137G (see the seed handler).
      flags.commitSeedCopilotCustomApiMetadata = true;
    } else if (arg === '--inspect-copilot-audit-table') {
      // Phase 137J — read-only metadata inspection of the future
      // cr664_copilotauditevent table. Pure GET; never writes.
      flags.inspectCopilotAuditTable = true;
      flags.dryRun = false;
    } else if (arg === '--seed-copilot-audit-table-metadata') {
      // Phase 137J — DRY-RUN-ONLY table metadata plan. Prints the planned
      // Dataverse table/field/index metadata and exits before any write.
      // Offline (no auth, no Web API call). Commit is NOT implemented.
      flags.seedCopilotAuditTableMetadata = true;
      flags.dryRun = false;
    } else if (arg === '--commit-seed-copilot-audit-table-metadata') {
      // Accepted only to give a clear "not implemented" message — it
      // performs NO write. Commit / live table creation is explicitly not
      // implemented in Phase 137J (see the seed handler).
      flags.commitSeedCopilotAuditTableMetadata = true;
    } else if (arg === '--inspect-portfolio-boarding-schema') {
      // Phase 140I — read-only Web API metadata inspection of the candidate
      // portfolio-boarding tables + reusable related tables. Pure GET; never
      // writes. Classifies each table EXISTS_REUSABLE / EXISTS_NEEDS_REVIEW /
      // MISSING_CAN_SEED / BLOCKED_BY_CONFLICT / UNKNOWN.
      flags.inspectPortfolioBoardingSchema = true;
      flags.dryRun = false;
    } else if (arg === '--plan-portfolio-boarding-schema') {
      // Phase 140I — read-only schema PLAN. Runs the same GET inspection,
      // then prints the exact (future) creation plan in seed order. Still
      // read-only: NO table/column/relationship creation. No commit flag.
      flags.planPortfolioBoardingSchema = true;
      flags.dryRun = false;
    } else if (arg === '--seed-portfolio-boarding-schema') {
      // Phase 140J — guarded schema SEED. Dry-run by default: runs the same
      // GET inspection + derives the seed plan and prints it. Live metadata
      // creation happens ONLY when paired with the explicit commit flag.
      flags.seedPortfolioBoardingSchema = true;
      flags.dryRun = false;
    } else if (arg === '--commit-seed-portfolio-boarding-schema') {
      // Phase 140J — the ONLY flag that authorizes live schema metadata
      // creation. Valid only alongside --seed-portfolio-boarding-schema.
      flags.commitSeedPortfolioBoardingSchema = true;
    } else if (arg === '--repair-portfolio-boarding-optional-relationships') {
      // Phase 140K — narrow repair mode. Dry-run by default: inspects and
      // reports ONLY the missing optional evidence→document lookup. Live
      // creation requires the explicit commit flag below.
      flags.repairPortfolioBoardingOptionalRelationships = true;
      flags.dryRun = false;
    } else if (arg === '--commit-repair-portfolio-boarding-optional-relationships') {
      // Phase 140K — authorizes creating ONLY the optional evidence→document
      // lookup. Valid only alongside the repair mode.
      flags.commitRepairPortfolioBoardingOptionalRelationships = true;
    } else if (arg === '--help' || arg === '-h') flags.help = true;
    else bailParseArgs(`Unknown argument: ${arg}`);
  }

  const exclusiveModes = [
    flags.commit,
    flags.inspectDependencies,
    flags.cleanupFormId !== null,
    flags.inspectFormId !== null,
    flags.cleanupSubgridFormId !== null,
    flags.inspectViewId !== null,
    flags.cleanupViewId !== null,
    flags.seedClientRelationship,
    flags.inspectAttributeItems !== null,
    flags.seedProductReferences,
    flags.seedManagerEntitlement,
    flags.seedExecutivePrimaryWorkspace,
    flags.inspectCopilotCustomApi,
    flags.seedCopilotCustomApiMetadata,
    flags.inspectCopilotAuditTable,
    flags.seedCopilotAuditTableMetadata,
    flags.inspectPortfolioBoardingSchema,
    flags.planPortfolioBoardingSchema,
    flags.seedPortfolioBoardingSchema,
    flags.repairPortfolioBoardingOptionalRelationships,
  ].filter(Boolean);
  if (exclusiveModes.length > 1) {
    bailParseArgs(
      'Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, --seed-copilot-custom-api-metadata, --inspect-copilot-audit-table, and --seed-copilot-audit-table-metadata are mutually exclusive.',
    );
  }
  if (flags.commitFormCleanup && flags.cleanupFormId === null) {
    bailParseArgs('--commit-form-cleanup has no effect without --cleanup-form <id>.');
  }
  // Phase 140J — the portfolio-boarding schema commit flag only authorizes
  // writes alongside the seed mode; on its own it must fail.
  if (
    flags.commitSeedPortfolioBoardingSchema &&
    !flags.seedPortfolioBoardingSchema
  ) {
    bailParseArgs(
      '--commit-seed-portfolio-boarding-schema has no effect without --seed-portfolio-boarding-schema.',
    );
  }
  // Phase 140K — the optional-relationship repair commit flag is inert on its
  // own; it only authorizes writes alongside the repair mode.
  if (
    flags.commitRepairPortfolioBoardingOptionalRelationships &&
    !flags.repairPortfolioBoardingOptionalRelationships
  ) {
    bailParseArgs(
      '--commit-repair-portfolio-boarding-optional-relationships has no effect without --repair-portfolio-boarding-optional-relationships.',
    );
  }
  // --attribute is a shared "<table>.<column>" qualifier reused by
  // --inspect-form, --inspect-view, and --cleanup-view. The field
  // name `inspectFormAttribute` predates the broader reuse — kept
  // for back-compat with existing static-source pins.
  if (flags.inspectFormId !== null && flags.inspectFormAttribute === null) {
    bailParseArgs('--inspect-form requires --attribute <table>.<column>');
  }
  if (flags.inspectViewId !== null && flags.inspectFormAttribute === null) {
    bailParseArgs('--inspect-view requires --attribute <table>.<column>');
  }
  if (flags.cleanupViewId !== null && flags.inspectFormAttribute === null) {
    bailParseArgs('--cleanup-view requires --attribute <table>.<column>');
  }
  if (
    flags.inspectFormAttribute !== null &&
    flags.inspectFormId === null &&
    flags.inspectViewId === null &&
    flags.cleanupViewId === null &&
    flags.cleanupFormId === null
  ) {
    bailParseArgs(
      '--attribute is only valid alongside --inspect-form, --inspect-view, --cleanup-form, or --cleanup-view',
    );
  }
  if (flags.cleanupSubgridFormId !== null && flags.cleanupSubgridControlId === null) {
    bailParseArgs('--cleanup-subgrid requires --control-id <id>');
  }
  if (flags.cleanupSubgridControlId !== null && flags.cleanupSubgridFormId === null) {
    bailParseArgs('--control-id is only valid alongside --cleanup-subgrid <id>');
  }
  if (flags.commitSubgridCleanup && flags.cleanupSubgridFormId === null) {
    bailParseArgs('--commit-subgrid-cleanup has no effect without --cleanup-subgrid <id>.');
  }
  if (flags.commitViewCleanup && flags.cleanupViewId === null) {
    bailParseArgs('--commit-view-cleanup has no effect without --cleanup-view <id>.');
  }
  // --seed-client-relationship cross-flag validation. All three inputs
  // are required when the mode is selected. None of them is meaningful
  // without the mode.
  if (flags.seedClientRelationship) {
    if (!flags.seedDealName) {
      bailParseArgs('--seed-client-relationship requires --deal-name <text>');
    }
    if (!flags.seedClientName) {
      bailParseArgs('--seed-client-relationship requires --client-name <text>');
    }
    if (flags.seedBorrowerType === null) {
      bailParseArgs('--seed-client-relationship requires --borrower-type <integer>');
    }
  } else {
    if (flags.seedClientName) {
      bailParseArgs('--client-name is only valid alongside --seed-client-relationship');
    }
    if (flags.seedBorrowerType !== null) {
      bailParseArgs('--borrower-type is only valid alongside --seed-client-relationship');
    }
    if (flags.commitSeedClient) {
      bailParseArgs('--commit-seed-client has no effect without --seed-client-relationship.');
    }
  }
  // --seed-product-references cross-flag validation. --deal-name is
  // shared with --seed-client-relationship since both write to the
  // same Loan Deal row; it is valid alongside either seed mode but
  // not in any other context.
  if (flags.seedProductReferences) {
    if (!flags.seedDealName) {
      bailParseArgs('--seed-product-references requires --deal-name <text>');
    }
  } else if (flags.commitSeedProductReferences) {
    bailParseArgs(
      '--commit-seed-product-references has no effect without --seed-product-references.',
    );
  }
  if (
    flags.seedDealName &&
    !flags.seedClientRelationship &&
    !flags.seedProductReferences &&
    !flags.seedManagerEntitlement &&
    !flags.seedExecutivePrimaryWorkspace
  ) {
    bailParseArgs(
      '--deal-name is only valid alongside --seed-client-relationship, --seed-product-references, or --seed-manager-entitlement',
    );
  }
  // Phase 124D — manager-entitlement seed cross-flag validation.
  // --seed-manager-entitlement requires all three of --upn,
  // --team-name, and --deal-name. None of those inputs is meaningful
  // outside this mode.
  if (flags.seedManagerEntitlement) {
    if (!flags.seedUpn) {
      bailParseArgs('--seed-manager-entitlement requires --upn <email>');
    }
    if (!flags.seedTeamName) {
      bailParseArgs('--seed-manager-entitlement requires --team-name <text>');
    }
    if (!flags.seedDealName) {
      bailParseArgs('--seed-manager-entitlement requires --deal-name <text>');
    }
  } else if (flags.seedExecutivePrimaryWorkspace) {
    // Phase 133C — executive primary-workspace seed requires only --upn
    // and --workspace-name. The manager-seed-only inputs may not ride
    // along: --deal-name, --team-name, and --commit-seed-manager-
    // entitlement are each rejected here so they cannot silently attach
    // to the executive seed.
    if (!flags.seedUpn) {
      bailParseArgs('--seed-executive-primary-workspace requires --upn <email>');
    }
    if (!flags.seedWorkspaceName) {
      bailParseArgs('--seed-executive-primary-workspace requires --workspace-name <text>');
    }
    if (flags.seedDealName) {
      bailParseArgs('--deal-name is only valid alongside --seed-manager-entitlement or --seed-product-references');
    }
    if (flags.seedTeamName) {
      bailParseArgs('--team-name is only valid alongside --seed-manager-entitlement');
    }
    if (flags.commitSeedManagerEntitlement) {
      bailParseArgs(
        '--commit-seed-manager-entitlement has no effect without --seed-manager-entitlement.',
      );
    }
  } else {
    if (flags.seedUpn) {
      bailParseArgs('--upn is only valid alongside --seed-manager-entitlement or --seed-executive-primary-workspace');
    }
    if (flags.seedTeamName) {
      bailParseArgs('--team-name is only valid alongside --seed-manager-entitlement');
    }
    if (flags.seedWorkspaceName) {
      bailParseArgs('--workspace-name is only valid alongside --seed-executive-primary-workspace');
    }
    if (flags.commitSeedManagerEntitlement) {
      bailParseArgs(
        '--commit-seed-manager-entitlement has no effect without --seed-manager-entitlement.',
      );
    }
    if (flags.commitSeedExecutivePrimaryWorkspace) {
      bailParseArgs(
        '--commit-seed-executive-primary-workspace has no effect without --seed-executive-primary-workspace.',
      );
    }
  }
  // Phase 137G — Copilot Custom API metadata mode cross-flag validation.
  // The commit flag is meaningless without the seed mode; and even WITH it,
  // commit is not implemented (the seed handler performs no write). The
  // inspect mode cannot ride along with the seed/commit flags.
  if (flags.commitSeedCopilotCustomApiMetadata && !flags.seedCopilotCustomApiMetadata) {
    bailParseArgs(
      '--commit-seed-copilot-custom-api-metadata has no effect without --seed-copilot-custom-api-metadata.',
    );
  }
  if (flags.inspectCopilotCustomApi && flags.commitSeedCopilotCustomApiMetadata) {
    bailParseArgs(
      '--commit-seed-copilot-custom-api-metadata cannot be combined with --inspect-copilot-custom-api.',
    );
  }
  // Phase 137J — Copilot audit-table metadata mode cross-flag validation.
  // The commit flag is meaningless without the seed mode; and even WITH it,
  // commit is NOT implemented (the seed handler performs no write). The
  // inspect mode cannot ride along with the seed/commit flags.
  if (flags.commitSeedCopilotAuditTableMetadata && !flags.seedCopilotAuditTableMetadata) {
    bailParseArgs(
      '--commit-seed-copilot-audit-table-metadata has no effect without --seed-copilot-audit-table-metadata.',
    );
  }
  if (flags.inspectCopilotAuditTable && flags.commitSeedCopilotAuditTableMetadata) {
    bailParseArgs(
      '--commit-seed-copilot-audit-table-metadata cannot be combined with --inspect-copilot-audit-table.',
    );
  }
  return flags;
}

function bailParseArgs(msg) {
  console.error(msg);
  console.error(
    'Usage: node scripts/phase122-lookup-repair.mjs ' +
      '[--dry-run | --commit | --inspect-dependencies | ' +
      '--cleanup-form <id> [--commit-form-cleanup] | ' +
      '--inspect-form <id> --attribute <table>.<column> | ' +
      '--cleanup-subgrid <id> --control-id <id> [--commit-subgrid-cleanup] | ' +
      '--inspect-view <id> --attribute <table>.<column> | ' +
      '--cleanup-view <id> --attribute <table>.<column> [--commit-view-cleanup]] ' +
      '[--help]',
  );
  process.exit(2);
}

const FLAGS = parseArgs(process.argv);

if (FLAGS.help) {
  printHelp();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const MODE = FLAGS.commit
  ? 'COMMIT'
  : FLAGS.inspectDependencies
    ? 'INSPECT-DEPENDENCIES'
    : FLAGS.cleanupFormId !== null
      ? FLAGS.commitFormCleanup
        ? 'COMMIT-FORM-CLEANUP'
        : 'CLEANUP-FORM (dry-run)'
      : FLAGS.inspectFormId !== null
        ? 'INSPECT-FORM'
        : FLAGS.cleanupSubgridFormId !== null
          ? FLAGS.commitSubgridCleanup
            ? 'COMMIT-SUBGRID-CLEANUP'
            : 'CLEANUP-SUBGRID (dry-run)'
          : FLAGS.inspectViewId !== null
            ? 'INSPECT-VIEW'
            : FLAGS.cleanupViewId !== null
              ? FLAGS.commitViewCleanup
                ? 'COMMIT-VIEW-CLEANUP'
                : 'CLEANUP-VIEW (dry-run)'
              : FLAGS.verifyLookups
                ? 'VERIFY-LOOKUPS'
                : FLAGS.inspectTableName !== null
                  ? 'INSPECT-TABLE'
                  : FLAGS.inspectAttributeItems !== null
                    ? 'INSPECT-ATTRIBUTES'
                    : FLAGS.seedClientRelationship
                      ? FLAGS.commitSeedClient
                        ? 'COMMIT-SEED-CLIENT'
                        : 'SEED-CLIENT-RELATIONSHIP (dry-run)'
                      : FLAGS.seedProductReferences
                        ? FLAGS.commitSeedProductReferences
                          ? 'COMMIT-SEED-PRODUCT-REFERENCES'
                          : 'SEED-PRODUCT-REFERENCES (dry-run)'
                        : FLAGS.seedManagerEntitlement
                          ? FLAGS.commitSeedManagerEntitlement
                            ? 'COMMIT-SEED-MANAGER-ENTITLEMENT'
                            : 'SEED-MANAGER-ENTITLEMENT (dry-run)'
                          : FLAGS.seedExecutivePrimaryWorkspace
                            ? FLAGS.commitSeedExecutivePrimaryWorkspace
                              ? 'COMMIT-SEED-EXECUTIVE-PRIMARY-WORKSPACE'
                              : 'SEED-EXECUTIVE-PRIMARY-WORKSPACE (dry-run)'
                            : FLAGS.inspectCopilotCustomApi
                              ? 'INSPECT-COPILOT-CUSTOM-API'
                              : FLAGS.seedCopilotCustomApiMetadata
                                ? FLAGS.commitSeedCopilotCustomApiMetadata
                                  ? 'SEED-COPILOT-CUSTOM-API-METADATA (commit requested — NOT IMPLEMENTED, dry-run only)'
                                  : 'SEED-COPILOT-CUSTOM-API-METADATA (dry-run)'
                                : FLAGS.inspectCopilotAuditTable
                                  ? 'INSPECT-COPILOT-AUDIT-TABLE'
                                  : FLAGS.seedCopilotAuditTableMetadata
                                    ? FLAGS.commitSeedCopilotAuditTableMetadata
                                      ? 'SEED-COPILOT-AUDIT-TABLE-METADATA (commit requested — NOT IMPLEMENTED, dry-run only)'
                                      : 'SEED-COPILOT-AUDIT-TABLE-METADATA (dry-run)'
                                    : FLAGS.inspectPortfolioBoardingSchema
                                      ? 'INSPECT-PORTFOLIO-BOARDING-SCHEMA (read-only)'
                                      : FLAGS.planPortfolioBoardingSchema
                                        ? 'PLAN-PORTFOLIO-BOARDING-SCHEMA (read-only, dry-run only)'
                                        : FLAGS.seedPortfolioBoardingSchema
                                          ? FLAGS.commitSeedPortfolioBoardingSchema
                                            ? 'SEED-PORTFOLIO-BOARDING-SCHEMA (COMMIT — live metadata create)'
                                            : 'SEED-PORTFOLIO-BOARDING-SCHEMA (dry-run)'
                                          : FLAGS.repairPortfolioBoardingOptionalRelationships
                                            ? FLAGS.commitRepairPortfolioBoardingOptionalRelationships
                                              ? 'REPAIR-PORTFOLIO-BOARDING-OPTIONAL-RELATIONSHIPS (COMMIT — optional lookup only)'
                                              : 'REPAIR-PORTFOLIO-BOARDING-OPTIONAL-RELATIONSHIPS (dry-run)'
                                            : 'DRY-RUN';
console.log('='.repeat(70));
console.log(`Phase 122B — Dataverse lookup repair script — mode: ${MODE}`);
console.log('='.repeat(70));
console.log(`Environment id (pinned):  ${TARGET_ENVIRONMENT_ID}`);
console.log(`Solution for cr664_ work: ${SOLUTION_FOR_CR664}`);
console.log(`Cross-list reference:     ${SOLUTION_FOR_REFERENCE}`);
console.log(`Required prefix:          ${CR664_PUBLISHER_PREFIX}`);
console.log(`Forbidden prefix:         ${FORBIDDEN_PUBLISHER_PREFIX}`);
console.log('');

if (
  FLAGS.commit ||
  FLAGS.commitFormCleanup ||
  FLAGS.commitSubgridCleanup ||
  FLAGS.commitViewCleanup ||
  FLAGS.commitSeedClient ||
  FLAGS.commitSeedProductReferences ||
  FLAGS.commitSeedManagerEntitlement ||
  FLAGS.commitSeedExecutivePrimaryWorkspace ||
  FLAGS.commitSeedPortfolioBoardingSchema ||
  FLAGS.commitRepairPortfolioBoardingOptionalRelationships
) {
  console.log('⚠  WRITE MODE — script may perform live Dataverse writes if every');
  console.log('   safety gate passes. Press Ctrl+C now to abort.');
  console.log('');
}

// ---------------------------------------------------------------------------
// pac CLI auth sanity check
// ---------------------------------------------------------------------------

function assertPacAuth() {
  const res = spawnSync('pac', ['auth', 'list'], { encoding: 'utf8' });
  if (res.status !== 0) {
    bail(
      'pac CLI is not authenticated. Run `pac auth create --deviceCode` and select the ' +
        'CommercialLendingLOS environment before running this script.',
    );
  }
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  if (!/\*\s+UNIVERSAL/.test(out) && !out.includes('Active')) {
    bail(
      'pac CLI has no active universal auth session. Run `pac auth select --index N` ' +
        'to activate one before running this script.',
    );
  }
}

// ---------------------------------------------------------------------------
// pac env fetch shellout (read-only)
// ---------------------------------------------------------------------------

function fetchXml(xml) {
  const res = spawnSync('pac', ['env', 'fetch', '-x', xml], { encoding: 'utf8' });
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  if (out.includes('Error:')) {
    return { ok: false, error: out };
  }
  return { ok: true, raw: out };
}

function attributeExists(table, attribute) {
  // Legacy pac-based existence probe. Retained for callers outside
  // the lookup audit; the audit itself now uses
  // classifyAttribute() against the Dataverse Web API metadata
  // endpoint because pac env fetch was returning stale answers on
  // the operator's 2026-06-08 dry-run after a real Lookup attribute
  // had been created (it reported pseudo cr664_deal as still
  // present because the new lookup's logical name collides).
  const xml = `<fetch count='1'><entity name='${table}'><attribute name='${table}id'/><attribute name='${attribute}'/></entity></fetch>`;
  return fetchXml(xml).ok;
}

/**
 * Web API metadata classification — the authoritative answer to
 * "does <table>.<attribute> exist, and if so, is it a real Lookup or
 * the legacy pseudo scalar?". Used by the audit, by the
 * --verify-lookups mode, and by the post-commit verify steps.
 *
 * Read-only. Uses two GETs:
 *   1. /api/data/v9.2/EntityDefinitions(LogicalName='<table>')
 *      /Attributes(LogicalName='<attribute>')?$select=AttributeType,…
 *      → 404 means missing; 200 yields the AttributeType.
 *   2. Same path + /Microsoft.Dynamics.CRM.LookupAttributeMetadata
 *      $select=Targets,…
 *      → 200 confirms the attribute can be cast to LookupAttributeMetadata
 *        and exposes Targets[]. 404 means it's a non-Lookup
 *        (pseudo scalar) — caught by step 1's AttributeType.
 *
 * Returns an object with `classification` in
 *   'missing' | 'pseudo-scalar' | 'real-lookup' | 'probe-failed'
 * plus details when applicable.
 */
async function classifyAttribute(table, attribute, token, envUrl) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
  };
  const baseUrl = `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${attribute}')`;
  let res;
  try {
    res = await fetch(`${baseUrl}?$select=AttributeType,SchemaName,MetadataId,LogicalName`, {
      method: 'GET',
      headers,
    });
  } catch (err) {
    return { classification: 'probe-failed', error: `attribute metadata network error: ${err.message}` };
  }
  if (res.status === 404) {
    return { classification: 'missing' };
  }
  if (!res.ok) {
    const text = await res.text();
    return { classification: 'probe-failed', error: `attribute metadata → ${res.status}: ${text}` };
  }
  const meta = await res.json();
  if (meta.AttributeType !== 'Lookup') {
    return {
      classification: 'pseudo-scalar',
      attributeType: meta.AttributeType,
      schemaName: meta.SchemaName,
      metadataId: meta.MetadataId,
    };
  }
  // AttributeType is Lookup. Fetch Targets via the explicit cast so
  // the script reports the resolved target entity authoritatively.
  let lookupRes;
  try {
    lookupRes = await fetch(
      `${baseUrl}/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets,SchemaName,MetadataId`,
      { method: 'GET', headers },
    );
  } catch (err) {
    return {
      classification: 'real-lookup',
      attributeType: 'Lookup',
      schemaName: meta.SchemaName,
      metadataId: meta.MetadataId,
      error: `lookup cast network error: ${err.message}`,
    };
  }
  if (!lookupRes.ok) {
    const text = await lookupRes.text();
    return {
      classification: 'real-lookup',
      attributeType: 'Lookup',
      schemaName: meta.SchemaName,
      metadataId: meta.MetadataId,
      error: `lookup cast → ${lookupRes.status}: ${text}`,
    };
  }
  const lookup = await lookupRes.json();
  return {
    classification: 'real-lookup',
    attributeType: 'Lookup',
    schemaName: meta.SchemaName,
    metadataId: meta.MetadataId,
    targets: Array.isArray(lookup.Targets) ? lookup.Targets : [],
  };
}

/**
 * Read-only Web API probe for the ManyToOne relationship metadata
 * tied to a specific (table, attribute) lookup. Returns the
 * relationship's SchemaName and ReferencedEntity, or null when no
 * relationship is found (e.g. the attribute is not yet a real lookup).
 */
async function getManyToOneRelationshipMeta(table, attribute, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${table}')` +
    `/ManyToOneRelationships?$filter=ReferencingAttribute eq '${attribute}'` +
    `&$select=SchemaName,ReferencingEntity,ReferencedEntity,ReferencingAttribute`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      return { ok: false, error: `many-to-one GET → ${res.status}` };
    }
    const json = await res.json();
    const first = Array.isArray(json.value) && json.value.length > 0 ? json.value[0] : null;
    return { ok: true, relationship: first };
  } catch (err) {
    return { ok: false, error: `many-to-one network error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Read-only Web API metadata verification (--verify-lookups).
//
// Standalone diagnostic mode. For every Phase 122 target attribute,
// queries the Dataverse Web API metadata layer (NOT pac env fetch)
// and reports six facts per attribute:
//
//   1. Does the attribute exist?
//   2. Is it a true LookupAttributeMetadata (i.e. AttributeType === 'Lookup'
//      AND the .../Microsoft.Dynamics.CRM.LookupAttributeMetadata cast 200s)?
//   3. Does Targets[] include the expected referenced entity?
//   4. The expected OData FK projection name (`_<attribute>_value`).
//   5. The ManyToOne relationship SchemaName (if any).
//   6. Whether the legacy pseudo-scalar with the same logical name is
//      still present.
//
// Pure GETs — no PATCH, POST, DELETE, or PublishXml call. Used both as
// a standalone --verify-lookups mode AND as the building block for the
// `kind: 'webapi-verify'` plan steps that run after the destructive
// commit phase.
// ---------------------------------------------------------------------------

const VERIFY_LOOKUP_TARGETS = Object.freeze([
  ...CANDIDATE_CHILD_TABLES.map((t) => ({
    table: t,
    attribute: PSEUDO_DEAL_COLUMN,
    expectedTarget: LOOKUP_TARGET_LOAN_DEAL,
  })),
  {
    table: 'cr664_dealtask1',
    attribute: PSEUDO_ASSIGNEDTO_COLUMN,
    expectedTarget: LOOKUP_TARGET_SYSTEMUSER,
  },
]);

async function verifyOneLookup(target, token, envUrl) {
  const { table, attribute, expectedTarget } = target;
  const classification = await classifyAttribute(table, attribute, token, envUrl);
  const rel = await getManyToOneRelationshipMeta(table, attribute, token, envUrl);
  return {
    table,
    attribute,
    expectedTarget,
    classification: classification.classification,
    attributeType: classification.attributeType ?? null,
    schemaName: classification.schemaName ?? null,
    metadataId: classification.metadataId ?? null,
    targets: classification.targets ?? null,
    relationshipSchemaName: rel.ok ? rel.relationship?.SchemaName ?? null : null,
    relationshipReferencedEntity: rel.ok ? rel.relationship?.ReferencedEntity ?? null : null,
    expectedFkProjectionName: `_${attribute}_value`,
    error: classification.error ?? (rel.ok ? null : rel.error),
  };
}

function printVerifyLookupReport(report) {
  console.log(`-- ${report.table}.${report.attribute}  (expected target: ${report.expectedTarget})`);
  console.log(`     classification:           ${report.classification}`);
  if (report.attributeType) {
    console.log(`     AttributeType:            ${report.attributeType}`);
  }
  if (report.schemaName) {
    console.log(`     SchemaName:               ${report.schemaName}`);
  }
  if (report.metadataId) {
    console.log(`     MetadataId:               ${report.metadataId}`);
  }
  if (report.classification === 'real-lookup') {
    const ok = Array.isArray(report.targets) && report.targets.includes(report.expectedTarget);
    console.log(`     LookupAttributeMetadata:  YES`);
    console.log(`     Targets[]:                ${JSON.stringify(report.targets)}`);
    console.log(`     Targets includes ${report.expectedTarget}: ${ok ? 'YES ✓' : 'NO ✗'}`);
    console.log(`     OData FK projection:      ${report.expectedFkProjectionName}`);
  } else if (report.classification === 'pseudo-scalar') {
    console.log(`     LookupAttributeMetadata:  NO`);
    console.log(`     legacy pseudo scalar:     YES — still needs cleanup`);
  } else if (report.classification === 'missing') {
    console.log(`     attribute does NOT exist on this table.`);
  } else {
    console.log(`     classification probe failed: ${report.error ?? '(no detail)'}`);
  }
  if (report.relationshipSchemaName) {
    console.log(`     M:1 relationship name:    ${report.relationshipSchemaName}`);
  } else {
    console.log(`     M:1 relationship name:    (none — relationship not found)`);
  }
  if (report.relationshipReferencedEntity) {
    console.log(`     M:1 referenced entity:    ${report.relationshipReferencedEntity}`);
  }
  if (report.error) {
    console.log(`     probe errors:             ${report.error}`);
  }
}

async function runVerifyLookups(token, envUrl) {
  console.log('');
  console.log('Phase L — Lookup metadata verification (Web API only, read-only)');
  console.log('');
  console.log('NOTE: no pac env fetch. This mode reads the Dataverse Web API');
  console.log('      metadata endpoints directly so the result reflects the');
  console.log('      actual lookup attribute / relationship metadata, not');
  console.log('      the pac client cache.');
  console.log('');
  const reports = [];
  for (const target of VERIFY_LOOKUP_TARGETS) {
    const report = await verifyOneLookup(target, token, envUrl);
    printVerifyLookupReport(report);
    reports.push(report);
    console.log('');
  }
  // Final summary line: how many targets are real-lookup vs not.
  const realCount = reports.filter((r) => r.classification === 'real-lookup').length;
  const pseudoCount = reports.filter((r) => r.classification === 'pseudo-scalar').length;
  const missingCount = reports.filter((r) => r.classification === 'missing').length;
  const failedCount = reports.filter((r) => r.classification === 'probe-failed').length;
  console.log('Summary:');
  console.log(`  real-lookup:    ${realCount}/${reports.length}`);
  console.log(`  pseudo-scalar:  ${pseudoCount}/${reports.length}`);
  console.log(`  missing:        ${missingCount}/${reports.length}`);
  console.log(`  probe-failed:   ${failedCount}/${reports.length}`);
  console.log('');
  if (realCount === reports.length) {
    console.log('✓ Every Phase 122 target is a real LookupAttributeMetadata pointing at');
    console.log('  the expected referenced entity. The cr664_deal cleanup is complete from');
    console.log('  the metadata side.');
  } else if (pseudoCount > 0) {
    console.log('⚠ Some attributes still present as legacy pseudo scalars. Re-run --commit');
    console.log('  to delete the pseudos and create real lookups.');
  } else if (missingCount > 0) {
    console.log('⚠ Some attributes do not exist on their tables. Re-run --commit to');
    console.log('  create the lookups.');
  } else {
    console.log('⚠ Probe failures detected. Investigate the per-attribute errors above.');
  }
}

// ---------------------------------------------------------------------------
// Read-only Web API table-schema inspection (--inspect-table).
//
// Phase 122D — the operator hit a wall trying to seed
// cr664_clientrelationship rows in Maker Portal because the table has
// required nested-reference dependencies (a Borrower lookup and a
// relationship-type field). The generated Power Apps SDK does NOT
// include a model for cr664_clientrelationship — that table was added
// to Dataverse after the last `pac modelbuilder` run — so the schema
// can only be learned authoritatively from Web API metadata.
//
// This mode fetches the table's EntityDefinitions metadata + the
// per-attribute RequiredLevel + lookup Targets + Picklist OptionSet
// values, grouped by required-for-create level. Pure GETs, no write.
// ---------------------------------------------------------------------------

async function getTableMetadata(tableLogicalName, token, envUrl) {
  // Single GET pulls table + attribute headline metadata. Per-attribute
  // lookup Targets / Picklist OptionSet need separate casts (below).
  const url =
    `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${tableLogicalName}')` +
    `?$select=LogicalName,SchemaName,EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute,` +
    `LogicalCollectionName,DisplayName,IsCustomEntity` +
    `&$expand=Attributes($select=LogicalName,SchemaName,AttributeType,RequiredLevel,` +
    `IsValidForCreate,IsValidForUpdate,DisplayName,IsCustomAttribute)`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (res.status === 404) {
      return { ok: false, error: `table not found: ${tableLogicalName}` };
    }
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `EntityDefinitions GET → ${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, table: json };
  } catch (err) {
    return { ok: false, error: `EntityDefinitions network error: ${err.message}` };
  }
}

async function getLookupTargetsForAttribute(table, attribute, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${table}')` +
    `/Attributes(LogicalName='${attribute}')` +
    `/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets,SchemaName`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      return { ok: false, error: `lookup-cast GET → ${res.status}` };
    }
    const json = await res.json();
    return { ok: true, targets: Array.isArray(json.Targets) ? json.Targets : [] };
  } catch (err) {
    return { ok: false, error: `lookup-cast network error: ${err.message}` };
  }
}

async function getPicklistOptionsForAttribute(table, attribute, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${table}')` +
    `/Attributes(LogicalName='${attribute}')` +
    `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=SchemaName` +
    `&$expand=OptionSet($select=Options)`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { ok: false, error: `picklist-cast GET → ${res.status}` };
    const json = await res.json();
    const options = Array.isArray(json?.OptionSet?.Options)
      ? json.OptionSet.Options.map((o) => ({
          value: o.Value,
          label:
            Array.isArray(o?.Label?.LocalizedLabels) &&
            o.Label.LocalizedLabels[0]?.Label
              ? o.Label.LocalizedLabels[0].Label
              : null,
        }))
      : [];
    return { ok: true, options };
  } catch (err) {
    return { ok: false, error: `picklist-cast network error: ${err.message}` };
  }
}

function localizedDisplayName(displayName) {
  if (!displayName) return null;
  const labels = displayName.LocalizedLabels;
  if (!Array.isArray(labels) || labels.length === 0) return null;
  return labels[0]?.Label ?? null;
}

async function runInspectTable(tableLogicalName, token, envUrl) {
  console.log('');
  console.log('Phase T — Dataverse table inspection (Web API metadata, read-only)');
  console.log(`   Target table: ${tableLogicalName}`);
  console.log('');

  const meta = await getTableMetadata(tableLogicalName, token, envUrl);
  if (!meta.ok) bail(`Table inspection failed: ${meta.error}`);
  const t = meta.table;

  console.log(`   LogicalName:              ${t.LogicalName}`);
  console.log(`   SchemaName:               ${t.SchemaName}`);
  console.log(`   EntitySetName:            ${t.EntitySetName}`);
  console.log(`   LogicalCollectionName:    ${t.LogicalCollectionName ?? '(none)'}`);
  console.log(`   DisplayName:              ${localizedDisplayName(t.DisplayName) ?? '(none)'}`);
  console.log(`   PrimaryNameAttribute:     ${t.PrimaryNameAttribute}`);
  console.log(`   PrimaryIdAttribute:       ${t.PrimaryIdAttribute}`);
  console.log(`   IsCustomEntity:           ${t.IsCustomEntity}`);
  console.log('');

  // Partition attributes by required-for-create level. Skip
  // attributes that aren't valid for create (those are server-managed).
  const required = [];
  const recommended = [];
  const optional = [];
  for (const attr of t.Attributes ?? []) {
    if (!attr.IsValidForCreate) continue;
    const lvl = attr.RequiredLevel?.Value ?? 'None';
    if (lvl === 'SystemRequired' || lvl === 'ApplicationRequired') {
      required.push(attr);
    } else if (lvl === 'Recommended') {
      recommended.push(attr);
    } else {
      optional.push(attr);
    }
  }
  // Sort each bucket alphabetically for stable output.
  const byLogical = (a, b) => a.LogicalName.localeCompare(b.LogicalName);
  required.sort(byLogical);
  recommended.sort(byLogical);
  optional.sort(byLogical);

  console.log(`   REQUIRED FOR CREATE (${required.length}):`);
  for (const attr of required) {
    const lvl = attr.RequiredLevel?.Value ?? 'None';
    const display = localizedDisplayName(attr.DisplayName);
    console.log(
      `     - ${attr.LogicalName}   type=${attr.AttributeType}   ` +
        `RequiredLevel=${lvl}   IsCustom=${attr.IsCustomAttribute}` +
        (display ? `   DisplayName="${display}"` : ''),
    );
    if (attr.AttributeType === 'Lookup' || attr.AttributeType === 'Customer') {
      const lookup = await getLookupTargetsForAttribute(
        tableLogicalName,
        attr.LogicalName,
        token,
        envUrl,
      );
      if (lookup.ok) {
        console.log(`         Lookup Targets: ${JSON.stringify(lookup.targets)}`);
      } else {
        console.log(`         (could not fetch Targets: ${lookup.error})`);
      }
    } else if (attr.AttributeType === 'Picklist') {
      const choice = await getPicklistOptionsForAttribute(
        tableLogicalName,
        attr.LogicalName,
        token,
        envUrl,
      );
      if (choice.ok) {
        console.log(`         OptionSet (${choice.options.length} options):`);
        for (const o of choice.options) {
          console.log(`           ${o.value} → ${o.label ?? '(no label)'}`);
        }
      } else {
        console.log(`         (could not fetch OptionSet: ${choice.error})`);
      }
    }
  }

  console.log('');
  console.log(`   RECOMMENDED (${recommended.length}):`);
  for (const attr of recommended) {
    const display = localizedDisplayName(attr.DisplayName);
    console.log(
      `     - ${attr.LogicalName}   type=${attr.AttributeType}` +
        (display ? `   DisplayName="${display}"` : ''),
    );
  }

  console.log('');
  console.log(`   OPTIONAL (${optional.length}):  …not printed individually.`);
  console.log('     Run again against this table after the operator has the');
  console.log('     required-column list captured if you also need the optional set.');

  console.log('');
  console.log('Summary:');
  console.log(`   total attributes:       ${(t.Attributes ?? []).length}`);
  console.log(`   required for create:    ${required.length}`);
  console.log(`   recommended:            ${recommended.length}`);
  console.log(`   optional:               ${optional.length}`);
  console.log('');
  console.log(
    'Read-only inspection. No write of any kind has been issued against this env.',
  );
  return { ok: true, table: t, required, recommended, optional };
}

// ---------------------------------------------------------------------------
// Phase 122E Pt 1 — targeted attribute inspection (--inspect-attributes).
//
// --inspect-table prints a table's columns grouped by RequiredLevel
// (REQUIRED FOR CREATE / RECOMMENDED / OPTIONAL). For Phase 122E the
// final three cockpit-missing fields are OPTIONAL reference lookups
// on cr664_loandeal:
//
//   cr664_producttypereference
//   cr664_loanstructuretypereference
//   cr664_pricingtypereference
//
// Optional columns are not detail-printed by --inspect-table (their
// lookup Targets + per-target required columns are not surfaced). To
// design a seed for those references we need the full picture per
// attribute — what entity each lookup points at, what columns each
// target table requires on create, and (for any nested picklist)
// what OptionSet values are valid.
//
// This mode walks one level deep: for each operator-supplied
// <table>.<attribute>, GETs the parent table + the attribute, and —
// if the attribute is a Lookup — GETs each Targets[] table's
// REQUIRED FOR CREATE column set with Lookup Targets + Picklist
// OptionSets inlined. Read-only Web API GETs; no PATCH / POST /
// DELETE / pac shellout / bypass headers.
// ---------------------------------------------------------------------------

async function runInspectAttributes(items, token, envUrl) {
  console.log('');
  console.log(
    'Phase A — Targeted attribute inspection (Web API metadata, read-only)',
  );
  console.log(`   Items: ${items.length}`);
  console.log('');

  for (const { table, attribute } of items) {
    console.log('='.repeat(72));
    console.log(`-- ${table}.${attribute}`);
    console.log('='.repeat(72));

    const tableMeta = await getTableMetadata(table, token, envUrl);
    if (!tableMeta.ok) {
      console.log(`   ✗ Could not fetch table metadata: ${tableMeta.error}`);
      console.log('');
      continue;
    }
    const t = tableMeta.table;
    const attr = (t.Attributes ?? []).find(
      (a) =>
        typeof a.LogicalName === 'string' &&
        a.LogicalName.toLowerCase() === attribute,
    );
    if (!attr) {
      console.log(`   ✗ Attribute "${attribute}" not found on table "${table}".`);
      console.log('');
      continue;
    }

    console.log(`   Table LogicalName:     ${t.LogicalName}`);
    console.log(`   Attribute LogicalName: ${attr.LogicalName}`);
    console.log(`   SchemaName:            ${attr.SchemaName}`);
    console.log(`   AttributeType:         ${attr.AttributeType}`);
    console.log(
      `   DisplayName:           ${localizedDisplayName(attr.DisplayName) ?? '(none)'}`,
    );
    console.log(
      `   RequiredLevel:         ${attr.RequiredLevel?.Value ?? 'None'}`,
    );
    console.log(`   IsCustomAttribute:     ${attr.IsCustomAttribute}`);
    console.log('');

    if (attr.AttributeType === 'Lookup' || attr.AttributeType === 'Customer') {
      const lookupRes = await getLookupTargetsForAttribute(
        table,
        attribute,
        token,
        envUrl,
      );
      if (!lookupRes.ok) {
        console.log(`   ✗ Could not fetch lookup targets: ${lookupRes.error}`);
        console.log('');
        continue;
      }
      console.log(`   Lookup Targets[]:      ${JSON.stringify(lookupRes.targets)}`);
      console.log('');

      for (const targetTable of lookupRes.targets) {
        console.log(`   --- target table: ${targetTable} ---`);
        const targetMeta = await getTableMetadata(targetTable, token, envUrl);
        if (!targetMeta.ok) {
          console.log(
            `       ✗ Could not fetch target metadata: ${targetMeta.error}`,
          );
          console.log('');
          continue;
        }
        const tt = targetMeta.table;
        console.log(`       LogicalName:           ${tt.LogicalName}`);
        console.log(`       EntitySetName:         ${tt.EntitySetName}`);
        console.log(`       PrimaryNameAttribute:  ${tt.PrimaryNameAttribute}`);
        console.log(`       PrimaryIdAttribute:    ${tt.PrimaryIdAttribute}`);
        console.log(`       IsCustomEntity:        ${tt.IsCustomEntity}`);
        console.log(
          `       DisplayName:           ${localizedDisplayName(tt.DisplayName) ?? '(none)'}`,
        );
        console.log('');

        // REQUIRED FOR CREATE on the target table.
        const required = [];
        for (const a of tt.Attributes ?? []) {
          if (!a.IsValidForCreate) continue;
          const lvl = a.RequiredLevel?.Value ?? 'None';
          if (lvl === 'SystemRequired' || lvl === 'ApplicationRequired') {
            required.push(a);
          }
        }
        required.sort((a, b) => a.LogicalName.localeCompare(b.LogicalName));

        console.log(
          `       REQUIRED FOR CREATE on ${tt.LogicalName} (${required.length}):`,
        );
        for (const ra of required) {
          const lvl = ra.RequiredLevel?.Value ?? 'None';
          const display = localizedDisplayName(ra.DisplayName);
          console.log(
            `         - ${ra.LogicalName}   type=${ra.AttributeType}   ` +
              `RequiredLevel=${lvl}   IsCustom=${ra.IsCustomAttribute}` +
              (display ? `   DisplayName="${display}"` : ''),
          );
          if (ra.AttributeType === 'Lookup' || ra.AttributeType === 'Customer') {
            const nestedLookup = await getLookupTargetsForAttribute(
              tt.LogicalName,
              ra.LogicalName,
              token,
              envUrl,
            );
            if (nestedLookup.ok) {
              console.log(
                `             Lookup Targets: ${JSON.stringify(nestedLookup.targets)}`,
              );
            } else {
              console.log(
                `             (could not fetch nested lookup targets: ${nestedLookup.error})`,
              );
            }
          } else if (ra.AttributeType === 'Picklist') {
            const choice = await getPicklistOptionsForAttribute(
              tt.LogicalName,
              ra.LogicalName,
              token,
              envUrl,
            );
            if (choice.ok) {
              console.log(`             OptionSet (${choice.options.length}):`);
              for (const o of choice.options) {
                console.log(
                  `               ${o.value} → ${o.label ?? '(no label)'}`,
                );
              }
            } else {
              console.log(
                `             (could not fetch nested OptionSet: ${choice.error})`,
              );
            }
          }
        }
        console.log('');
      }
    } else if (attr.AttributeType === 'Picklist') {
      const choice = await getPicklistOptionsForAttribute(
        table,
        attribute,
        token,
        envUrl,
      );
      if (!choice.ok) {
        console.log(`   ✗ Could not fetch OptionSet: ${choice.error}`);
        console.log('');
        continue;
      }
      console.log(`   OptionSet (${choice.options.length} options):`);
      for (const o of choice.options) {
        console.log(`     ${o.value} → ${o.label ?? '(no label)'}`);
      }
      console.log('');
    } else {
      console.log(
        `   (no per-type detail to print for AttributeType=${attr.AttributeType} — it is neither a Lookup nor a Picklist.)`,
      );
      console.log('');
    }
  }

  console.log(
    'Read-only attribute inspection complete. No write of any kind issued.',
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 122D Pt 2 — guarded TEST Client / Relationship seed.
//
// Loan Deal.cr664_Client points at cr664_clientrelationship. The Pt 1
// audit confirmed the table's required columns are:
//   cr664_clientname        String     ApplicationRequired
//   cr664_borrowertype      Picklist   ApplicationRequired
// plus system-managed cr664_clientrelationshipid / ownerid / owneridtype.
//
// This mode:
//   1. Resolves the target Loan Deal by primary name (cr664_dealname).
//   2. Resolves the target Client / Relationship by primary name
//      (cr664_clientname). If found, reuse. If not, plan a POST that
//      creates it with the operator-supplied client name + borrower
//      type integer.
//   3. If the deal's _cr664_client_value already equals the resolved
//      client id, the run is a no-op success — idempotent.
//   4. Otherwise: dry-run prints the planned actions and exits.
//      Commit mode (--commit-seed-client) executes the POST (if
//      needed) and PATCHes the deal's cr664_Client@odata.bind. After
//      writing it re-reads the deal and verifies the link.
//
// Hard safety: dry-run by default; --commit-seed-client required for
// any write. The PATCH body sets ONLY cr664_Client@odata.bind — no
// other column is touched, so Product Type / Loan Structure / Pricing
// Type stay legitimately blank.
// ---------------------------------------------------------------------------

function odataEscapeStringLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function fetchODataList(url, token) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, records: Array.isArray(json.value) ? json.value : [] };
  } catch (err) {
    return { ok: false, error: `network error: ${err.message}` };
  }
}

async function findLoanDealByName(dealName, token, envUrl) {
  const filter =
    `cr664_dealname eq '${odataEscapeStringLiteral(dealName)}'`;
  const select =
    'cr664_loandealid,cr664_dealname,_cr664_client_value';
  const url =
    `${envUrl}/api/data/v9.2/cr664_loandeals` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function findClientRelationshipByName(clientName, token, envUrl) {
  const filter =
    `cr664_clientname eq '${odataEscapeStringLiteral(clientName)}'`;
  const select =
    'cr664_clientrelationshipid,cr664_clientname,cr664_borrowertype';
  const url =
    `${envUrl}/api/data/v9.2/cr664_clientrelationships` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function createClientRelationship(clientName, borrowerType, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/cr664_clientrelationships`;
  const body = {
    cr664_clientname: clientName,
    cr664_borrowertype: borrowerType,
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Ask Dataverse to return the created row so we can pluck the
        // primary id without a follow-up GET.
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `POST cr664_clientrelationships → ${res.status}: ${text}` };
    }
    const json = await res.json();
    if (!json.cr664_clientrelationshipid) {
      return {
        ok: false,
        error: 'POST succeeded but response is missing cr664_clientrelationshipid',
      };
    }
    return { ok: true, id: json.cr664_clientrelationshipid, record: json };
  } catch (err) {
    return { ok: false, error: `POST network error: ${err.message}` };
  }
}

async function patchLoanDealClient(dealId, clientId, token, envUrl) {
  // PATCH ONLY cr664_Client@odata.bind. Do NOT include any other
  // column in the body — Phase 122C's loader-side hydration relies on
  // Dataverse returning the existing Product Type / Loan Structure /
  // Pricing Type / etc. unchanged on the next GET.
  const url = `${envUrl}/api/data/v9.2/cr664_loandeals(${dealId})`;
  const body = {
    'cr664_Client@odata.bind': `/cr664_clientrelationships(${clientId})`,
  };
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `PATCH cr664_loandeals(${dealId}) → ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

async function readLoanDealClientLink(dealId, token, envUrl) {
  // Re-read the deal with annotations so the formatted Client lookup
  // value is available on verify.
  const url =
    `${envUrl}/api/data/v9.2/cr664_loandeals(${dealId})` +
    `?$select=cr664_loandealid,cr664_dealname,_cr664_client_value`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, record: json };
  } catch (err) {
    return { ok: false, error: `re-read network error: ${err.message}` };
  }
}

async function runSeedClientRelationship(
  { dealName, clientName, borrowerType, doCommit },
  token,
  envUrl,
) {
  console.log('');
  console.log('Phase S — TEST Client / Relationship seed');
  console.log(`   Deal name:     ${dealName}`);
  console.log(`   Client name:   ${clientName}`);
  console.log(
    `   Borrower type: ${borrowerType} (${BORROWER_TYPE_LABELS[borrowerType] ?? '(unknown)'})`,
  );
  console.log(
    `   Mode:          ${doCommit ? 'COMMIT-SEED-CLIENT (will write)' : 'dry-run (no write)'}`,
  );
  console.log('');

  // 1. Resolve the deal.
  const dealResult = await findLoanDealByName(dealName, token, envUrl);
  if (!dealResult.ok) {
    bail(`Could not resolve deal "${dealName}": ${dealResult.error}`);
  }
  if (dealResult.records.length === 0) {
    bail(
      `No cr664_loandeals row with cr664_dealname = "${dealName}". ` +
        `Refusing — the script will not invent a deal.`,
    );
  }
  if (dealResult.records.length > 1) {
    bail(
      `${dealResult.records.length} cr664_loandeals rows match cr664_dealname = ` +
        `"${dealName}". Refusing — the operator must pick one explicitly.`,
    );
  }
  const deal = dealResult.records[0];
  console.log(`   ✓ Deal found:    cr664_loandealid=${deal.cr664_loandealid}`);
  console.log(
    `     current cr664_Client lookup value: ${deal._cr664_client_value ?? '(unset)'}`,
  );

  // 2. Resolve (or plan-to-create) the client.
  const clientResult = await findClientRelationshipByName(clientName, token, envUrl);
  if (!clientResult.ok) {
    bail(`Could not resolve client "${clientName}": ${clientResult.error}`);
  }
  if (clientResult.records.length > 1) {
    bail(
      `${clientResult.records.length} cr664_clientrelationships rows match ` +
        `cr664_clientname = "${clientName}". Refusing for safety; ` +
        `the operator must resolve the ambiguity before seeding.`,
    );
  }
  let clientId = null;
  let needCreate = false;
  if (clientResult.records.length === 1) {
    clientId = clientResult.records[0].cr664_clientrelationshipid;
    const existingType = clientResult.records[0].cr664_borrowertype;
    console.log(`   ✓ Client exists: cr664_clientrelationshipid=${clientId}`);
    if (existingType != null && existingType !== borrowerType) {
      console.log(
        `     ⚠ Existing cr664_borrowertype=${existingType} differs from operator-requested ` +
          `${borrowerType}. Reusing the existing row AS-IS — this seed mode does not ` +
          `mutate existing values; an explicit follow-up PATCH would be required.`,
      );
    }
  } else {
    needCreate = true;
    console.log(`   ⚙ Client does not exist — will create on commit.`);
  }

  // 3. Idempotency: if the deal already points to the resolved client, no-op.
  if (clientId && deal._cr664_client_value === clientId) {
    console.log('');
    console.log(
      `   ✓ Already linked: cr664_loandeals(${deal.cr664_loandealid}).cr664_Client → ` +
        `cr664_clientrelationships(${clientId}).`,
    );
    console.log('   No-op success.');
    return { ok: true, alreadyLinked: true, clientId };
  }

  // 4. Plan summary.
  console.log('');
  console.log('   Planned actions:');
  let stepNum = 1;
  if (needCreate) {
    console.log(`     [${stepNum}] POST /api/data/v9.2/cr664_clientrelationships`);
    console.log(
      `         body: { "cr664_clientname": "${clientName}", ` +
        `"cr664_borrowertype": ${borrowerType} }`,
    );
    stepNum += 1;
  }
  console.log(
    `     [${stepNum}] PATCH /api/data/v9.2/cr664_loandeals(${deal.cr664_loandealid})`,
  );
  if (needCreate) {
    console.log(
      `         body: { "cr664_Client@odata.bind": "/cr664_clientrelationships(<newly-created>)" }`,
    );
  } else {
    console.log(
      `         body: { "cr664_Client@odata.bind": "/cr664_clientrelationships(${clientId})" }`,
    );
  }
  console.log(
    '         PATCH body sets ONLY cr664_Client@odata.bind — no other column touched.',
  );

  if (!doCommit) {
    console.log('');
    console.log('   Dry-run only — no POST or PATCH issued.');
    console.log('   Re-run with `--commit-seed-client` to execute the plan above.');
    return { ok: true, planned: true, needCreate, clientId };
  }

  // 5. Commit. Create the client if needed.
  if (needCreate) {
    console.log('');
    console.log(`   ⚙ POST /api/data/v9.2/cr664_clientrelationships …`);
    const createResult = await createClientRelationship(
      clientName,
      borrowerType,
      token,
      envUrl,
    );
    if (!createResult.ok) {
      bail(`Create cr664_clientrelationship failed: ${createResult.error}`);
    }
    clientId = createResult.id;
    console.log(`   ✓ Created cr664_clientrelationshipid=${clientId}`);
  }

  // 6. PATCH the deal.
  console.log(`   ⚙ PATCH cr664_loandeals(${deal.cr664_loandealid}) cr664_Client@odata.bind …`);
  const patchResult = await patchLoanDealClient(
    deal.cr664_loandealid,
    clientId,
    token,
    envUrl,
  );
  if (!patchResult.ok) {
    bail(`PATCH loan deal failed: ${patchResult.error}`);
  }
  console.log('   ✓ PATCH succeeded.');

  // 7. Verify.
  console.log('');
  console.log('   ⚙ Re-reading the deal to verify the new Client lookup …');
  const verifyResult = await readLoanDealClientLink(
    deal.cr664_loandealid,
    token,
    envUrl,
  );
  if (!verifyResult.ok) {
    console.log(`     ⚠ Could not re-read deal: ${verifyResult.error}`);
  } else {
    const verifiedDeal = verifyResult.record;
    const verifiedClient = verifiedDeal._cr664_client_value ?? '(unset)';
    const formatted =
      verifiedDeal[
        '_cr664_client_value@OData.Community.Display.V1.FormattedValue'
      ];
    console.log(`     _cr664_client_value:                       ${verifiedClient}`);
    if (formatted) {
      console.log(`     formatted value (cockpit display):         ${formatted}`);
    }
    if (verifiedDeal._cr664_client_value === clientId) {
      console.log('     ✓ Deal Client lookup is linked to the seeded client.');
    } else {
      console.log(
        '     ⚠ Verification mismatch — re-read shows a different client id ' +
          'than the one the script wrote. Investigate.',
      );
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`   client created:      ${needCreate ? 'yes' : 'no (reused)'}`);
  console.log(`   client id:           ${clientId}`);
  console.log(`   deal id:             ${deal.cr664_loandealid}`);
  console.log(`   deal linked:         yes`);
  console.log('');
  console.log('✓ Seed commit complete.');
  return { ok: true, clientId, needCreate };
}

// ---------------------------------------------------------------------------
// Phase 122E Pt 2 — guarded Product / Loan Structure / Pricing reference seed.
//
// Three optional reference lookups on cr664_loandeal all target the
// SAME table (cr664_producttypereference) per Pt 1's audit:
//
//   cr664_loandeal.cr664_producttypereference        → cr664_producttypereference
//   cr664_loandeal.cr664_loanstructuretypereference  → cr664_producttypereference
//   cr664_loandeal.cr664_pricingtypereference        → cr664_producttypereference
//
// The target table has three ApplicationRequired columns:
//   cr664_name        String   (primary name)
//   cr664_code        String
//   cr664_activeflag  Boolean
//
// This mode resolves-or-creates one row per seed (see
// PRODUCT_REFERENCE_SEEDS above) and PATCHes the deal with up to
// three @odata.bind values. Idempotent at both levels:
//   - Per row: look up by cr664_code first, then by cr664_name. If
//     found, reuse. If duplicates exist by either probe, bail.
//   - Per deal: if all three deal lookups already point at the
//     resolved row ids, no PATCH is sent.
//
// Existing reference rows are NEVER mutated, even if their stored
// activeflag / name / code differs from PRODUCT_REFERENCE_SEEDS.
// The script honors operator state; explicit follow-up PATCHes
// belong to a different mode.
// ---------------------------------------------------------------------------

async function findProductReferenceByCode(code, token, envUrl) {
  const filter = `cr664_code eq '${odataEscapeStringLiteral(code)}'`;
  const select = 'cr664_producttypereferenceid,cr664_name,cr664_code,cr664_activeflag';
  const url =
    `${envUrl}/api/data/v9.2/${PRODUCT_REFERENCE_ENTITY_SET}` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function findProductReferenceByName(name, token, envUrl) {
  const filter = `cr664_name eq '${odataEscapeStringLiteral(name)}'`;
  const select = 'cr664_producttypereferenceid,cr664_name,cr664_code,cr664_activeflag';
  const url =
    `${envUrl}/api/data/v9.2/${PRODUCT_REFERENCE_ENTITY_SET}` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function createProductReference(seedName, seedCode, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/${PRODUCT_REFERENCE_ENTITY_SET}`;
  // POST body contains ONLY the three audit-confirmed required columns.
  // Nothing else — Phase 122E Pt 2 spec.
  const body = {
    cr664_name: seedName,
    cr664_code: seedCode,
    cr664_activeflag: true,
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `POST ${PRODUCT_REFERENCE_ENTITY_SET} → ${res.status}: ${text}`,
      };
    }
    const json = await res.json();
    if (!json.cr664_producttypereferenceid) {
      return {
        ok: false,
        error: 'POST succeeded but response is missing cr664_producttypereferenceid',
      };
    }
    return { ok: true, id: json.cr664_producttypereferenceid, record: json };
  } catch (err) {
    return { ok: false, error: `POST network error: ${err.message}` };
  }
}

async function patchLoanDealProductReferences(dealId, bindPairs, token, envUrl) {
  // bindPairs is a record like:
  //   {
  //     'cr664_ProductTypeReference@odata.bind':       '/cr664_producttypereferences(<id>)',
  //     'cr664_LoanStructureTypeReference@odata.bind': '/cr664_producttypereferences(<id>)',
  //     'cr664_PricingTypeReference@odata.bind':       '/cr664_producttypereferences(<id>)',
  //   }
  // Only the keys that need to change are included by the caller.
  // The body MUST NOT contain anything else — Phase 122E Pt 2 spec
  // forbids touching Client / Stage / Status / Banker / Customer /
  // Industry / Guarantor / Collateral.
  const url = `${envUrl}/api/data/v9.2/cr664_loandeals(${dealId})`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bindPairs),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `PATCH cr664_loandeals(${dealId}) → ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

async function readLoanDealProductReferences(dealId, token, envUrl) {
  const select = [
    'cr664_loandealid',
    'cr664_dealname',
    '_cr664_producttypereference_value',
    '_cr664_loanstructuretypereference_value',
    '_cr664_pricingtypereference_value',
  ].join(',');
  const url =
    `${envUrl}/api/data/v9.2/cr664_loandeals(${dealId})` +
    `?$select=${encodeURIComponent(select)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, record: json };
  } catch (err) {
    return { ok: false, error: `re-read network error: ${err.message}` };
  }
}

/**
 * Resolve one PRODUCT_REFERENCE_SEEDS entry to an existing row id
 * (matched by cr664_code first, then cr664_name) or flag it for
 * creation. Refuses duplicate matches by either probe as ambiguous.
 */
async function resolveProductReference(seed, token, envUrl) {
  const byCode = await findProductReferenceByCode(seed.code, token, envUrl);
  if (!byCode.ok) return { ok: false, error: byCode.error };
  if (byCode.records.length > 1) {
    return {
      ok: false,
      error:
        `${byCode.records.length} ${PRODUCT_REFERENCE_ENTITY_SET} rows match ` +
        `cr664_code = "${seed.code}". Refusing as ambiguous.`,
    };
  }
  if (byCode.records.length === 1) {
    return {
      ok: true,
      found: true,
      source: 'code',
      id: byCode.records[0].cr664_producttypereferenceid,
      record: byCode.records[0],
    };
  }

  const byName = await findProductReferenceByName(seed.name, token, envUrl);
  if (!byName.ok) return { ok: false, error: byName.error };
  if (byName.records.length > 1) {
    return {
      ok: false,
      error:
        `${byName.records.length} ${PRODUCT_REFERENCE_ENTITY_SET} rows match ` +
        `cr664_name = "${seed.name}". Refusing as ambiguous.`,
    };
  }
  if (byName.records.length === 1) {
    return {
      ok: true,
      found: true,
      source: 'name',
      id: byName.records[0].cr664_producttypereferenceid,
      record: byName.records[0],
    };
  }

  return { ok: true, found: false, source: 'none' };
}

async function runSeedProductReferences({ dealName, doCommit }, token, envUrl) {
  console.log('');
  console.log('Phase P — Product / Loan Structure / Pricing reference seed');
  console.log(`   Deal name:   ${dealName}`);
  console.log(`   Target table: ${PRODUCT_REFERENCE_TABLE_LOGICAL}`);
  console.log(
    `   Mode:        ${doCommit ? 'COMMIT-SEED-PRODUCT-REFERENCES (will write)' : 'dry-run (no write)'}`,
  );
  console.log('');

  // 1. Resolve the deal.
  const dealResult = await findLoanDealByName(dealName, token, envUrl);
  if (!dealResult.ok) {
    bail(`Could not resolve deal "${dealName}": ${dealResult.error}`);
  }
  if (dealResult.records.length === 0) {
    bail(
      `No cr664_loandeals row with cr664_dealname = "${dealName}". ` +
        `Refusing — the script will not invent a deal.`,
    );
  }
  if (dealResult.records.length > 1) {
    bail(
      `${dealResult.records.length} cr664_loandeals rows match cr664_dealname = ` +
        `"${dealName}". Refusing — the operator must pick one explicitly.`,
    );
  }
  const deal = dealResult.records[0];
  const dealId = deal.cr664_loandealid;
  console.log(`   ✓ Deal found: cr664_loandealid=${dealId}`);

  // Re-read the deal so we know the CURRENT lookup state per field —
  // findLoanDealByName only selects _cr664_client_value, which is
  // useful for Phase 122D but not Phase 122E. The single GET below
  // covers all three product-reference FKs in one round trip.
  const currentRead = await readLoanDealProductReferences(dealId, token, envUrl);
  if (!currentRead.ok) {
    bail(`Could not re-read deal for product-reference state: ${currentRead.error}`);
  }
  const currentDeal = currentRead.record;
  console.log(`   Current Loan Deal product-reference state:`);
  console.log(
    `     _cr664_producttypereference_value:        ${currentDeal._cr664_producttypereference_value ?? '(unset)'}`,
  );
  console.log(
    `     _cr664_loanstructuretypereference_value:  ${currentDeal._cr664_loanstructuretypereference_value ?? '(unset)'}`,
  );
  console.log(
    `     _cr664_pricingtypereference_value:        ${currentDeal._cr664_pricingtypereference_value ?? '(unset)'}`,
  );
  console.log('');

  // 2. Resolve each seed row.
  const seedEntries = [
    {
      ...PRODUCT_REFERENCE_SEEDS.productType,
      currentFkKey: '_cr664_producttypereference_value',
    },
    {
      ...PRODUCT_REFERENCE_SEEDS.loanStructure,
      currentFkKey: '_cr664_loanstructuretypereference_value',
    },
    {
      ...PRODUCT_REFERENCE_SEEDS.pricingType,
      currentFkKey: '_cr664_pricingtypereference_value',
    },
  ];

  console.log('   Per-seed resolution:');
  const resolved = [];
  for (const seed of seedEntries) {
    const res = await resolveProductReference(seed, token, envUrl);
    if (!res.ok) bail(`Resolve "${seed.code}" failed: ${res.error}`);
    if (res.found) {
      console.log(
        `     ✓ ${seed.label}: reusing existing row matched by ${res.source}` +
          ` (cr664_producttypereferenceid=${res.id})`,
      );
      const existingActive = res.record?.cr664_activeflag;
      const existingName = res.record?.cr664_name;
      const existingCode = res.record?.cr664_code;
      if (existingActive === false) {
        console.log(
          `         ⚠ Existing row has cr664_activeflag=false; reusing AS-IS (no mutation).`,
        );
      }
      if (existingName !== seed.name || existingCode !== seed.code) {
        console.log(
          `         ⚠ Existing row name/code differs from seed (` +
            `name="${existingName}", code="${existingCode}"). ` +
            `Reusing AS-IS (no mutation).`,
        );
      }
    } else {
      console.log(
        `     ⚙ ${seed.label}: no existing row found — will create on commit ` +
          `(cr664_name="${seed.name}", cr664_code="${seed.code}", cr664_activeflag=true)`,
      );
    }
    resolved.push({ seed, ...res });
  }
  console.log('');

  // 3. Idempotency: build the diff between current FK values and
  //    resolved (existing or to-be-created) ids. For not-yet-created
  //    rows the id will be filled in during commit; for the dry-run
  //    diff we mark them as "<new>".
  const linkPlan = [];
  for (const r of resolved) {
    const currentFk = currentDeal[r.seed.currentFkKey] ?? null;
    const desiredId = r.found ? r.id : '<new>';
    const needsLink = r.found ? currentFk !== r.id : true;
    linkPlan.push({
      seed: r.seed,
      currentFk,
      desiredId,
      needsLink,
      resolved: r,
    });
  }
  const anyNeedsLink = linkPlan.some((p) => p.needsLink);
  const anyNeedsCreate = resolved.some((r) => !r.found);

  console.log('   Link diff (current → desired):');
  for (const p of linkPlan) {
    const arrow = p.needsLink ? '→' : '=';
    console.log(
      `     ${p.needsLink ? '⚙' : '✓'} ${p.seed.label.padEnd(18)}` +
        ` ${String(p.currentFk ?? '(unset)').padEnd(38)} ${arrow} ${p.desiredId}`,
    );
  }
  console.log('');

  if (!anyNeedsCreate && !anyNeedsLink) {
    console.log(
      '   ✓ All three product-reference lookups already point at the resolved rows.',
    );
    console.log('   No-op success.');
    return { ok: true, alreadyLinked: true };
  }

  // 4. Plan summary.
  console.log('   Planned actions:');
  let stepNum = 1;
  for (const r of resolved) {
    if (!r.found) {
      console.log(
        `     [${stepNum}] POST /api/data/v9.2/${PRODUCT_REFERENCE_ENTITY_SET}`,
      );
      console.log(
        `         body: { "cr664_name": "${r.seed.name}", ` +
          `"cr664_code": "${r.seed.code}", "cr664_activeflag": true }`,
      );
      stepNum += 1;
    }
  }
  if (anyNeedsLink) {
    console.log(
      `     [${stepNum}] PATCH /api/data/v9.2/cr664_loandeals(${dealId})`,
    );
    console.log('         body keys (only differing binds are sent):');
    for (const p of linkPlan) {
      if (!p.needsLink) continue;
      const targetId = p.resolved.found ? p.resolved.id : '<newly-created>';
      console.log(
        `           "${p.seed.bind}": ` +
          `"/${PRODUCT_REFERENCE_ENTITY_SET}(${targetId})"`,
      );
    }
    console.log(
      '         PATCH body sets ONLY the three product-reference binds — no other column.',
    );
  }

  if (!doCommit) {
    console.log('');
    console.log('   Dry-run only — no POST or PATCH issued.');
    console.log('   Re-run with `--commit-seed-product-references` to execute the plan above.');
    return { ok: true, planned: true, needCreate: anyNeedsCreate, needLink: anyNeedsLink };
  }

  // 5. Commit. Create missing rows.
  for (const r of resolved) {
    if (r.found) continue;
    console.log('');
    console.log(
      `   ⚙ POST /api/data/v9.2/${PRODUCT_REFERENCE_ENTITY_SET} (${r.seed.label}) …`,
    );
    const createResult = await createProductReference(
      r.seed.name,
      r.seed.code,
      token,
      envUrl,
    );
    if (!createResult.ok) bail(`Create "${r.seed.code}" failed: ${createResult.error}`);
    r.id = createResult.id;
    r.found = true;
    r.source = 'created';
    console.log(`   ✓ Created cr664_producttypereferenceid=${r.id}`);
  }

  // 6. Build PATCH body containing only the differing binds.
  const bindBody = {};
  for (const p of linkPlan) {
    if (!p.needsLink) continue;
    const targetId = p.resolved.id;
    bindBody[p.seed.bind] = `/${PRODUCT_REFERENCE_ENTITY_SET}(${targetId})`;
  }
  if (Object.keys(bindBody).length > 0) {
    console.log('');
    console.log(`   ⚙ PATCH cr664_loandeals(${dealId}) …`);
    const patchResult = await patchLoanDealProductReferences(
      dealId,
      bindBody,
      token,
      envUrl,
    );
    if (!patchResult.ok) {
      bail(`PATCH loan deal failed: ${patchResult.error}`);
    }
    console.log('   ✓ PATCH succeeded.');
  } else {
    console.log('   (no PATCH needed — existing links already match the resolved ids.)');
  }

  // 7. Verify.
  console.log('');
  console.log('   ⚙ Re-reading the deal to verify the three lookups …');
  const verifyResult = await readLoanDealProductReferences(dealId, token, envUrl);
  if (!verifyResult.ok) {
    console.log(`     ⚠ Could not re-read deal: ${verifyResult.error}`);
  } else {
    const v = verifyResult.record;
    for (const p of linkPlan) {
      const verifiedId = v[p.seed.currentFkKey];
      const formatted =
        v[`${p.seed.currentFkKey}@OData.Community.Display.V1.FormattedValue`];
      console.log(`     ${p.seed.label}:`);
      console.log(`       FK value:      ${verifiedId ?? '(unset!)'}`);
      console.log(`       formatted:     ${formatted ?? '(no formatted value)'}`);
      const expectedId = p.resolved.id;
      if (verifiedId === expectedId) {
        console.log('       ✓ link verified.');
      } else {
        console.log(
          '       ⚠ verification mismatch — re-read shows a different id ' +
            'than the one the script wrote.',
        );
      }
    }
  }

  console.log('');
  console.log('Summary:');
  for (const r of resolved) {
    const action =
      r.source === 'created'
        ? 'created'
        : r.source === 'code'
          ? 'reused (matched by code)'
          : r.source === 'name'
            ? 'reused (matched by name)'
            : 'unknown';
    console.log(`   ${r.seed.label.padEnd(18)} ${action}  id=${r.id}`);
  }
  console.log('');
  console.log('✓ Product-references seed commit complete.');
  return { ok: true, resolved };
}

function countNonNull(table, attribute) {
  const xml = `<fetch count='10' returntotalrecordcount='true'><entity name='${table}'><attribute name='${table}id'/><attribute name='${attribute}'/><filter><condition attribute='${attribute}' operator='not-null'/></filter></entity></fetch>`;
  const r = fetchXml(xml);
  if (!r.ok) return { ok: false, error: r.error };
  // pac env fetch table output: count rows by counting data lines.
  // First two lines are header + separator; data starts on line 3 of the
  // post-"Connected" output. If "No results returned." appears, count = 0.
  const data = r.raw;
  if (/No results returned\./.test(data)) return { ok: true, count: 0 };
  const lines = data
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith('Connected'));
  // Subtract 1 for the column-header row.
  const count = Math.max(0, lines.length - 1);
  return { ok: true, count };
}

// ---------------------------------------------------------------------------
// Phase 124D — guarded TEST manager-entitlement seed.
//
// Bridges the Phase 124C workspace switcher to a live entitlement
// path for one specified UPN. `loadManagerIdentity(upn)` returns
// `kind: 'ready'` only when:
//   1. cr664_banker row exists where cr664_email = upn
//   2. that Banker has _cr664_team_value populated
// Manager data is then team-scoped: cr664_loandeal._cr664_team_value
// must equal the same team for the deal to appear on the manager's
// surface.
//
// This mode:
//   - resolves Banker by cr664_email = --upn (bails on 0 or >1)
//   - resolves Team by cr664_teamname = --team-name (creates on
//     commit when missing; bails on >1)
//   - resolves Loan Deal by cr664_dealname = --deal-name (bails on
//     0 or >1)
//   - PATCHes the Banker with ONLY cr664_Team@odata.bind
//   - PATCHes the Loan Deal with ONLY cr664_Team@odata.bind
//   - re-reads both with formatted-value annotation to verify
//
// Idempotency:
//   - existing Banker / Team / Loan Deal rows are NEVER mutated
//     beyond the single cr664_Team relationship
//   - if Banker and Loan Deal already point at the resolved Team id,
//     no PATCH is issued (no-op success)
//   - existing Team rows are never modified, even if their
//     cr664_description / statecode etc. differ from a "fresh" create
//
// Safety:
//   - dry-run default; writes require --commit-seed-manager-entitlement
//   - PATCH body shapes contain ONLY cr664_Team@odata.bind
//   - no bypass / suppress / force headers anywhere
//   - duplicates bail explicitly with a hand-fix message
// ---------------------------------------------------------------------------

async function findBankerByEmail(upn, token, envUrl) {
  const filter = `cr664_email eq '${odataEscapeStringLiteral(upn)}'`;
  const select =
    'cr664_bankerid,cr664_fullname,cr664_email,_cr664_team_value';
  const url =
    `${envUrl}/api/data/v9.2/cr664_bankers` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function findTeamByName(teamName, token, envUrl) {
  const filter = `cr664_teamname eq '${odataEscapeStringLiteral(teamName)}'`;
  const select = 'cr664_teamid,cr664_teamname';
  const url =
    `${envUrl}/api/data/v9.2/cr664_teams` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function createTeam(teamName, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/cr664_teams`;
  // ONLY the primary name. Description / statecode / statuscode are
  // intentionally omitted — Dataverse applies its own defaults
  // (statecode=0 Active, statuscode=1 Active, owner = calling user).
  // Adding any other field here would constitute schema drift the
  // operator did not request.
  const body = { cr664_teamname: teamName };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Ask Dataverse to return the created row so we can pluck the
        // primary id without a follow-up GET.
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `POST cr664_teams → ${res.status}: ${text}` };
    }
    const json = await res.json();
    if (!json.cr664_teamid) {
      return {
        ok: false,
        error: 'POST succeeded but response is missing cr664_teamid',
      };
    }
    return { ok: true, id: json.cr664_teamid, record: json };
  } catch (err) {
    return { ok: false, error: `POST network error: ${err.message}` };
  }
}

async function patchBankerTeam(bankerId, teamId, token, envUrl) {
  // PATCH ONLY cr664_Team@odata.bind. Do NOT include any other
  // column in the body — the script must not mutate fullname, email,
  // role type, team-name denorm, or any other Banker attribute.
  const url = `${envUrl}/api/data/v9.2/cr664_bankers(${bankerId})`;
  const body = {
    'cr664_Team@odata.bind': `/cr664_teams(${teamId})`,
  };
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `PATCH cr664_bankers(${bankerId}) → ${res.status}: ${text}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

async function patchLoanDealTeam(dealId, teamId, token, envUrl) {
  // PATCH ONLY cr664_Team@odata.bind. Do NOT include Client /
  // Product Type / Stage / Status / Banker / Amount / etc. The
  // Phase 122C loader-side hydration depends on Dataverse returning
  // every other column unchanged on the next GET.
  const url = `${envUrl}/api/data/v9.2/cr664_loandeals(${dealId})`;
  const body = {
    'cr664_Team@odata.bind': `/cr664_teams(${teamId})`,
  };
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `PATCH cr664_loandeals(${dealId}) → ${res.status}: ${text}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

async function readBankerTeamLink(bankerId, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/cr664_bankers(${bankerId})` +
    `?$select=cr664_bankerid,cr664_fullname,cr664_email,_cr664_team_value`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        Prefer:
          'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, record: json };
  } catch (err) {
    return { ok: false, error: `re-read network error: ${err.message}` };
  }
}

async function readLoanDealTeamLink(dealId, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/cr664_loandeals(${dealId})` +
    `?$select=cr664_loandealid,cr664_dealname,_cr664_team_value`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        Prefer:
          'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, record: json };
  } catch (err) {
    return { ok: false, error: `re-read network error: ${err.message}` };
  }
}

async function runSeedManagerEntitlement(
  { upn, teamName, dealName, doCommit },
  token,
  envUrl,
) {
  console.log('');
  console.log('Phase M — TEST manager-entitlement seed');
  console.log(`   UPN:           ${upn}`);
  console.log(`   Team name:     ${teamName}`);
  console.log(`   Deal name:     ${dealName}`);
  console.log(
    `   Mode:          ${
      doCommit
        ? 'COMMIT-SEED-MANAGER-ENTITLEMENT (will write)'
        : 'dry-run (no write)'
    }`,
  );
  console.log('');

  // 1. Resolve the banker.
  const bankerResult = await findBankerByEmail(upn, token, envUrl);
  if (!bankerResult.ok) {
    bail(`Could not resolve banker by upn "${upn}": ${bankerResult.error}`);
  }
  if (bankerResult.records.length === 0) {
    bail(
      `No cr664_banker row with cr664_email = "${upn}". Refusing — the ` +
        `script will not auto-create a banker row. Provision the banker ` +
        `via the Maker Portal (or a dedicated banker-seed mode in a ` +
        `follow-up phase) before re-running this mode.`,
    );
  }
  if (bankerResult.records.length > 1) {
    bail(
      `${bankerResult.records.length} cr664_banker rows match cr664_email = ` +
        `"${upn}". Refusing — the operator must resolve the ambiguity ` +
        `before seeding.`,
    );
  }
  const banker = bankerResult.records[0];
  console.log(`   ✓ Banker found:   cr664_bankerid=${banker.cr664_bankerid}`);
  console.log(
    `     current cr664_Team lookup value: ${banker._cr664_team_value ?? '(unset)'}`,
  );

  // 2. Resolve (or plan-to-create) the team.
  const teamResult = await findTeamByName(teamName, token, envUrl);
  if (!teamResult.ok) {
    bail(`Could not resolve team "${teamName}": ${teamResult.error}`);
  }
  if (teamResult.records.length > 1) {
    bail(
      `${teamResult.records.length} cr664_teams rows match cr664_teamname = ` +
        `"${teamName}". Refusing — the operator must resolve the ambiguity ` +
        `before seeding.`,
    );
  }
  let teamId = null;
  let needCreateTeam = false;
  if (teamResult.records.length === 1) {
    teamId = teamResult.records[0].cr664_teamid;
    console.log(`   ✓ Team exists:    cr664_teamid=${teamId}`);
  } else {
    needCreateTeam = true;
    console.log(
      `   ⚙ Team does not exist — will create on commit (POST cr664_teams ` +
        `with only cr664_teamname).`,
    );
  }

  // 3. Resolve the deal.
  const dealResult = await findLoanDealByName(dealName, token, envUrl);
  if (!dealResult.ok) {
    bail(`Could not resolve deal "${dealName}": ${dealResult.error}`);
  }
  if (dealResult.records.length === 0) {
    bail(
      `No cr664_loandeals row with cr664_dealname = "${dealName}". ` +
        `Refusing — the script will not invent a deal.`,
    );
  }
  if (dealResult.records.length > 1) {
    bail(
      `${dealResult.records.length} cr664_loandeals rows match ` +
        `cr664_dealname = "${dealName}". Refusing — the operator must ` +
        `pick one explicitly.`,
    );
  }
  // Re-read with the _cr664_team_value column. findLoanDealByName's
  // SELECT does not currently include it, so probe with a quick
  // second GET.
  const dealLinkResult = await readLoanDealTeamLink(
    dealResult.records[0].cr664_loandealid,
    token,
    envUrl,
  );
  if (!dealLinkResult.ok) {
    bail(`Could not re-read deal team link: ${dealLinkResult.error}`);
  }
  const deal = dealLinkResult.record;
  console.log(`   ✓ Deal found:     cr664_loandealid=${deal.cr664_loandealid}`);
  console.log(
    `     current cr664_Team lookup value: ${deal._cr664_team_value ?? '(unset)'}`,
  );

  // 4. Idempotency: if both Banker and Loan Deal already point at the
  //    resolved Team id, no PATCH is needed.
  const bankerAlreadyLinked =
    teamId != null && banker._cr664_team_value === teamId;
  const dealAlreadyLinked =
    teamId != null && deal._cr664_team_value === teamId;
  if (bankerAlreadyLinked && dealAlreadyLinked) {
    console.log('');
    console.log(
      `   ✓ Already linked: cr664_bankers(${banker.cr664_bankerid}).cr664_Team and ` +
        `cr664_loandeals(${deal.cr664_loandealid}).cr664_Team both point at ` +
        `cr664_teams(${teamId}).`,
    );
    console.log('   No-op success.');
    return { ok: true, alreadyLinked: true, teamId };
  }

  // 5. Plan summary.
  console.log('');
  console.log('   Planned actions:');
  let stepNum = 1;
  if (needCreateTeam) {
    console.log(`     [${stepNum}] POST /api/data/v9.2/cr664_teams`);
    console.log(`         body: { "cr664_teamname": "${teamName}" }`);
    stepNum += 1;
  }
  if (!bankerAlreadyLinked) {
    console.log(
      `     [${stepNum}] PATCH /api/data/v9.2/cr664_bankers(${banker.cr664_bankerid})`,
    );
    if (needCreateTeam) {
      console.log(
        `         body: { "cr664_Team@odata.bind": "/cr664_teams(<newly-created>)" }`,
      );
    } else {
      console.log(
        `         body: { "cr664_Team@odata.bind": "/cr664_teams(${teamId})" }`,
      );
    }
    console.log(
      '         PATCH body sets ONLY cr664_Team@odata.bind — no other column touched.',
    );
    stepNum += 1;
  }
  if (!dealAlreadyLinked) {
    console.log(
      `     [${stepNum}] PATCH /api/data/v9.2/cr664_loandeals(${deal.cr664_loandealid})`,
    );
    if (needCreateTeam) {
      console.log(
        `         body: { "cr664_Team@odata.bind": "/cr664_teams(<newly-created>)" }`,
      );
    } else {
      console.log(
        `         body: { "cr664_Team@odata.bind": "/cr664_teams(${teamId})" }`,
      );
    }
    console.log(
      '         PATCH body sets ONLY cr664_Team@odata.bind — no other column touched.',
    );
  }

  if (!doCommit) {
    console.log('');
    console.log('   Dry-run only — no POST or PATCH issued.');
    console.log(
      '   Re-run with `--commit-seed-manager-entitlement` to execute the plan above.',
    );
    return {
      ok: true,
      planned: true,
      needCreateTeam,
      teamId,
      bankerId: banker.cr664_bankerid,
      dealId: deal.cr664_loandealid,
    };
  }

  // 6. Commit. Create the team if needed.
  if (needCreateTeam) {
    console.log('');
    console.log(`   ⚙ POST /api/data/v9.2/cr664_teams …`);
    const createResult = await createTeam(teamName, token, envUrl);
    if (!createResult.ok) {
      bail(`Create cr664_team failed: ${createResult.error}`);
    }
    teamId = createResult.id;
    console.log(`   ✓ Created cr664_teamid=${teamId}`);
  }

  // 7. PATCH the banker (if not already linked).
  if (!bankerAlreadyLinked) {
    console.log(
      `   ⚙ PATCH cr664_bankers(${banker.cr664_bankerid}) cr664_Team@odata.bind …`,
    );
    const patchBankerResult = await patchBankerTeam(
      banker.cr664_bankerid,
      teamId,
      token,
      envUrl,
    );
    if (!patchBankerResult.ok) {
      bail(`PATCH banker failed: ${patchBankerResult.error}`);
    }
    console.log('   ✓ Banker PATCH succeeded.');
  }

  // 8. PATCH the deal (if not already linked).
  if (!dealAlreadyLinked) {
    console.log(
      `   ⚙ PATCH cr664_loandeals(${deal.cr664_loandealid}) cr664_Team@odata.bind …`,
    );
    const patchDealResult = await patchLoanDealTeam(
      deal.cr664_loandealid,
      teamId,
      token,
      envUrl,
    );
    if (!patchDealResult.ok) {
      bail(`PATCH loan deal failed: ${patchDealResult.error}`);
    }
    console.log('   ✓ Deal PATCH succeeded.');
  }

  // 9. Verify both rows.
  console.log('');
  console.log('   ⚙ Re-reading the banker to verify the new Team lookup …');
  const verifyBanker = await readBankerTeamLink(
    banker.cr664_bankerid,
    token,
    envUrl,
  );
  if (!verifyBanker.ok) {
    console.log(`     ⚠ Could not re-read banker: ${verifyBanker.error}`);
  } else {
    const b = verifyBanker.record;
    const bTeam = b._cr664_team_value ?? '(unset)';
    const bFormatted =
      b['_cr664_team_value@OData.Community.Display.V1.FormattedValue'];
    console.log(`     banker _cr664_team_value:                  ${bTeam}`);
    if (bFormatted) {
      console.log(`     banker team formatted value:               ${bFormatted}`);
    }
    if (b._cr664_team_value === teamId) {
      console.log('     ✓ Banker Team lookup is linked to the seeded team.');
    } else {
      console.log(
        '     ⚠ Verification mismatch — re-read shows a different team id ' +
          'than the one the script wrote. Investigate.',
      );
    }
  }

  console.log('   ⚙ Re-reading the deal to verify the new Team lookup …');
  const verifyDeal = await readLoanDealTeamLink(
    deal.cr664_loandealid,
    token,
    envUrl,
  );
  if (!verifyDeal.ok) {
    console.log(`     ⚠ Could not re-read deal: ${verifyDeal.error}`);
  } else {
    const d = verifyDeal.record;
    const dTeam = d._cr664_team_value ?? '(unset)';
    const dFormatted =
      d['_cr664_team_value@OData.Community.Display.V1.FormattedValue'];
    console.log(`     deal _cr664_team_value:                    ${dTeam}`);
    if (dFormatted) {
      console.log(`     deal team formatted value:                 ${dFormatted}`);
    }
    if (d._cr664_team_value === teamId) {
      console.log('     ✓ Deal Team lookup is linked to the seeded team.');
    } else {
      console.log(
        '     ⚠ Verification mismatch — re-read shows a different team id ' +
          'than the one the script wrote. Investigate.',
      );
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`   team created:   ${needCreateTeam ? 'yes' : 'no (reused)'}`);
  console.log(`   team id:        ${teamId}`);
  console.log(`   banker id:      ${banker.cr664_bankerid}`);
  console.log(`   banker linked:  ${bankerAlreadyLinked ? 'already' : 'now linked'}`);
  console.log(`   deal id:        ${deal.cr664_loandealid}`);
  console.log(`   deal linked:    ${dealAlreadyLinked ? 'already' : 'now linked'}`);
  console.log('');
  console.log(
    'After a hard browser refresh, the Phase 124C workspace switcher should ' +
      'now expose the "Manager Workspace" link for this UPN, and the ' +
      'manager surface will list this deal in the team pipeline.',
  );
  console.log('');
  console.log('✓ Seed commit complete.');
  return {
    ok: true,
    teamId,
    needCreateTeam,
    bankerId: banker.cr664_bankerid,
    dealId: deal.cr664_loandealid,
  };
}

// ---------------------------------------------------------------------------
// Phase 133C — Platform User / Platform Workspace helpers (executive seed)
//
// The Executive Workspace becomes reachable when the signed-in Platform
// User's primary workspace resolves to "Executive Dashboard" (see
// docs/PHASE_133B). These helpers resolve that row pair and patch ONLY
// the Platform User primary-workspace lookup — never any other table.
// ---------------------------------------------------------------------------

async function findPlatformUserByEmail(upn, token, envUrl) {
  const filter = `cr664_email eq '${odataEscapeStringLiteral(upn)}'`;
  const select =
    'cr664_platformuserid,cr664_email,_cr664_primaryworkspace_value';
  const url =
    `${envUrl}/api/data/v9.2/cr664_platformusers` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function findPlatformWorkspaceByName(workspaceName, token, envUrl) {
  const filter = `cr664_workspacename eq '${odataEscapeStringLiteral(workspaceName)}'`;
  const select = 'cr664_platformworkspaceid,cr664_workspacename';
  const url =
    `${envUrl}/api/data/v9.2/cr664_platformworkspaces` +
    `?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
  return fetchODataList(url, token);
}

async function createPlatformWorkspace(workspaceName, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/cr664_platformworkspaces`;
  // ONLY the primary name. Mirrors createTeam — Dataverse applies its
  // own defaults (statecode/statuscode/owner). No other column is set.
  const body = { cr664_workspacename: workspaceName };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `POST cr664_platformworkspaces → ${res.status}: ${text}`,
      };
    }
    const json = await res.json();
    if (!json.cr664_platformworkspaceid) {
      return {
        ok: false,
        error: 'POST succeeded but response is missing cr664_platformworkspaceid',
      };
    }
    return { ok: true, id: json.cr664_platformworkspaceid, record: json };
  } catch (err) {
    return { ok: false, error: `POST network error: ${err.message}` };
  }
}

async function patchPlatformUserPrimaryWorkspace(
  platformUserId,
  workspaceId,
  token,
  envUrl,
) {
  // PATCH ONLY cr664_PrimaryWorkspace@odata.bind. Do NOT include
  // cr664_email, fullname, role, or any other Platform User column —
  // the bootstrap flow reads every other field unchanged on next login.
  // This bind name matches the generated platform-user model navigation
  // property used by bootstrap/platform-user code.
  const url = `${envUrl}/api/data/v9.2/cr664_platformusers(${platformUserId})`;
  const body = {
    'cr664_PrimaryWorkspace@odata.bind': `/cr664_platformworkspaces(${workspaceId})`,
  };
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `PATCH cr664_platformusers(${platformUserId}) → ${res.status}: ${text}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

async function readPlatformUserPrimaryWorkspace(platformUserId, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/cr664_platformusers(${platformUserId})` +
    `?$select=cr664_platformuserid,cr664_email,_cr664_primaryworkspace_value`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        Prefer:
          'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, record: json };
  } catch (err) {
    return { ok: false, error: `re-read network error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Phase 133C — Executive primary-workspace seed runner.
//
// Resolves exactly one Platform User (by cr664_email) and at most one
// "Executive Dashboard" Platform Workspace (by cr664_workspacename),
// then PATCHes ONLY the Platform User primary-workspace lookup. Dry-run
// by default; the lone write requires --commit-seed-executive-primary-
// workspace. Idempotent: a no-op when the user already points at the
// resolved workspace.
// ---------------------------------------------------------------------------

async function runSeedExecutivePrimaryWorkspace(
  { upn, workspaceName, doCommit },
  token,
  envUrl,
) {
  console.log('');
  console.log('Phase E — TEST executive primary-workspace seed');
  console.log(`   UPN:             ${upn}`);
  console.log(`   Workspace name:  ${workspaceName}`);
  console.log(
    `   Mode:            ${
      doCommit
        ? 'COMMIT-SEED-EXECUTIVE-PRIMARY-WORKSPACE (will write)'
        : 'dry-run (no write)'
    }`,
  );
  console.log('');

  // 1. Resolve the Platform User by cr664_email — exactly one row.
  const userResult = await findPlatformUserByEmail(upn, token, envUrl);
  if (!userResult.ok) {
    bail(`Could not resolve platform user by upn "${upn}": ${userResult.error}`);
  }
  if (userResult.records.length === 0) {
    bail(
      `No cr664_platformuser row with cr664_email = "${upn}". Refusing — ` +
        `the script will not auto-create a platform user. Provision the ` +
        `platform user before re-running this mode.`,
    );
  }
  if (userResult.records.length > 1) {
    bail(
      `${userResult.records.length} cr664_platformuser rows match ` +
        `cr664_email = "${upn}". Refusing — the operator must resolve the ` +
        `ambiguity before seeding.`,
    );
  }
  const platformUser = userResult.records[0];
  console.log(
    `   ✓ Platform user found:  cr664_platformuserid=${platformUser.cr664_platformuserid}`,
  );
  console.log(
    `     current _cr664_primaryworkspace_value: ${
      platformUser._cr664_primaryworkspace_value ?? '(unset)'
    }`,
  );

  // 2. Resolve the Platform Workspace by name — at most one row.
  const wsResult = await findPlatformWorkspaceByName(workspaceName, token, envUrl);
  if (!wsResult.ok) {
    bail(`Could not resolve platform workspace "${workspaceName}": ${wsResult.error}`);
  }
  if (wsResult.records.length > 1) {
    bail(
      `${wsResult.records.length} cr664_platformworkspace rows match ` +
        `cr664_workspacename = "${workspaceName}". Refusing — the operator ` +
        `must resolve the ambiguity before seeding.`,
    );
  }
  let workspaceId = null;
  let needCreateWorkspace = false;
  if (wsResult.records.length === 1) {
    workspaceId = wsResult.records[0].cr664_platformworkspaceid;
    console.log(`   ✓ Platform workspace exists:  cr664_platformworkspaceid=${workspaceId}`);
  } else {
    needCreateWorkspace = true;
    console.log(
      `   ⚙ Platform workspace "${workspaceName}" does not exist — will ` +
        `create on commit (POST cr664_platformworkspaces with ONLY ` +
        `cr664_workspacename). This mirrors the existing team ` +
        `create-on-commit seed pattern.`,
    );
  }

  // 3. Idempotency: already pointing at the resolved workspace?
  const alreadyLinked =
    workspaceId != null &&
    platformUser._cr664_primaryworkspace_value === workspaceId;
  if (alreadyLinked) {
    console.log('');
    console.log(
      `   ✓ Already linked: cr664_platformusers(${platformUser.cr664_platformuserid})` +
        `.cr664_PrimaryWorkspace already points at ` +
        `cr664_platformworkspaces(${workspaceId}).`,
    );
    console.log('   No-op success.');
    return { ok: true, alreadyLinked: true, workspaceId };
  }

  // 4. Plan summary.
  console.log('');
  console.log('   Planned actions:');
  let stepNum = 1;
  if (needCreateWorkspace) {
    console.log(`     [${stepNum}] POST /api/data/v9.2/cr664_platformworkspaces`);
    console.log(`         body: { "cr664_workspacename": "${workspaceName}" }`);
    stepNum += 1;
  }
  console.log(
    `     [${stepNum}] PATCH /api/data/v9.2/cr664_platformusers(${platformUser.cr664_platformuserid})`,
  );
  if (needCreateWorkspace) {
    console.log(
      `         body: { "cr664_PrimaryWorkspace@odata.bind": "/cr664_platformworkspaces(<newly-created>)" }`,
    );
  } else {
    console.log(
      `         body: { "cr664_PrimaryWorkspace@odata.bind": "/cr664_platformworkspaces(${workspaceId})" }`,
    );
  }
  console.log(
    '         PATCH body sets ONLY cr664_PrimaryWorkspace@odata.bind — no ' +
      'other Platform User column, and no Banker / Team / Loan Deal / ' +
      'Manager / Portfolio / Executive row, is touched.',
  );

  if (!doCommit) {
    console.log('');
    console.log('   Dry-run only — no POST or PATCH issued.');
    console.log(
      '   Re-run with `--commit-seed-executive-primary-workspace` to execute the plan above.',
    );
    return {
      ok: true,
      planned: true,
      needCreateWorkspace,
      workspaceId,
      platformUserId: platformUser.cr664_platformuserid,
    };
  }

  // 5. Commit. Create the workspace if needed.
  if (needCreateWorkspace) {
    console.log('');
    console.log(`   ⚙ POST /api/data/v9.2/cr664_platformworkspaces …`);
    const createResult = await createPlatformWorkspace(workspaceName, token, envUrl);
    if (!createResult.ok) {
      bail(`Create cr664_platformworkspace failed: ${createResult.error}`);
    }
    workspaceId = createResult.id;
    console.log(`   ✓ Created cr664_platformworkspaceid=${workspaceId}`);
  }

  // 6. PATCH the Platform User primary-workspace lookup.
  console.log(
    `   ⚙ PATCH cr664_platformusers(${platformUser.cr664_platformuserid}) cr664_PrimaryWorkspace@odata.bind …`,
  );
  const patchResult = await patchPlatformUserPrimaryWorkspace(
    platformUser.cr664_platformuserid,
    workspaceId,
    token,
    envUrl,
  );
  if (!patchResult.ok) {
    bail(`PATCH platform user failed: ${patchResult.error}`);
  }
  console.log('   ✓ Platform user PATCH succeeded.');

  // 7. Verify.
  console.log('');
  console.log('   ⚙ Re-reading the platform user to verify the new primary workspace …');
  const verify = await readPlatformUserPrimaryWorkspace(
    platformUser.cr664_platformuserid,
    token,
    envUrl,
  );
  if (!verify.ok) {
    console.log(`     ⚠ Could not re-read platform user: ${verify.error}`);
  } else {
    const u = verify.record;
    const cur = u._cr664_primaryworkspace_value ?? '(unset)';
    const formatted =
      u['_cr664_primaryworkspace_value@OData.Community.Display.V1.FormattedValue'];
    console.log(`     platform user _cr664_primaryworkspace_value:  ${cur}`);
    if (formatted) {
      console.log(`     primary workspace formatted value:            ${formatted}`);
    }
    if (u._cr664_primaryworkspace_value === workspaceId) {
      console.log('     ✓ Primary workspace lookup is linked to the Executive Dashboard workspace.');
    } else {
      console.log(
        '     ⚠ Verification mismatch — re-read shows a different workspace id ' +
          'than the one the script wrote. Investigate.',
      );
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`   workspace created:  ${needCreateWorkspace ? 'yes' : 'no (reused)'}`);
  console.log(`   workspace id:       ${workspaceId}`);
  console.log(`   platform user id:   ${platformUser.cr664_platformuserid}`);
  console.log('');
  console.log(
    'After a hard browser refresh, this user should land on ' +
      '/workspaces/executive or see Executive Workspace according to the ' +
      'bootstrap route.',
  );
  console.log('');
  console.log('✓ Seed commit complete.');
  return {
    ok: true,
    workspaceId,
    needCreateWorkspace,
    platformUserId: platformUser.cr664_platformuserid,
  };
}

// ---------------------------------------------------------------------------
// Audit phase — publishers + tables + columns
// ---------------------------------------------------------------------------

function auditPublishers() {
  console.log('Phase A — Auditing publishers + solution → publisher join…');
  const xml = `<fetch><entity name='solution'><attribute name='uniquename'/><attribute name='friendlyname'/><filter><condition attribute='uniquename' operator='in'><value>${SOLUTION_FOR_CR664}</value><value>${SOLUTION_FOR_REFERENCE}</value></condition></filter><link-entity name='publisher' from='publisherid' to='publisherid' alias='pub'><attribute name='customizationprefix' alias='pub_prefix'/><attribute name='uniquename' alias='pub_unique'/></link-entity></entity></fetch>`;
  const r = fetchXml(xml);
  if (!r.ok) bail('Publisher audit failed: ' + r.error);
  // Parse pac fetch's column-aligned table output. We only need to know
  // each solution's publisher prefix.
  // Phase 122 §10 audit established that the only prefixes that
  // appear in the publisher table for solutions we care about are
  // `cr664` and `new`. (`ogb` is a third but doesn't own any of
  // the candidate child tables.) Match by whole-word presence on
  // each line for robustness against pac fetch's column-aligned
  // output spacing.
  const KNOWN_PREFIXES = ['cr664', 'new', 'ogb'];
  const found = {};
  const lines = r.raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  function findPrefixOnLine(line) {
    for (const p of KNOWN_PREFIXES) {
      if (new RegExp(`\\b${p}\\b`).test(line)) return p;
    }
    return null;
  }
  for (const line of lines) {
    if (line.includes(SOLUTION_FOR_CR664) && !found[SOLUTION_FOR_CR664]) {
      found[SOLUTION_FOR_CR664] = findPrefixOnLine(line);
    } else if (line.includes(SOLUTION_FOR_REFERENCE) && !found[SOLUTION_FOR_REFERENCE]) {
      found[SOLUTION_FOR_REFERENCE] = findPrefixOnLine(line);
    }
  }
  return found;
}

async function auditTable(table, token, envUrl) {
  console.log(`  · ${table}`);
  const result = { table };
  // The audit now reads Dataverse Web API metadata, not pac env fetch.
  // pac was reporting the legacy pseudo column as still present even
  // after a real Lookup attribute had been created with the same
  // logical name (and reporting the new lookup's _<…>_value as
  // missing). The Web API metadata endpoint distinguishes the two
  // states cleanly via AttributeType.
  const c = await classifyAttribute(table, PSEUDO_DEAL_COLUMN, token, envUrl);
  result.dealClassification = c.classification;
  result.dealAttributeType = c.attributeType ?? null;
  result.dealSchemaName = c.schemaName ?? null;
  result.dealLookupTargets = c.targets ?? null;
  // Map classification onto the existing boolean fields so buildPlan
  // and the dry-run summary keep working without further changes.
  result.pseudoDealColumnExists = c.classification === 'pseudo-scalar';
  result.standardLookupFkExists = c.classification === 'real-lookup';
  result.pseudoDealColumnPopulated = undefined;
  if (result.pseudoDealColumnExists) {
    // Row count still uses pac env fetch — the attribute logical name
    // is concrete and well-known at this point; the issue pac had was
    // distinguishing pseudo vs lookup metadata, not counting rows.
    const cn = countNonNull(table, PSEUDO_DEAL_COLUMN);
    result.pseudoDealColumnPopulated = cn.ok ? cn.count : null;
  }
  if (table === 'cr664_dealtask1') {
    const ca = await classifyAttribute(table, PSEUDO_ASSIGNEDTO_COLUMN, token, envUrl);
    result.assignedToClassification = ca.classification;
    result.assignedToAttributeType = ca.attributeType ?? null;
    result.assignedToLookupTargets = ca.targets ?? null;
    result.pseudoAssignedToColumnExists = ca.classification === 'pseudo-scalar';
    result.standardAssignedToFkExists = ca.classification === 'real-lookup';
    if (result.pseudoAssignedToColumnExists) {
      const cn = countNonNull(table, PSEUDO_ASSIGNEDTO_COLUMN);
      result.pseudoAssignedToColumnPopulated = cn.ok ? cn.count : null;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Plan emission — every Web API payload + verification command
// ---------------------------------------------------------------------------

function buildLookupRelationshipPayload({ referencingEntity, schemaName, displayLabel, target }) {
  // Payload shape per the Dataverse Web API "Create a one-to-many
  // relationship" quickstart. Two things to be careful about — both
  // surfaced by the operator's 2026-06-08 partial-commit failure:
  //
  //   1. `IsCustomizable` does NOT belong on AssociatedMenuConfiguration.
  //      The 2026-06-08 attempt POSTed it nested under that property,
  //      shaped as { Value: true, CanBeChanged: true,
  //                  ManagedPropertyLogicalName: 'iscustomizable' }.
  //      The endpoint replied with
  //        ODataException: An unexpected 'StartObject' node was found
  //        for property named 'IsCustomizable'. A 'PrimitiveValue'
  //        node was expected.
  //      The fix is to remove `IsCustomizable` from
  //      AssociatedMenuConfiguration entirely. Microsoft's example
  //      payload for the same operation does not include it there.
  //
  //   2. The Lookup attribute's `RequiredLevel` is correctly typed as
  //      an `AttributeRequiredLevelManagedProperty` object — that one
  //      is documented and accepted. Don't touch it.
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${referencingEntity}_${target}_${schemaName.replace(/^cr664_/, '')}`,
    ReferencedEntity: target,
    ReferencingEntity: referencingEntity,
    AssociatedMenuConfiguration: {
      Behavior: 'UseCollectionName',
      Group: 'Details',
      Order: 10000,
    },
    CascadeConfiguration: {
      Assign: 'NoCascade',
      Share: 'NoCascade',
      Unshare: 'NoCascade',
      Reparent: 'NoCascade',
      Delete: 'RemoveLink',
      Merge: 'NoCascade',
    },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      AttributeType: 'Lookup',
      AttributeTypeName: { Value: 'LookupType' },
      Description: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ Label: `${displayLabel} lookup added by Phase 122B`, LanguageCode: 1033 }],
      },
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ Label: displayLabel, LanguageCode: 1033 }],
      },
      RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
      SchemaName: schemaName,
      Targets: [target],
    },
  };
}

function buildPlan(audit) {
  const steps = [];

  // Step 1 — solution rollback exports
  if (!FLAGS.skipRollback) {
    steps.push({
      id: 'rollback-export-commerciallendinglos',
      kind: 'pac',
      label: 'Rollback export — CommercialLendingLOS',
      command: `pac solution export --name ${SOLUTION_FOR_REFERENCE} --path ${ROLLBACK_DIR}/${SOLUTION_FOR_REFERENCE}_PRE_PHASE_122B.zip --managed false`,
    });
    steps.push({
      id: 'rollback-export-loanopsexport',
      kind: 'pac',
      label: 'Rollback export — LoanOpsExport',
      command: `pac solution export --name ${SOLUTION_FOR_CR664} --path ${ROLLBACK_DIR}/${SOLUTION_FOR_CR664}_PRE_PHASE_122B.zip --managed false`,
    });
  }

  // Step 2 — delete pseudo-columns where safe
  for (const t of CANDIDATE_CHILD_TABLES) {
    const a = audit.tables.find((x) => x.table === t);
    if (!a || !a.pseudoDealColumnExists) continue;
    const populated = a.pseudoDealColumnPopulated;
    if (populated === null || populated === undefined) {
      steps.push({
        id: `inspect-pseudo-${t}`,
        kind: 'manual-inspection',
        label: `MANUAL INSPECTION REQUIRED — ${t}.${PSEUDO_DEAL_COLUMN} populated state could not be probed`,
        details: `Run \`pac env fetch -x "<fetch count='10' returntotalrecordcount='true'><entity name='${t}'><attribute name='${t}id'/><attribute name='${PSEUDO_DEAL_COLUMN}'/><filter><condition attribute='${PSEUDO_DEAL_COLUMN}' operator='not-null'/></filter></entity></fetch>"\` manually and report. The script will NOT delete an unverified column.`,
      });
      continue;
    }
    if (populated > 0) {
      steps.push({
        id: `populated-pseudo-${t}`,
        kind: 'stop-condition',
        label: `STOP — ${t}.${PSEUDO_DEAL_COLUMN} has ${populated} non-NULL row(s)`,
        details:
          'Capture the populated GUID values to CSV first, then re-run with an explicit ' +
          'operator decision. The script refuses to delete columns that carry data.',
      });
      continue;
    }
    steps.push({
      id: `delete-pseudo-${t}`,
      kind: 'webapi',
      label: `Delete pseudo-column ${t}.${PSEUDO_DEAL_COLUMN} (verified zero non-NULL rows)`,
      method: 'DELETE',
      url: `/api/data/v9.2/EntityDefinitions(LogicalName='${t}')/Attributes(LogicalName='${PSEUDO_DEAL_COLUMN}')`,
      solutionContextHeader: `MSCRM.SolutionUniqueName: ${SOLUTION_FOR_CR664}`,
      body: undefined,
    });
  }

  // AssignedTo pseudo-column
  const dealtask = audit.tables.find((x) => x.table === 'cr664_dealtask1');
  if (dealtask?.pseudoAssignedToColumnExists) {
    const populated = dealtask.pseudoAssignedToColumnPopulated;
    if (populated === null || populated === undefined) {
      steps.push({
        id: `inspect-pseudo-assignedto`,
        kind: 'manual-inspection',
        label: `MANUAL INSPECTION REQUIRED — cr664_dealtask1.${PSEUDO_ASSIGNEDTO_COLUMN} populated state could not be probed`,
        details: `Run \`pac env fetch -x "<fetch count='10'><entity name='cr664_dealtask1'><attribute name='cr664_dealtask1id'/><attribute name='${PSEUDO_ASSIGNEDTO_COLUMN}'/><filter><condition attribute='${PSEUDO_ASSIGNEDTO_COLUMN}' operator='not-null'/></filter></entity></fetch>"\` manually.`,
      });
    } else if (populated > 0) {
      steps.push({
        id: `populated-pseudo-assignedto`,
        kind: 'stop-condition',
        label: `STOP — cr664_dealtask1.${PSEUDO_ASSIGNEDTO_COLUMN} has ${populated} non-NULL row(s)`,
        details: 'Capture populated GUIDs to CSV first; do not let the script delete the column.',
      });
    } else {
      steps.push({
        id: `delete-pseudo-assignedto`,
        kind: 'webapi',
        label: `Delete pseudo-column cr664_dealtask1.${PSEUDO_ASSIGNEDTO_COLUMN} (verified zero non-NULL rows)`,
        method: 'DELETE',
        url: `/api/data/v9.2/EntityDefinitions(LogicalName='cr664_dealtask1')/Attributes(LogicalName='${PSEUDO_ASSIGNEDTO_COLUMN}')`,
        solutionContextHeader: `MSCRM.SolutionUniqueName: ${SOLUTION_FOR_CR664}`,
        body: undefined,
      });
    }
  }

  // Step 3 — create cr664_Deal Lookup on each of the 5 tables
  for (const t of CANDIDATE_CHILD_TABLES) {
    const a = audit.tables.find((x) => x.table === t);
    if (a?.standardLookupFkExists) {
      steps.push({
        id: `already-correct-${t}`,
        kind: 'noop',
        label: `Already correct — ${t}._${PSEUDO_DEAL_COLUMN}_value exists; cr664_Deal Lookup is present.`,
      });
      continue;
    }
    steps.push({
      id: `create-cr664-deal-${t}`,
      kind: 'webapi',
      label: `Create cr664_Deal Lookup on ${t} → ${LOOKUP_TARGET_LOAN_DEAL}`,
      method: 'POST',
      url: '/api/data/v9.2/RelationshipDefinitions',
      solutionContextHeader: `MSCRM.SolutionUniqueName: ${SOLUTION_FOR_CR664}`,
      body: buildLookupRelationshipPayload({
        referencingEntity: t,
        schemaName: NEW_DEAL_COLUMN_SCHEMA_NAME,
        displayLabel: 'Deal',
        target: LOOKUP_TARGET_LOAN_DEAL,
      }),
    });
  }

  // Step 4 — create cr664_AssignedTo on cr664_dealtask1
  if (!dealtask?.standardAssignedToFkExists) {
    steps.push({
      id: 'create-cr664-assignedto',
      kind: 'webapi',
      label: `Create cr664_AssignedTo Lookup on cr664_dealtask1 → ${LOOKUP_TARGET_SYSTEMUSER}`,
      method: 'POST',
      url: '/api/data/v9.2/RelationshipDefinitions',
      solutionContextHeader: `MSCRM.SolutionUniqueName: ${SOLUTION_FOR_CR664}`,
      body: buildLookupRelationshipPayload({
        referencingEntity: 'cr664_dealtask1',
        schemaName: NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME,
        displayLabel: 'Assigned to',
        target: LOOKUP_TARGET_SYSTEMUSER,
      }),
    });
  }

  // Step 5 — publish customizations
  steps.push({
    id: 'publish-all',
    kind: 'pac',
    label: 'Publish all customizations',
    command: 'pac solution publish',
  });

  // Step 6 — Web API metadata verification probes.
  //
  // We deliberately do NOT use pac env fetch here. On the operator's
  // 2026-06-08 run a successful CREATE+publish was followed by pac
  // env fetch reporting `_cr664_deal_value` as missing — almost
  // certainly stale metadata in the pac client. The Web API metadata
  // endpoint is authoritative: each verify step casts the attribute
  // to Microsoft.Dynamics.CRM.LookupAttributeMetadata and checks
  // Targets[] contains the expected referenced entity.
  for (const t of CANDIDATE_CHILD_TABLES) {
    steps.push({
      id: `verify-${t}`,
      kind: 'webapi-verify',
      label: `Verify ${t}.${PSEUDO_DEAL_COLUMN} is a LookupAttributeMetadata targeting ${LOOKUP_TARGET_LOAN_DEAL} (Web API metadata)`,
      method: 'GET',
      url:
        `/api/data/v9.2/EntityDefinitions(LogicalName='${t}')` +
        `/Attributes(LogicalName='${PSEUDO_DEAL_COLUMN}')` +
        `/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets,SchemaName,MetadataId`,
      expectedTarget: LOOKUP_TARGET_LOAN_DEAL,
    });
  }
  steps.push({
    id: 'verify-assignedto',
    kind: 'webapi-verify',
    label: `Verify cr664_dealtask1.${PSEUDO_ASSIGNEDTO_COLUMN} is a LookupAttributeMetadata targeting ${LOOKUP_TARGET_SYSTEMUSER} (Web API metadata)`,
    method: 'GET',
    url:
      `/api/data/v9.2/EntityDefinitions(LogicalName='cr664_dealtask1')` +
      `/Attributes(LogicalName='${PSEUDO_ASSIGNEDTO_COLUMN}')` +
      `/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets,SchemaName,MetadataId`,
    expectedTarget: LOOKUP_TARGET_SYSTEMUSER,
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Commit-mode safety gates
// ---------------------------------------------------------------------------

function refuseIfForbiddenPrefix(publisherAudit) {
  for (const [solution, prefix] of Object.entries(publisherAudit)) {
    if (solution === SOLUTION_FOR_CR664 && prefix !== CR664_PUBLISHER_PREFIX) {
      bail(
        `Safety gate: solution ${SOLUTION_FOR_CR664} has publisher prefix "${prefix}" — ` +
          `expected "${CR664_PUBLISHER_PREFIX}". The script will NOT create columns from a ` +
          `non-cr664 publisher; this is what would have produced new_Deal junk columns. ` +
          `Re-audit the publisher join and rerun.`,
      );
    }
  }
}

/**
 * Acquire a Dataverse bearer token without requiring an admin install.
 *
 * Priority order (the FIRST that yields a token wins):
 *   1. `DATAVERSE_BEARER_TOKEN` env var — used directly if shaped like a JWT.
 *   2. Cached device-code token from a previous run (gitignored cache file).
 *   3. Interactive OAuth2 device-code flow via login.microsoftonline.com.
 *
 * If every source fails, the commit-mode safety gate fires and the
 * script exits. Dry-run mode never reaches this code path.
 */
async function acquireBearerToken(envUrl) {
  const fromEnv = process.env[DV_BEARER_TOKEN_ENV_VAR];
  if (fromEnv && fromEnv.trim().length > 0) {
    const trimmed = fromEnv.trim();
    if (!isJwtShape(trimmed)) {
      bail(
        `Safety gate: ${DV_BEARER_TOKEN_ENV_VAR} env var is set but does not look like a ` +
          `JWT (header.body.signature). Refusing to use a malformed token.`,
      );
    }
    console.log(`Token source: ${DV_BEARER_TOKEN_ENV_VAR} env var.`);
    return trimmed;
  }

  const cached = readTokenCache();
  if (
    cached &&
    typeof cached.token === 'string' &&
    isJwtShape(cached.token) &&
    typeof cached.expiresAt === 'number' &&
    cached.expiresAt > Date.now() + 60_000 &&
    cached.scopeEnvUrl === envUrl
  ) {
    console.log(
      `Token source: cached device-code token (valid until ${new Date(cached.expiresAt).toISOString()}).`,
    );
    return cached.token;
  }

  console.log(
    `No ${DV_BEARER_TOKEN_ENV_VAR} env var and no valid cached token. Falling back ` +
      'to OAuth2 device-code flow (no-admin, no install).',
  );
  const result = await acquireTokenViaDeviceCode(envUrl);
  if (!result.ok) {
    bail(
      `Safety gate: could not acquire bearer token. Tried env var, cached token, and ` +
        `device-code flow (${DV_BEARER_TOKEN_ENV_VAR} was empty). Last error: ${result.error}`,
    );
  }
  writeTokenCache({
    token: result.token,
    expiresAt: result.expiresAt,
    scopeEnvUrl: envUrl,
    acquiredAt: Date.now(),
  });
  console.log('Token source: fresh device-code flow.');
  return result.token;
}

/**
 * OAuth 2.0 device-code flow against Microsoft identity v2.0.
 * Implemented with native fetch() — no @azure/identity / @azure/msal-node
 * / az CLI required. The operator gets a code + URL, signs in in any
 * browser (including a phone), and the script polls until the token
 * is issued.
 */
async function acquireTokenViaDeviceCode(envUrl) {
  const scope = `${envUrl}/.default offline_access openid profile`;
  const dcUrl = `https://login.microsoftonline.com/${DEVICE_CODE_TENANT}/oauth2/v2.0/devicecode`;
  const tokenUrl = `https://login.microsoftonline.com/${DEVICE_CODE_TENANT}/oauth2/v2.0/token`;

  let dcResp;
  try {
    dcResp = await fetch(dcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: PUBLIC_CLIENT_ID, scope }).toString(),
    });
  } catch (err) {
    return { ok: false, error: `device-code request network error: ${err.message}` };
  }
  if (!dcResp.ok) {
    const text = await dcResp.text();
    return { ok: false, error: `device-code request failed: ${dcResp.status} ${text}` };
  }
  const dc = await dcResp.json();

  console.log('');
  console.log('━'.repeat(64));
  console.log('🔐 Microsoft sign-in required (no admin install needed).');
  console.log('');
  console.log(`   1. Open this URL in any browser:  ${dc.verification_uri}`);
  console.log(`   2. Enter this code:               ${dc.user_code}`);
  console.log('   3. Sign in as the operator with Dataverse maker rights.');
  console.log('');
  console.log(`   Code expires in ${Math.round(dc.expires_in / 60)} minute(s). Polling…`);
  console.log('━'.repeat(64));
  console.log('');

  const deadline = Date.now() + dc.expires_in * 1000;
  let intervalMs = (dc.interval || 5) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let tokResp;
    try {
      tokResp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: PUBLIC_CLIENT_ID,
          device_code: dc.device_code,
        }).toString(),
      });
    } catch (err) {
      return { ok: false, error: `device-code token poll network error: ${err.message}` };
    }
    const tokJson = await tokResp.json().catch(() => ({}));
    if (tokResp.ok && typeof tokJson.access_token === 'string') {
      return {
        ok: true,
        token: tokJson.access_token,
        expiresAt: Date.now() + (tokJson.expires_in || 3600) * 1000,
      };
    }
    if (tokJson.error === 'authorization_pending') continue;
    if (tokJson.error === 'slow_down') {
      intervalMs += 5000;
      continue;
    }
    return {
      ok: false,
      error: `device-code token poll failed: ${tokJson.error ?? 'unknown'} — ${
        tokJson.error_description ?? ''
      }`.trim(),
    };
  }
  return { ok: false, error: 'device-code expired before user authenticated' };
}

function isJwtShape(s) {
  return (
    typeof s === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s.trim())
  );
}

function readTokenCache() {
  try {
    if (!existsSync(DV_BEARER_TOKEN_CACHE_PATH)) return null;
    const raw = readFileSync(DV_BEARER_TOKEN_CACHE_PATH, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.token !== 'string' || typeof obj.expiresAt !== 'number') {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

function writeTokenCache(obj) {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(DV_BEARER_TOKEN_CACHE_PATH, JSON.stringify(obj), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (e) {
    console.warn(`Warning: could not write token cache: ${e.message}`);
  }
}

function ensureRollbackArtifactsExist(reasonHint) {
  for (const sln of [SOLUTION_FOR_REFERENCE, SOLUTION_FOR_CR664]) {
    const path = resolve(ROLLBACK_DIR, `${sln}_PRE_PHASE_122B.zip`);
    if (!existsSync(path)) {
      bail(
        `Safety gate: rollback artifact missing — ${path}.${
          reasonHint ? ' ' + reasonHint : ''
        }`,
      );
    }
  }
}

/**
 * Idempotency gate for the rollback-export steps.
 *
 * `pac solution export --path X.zip` fails (exit code != 0) when X.zip
 * already exists. On the operator's repeat --commit run after the
 * first round of PATCH + PublishXml, the previously-exported zips are
 * still on disk and the export step would crash before the script
 * could reach its destructive Attribute deletes.
 *
 * This helper:
 *   - Returns `true` (skip) when the destination zip already exists
 *     on disk AND is non-empty. The existing file is treated as a
 *     valid checkpoint — the script never overwrites it silently.
 *   - Bails (throws BailError) when the destination zip exists but is
 *     0 bytes. That is almost certainly a corrupt partial export from
 *     an interrupted previous run; operator should delete it before
 *     re-running.
 *   - Returns `false` (run the export) when nothing is on disk yet.
 */
function shouldSkipRollbackExportStep(step) {
  const pathMatch = typeof step.command === 'string'
    ? step.command.match(/--path\s+(\S+)/)
    : null;
  if (!pathMatch) return false;
  const destPath = pathMatch[1];
  if (!existsSync(destPath)) return false;
  let stats;
  try {
    stats = statSync(destPath);
  } catch (err) {
    console.log(
      `   ⚠ Could not stat existing rollback artifact at ${destPath}: ${err.message}. ` +
        `Will retry the pac export.`,
    );
    return false;
  }
  if (stats.size === 0) {
    bail(
      `Existing rollback artifact at ${destPath} is 0 bytes — refusing to overwrite ` +
        `it silently. Delete the empty/corrupt file manually before re-running, or ` +
        `rename it with a timestamp suffix to preserve it.`,
    );
  }
  console.log(
    `   ⏭ Reusing existing rollback artifact at ${destPath} (${stats.size} bytes). ` +
      `Skipping pac export to avoid silent overwrite (idempotent re-run).`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Commit execution (Web API + pac shellouts)
// ---------------------------------------------------------------------------

async function executeStep(step, ctx) {
  console.log(`> EXECUTING: ${step.label}`);
  if (step.kind === 'noop') return { ok: true, skipped: true };
  if (step.kind === 'manual-inspection' || step.kind === 'stop-condition') {
    bail(`Stop condition reached during commit: ${step.label}`);
  }
  if (step.kind === 'pac') {
    const cmd = step.command.split(' ');
    const res = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', stdio: 'inherit' });
    if (res.status !== 0) {
      return { ok: false, error: `pac command exited with status ${res.status}` };
    }
    return { ok: true };
  }
  if (step.kind === 'webapi-verify') {
    // Post-commit Web API metadata verification. Authoritative — uses
    // the same /Attributes(…)/Microsoft.Dynamics.CRM.LookupAttributeMetadata
    // cast that --verify-lookups uses, with an explicit Targets[]
    // check. Replaces the previous pac env fetch verify step.
    const url = `${ctx.envUrl}${step.url}`;
    let res;
    try {
      res = await fetch(url, {
        method: step.method,
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          Accept: 'application/json',
        },
      });
    } catch (err) {
      return { ok: false, error: `Web API verify network error: ${err.message}` };
    }
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error:
          `Web API verify ${step.method} ${url} → ${res.status}: ${text}. ` +
          `The attribute may not be a LookupAttributeMetadata yet — re-check with --verify-lookups.`,
      };
    }
    const json = await res.json();
    if (!Array.isArray(json.Targets) || !json.Targets.includes(step.expectedTarget)) {
      return {
        ok: false,
        error:
          `LookupAttributeMetadata Targets ${JSON.stringify(json.Targets)} does not ` +
          `include the expected entity "${step.expectedTarget}".`,
      };
    }
    return { ok: true };
  }
  if (step.kind === 'webapi') {
    const url = `${ctx.envUrl}${step.url}`;
    const headers = {
      Authorization: `Bearer ${ctx.token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'MSCRM.SolutionUniqueName': SOLUTION_FOR_CR664,
    };
    const res = await fetch(url, {
      method: step.method,
      headers,
      body: step.body ? JSON.stringify(step.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Web API ${step.method} ${url} → ${res.status}: ${text}` };
    }
    return { ok: true };
  }
  return { ok: false, error: `Unknown step kind: ${step.kind}` };
}

async function resolveEnvUrl() {
  const res = spawnSync('pac', ['org', 'who'], { encoding: 'utf8' });
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  const m = out.match(/Connected to\.\.\.\s*[^\n]+\n[\s\S]*?(https:\/\/[^\s]+\.crm\.dynamics\.com)/);
  if (m) return m[1].replace(/\/$/, '');
  bail('Could not resolve env URL via `pac org who`. Set DATAVERSE_ENV_URL explicitly.');
  return ''; // unreachable
}

// ---------------------------------------------------------------------------
// Dependency inspection — pre-destructive read-only safety gate.
//
// Dataverse refuses to delete an Attribute that any other component
// (form, view, workflow, relationship, field-security profile, etc.)
// still references — error code `0x8004f01f` from the operator's
// 2026-05-29 run on cr664_documentchecklist.cr664_deal proved the
// case for this script. The remediation Microsoft documents is to
// call `RetrieveDependenciesForDeleteRequest`, identify the dependent
// component, remove/repoint that reference, and only then re-attempt
// the delete.
//
// This block adds three pieces:
//   1. `getAttributeMetadataId()` — resolves a table+attribute pair to
//      its MetadataId (= the AttributeId that the dependency API expects).
//   2. `retrieveDependenciesForDelete()` — issues the read-only
//      RetrieveDependenciesForDelete Web API function and returns the
//      raw dependency rows.
//   3. `inspectPseudoColumnDependencies()` — walks the plan's pending
//      pseudo-column delete steps in order, short-circuits at the
//      first column with non-empty dependencies (per the task's
//      "do not continue to later tables after a dependency is found"
//      requirement), and prints each dependency with its component
//      type and IDs.
//
// All three use HTTP GET only. None of them is reachable from dry-run
// (token is acquired only in commit and inspect-dependencies modes).
// ---------------------------------------------------------------------------

async function getAttributeMetadataId(table, attribute, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${table}')` +
    `/Attributes(LogicalName='${attribute}')?$select=MetadataId,SchemaName`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `GET attribute metadata → ${res.status}: ${text}` };
    }
    const json = await res.json();
    if (!json.MetadataId) {
      return { ok: false, error: 'attribute metadata response missing MetadataId' };
    }
    return { ok: true, metadataId: json.MetadataId, schemaName: json.SchemaName };
  } catch (err) {
    return { ok: false, error: `attribute metadata network error: ${err.message}` };
  }
}

async function retrieveDependenciesForDelete(componentType, objectId, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/RetrieveDependenciesForDelete(ComponentType=@p1,ObjectId=@p2)` +
    `?@p1=${componentType}&@p2=${objectId}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `RetrieveDependenciesForDelete → ${res.status}: ${text}` };
    }
    const json = await res.json();
    return { ok: true, dependencies: Array.isArray(json.value) ? json.value : [] };
  } catch (err) {
    return { ok: false, error: `RetrieveDependenciesForDelete network error: ${err.message}` };
  }
}

async function inspectPseudoColumnDependencies(plan, token, envUrl) {
  console.log('');
  console.log('Phase D — Inspecting Dataverse dependencies for each pseudo-column delete step…');
  console.log('');
  const deleteSteps = plan.filter(
    (s) =>
      s.kind === 'webapi' &&
      s.method === 'DELETE' &&
      typeof s.url === 'string' &&
      s.url.includes('/Attributes('),
  );
  if (deleteSteps.length === 0) {
    console.log('  No pseudo-column delete steps in plan. Skipping dependency inspection.');
    return { blocked: false, blockers: [], inspected: 0 };
  }

  const blockers = [];
  let inspected = 0;
  for (const step of deleteSteps) {
    const m = step.url.match(
      /EntityDefinitions\(LogicalName='([^']+)'\)\/Attributes\(LogicalName='([^']+)'\)/,
    );
    if (!m) {
      console.log(`  ! Could not parse table/attribute from step ${step.id}; skipping.`);
      continue;
    }
    const [, table, attribute] = m;
    inspected += 1;
    console.log(`  · ${table}.${attribute}`);

    const idResult = await getAttributeMetadataId(table, attribute, token, envUrl);
    if (!idResult.ok) {
      console.log(`      ✗ Could not resolve MetadataId: ${idResult.error}`);
      blockers.push({
        table,
        attribute,
        reason: 'metadata-id-unresolvable',
        details: idResult.error,
      });
      // Treat unresolvable metadata as a blocker — the operator must
      // investigate manually. Per the task spec, do not continue to
      // later tables once any blocker is found.
      break;
    }
    const depResult = await retrieveDependenciesForDelete(
      COMPONENT_TYPE_ATTRIBUTE,
      idResult.metadataId,
      token,
      envUrl,
    );
    if (!depResult.ok) {
      console.log(`      ✗ Dependency probe failed: ${depResult.error}`);
      blockers.push({
        table,
        attribute,
        metadataId: idResult.metadataId,
        reason: 'dependency-probe-failed',
        details: depResult.error,
      });
      break;
    }
    if (depResult.dependencies.length === 0) {
      console.log('      ✓ no dependent components — safe to delete');
      continue;
    }
    console.log(
      `      ✗ ${depResult.dependencies.length} dependent component(s) — DELETE will fail (0x8004f01f):`,
    );
    for (const dep of depResult.dependencies) {
      const typeCode = dep.dependentcomponenttype;
      const typeName = COMPONENT_TYPE_NAMES[typeCode] ?? `Type#${typeCode}`;
      const objectId = dep.dependentcomponentobjectid ?? '(no id)';
      const baseSolutionId = dep.dependentcomponentbasesolutionid ?? '(no solution id)';
      console.log(`        - ${typeName}`);
      console.log(`            componentobjectid:    ${objectId}`);
      console.log(`            basesolutionid:       ${baseSolutionId}`);
      console.log(`            remediation: ${remediationHintForComponentType(typeCode)}`);
    }
    blockers.push({
      table,
      attribute,
      metadataId: idResult.metadataId,
      reason: 'dependent-components',
      dependencies: depResult.dependencies,
    });
    // Per the task spec: do not continue to later tables after a
    // dependency is found.
    break;
  }
  console.log('');
  return { blocked: blockers.length > 0, blockers, inspected };
}

function remediationHintForComponentType(typeCode) {
  switch (typeCode) {
    case 24:
    case 60:
      return 'open the form in Maker Portal → form designer → remove the field reference, then save + publish.';
    case 26:
      return 'open the view in Maker Portal → view designer → remove the column, then save + publish.';
    case 10:
      return 'open Maker Portal → table → Relationships → delete or repoint the relationship to the new cr664_Deal column.';
    case 20:
    case 35:
    case 36:
      return 'open the workflow / business rule in Maker Portal → replace the field reference, then activate the new version.';
    case 95:
      return 'open the field-security profile that grants access to this column → remove the field, then re-save.';
    case 90:
    case 91:
    case 92:
    case 93:
      return 'open the report definition → remove or repoint the field reference, then re-publish the report.';
    default:
      return 'investigate the component via Maker Portal solution explorer + repoint or remove its reference to the pseudo-column.';
  }
}

// ---------------------------------------------------------------------------
// SystemForm cleanup — targeted, opt-in, dry-run-by-default
//
// Form designer often won't surface a "remove field" affordance for a
// field that was added as a non-standard control. The script can do
// it directly via the Dataverse Web API:
//
//   1. GET  /api/data/v9.2/systemforms(<id>)?$select=formxml,name,...
//      → returns the form's persisted XML body.
//   2. Locate every <cell> whose inner control has
//      datafieldname="cr664_deal" — these are the references the
//      pseudo-column is blocked by.
//   3. Without --commit-form-cleanup: PRINT each match. No write.
//   4. With --commit-form-cleanup:    splice each matching <cell>
//      element out of the formxml, then PATCH the form, then publish
//      it via the PublishXml action.
//   5. Re-run RetrieveDependenciesForDelete against the same
//      table.cr664_deal to confirm the blocker is gone.
//
// The script operates on the SystemForm GUID the operator supplies on
// the command line — it never picks one itself, and it never removes
// any other field. The cr664_deal pseudo-column name comes from the
// PSEUDO_DEAL_COLUMN constant pinned at the top of this file.
// ---------------------------------------------------------------------------

async function readSystemFormXml(formId, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/systemforms(${formId})` +
    `?$select=formxml,name,objecttypecode,type,description`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `GET systemforms(${formId}) → ${res.status}: ${text}` };
    }
    const form = await res.json();
    return { ok: true, form };
  } catch (err) {
    return { ok: false, error: `systemforms network error: ${err.message}` };
  }
}

function findCr664DealReferences(formXml) {
  // Match every <cell>…</cell> whose contents reference cr664_deal as
  // a control datafieldname or control id. We deliberately match the
  // enclosing <cell> (not just the <control>) because removing only
  // the inner <control> leaves an orphan cell that Dataverse renders
  // as a blank slot. Removing the whole <cell> mirrors what the form
  // designer does when you click "Remove" on a field.
  if (typeof formXml !== 'string' || formXml.length === 0) return [];
  const refs = [];
  const cellRegex = /<cell\b[^>]*>[\s\S]*?<\/cell>/gi;
  let m;
  while ((m = cellRegex.exec(formXml)) !== null) {
    const snippet = m[0];
    if (
      /datafieldname="cr664_deal"/i.test(snippet) ||
      /\bid="cr664_deal"/i.test(snippet)
    ) {
      refs.push({
        startIndex: m.index,
        endIndex: m.index + snippet.length,
        snippet,
      });
    }
  }
  return refs;
}

function removeCr664DealReferences(formXml) {
  const refs = findCr664DealReferences(formXml);
  if (refs.length === 0) return { removed: 0, newXml: formXml };
  let xml = formXml;
  // Splice from the back forward so earlier indices remain valid.
  for (let i = refs.length - 1; i >= 0; i -= 1) {
    xml = xml.slice(0, refs[i].startIndex) + xml.slice(refs[i].endIndex);
  }
  return { removed: refs.length, newXml: xml };
}

/**
 * Generic version of findCr664DealReferences that accepts any
 * attribute logical name (e.g. `cr664_assignedto`). Used by
 * --cleanup-form when the operator passes --attribute <table>.<col>;
 * the legacy findCr664DealReferences continues to handle the default
 * cr664_deal target so the original static-source pins remain stable.
 *
 * Same enclosing-cell semantics as the legacy helper: matches every
 * <cell>…</cell> whose body has `datafieldname="<attribute>"` or
 * `id="<attribute>"`. Refuses to match anything that doesn't have an
 * attribute string supplied.
 */
function findDirectFieldCellReferences(formXml, attributeName) {
  if (typeof formXml !== 'string' || formXml.length === 0) return [];
  if (typeof attributeName !== 'string' || attributeName.length === 0) return [];
  const refs = [];
  const cellRegex = /<cell\b[^>]*>[\s\S]*?<\/cell>/gi;
  const attrEsc = escapeRegExp(attributeName);
  const datafieldRe = new RegExp(`datafieldname="${attrEsc}"`, 'i');
  const idAttrRe = new RegExp(`\\bid="${attrEsc}"`, 'i');
  let m;
  while ((m = cellRegex.exec(formXml)) !== null) {
    if (datafieldRe.test(m[0]) || idAttrRe.test(m[0])) {
      refs.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        snippet: m[0],
      });
    }
  }
  return refs;
}

function removeDirectFieldCellReferences(formXml, attributeName) {
  const refs = findDirectFieldCellReferences(formXml, attributeName);
  if (refs.length === 0) return { removed: 0, newXml: formXml };
  let xml = formXml;
  for (let i = refs.length - 1; i >= 0; i -= 1) {
    xml = xml.slice(0, refs[i].startIndex) + xml.slice(refs[i].endIndex);
  }
  return { removed: refs.length, newXml: xml };
}

async function patchSystemFormXml(formId, formxml, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/systemforms(${formId})`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ formxml }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `PATCH systemforms(${formId}) → ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH systemforms network error: ${err.message}` };
  }
}

async function publishSystemForm(formId, entityName, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/PublishXml`;
  const parameterXml =
    `<importexportxml>` +
    `<entities><entity>${entityName}</entity></entities>` +
    `<systemforms><systemform>{${formId}}</systemform></systemforms>` +
    `</importexportxml>`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ParameterXml: parameterXml }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `PublishXml → ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PublishXml network error: ${err.message}` };
  }
}

async function runFormCleanup(formId, qualifiedAttribute, token, envUrl, doCommit) {
  // qualifiedAttribute is optional. When null/undefined the cleanup
  // targets the default PSEUDO_DEAL_COLUMN (cr664_deal) — preserves
  // the original --cleanup-form contract. When supplied as
  // "<table>.<column>" the cleanup targets the operator-specified
  // column instead, and the post-commit re-probe runs against that
  // exact qualified attribute.
  const usingCustomAttribute =
    typeof qualifiedAttribute === 'string' && qualifiedAttribute.length > 0;
  let targetTable = null;
  let targetAttribute = PSEUDO_DEAL_COLUMN;
  if (usingCustomAttribute) {
    const parts = qualifiedAttribute.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      bail(`--attribute must be "<table>.<column>"; got "${qualifiedAttribute}"`);
    }
    [targetTable, targetAttribute] = parts;
  }

  console.log('');
  console.log('Phase F — Targeted SystemForm cleanup');
  console.log(`   Form id:    ${formId}`);
  console.log(
    `   Target:     ${usingCustomAttribute
      ? `${targetTable}.${targetAttribute} (operator-supplied)`
      : `${PSEUDO_DEAL_COLUMN} (default)`}`,
  );
  console.log(`   Mode:       ${doCommit ? 'COMMIT-FORM-CLEANUP (will write)' : 'dry-run (no write)'}`);
  console.log('');

  // 1. Read the form
  const formResult = await readSystemFormXml(formId, token, envUrl);
  if (!formResult.ok) {
    bail(`Form read failed: ${formResult.error}`);
  }
  const form = formResult.form;
  console.log(`   Form name:           ${form.name ?? '(unknown)'}`);
  console.log(`   Entity (objecttype): ${form.objecttypecode ?? '(unknown)'}`);
  console.log(`   Form type code:      ${form.type ?? '(unknown)'}`);
  if (typeof form.formxml !== 'string' || form.formxml.length === 0) {
    bail(`Form ${formId} has empty formxml — nothing to inspect.`);
  }
  console.log(`   formxml length:      ${form.formxml.length} chars`);

  // 2. Locate DIRECT references (a <cell> whose inner control has
  //    datafieldname or id equal to the target attribute). This
  //    cleanup path removes ONLY direct field cells — subgrid /
  //    NavBar / view dependencies must be handled via the dedicated
  //    --cleanup-subgrid / --cleanup-view modes.
  const refs = findDirectFieldCellReferences(form.formxml, targetAttribute);
  console.log('');
  if (refs.length === 0) {
    if (usingCustomAttribute) {
      // When --attribute is supplied, the cleanup is strictly scoped
      // to that single attribute. We do NOT run the cr664_deal-
      // specific indirect-refs diagnostic (which scans against
      // CANDIDATE_CHILD_TABLES). Instead we tell the operator how to
      // diagnose indirect refs for the SAME attribute.
      console.log(`   ✓ No direct <cell> with datafieldname/id="${targetAttribute}" found on this form.`);
      console.log('     The targeted cleanup mode handles ONLY direct field controls.');
      console.log('     For indirect references (subgrid / NavBar / relationship), use:');
      console.log(`       node scripts/phase122-lookup-repair.mjs --inspect-form ${formId} \\`);
      console.log(`         --attribute ${qualifiedAttribute}`);
      console.log('     For SavedQuery (view) dependencies, use:');
      console.log(`       node scripts/phase122-lookup-repair.mjs --inspect-view <view-guid> \\`);
      console.log(`         --attribute ${qualifiedAttribute}`);
      return { ok: true, removed: 0 };
    }
    // Default cr664_deal path: keep the existing indirect-refs diagnostic.
    const indirect = scanIndirectReferencesForCandidateTables(form.formxml);
    if (indirect.total === 0) {
      console.log(`   ✓ No ${PSEUDO_DEAL_COLUMN} references (direct or indirect) found in this form's XML.`);
      console.log('     Nothing to remove. The form is already clean for this field.');
      return { ok: true, removed: 0 };
    }
    console.log(`   ⚠ No DIRECT field control for ${PSEUDO_DEAL_COLUMN} was found on this form,`);
    console.log(`     but ${indirect.total} INDIRECT reference(s) were detected:`);
    console.log('');
    printIndirectFindingsSummary(indirect);
    console.log('');
    console.log('   This cleanup path will NOT auto-remove subgrid / relationship /');
    console.log('   NavBar bindings. Reasons: the script cannot guarantee that');
    console.log('   removing a subgrid is the intended operator decision, and');
    console.log('   relationship-bound elements often carry hidden meaning beyond');
    console.log('   the surfaced child reference.');
    console.log('');
    console.log('   Required operator action — Maker Portal:');
    console.log(`     Form name:        ${form.name ?? '(unknown)'}`);
    console.log(`     Form entity:      ${form.objecttypecode ?? '(unknown)'}`);
    console.log(`     Form type code:   ${form.type ?? '(unknown)'}`);
    console.log('     Open the form designer for the entity above and remove the');
    console.log('     subgrid / related-records / navigation control that pulls');
    console.log('     in Document Checklist (or whichever child table is named');
    console.log('     in the indirect references above). Save + publish.');
    console.log('');
    console.log('   For a comprehensive per-category breakdown of every indirect');
    console.log('   reference, run:');
    console.log(`     node scripts/phase122-lookup-repair.mjs --inspect-form ${formId} \\`);
    console.log('       --attribute <candidate-table>.cr664_deal');
    console.log('');
    return { ok: true, removed: 0, blockedByIndirect: true, indirect };
  }
  console.log(`   Found ${refs.length} direct ${targetAttribute} reference(s):`);
  for (const [i, ref] of refs.entries()) {
    const compact = ref.snippet.replace(/\s+/g, ' ');
    const preview = compact.length > 400 ? compact.slice(0, 400) + '…' : compact;
    console.log(`     [${i + 1}] cell @ chars ${ref.startIndex}-${ref.endIndex} (${ref.snippet.length} chars)`);
    console.log(`         ${preview}`);
  }

  if (!doCommit) {
    console.log('');
    console.log(`   Dry-run only — no PATCH or PublishXml issued.`);
    console.log('   Re-run with `--commit-form-cleanup` to actually remove the reference(s).');
    return { ok: true, removed: 0, planned: refs.length };
  }

  // 3. Splice the cells out of the formxml (only the cells matching
  //    targetAttribute — nothing else).
  const { removed, newXml } = removeDirectFieldCellReferences(
    form.formxml,
    targetAttribute,
  );
  console.log('');
  console.log(`   ⚙ Removing ${removed} reference(s) from formxml (-${form.formxml.length - newXml.length} chars).`);

  // 4. PATCH the form.
  console.log(`   ⚙ PATCH systemforms(${formId}) …`);
  const patchResult = await patchSystemFormXml(formId, newXml, token, envUrl);
  if (!patchResult.ok) {
    bail(`PATCH systemforms(${formId}) failed: ${patchResult.error}`);
  }
  console.log('   ✓ PATCH succeeded.');

  // 5. Publish via PublishXml so the form-designer side reflects the change.
  if (form.objecttypecode) {
    console.log(`   ⚙ Publishing form via PublishXml (entity=${form.objecttypecode}) …`);
    const pubResult = await publishSystemForm(formId, form.objecttypecode, token, envUrl);
    if (!pubResult.ok) {
      bail(`PublishXml failed: ${pubResult.error}`);
    }
    console.log('   ✓ Publish succeeded.');
  } else {
    console.log('   ⚠ Form has no objecttypecode; skipping PublishXml. Operator should publish manually if needed.');
  }

  // 6. Re-running RetrieveDependenciesForDelete on the SUPPLIED
  //    table.column when --attribute was provided, otherwise on the
  //    form's parent entity + the default pseudo-column. This is the
  //    only way to confirm the form was the actual blocker.
  const probeTable = targetTable ?? form.objecttypecode;
  const probeAttribute = targetAttribute;
  console.log('');
  console.log(`   ⚙ Re-running RetrieveDependenciesForDelete for ${probeTable ?? '(unknown)'}.${probeAttribute} …`);
  if (probeTable) {
    const idResult = await getAttributeMetadataId(
      probeTable,
      probeAttribute,
      token,
      envUrl,
    );
    if (!idResult.ok) {
      console.log(`     ⚠ Could not resolve MetadataId for re-probe: ${idResult.error}`);
    } else {
      const depResult = await retrieveDependenciesForDelete(
        COMPONENT_TYPE_ATTRIBUTE,
        idResult.metadataId,
        token,
        envUrl,
      );
      if (!depResult.ok) {
        console.log(`     ⚠ Re-probe failed: ${depResult.error}`);
      } else if (depResult.dependencies.length === 0) {
        console.log(`     ✓ ${probeTable}.${probeAttribute} has ZERO dependent components.`);
        console.log('       This form is no longer blocking the pseudo-column delete.');
      } else {
        console.log(
          `     ⚠ ${probeTable}.${probeAttribute} still has ${depResult.dependencies.length} dependent component(s):`,
        );
        for (const dep of depResult.dependencies) {
          const typeName = COMPONENT_TYPE_NAMES[dep.dependentcomponenttype] ?? `Type#${dep.dependentcomponenttype}`;
          console.log(`         - ${typeName} (id=${dep.dependentcomponentobjectid ?? '(no id)'})`);
        }
        console.log('       Run `--inspect-dependencies` for the full picture.');
      }
    }
  }
  console.log('');
  console.log('✓ Form cleanup commit complete.');
  return { ok: true, removed };
}

// ---------------------------------------------------------------------------
// Broad SystemForm inspection — read-only.
//
// The cleanup path above only handles DIRECT field controls (a <cell>
// whose inner <control> has datafieldname="cr664_deal"). Dataverse
// also records SystemForm dependencies that come from INDIRECT
// references: subgrid controls that bind to a related child table,
// NavBar items that surface a related-records pane, relationship-
// bound parameters, etc. Those cannot be safely auto-removed because
// they often carry hidden semantic meaning the operator must judge.
//
// This block adds a comprehensive read-only inspector that walks the
// form XML and groups every possible reference into categories so the
// operator knows exactly which control to remove in Maker Portal.
//
// Nothing in this section issues a PATCH, POST, or PublishXml call.
// ---------------------------------------------------------------------------

// The Dataverse "Subgrid" control classid is fixed across orgs.
const SUBGRID_CONTROL_CLASSID = '{E7A81278-8635-4d9e-8D4D-59480B391C5B}';
// Quick view form control classid (read-only embedded form).
const QUICKVIEW_CONTROL_CLASSID = '{069810AB-2C8A-4B53-AD30-A1FB60AA2F26}';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractContext(formXml, start, length, padding) {
  const from = Math.max(0, start - padding);
  const to = Math.min(formXml.length, start + length + padding);
  return formXml.slice(from, to);
}

/**
 * Given an arbitrary offset inside the formxml (e.g. the start index
 * of a matched <RelationshipName>…</RelationshipName> element), walk
 * outward and report:
 *   - the enclosing <cell …> id (if the cell carries an id attribute);
 *   - the enclosing <control …> id, classid, and <TargetEntityType>
 *     pulled from that control's body.
 *
 * Used by findFormReferences to enrich relationship hits with the
 * exact handles the operator needs to call --cleanup-subgrid against.
 * Returns {cellId, control} where each may be null if not found.
 */
function findEnclosingControlForRelationship(formXml, hitIndex) {
  if (typeof formXml !== 'string' || formXml.length === 0) {
    return { cellId: null, control: null };
  }
  const cellRegex = /<cell\b[^>]*>[\s\S]*?<\/cell>/gi;
  let enclosingCell = null;
  let m;
  while ((m = cellRegex.exec(formXml)) !== null) {
    if (m.index <= hitIndex && hitIndex < m.index + m[0].length) {
      enclosingCell = { start: m.index, end: m.index + m[0].length, snippet: m[0] };
      break;
    }
  }
  if (!enclosingCell) return { cellId: null, control: null };

  const cellIdMatch = /<cell\b[^>]*\bid="([^"]+)"/i.exec(enclosingCell.snippet);
  const cellId = cellIdMatch ? cellIdMatch[1] : null;

  // Within the cell, find the <control>…</control> block (subgrids /
  // quick-views always have a body — they're never self-closing) that
  // contains the hit position.
  const relInCell = hitIndex - enclosingCell.start;
  const controlRegex = /<control\b[^>]*>[\s\S]*?<\/control>/gi;
  let control = null;
  let cm;
  while ((cm = controlRegex.exec(enclosingCell.snippet)) !== null) {
    if (cm.index <= relInCell && relInCell < cm.index + cm[0].length) {
      const ctrlSnippet = cm[0];
      const ctrlIdMatch = /<control\b[^>]*\bid="([^"]+)"/i.exec(ctrlSnippet);
      const classidMatch = /classid="([^"]+)"/i.exec(ctrlSnippet);
      const tetMatch = /<TargetEntityType>([^<]+)<\/TargetEntityType>/i.exec(ctrlSnippet);
      control = {
        id: ctrlIdMatch ? ctrlIdMatch[1] : null,
        classid: classidMatch ? classidMatch[1] : null,
        targetEntity: tetMatch ? tetMatch[1].trim() : null,
      };
      break;
    }
  }
  return { cellId, control };
}

/**
 * Walk a form's persisted XML and group every reference to the given
 * table + attribute (`table` = e.g. "cr664_documentchecklist",
 * `attribute` = e.g. "cr664_deal") into categories. Used by both
 * `--inspect-form` (read-only inspection) and the cleanup path's
 * "no direct cells but indirect refs" diagnostics branch.
 *
 * Returns a structured object — never throws, never writes.
 */
function findFormReferences(formXml, table, attribute) {
  const empty = {
    direct: [],
    subgrids: [],
    quickViews: [],
    targetEntities: [],
    relationships: [],
    navBar: [],
    bareAttributeName: [],
  };
  if (typeof formXml !== 'string' || formXml.length === 0) return empty;
  if (typeof table !== 'string' || typeof attribute !== 'string') return empty;

  const tableEsc = escapeRegExp(table);
  const attrEsc = escapeRegExp(attribute);
  const findings = {
    direct: [],
    subgrids: [],
    quickViews: [],
    targetEntities: [],
    relationships: [],
    navBar: [],
    bareAttributeName: [],
  };

  // 1. Direct field cells: <cell>…<control datafieldname="<attribute>" …></cell>
  const datafieldRe = new RegExp(`datafieldname="${attrEsc}"`, 'i');
  const idAttrRe = new RegExp(`\\bid="${attrEsc}"`, 'i');
  const cellRegex = /<cell\b[^>]*>[\s\S]*?<\/cell>/gi;
  let m;
  while ((m = cellRegex.exec(formXml)) !== null) {
    if (datafieldRe.test(m[0]) || idAttrRe.test(m[0])) {
      findings.direct.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        snippet: m[0],
      });
    }
  }

  // 2. Subgrid controls whose body references the table.
  const subgridClassidEsc = escapeRegExp(SUBGRID_CONTROL_CLASSID);
  const subgridControlRegex = new RegExp(
    `<control\\b[^>]*classid="${subgridClassidEsc}"[\\s\\S]*?<\\/control>`,
    'gi',
  );
  const tableRefRegex = new RegExp(`\\b${tableEsc}\\b`, 'i');
  while ((m = subgridControlRegex.exec(formXml)) !== null) {
    if (tableRefRegex.test(m[0])) {
      findings.subgrids.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        snippet: m[0],
      });
    }
  }

  // 3. Quick view form controls whose body references the table.
  const quickViewClassidEsc = escapeRegExp(QUICKVIEW_CONTROL_CLASSID);
  const quickViewRegex = new RegExp(
    `<control\\b[^>]*classid="${quickViewClassidEsc}"[\\s\\S]*?<\\/control>`,
    'gi',
  );
  while ((m = quickViewRegex.exec(formXml)) !== null) {
    if (tableRefRegex.test(m[0])) {
      findings.quickViews.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        snippet: m[0],
      });
    }
  }

  // 4. <TargetEntityType>cr664_documentchecklist</TargetEntityType>
  const tetRegex = new RegExp(
    `<TargetEntityType>\\s*${tableEsc}\\s*<\\/TargetEntityType>`,
    'gi',
  );
  while ((m = tetRegex.exec(formXml)) !== null) {
    findings.targetEntities.push({
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      snippet: extractContext(formXml, m.index, m[0].length, 200),
    });
  }

  // 5. Relationship names mentioning the table OR the attribute.
  //    Use normalize-then-substring matching: relationship names
  //    typically embed the entity / attribute logical name as part of
  //    a longer underscore-joined token (e.g.
  //    `cr664_DocumentChecklist_cr664_Deal_cr664_Deal`). The `\b`
  //    word-boundary trick does NOT work here because JS regex
  //    classifies `_` as a word character, so `\bcr664_deal\b` won't
  //    match when the token sits between underscores. Lowercase once
  //    and use `String#includes` instead.
  const relationshipRegex = /<RelationshipName>([^<]+)<\/RelationshipName>/gi;
  const tableLower = String(table).toLowerCase();
  const attrLower = String(attribute).toLowerCase();
  while ((m = relationshipRegex.exec(formXml)) !== null) {
    const name = m[1];
    const nameLower = name.toLowerCase();
    if (nameLower.includes(tableLower) || nameLower.includes(attrLower)) {
      const enclosing = findEnclosingControlForRelationship(formXml, m.index);
      findings.relationships.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        name,
        enclosingCellId: enclosing.cellId,
        enclosingControlId: enclosing.control?.id ?? null,
        enclosingControlClassid: enclosing.control?.classid ?? null,
        enclosingControlTargetEntity: enclosing.control?.targetEntity ?? null,
        snippet: extractContext(formXml, m.index, m[0].length, 200),
      });
    }
  }

  // 6. NavBar / NavBarByRelationshipItem nodes that reference the
  //    table or attribute.
  const navBarRegex = /<NavBar[\s\S]*?<\/NavBar>/gi;
  while ((m = navBarRegex.exec(formXml)) !== null) {
    if (
      tableRefRegex.test(m[0]) ||
      new RegExp(`\\b${attrEsc}\\b`, 'i').test(m[0])
    ) {
      findings.navBar.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        snippet: m[0],
      });
    }
  }
  const navItemRegex = /<NavBarByRelationshipItem\b[^>]*\/?>/gi;
  while ((m = navItemRegex.exec(formXml)) !== null) {
    if (
      tableRefRegex.test(m[0]) ||
      new RegExp(`\\b${attrEsc}\\b`, 'i').test(m[0])
    ) {
      findings.navBar.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        snippet: m[0],
      });
    }
  }

  // 7. Catch-all: bare logical-name occurrences of the attribute
  //    anywhere in the form XML that are NOT already covered above.
  const seenOffsets = new Set();
  for (const e of [
    ...findings.direct,
    ...findings.subgrids,
    ...findings.quickViews,
    ...findings.targetEntities,
    ...findings.relationships,
    ...findings.navBar,
  ]) {
    for (let k = e.startIndex; k < e.endIndex; k += 1) seenOffsets.add(k);
  }
  const bareRegex = new RegExp(`\\b${attrEsc}\\b`, 'gi');
  while ((m = bareRegex.exec(formXml)) !== null) {
    if (seenOffsets.has(m.index)) continue;
    findings.bareAttributeName.push({
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      context: extractContext(formXml, m.index, m[0].length, 120),
    });
    if (findings.bareAttributeName.length >= 25) break;
  }

  return findings;
}

function totalFindings(findings) {
  return (
    findings.direct.length +
    findings.subgrids.length +
    findings.quickViews.length +
    findings.targetEntities.length +
    findings.relationships.length +
    findings.navBar.length +
    findings.bareAttributeName.length
  );
}

/**
 * Scan one form's XML against every CANDIDATE_CHILD_TABLES + the
 * cr664_deal attribute, looking for INDIRECT references only (i.e.
 * everything `findFormReferences` reports except `direct`). Used by
 * the cleanup path's "no direct cells found" diagnostics branch.
 */
function scanIndirectReferencesForCandidateTables(formXml) {
  const perTable = [];
  let total = 0;
  for (const table of CANDIDATE_CHILD_TABLES) {
    const f = findFormReferences(formXml, table, PSEUDO_DEAL_COLUMN);
    const indirectTotal =
      f.subgrids.length +
      f.quickViews.length +
      f.targetEntities.length +
      f.relationships.length +
      f.navBar.length;
    if (indirectTotal > 0) {
      perTable.push({ table, findings: f, indirectTotal });
      total += indirectTotal;
    }
  }
  return { total, perTable };
}

function printIndirectFindingsSummary(indirect) {
  for (const entry of indirect.perTable) {
    console.log(`     - related table "${entry.table}": ${entry.indirectTotal} indirect ref(s)`);
    if (entry.findings.subgrids.length) {
      console.log(`         subgrid control(s):   ${entry.findings.subgrids.length}`);
    }
    if (entry.findings.quickViews.length) {
      console.log(`         quick-view control(s):${entry.findings.quickViews.length}`);
    }
    if (entry.findings.targetEntities.length) {
      console.log(`         <TargetEntityType>:   ${entry.findings.targetEntities.length}`);
    }
    if (entry.findings.relationships.length) {
      console.log(`         <RelationshipName>:   ${entry.findings.relationships.length}`);
      for (const r of entry.findings.relationships.slice(0, 3)) {
        console.log(`           - ${r.name}`);
      }
    }
    if (entry.findings.navBar.length) {
      console.log(`         <NavBar*>:            ${entry.findings.navBar.length}`);
    }
  }
}

/**
 * Read-only orchestrator for `--inspect-form <id> --attribute <t>.<c>`.
 *
 * Never writes. Never publishes. Calls only readSystemFormXml() +
 * (optionally) the dependency probe for context. The output is a
 * structured per-category breakdown of every reference the script can
 * detect — direct field controls, subgrid controls, quick-view
 * controls, TargetEntityType elements, relationship names, NavBar
 * items, and bare attribute-name occurrences.
 */
async function runFormInspect(formId, qualifiedAttribute, token, envUrl) {
  console.log('');
  console.log('Phase I — Broad SystemForm inspection (read-only)');
  console.log(`   Form id:        ${formId}`);
  console.log(`   Attribute:      ${qualifiedAttribute}`);
  console.log('');

  const [table, attribute] = qualifiedAttribute.split('.');
  if (!table || !attribute) {
    bail(`--attribute must be "<table>.<column>"; got "${qualifiedAttribute}"`);
  }

  const formResult = await readSystemFormXml(formId, token, envUrl);
  if (!formResult.ok) {
    bail(`Form read failed: ${formResult.error}`);
  }
  const form = formResult.form;
  console.log(`   Form name:           ${form.name ?? '(unknown)'}`);
  console.log(`   Entity (objecttype): ${form.objecttypecode ?? '(unknown)'}`);
  console.log(`   Form type code:      ${form.type ?? '(unknown)'}`);
  console.log(`   formxml length:      ${form.formxml?.length ?? 0} chars`);

  if (
    form.objecttypecode &&
    typeof form.objecttypecode === 'string' &&
    form.objecttypecode.toLowerCase() !== table.toLowerCase()
  ) {
    console.log('');
    console.log(
      `   ⚠ Form's parent entity (${form.objecttypecode}) DIFFERS from the`,
    );
    console.log(
      `     attribute's table (${table}). The dependency is therefore`,
    );
    console.log(
      '     INDIRECT — typically a subgrid, quick-view, or NavBar item on',
    );
    console.log(
      '     the form pointing at the related child table.',
    );
  }

  const findings = findFormReferences(form.formxml ?? '', table, attribute);
  console.log('');
  console.log('   Findings:');
  printFindingsSection(
    `Direct <cell> with datafieldname="${attribute}" or id="${attribute}"`,
    findings.direct,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `Subgrid controls (classid ${SUBGRID_CONTROL_CLASSID}) referencing "${table}"`,
    findings.subgrids,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `Quick-view controls referencing "${table}"`,
    findings.quickViews,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `<TargetEntityType>${table}</TargetEntityType> elements`,
    findings.targetEntities,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printRelationshipFindings(
    `<RelationshipName> values containing "${table}" or "${attribute}"`,
    findings.relationships,
    formId,
  );
  printFindingsSection(
    `<NavBar*> entries referencing "${table}" or "${attribute}"`,
    findings.navBar,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `Bare logical-name occurrences of "${attribute}" (catch-all)`,
    findings.bareAttributeName,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.context)}`,
  );

  console.log('');
  const total = totalFindings(findings);
  if (total === 0) {
    console.log(`   ✓ No references to ${table}.${attribute} found in this form's XML.`);
    console.log('     The dependency Dataverse recorded against this form may');
    console.log('     have already been removed, or it may live in a sibling form.');
    console.log('     Re-run `--inspect-dependencies` to refresh the dependency state.');
    return { ok: true, findings };
  }
  if (findings.direct.length > 0) {
    console.log(`   → ${findings.direct.length} direct field control(s) found —`);
    console.log('     these CAN be removed automatically. Run:');
    console.log(`       node scripts/phase122-lookup-repair.mjs --cleanup-form ${formId} \\`);
    console.log('         --commit-form-cleanup');
  } else {
    console.log('   ⚠ No direct field control found, only INDIRECT references.');
    console.log('     The script will NOT auto-remove subgrid / quick-view /');
    console.log('     relationship / NavBar bindings. Required operator action:');
    console.log('');
    console.log(`       Open Maker Portal → table ${form.objecttypecode ?? '(unknown)'}`);
    console.log(`       → Forms → "${form.name ?? '(unknown)'}" (type code ${form.type ?? '(unknown)'})`);
    console.log('       → Remove the subgrid / related-records / NavBar control');
    console.log(`         that surfaces ${table}, then Save + Publish.`);
  }
  console.log('');
  return { ok: true, findings };
}

function printFindingsSection(label, entries, formatLine) {
  if (entries.length === 0) {
    console.log(`     - ${label}: none.`);
    return;
  }
  console.log(`     - ${label}: ${entries.length}`);
  for (const [i, e] of entries.entries()) {
    console.log(`       [${i + 1}] ${formatLine(e)}`);
  }
}

/**
 * Pretty-print relationship findings with enclosing control context.
 * For each <RelationshipName> hit prints the relationship name, the
 * enclosing <cell> id (if any), the enclosing <control> id + classid +
 * <TargetEntityType>, and — when the script can prove the enclosing
 * control is a removable subgrid — the exact dry-run cleanup command
 * the operator would copy-paste.
 */
function printRelationshipFindings(label, entries, formId) {
  if (entries.length === 0) {
    console.log(`     - ${label}: none.`);
    return;
  }
  console.log(`     - ${label}: ${entries.length}`);
  for (const [i, e] of entries.entries()) {
    console.log(`       [${i + 1}] ${e.name}  (chars ${e.startIndex}-${e.endIndex})`);
    console.log(`           enclosing cell id:    ${e.enclosingCellId ?? '(none)'}`);
    console.log(`           enclosing control id: ${e.enclosingControlId ?? '(none)'}`);
    if (e.enclosingControlClassid) {
      const isSubgrid =
        e.enclosingControlClassid.toLowerCase() === SUBGRID_CONTROL_CLASSID.toLowerCase();
      console.log(
        `           classid:              ${e.enclosingControlClassid}${isSubgrid ? '  (subgrid)' : ''}`,
      );
    }
    if (e.enclosingControlTargetEntity) {
      console.log(`           TargetEntityType:     ${e.enclosingControlTargetEntity}`);
    }
    const isSafelyRemovable =
      typeof e.enclosingControlId === 'string' &&
      e.enclosingControlId.length > 0 &&
      typeof e.enclosingControlClassid === 'string' &&
      e.enclosingControlClassid.toLowerCase() === SUBGRID_CONTROL_CLASSID.toLowerCase() &&
      typeof e.enclosingControlTargetEntity === 'string' &&
      isAllowedSubgridTarget(e.enclosingControlTargetEntity);
    if (isSafelyRemovable) {
      console.log('           ► Safely removable by control id. Dry-run:');
      console.log(
        `               node scripts/phase122-lookup-repair.mjs \\`,
      );
      console.log(
        `                 --cleanup-subgrid ${formId} \\`,
      );
      console.log(
        `                 --control-id ${e.enclosingControlId}`,
      );
    } else if (e.enclosingControlId) {
      console.log(
        '           ⓘ Not auto-removable from this code path (classid or',
      );
      console.log(
        '             target-entity gate fails). Inspect the control in',
      );
      console.log('             Maker Portal.');
    }
  }
}

function compactSnippet(s, max = 280) {
  const c = String(s ?? '').replace(/\s+/g, ' ');
  return c.length > max ? c.slice(0, max) + '…' : c;
}

// ---------------------------------------------------------------------------
// Targeted subgrid cleanup — opt-in by control id.
//
// Operator's 2026-06-01 inspect-form run identified that the residual
// blocker on form 653f9d5e-… is a hidden subgrid (control id
// "Subgrid_new_5") bound to cr664_documentchecklist via the
// relationship cr664_DocumentChecklist_cr664_Deal_cr664_Deal. The
// form designer didn't expose it for direct removal. This mode lets
// the operator surgically remove ONE subgrid identified by its
// control id, with multi-stage validation before any write.
//
// Validation gates (every one must pass before write):
//   1. Form must exist and have formxml.
//   2. EXACTLY ONE <cell> in the form must contain a <control>
//      whose `id` attribute matches the supplied control id.
//      Zero matches → bail. >1 matches → bail (refuse for safety).
//   3. The control's classid must equal SUBGRID_CONTROL_CLASSID
//      (case-insensitive). Refuses any other control kind.
//   4. The control's <TargetEntityType> must be one of
//      CANDIDATE_CHILD_TABLES. Refuses subgrids that surface
//      tables outside the Phase 122 scope.
//   5. The control's <RelationshipName> must reference
//      PSEUDO_DEAL_COLUMN (cr664_deal). Refuses subgrids whose
//      binding relationship doesn't involve the pseudo-column the
//      script is trying to free up.
//
// In commit mode, after PATCH + PublishXml the script re-fetches the
// form and runs findFormReferences against the TargetEntityType that
// was validated. If ANY residual indirect reference to that table
// remains on the form, the script exits non-zero — the operator must
// re-run --cleanup-subgrid (or fix in Maker Portal) before the
// pseudo-column can be deleted.
// ---------------------------------------------------------------------------

function findCellContainingControl(formXml, controlId) {
  if (
    typeof formXml !== 'string' ||
    formXml.length === 0 ||
    typeof controlId !== 'string' ||
    controlId.length === 0
  ) {
    return { matches: [] };
  }
  const matches = [];
  const cellRegex = /<cell\b[^>]*>[\s\S]*?<\/cell>/gi;
  const controlIdRe = new RegExp(
    `<control\\b[^>]*\\bid="${escapeRegExp(controlId)}"`,
    'i',
  );
  let m;
  while ((m = cellRegex.exec(formXml)) !== null) {
    if (controlIdRe.test(m[0])) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        snippet: m[0],
      });
    }
  }
  return { matches };
}

function validateSubgridCellForCleanup(cellSnippet, controlId) {
  // 1. Opening <control id="..."> tag exists in this cell.
  const openTagRe = new RegExp(
    `<control\\b[^>]*\\bid="${escapeRegExp(controlId)}"[^>]*>`,
    'i',
  );
  const openTagMatch = openTagRe.exec(cellSnippet);
  if (!openTagMatch) {
    return {
      ok: false,
      error: `could not locate opening <control id="${controlId}"> tag inside the matched cell`,
    };
  }
  const openTag = openTagMatch[0];

  // 2. classid must equal SUBGRID_CONTROL_CLASSID (case-insensitive).
  const subgridClassidRe = new RegExp(
    `classid="${escapeRegExp(SUBGRID_CONTROL_CLASSID)}"`,
    'i',
  );
  if (!subgridClassidRe.test(openTag)) {
    return {
      ok: false,
      error:
        `control "${controlId}" is not a subgrid (classid mismatch). ` +
        `Refusing to remove a non-subgrid element.`,
    };
  }

  // 3. <TargetEntityType> must be in CANDIDATE_CHILD_TABLES.
  const tetMatch = /<TargetEntityType>([^<]+)<\/TargetEntityType>/i.exec(cellSnippet);
  if (!tetMatch) {
    return {
      ok: false,
      error: `subgrid "${controlId}" has no <TargetEntityType> element. Refusing.`,
    };
  }
  const targetEntity = tetMatch[1].trim();
  if (!isAllowedSubgridTarget(targetEntity)) {
    return {
      ok: false,
      error:
        `subgrid TargetEntityType "${targetEntity}" is not in the allowed-target list ` +
        `(canonical: ${CANDIDATE_CHILD_TABLES.join(', ')}; ` +
        `legacy: ${LEGACY_CR664_DEAL_CHILD_TABLES.join(', ')}). ` +
        `Refusing to remove subgrids outside Phase 122 scope.`,
    };
  }

  // 4. <RelationshipName> must reference PSEUDO_DEAL_COLUMN.
  //
  // Implementation note: this used to be `\bcr664_deal\b` with the
  // case-insensitive flag, but JS regex treats `_` as a word
  // character — so `\bcr664_deal\b` does NOT match when the token is
  // sandwiched between underscores in a relationship name like
  // `cr664_DocumentChecklist_cr664_Deal_cr664_Deal`. Operator hit a
  // false-negative on 2026-06-01. Switch to normalize-then-substring:
  // lowercase the relationship name once and check for the lowercase
  // pseudo-column. Same intent, no false negatives on mixed-case
  // tokens between underscores.
  const relMatch = /<RelationshipName>([^<]+)<\/RelationshipName>/i.exec(cellSnippet);
  if (!relMatch) {
    return {
      ok: false,
      error: `subgrid "${controlId}" has no <RelationshipName> element. Refusing.`,
    };
  }
  const relationshipName = relMatch[1].trim();
  if (!relationshipName.toLowerCase().includes(PSEUDO_DEAL_COLUMN)) {
    return {
      ok: false,
      error:
        `relationship name "${relationshipName}" does not reference ${PSEUDO_DEAL_COLUMN}. ` +
        `Refusing — this subgrid is not bound to the pseudo-column the script is trying to free.`,
    };
  }

  return { ok: true, targetEntity, relationshipName };
}

async function runSubgridCleanup(formId, controlId, token, envUrl, doCommit) {
  console.log('');
  console.log('Phase S — Targeted subgrid cleanup (by control id)');
  console.log(`   Form id:     ${formId}`);
  console.log(`   Control id:  ${controlId}`);
  console.log(`   Mode:        ${doCommit ? 'COMMIT-SUBGRID-CLEANUP (will write)' : 'dry-run (no write)'}`);
  console.log('');

  // 1. Read the form.
  const formResult = await readSystemFormXml(formId, token, envUrl);
  if (!formResult.ok) bail(`Form read failed: ${formResult.error}`);
  const form = formResult.form;
  console.log(`   Form name:           ${form.name ?? '(unknown)'}`);
  console.log(`   Entity (objecttype): ${form.objecttypecode ?? '(unknown)'}`);
  console.log(`   Form type code:      ${form.type ?? '(unknown)'}`);
  if (typeof form.formxml !== 'string' || form.formxml.length === 0) {
    bail(`Form ${formId} has empty formxml — nothing to inspect.`);
  }
  console.log(`   formxml length:      ${form.formxml.length} chars`);

  // 2. Find the enclosing <cell> for the supplied control id. Refuse
  //    if zero or more than one match — both indicate an unsafe
  //    state for surgical removal.
  const matches = findCellContainingControl(form.formxml, controlId).matches;
  if (matches.length === 0) {
    bail(
      `No <cell> contains a control with id="${controlId}" on form ${formId}. ` +
        `Refusing — the script will not invent a target.`,
    );
  }
  if (matches.length > 1) {
    bail(
      `${matches.length} <cell> elements contain a control with id="${controlId}" — ` +
        `refusing for safety. A single-control surgical removal must have exactly one match.`,
    );
  }
  const match = matches[0];

  // 3. Validate every safety property of the matched control: classid,
  //    TargetEntityType (must be a candidate child table),
  //    RelationshipName (must reference cr664_deal).
  const validation = validateSubgridCellForCleanup(match.snippet, controlId);
  if (!validation.ok) {
    bail(`Subgrid validation failed: ${validation.error}`);
  }

  console.log('');
  console.log('   ✓ Subgrid identified and validated:');
  console.log(`       control id:        ${controlId}`);
  console.log(`       classid:           ${SUBGRID_CONTROL_CLASSID}`);
  console.log(`       TargetEntityType:  ${validation.targetEntity}`);
  console.log(`       RelationshipName:  ${validation.relationshipName}`);
  console.log('');
  console.log(`   Enclosing <cell> @ chars ${match.start}-${match.end} (${match.snippet.length} chars):`);
  console.log(`     ${compactSnippet(match.snippet, 400)}`);

  if (!doCommit) {
    console.log('');
    console.log('   Dry-run only — no PATCH or PublishXml issued.');
    console.log('   Re-run with `--commit-subgrid-cleanup` to actually remove the cell.');
    return { ok: true, removed: 0, planned: 1, targetEntity: validation.targetEntity };
  }

  // 4. Splice exactly that one cell out of the formxml — nothing else.
  const newXml = form.formxml.slice(0, match.start) + form.formxml.slice(match.end);
  console.log('');
  console.log(
    `   ⚙ Splicing one <cell> out of formxml (-${form.formxml.length - newXml.length} chars).`,
  );

  // 5. PATCH the form.
  console.log(`   ⚙ PATCH systemforms(${formId}) …`);
  const patchResult = await patchSystemFormXml(formId, newXml, token, envUrl);
  if (!patchResult.ok) {
    bail(`PATCH systemforms(${formId}) failed: ${patchResult.error}`);
  }
  console.log('   ✓ PATCH succeeded.');

  // 6. PublishXml scoped to this exact form on its parent entity.
  if (form.objecttypecode) {
    console.log(`   ⚙ Publishing form via PublishXml (entity=${form.objecttypecode}) …`);
    const pubResult = await publishSystemForm(formId, form.objecttypecode, token, envUrl);
    if (!pubResult.ok) {
      bail(`PublishXml failed: ${pubResult.error}`);
    }
    console.log('   ✓ Publish succeeded.');
  }

  // 7. Re-fetch the form and run findFormReferences for the validated
  //    target entity. Fail (exit 8) if any residual reference remains.
  console.log('');
  console.log(
    `   ⚙ Re-inspecting form for residual ${validation.targetEntity} subgrid/reference(s) …`,
  );
  const refetch = await readSystemFormXml(formId, token, envUrl);
  if (!refetch.ok) {
    bail(
      `Could not re-fetch form after cleanup: ${refetch.error}. ` +
        `PATCH already applied; operator should re-fetch manually.`,
      8,
    );
  }
  const residual = findFormReferences(
    refetch.form.formxml ?? '',
    validation.targetEntity,
    PSEUDO_DEAL_COLUMN,
  );
  const residualIndirect =
    residual.subgrids.length +
    residual.quickViews.length +
    residual.targetEntities.length +
    residual.relationships.length +
    residual.navBar.length;
  if (residualIndirect === 0) {
    console.log(
      `   ✓ No remaining ${validation.targetEntity} subgrid/reference on this form.`,
    );
    console.log('');
    console.log('✓ Targeted subgrid cleanup complete.');
    return { ok: true, removed: 1, targetEntity: validation.targetEntity };
  }
  console.error('');
  console.error(
    `   ✗ ${residualIndirect} residual ${validation.targetEntity} reference(s) remain on this form:`,
  );
  printIndirectFindingsSummary({
    total: residualIndirect,
    perTable: [
      {
        table: validation.targetEntity,
        findings: residual,
        indirectTotal: residualIndirect,
      },
    ],
  });
  console.error('');
  console.error('   The targeted subgrid was removed, but more references remain.');
  console.error('   Re-run --cleanup-subgrid for each remaining control id, or fix the');
  console.error('   residual references in Maker Portal, then re-inspect.');
  bail(
    `${residualIndirect} residual ${validation.targetEntity} reference(s) remain on form ${formId} after targeted cleanup.`,
    8,
  );
}

// ---------------------------------------------------------------------------
// SavedQuery (view) inspection + targeted cleanup.
//
// A SavedQuery is a Dataverse view. It carries two XML payloads:
//   - `fetchxml`  — the FetchXML query (attributes, filters, sorts,
//                   link-entity joins).
//   - `layoutxml` — the grid column layout (which attributes appear in
//                   the rendered list view, with widths + labels).
//
// Dependency-component type 26 = SavedQuery. When the dependency
// probe reports a SavedQuery blocker, the operator can:
//   1. Read the view and see exactly which references to the
//      attribute exist, classified by kind (layout cell, fetch
//      attribute, filter condition, sort/order, link-entity binding).
//   2. Safely auto-clean ONLY when the references are limited to
//      displayed layout cells and/or plain fetch attributes on the
//      view's primary entity. Anything else (filter, sort, link-
//      entity) carries hidden semantic meaning and must be removed by
//      the operator in Maker Portal.
// ---------------------------------------------------------------------------

const COMPONENT_TYPE_SAVED_QUERY = 26;

async function readSavedQuery(viewId, token, envUrl) {
  const url =
    `${envUrl}/api/data/v9.2/savedqueries(${viewId})` +
    `?$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml,querytype`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `GET savedqueries(${viewId}) → ${res.status}: ${text}` };
    }
    const view = await res.json();
    return { ok: true, view };
  } catch (err) {
    return { ok: false, error: `savedqueries network error: ${err.message}` };
  }
}

/**
 * Walk a view's fetchxml + layoutxml and group every reference to the
 * supplied attribute into seven categories. Returns offsets relative
 * to the XML payload that contains them, so the cleanup path can
 * splice safely.
 */
function parseViewReferences(fetchxml, layoutxml, attribute) {
  const empty = {
    layoutCells: [],
    fetchTopLevelAttributes: [],
    fetchLinkAttributes: [],
    filterConditions: [],
    orderClauses: [],
    linkEntityFromTo: [],
  };
  if (typeof attribute !== 'string' || attribute.length === 0) return empty;
  const attrEsc = escapeRegExp(attribute);
  const findings = {
    layoutCells: [],
    fetchTopLevelAttributes: [],
    fetchLinkAttributes: [],
    filterConditions: [],
    orderClauses: [],
    linkEntityFromTo: [],
  };

  // --- layoutxml: <cell name="<attr>" .../>  or  <cell …>…</cell>
  if (typeof layoutxml === 'string' && layoutxml.length > 0) {
    const cellSelfClose = new RegExp(
      `<cell\\b[^>]*\\bname="${attrEsc}"[^>]*\\/>`,
      'gi',
    );
    const cellWithBody = new RegExp(
      `<cell\\b[^>]*\\bname="${attrEsc}"[^>]*>[\\s\\S]*?<\\/cell>`,
      'gi',
    );
    for (const re of [cellSelfClose, cellWithBody]) {
      let m;
      while ((m = re.exec(layoutxml)) !== null) {
        findings.layoutCells.push({
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          snippet: m[0],
        });
      }
    }
  }

  // --- fetchxml: attributes — distinguish top-level (on the primary
  //               entity) from link-entity-nested attributes.
  if (typeof fetchxml === 'string' && fetchxml.length > 0) {
    const linkEntityRanges = [];
    const linkRegex = /<link-entity\b[\s\S]*?<\/link-entity>/gi;
    let lm;
    while ((lm = linkRegex.exec(fetchxml)) !== null) {
      linkEntityRanges.push([lm.index, lm.index + lm[0].length]);
    }
    const attrRegex = new RegExp(
      `<attribute\\b[^>]*\\bname="${attrEsc}"[^>]*\\/?>`,
      'gi',
    );
    let am;
    while ((am = attrRegex.exec(fetchxml)) !== null) {
      const inLink = linkEntityRanges.some(
        ([s, e]) => am.index >= s && am.index < e,
      );
      const entry = {
        startIndex: am.index,
        endIndex: am.index + am[0].length,
        snippet: am[0],
      };
      if (inLink) findings.fetchLinkAttributes.push(entry);
      else findings.fetchTopLevelAttributes.push(entry);
    }

    // --- filter conditions: <condition attribute="<attr>" .../>
    const condRegex = new RegExp(
      `<condition\\b[^>]*\\battribute="${attrEsc}"[^>]*\\/?>`,
      'gi',
    );
    let cm;
    while ((cm = condRegex.exec(fetchxml)) !== null) {
      findings.filterConditions.push({
        startIndex: cm.index,
        endIndex: cm.index + cm[0].length,
        snippet: cm[0],
      });
    }

    // --- order: <order attribute="<attr>" .../>
    const orderRegex = new RegExp(
      `<order\\b[^>]*\\battribute="${attrEsc}"[^>]*\\/?>`,
      'gi',
    );
    let om;
    while ((om = orderRegex.exec(fetchxml)) !== null) {
      findings.orderClauses.push({
        startIndex: om.index,
        endIndex: om.index + om[0].length,
        snippet: om[0],
      });
    }

    // --- link-entity from/to: <link-entity ... from|to="<attr>" ...>
    const linkAttrRegex = new RegExp(
      `<link-entity\\b[^>]*\\b(?:from|to)="${attrEsc}"[^>]*>`,
      'gi',
    );
    let lam;
    while ((lam = linkAttrRegex.exec(fetchxml)) !== null) {
      findings.linkEntityFromTo.push({
        startIndex: lam.index,
        endIndex: lam.index + lam[0].length,
        snippet: lam[0],
      });
    }
  }

  return findings;
}

/**
 * Classify a parseViewReferences result into:
 *   'no-references' — nothing to remove.
 *   'safe'          — only layout cells and/or top-level fetch
 *                     attributes are present; the script can splice
 *                     them out automatically.
 *   'unsafe'        — at least one filter condition, sort/order,
 *                     link-entity binding, or link-entity-nested
 *                     attribute is present; the script refuses and
 *                     prints manual remediation.
 */
function classifyViewCleanupSafety(findings) {
  const unsafe =
    findings.fetchLinkAttributes.length > 0 ||
    findings.filterConditions.length > 0 ||
    findings.orderClauses.length > 0 ||
    findings.linkEntityFromTo.length > 0;
  const safeRefs =
    findings.layoutCells.length + findings.fetchTopLevelAttributes.length;
  if (unsafe) return 'unsafe';
  if (safeRefs === 0) return 'no-references';
  return 'safe';
}

function removeSafeViewReferences(fetchxml, layoutxml, findings) {
  let newLayoutXml = layoutxml ?? '';
  // Splice layout cells in reverse offset order.
  const cells = [...findings.layoutCells].sort((a, b) => b.startIndex - a.startIndex);
  for (const c of cells) {
    newLayoutXml = newLayoutXml.slice(0, c.startIndex) + newLayoutXml.slice(c.endIndex);
  }
  let newFetchXml = fetchxml ?? '';
  const attrs = [...findings.fetchTopLevelAttributes].sort(
    (a, b) => b.startIndex - a.startIndex,
  );
  for (const a of attrs) {
    newFetchXml = newFetchXml.slice(0, a.startIndex) + newFetchXml.slice(a.endIndex);
  }
  return { newFetchXml, newLayoutXml };
}

async function patchSavedQuery(viewId, fetchxml, layoutxml, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/savedqueries(${viewId})`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fetchxml, layoutxml }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `PATCH savedqueries(${viewId}) → ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH savedqueries network error: ${err.message}` };
  }
}

async function publishSavedQuery(viewId, entityName, token, envUrl) {
  const url = `${envUrl}/api/data/v9.2/PublishXml`;
  const entityXml = entityName
    ? `<entities><entity>${entityName}</entity></entities>`
    : '';
  const parameterXml =
    `<importexportxml>` +
    entityXml +
    `<savedqueries><savedquery>{${viewId}}</savedquery></savedqueries>` +
    `</importexportxml>`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ParameterXml: parameterXml }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `PublishXml(view) → ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PublishXml(view) network error: ${err.message}` };
  }
}

async function runViewInspect(viewId, qualifiedAttribute, token, envUrl) {
  console.log('');
  console.log('Phase V — SavedQuery (view) inspection (read-only)');
  console.log(`   View id:   ${viewId}`);
  console.log(`   Attribute: ${qualifiedAttribute}`);
  console.log('');

  const [table, attribute] = qualifiedAttribute.split('.');
  if (!table || !attribute) {
    bail(`--attribute must be "<table>.<column>"; got "${qualifiedAttribute}"`);
  }

  const viewResult = await readSavedQuery(viewId, token, envUrl);
  if (!viewResult.ok) bail(`SavedQuery read failed: ${viewResult.error}`);
  const view = viewResult.view;
  console.log(`   View name:           ${view.name ?? '(unknown)'}`);
  console.log(`   returnedtypecode:    ${view.returnedtypecode ?? '(unknown)'}`);
  console.log(`   querytype:           ${view.querytype ?? '(unknown)'}`);
  console.log(`   fetchxml length:     ${view.fetchxml?.length ?? 0} chars`);
  console.log(`   layoutxml length:    ${view.layoutxml?.length ?? 0} chars`);

  if (
    view.returnedtypecode &&
    typeof view.returnedtypecode === 'string' &&
    view.returnedtypecode.toLowerCase() !== table.toLowerCase()
  ) {
    console.log('');
    console.log(
      `   ⚠ View's returnedtypecode (${view.returnedtypecode}) DIFFERS from the`,
    );
    console.log(
      `     attribute's table (${table}). The attribute can only appear here`,
    );
    console.log(
      '     via a link-entity binding — refuse-classification will fire.',
    );
  }

  const findings = parseViewReferences(view.fetchxml, view.layoutxml, attribute);
  console.log('');
  console.log(`   References to ${attribute}:`);
  printFindingsSection(
    `Displayed <cell name="${attribute}" …> in layoutxml`,
    findings.layoutCells,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `Top-level <attribute name="${attribute}" …> in fetchxml (primary entity)`,
    findings.fetchTopLevelAttributes,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `<attribute name="${attribute}" …> inside a <link-entity>`,
    findings.fetchLinkAttributes,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `<condition attribute="${attribute}" …> (filter)`,
    findings.filterConditions,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `<order attribute="${attribute}" …>`,
    findings.orderClauses,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );
  printFindingsSection(
    `<link-entity … from|to="${attribute}" …>`,
    findings.linkEntityFromTo,
    (e) => `chars ${e.startIndex}-${e.endIndex}: ${compactSnippet(e.snippet)}`,
  );

  console.log('');
  const classification = classifyViewCleanupSafety(findings);
  if (classification === 'no-references') {
    console.log(`   ✓ No references to ${attribute} found in this view's XML.`);
  } else if (classification === 'safe') {
    console.log('   → Safe to auto-clean (only displayed cells / top-level fetch attributes).');
    console.log('     Run:');
    console.log(`       node scripts/phase122-lookup-repair.mjs --cleanup-view ${viewId} \\`);
    console.log(`         --attribute ${qualifiedAttribute}`);
    console.log('     then add --commit-view-cleanup to write.');
  } else {
    console.log('   ⚠ NOT safely auto-removable — filter / sort / link-entity refs are present.');
    console.log('     The script will refuse --cleanup-view. Remediation:');
    console.log(`       Open Maker Portal → table ${view.returnedtypecode} → Views`);
    console.log(`       → "${view.name}" → edit fetchxml/sort/filter as appropriate.`);
  }
  console.log('');
  return { ok: true, findings, classification };
}

async function runViewCleanup(viewId, qualifiedAttribute, token, envUrl, doCommit) {
  console.log('');
  console.log('Phase V — Targeted SavedQuery (view) cleanup');
  console.log(`   View id:    ${viewId}`);
  console.log(`   Attribute:  ${qualifiedAttribute}`);
  console.log(`   Mode:       ${doCommit ? 'COMMIT-VIEW-CLEANUP (will write)' : 'dry-run (no write)'}`);
  console.log('');

  const [table, attribute] = qualifiedAttribute.split('.');
  if (!table || !attribute) {
    bail(`--attribute must be "<table>.<column>"; got "${qualifiedAttribute}"`);
  }

  const viewResult = await readSavedQuery(viewId, token, envUrl);
  if (!viewResult.ok) bail(`SavedQuery read failed: ${viewResult.error}`);
  const view = viewResult.view;
  console.log(`   View name:           ${view.name ?? '(unknown)'}`);
  console.log(`   returnedtypecode:    ${view.returnedtypecode ?? '(unknown)'}`);

  const findings = parseViewReferences(view.fetchxml, view.layoutxml, attribute);
  const classification = classifyViewCleanupSafety(findings);

  if (classification === 'no-references') {
    console.log('');
    console.log(`   ✓ No references to ${attribute} in this view. Nothing to remove.`);
    return { ok: true, removed: 0 };
  }

  if (classification === 'unsafe') {
    console.log('');
    console.log(`   ⚠ Refusing to auto-clean — the view contains UNSAFE references:`);
    if (findings.fetchLinkAttributes.length) {
      console.log(`       <attribute> inside <link-entity>: ${findings.fetchLinkAttributes.length}`);
    }
    if (findings.filterConditions.length) {
      console.log(`       <condition attribute="${attribute}">: ${findings.filterConditions.length}`);
    }
    if (findings.orderClauses.length) {
      console.log(`       <order attribute="${attribute}">:     ${findings.orderClauses.length}`);
    }
    if (findings.linkEntityFromTo.length) {
      console.log(`       <link-entity from|to="${attribute}">: ${findings.linkEntityFromTo.length}`);
    }
    console.log('');
    console.log('   Required operator action — Maker Portal:');
    console.log(`     Table:  ${view.returnedtypecode}`);
    console.log(`     View:   "${view.name}"`);
    console.log('     Open the view editor and remove the filter / sort / join that');
    console.log(`     references ${attribute}. Save + publish.`);
    console.log('');
    console.log('   The script will NOT modify view semantics it cannot prove safe.');
    return { ok: true, removed: 0, refusedAsUnsafe: true };
  }

  // classification === 'safe'
  console.log('');
  console.log(`   Safely removable references found:`);
  if (findings.layoutCells.length) {
    console.log(`     - layoutxml cells: ${findings.layoutCells.length}`);
    for (const [i, c] of findings.layoutCells.entries()) {
      console.log(`         [${i + 1}] chars ${c.startIndex}-${c.endIndex}: ${compactSnippet(c.snippet, 200)}`);
    }
  }
  if (findings.fetchTopLevelAttributes.length) {
    console.log(`     - fetchxml top-level <attribute>: ${findings.fetchTopLevelAttributes.length}`);
    for (const [i, a] of findings.fetchTopLevelAttributes.entries()) {
      console.log(`         [${i + 1}] chars ${a.startIndex}-${a.endIndex}: ${compactSnippet(a.snippet, 200)}`);
    }
  }

  if (!doCommit) {
    console.log('');
    console.log('   Dry-run only — no PATCH or PublishXml issued.');
    console.log('   Re-run with `--commit-view-cleanup` to actually remove the reference(s).');
    return { ok: true, removed: 0, planned: findings.layoutCells.length + findings.fetchTopLevelAttributes.length };
  }

  const { newFetchXml, newLayoutXml } = removeSafeViewReferences(
    view.fetchxml,
    view.layoutxml,
    findings,
  );
  console.log('');
  console.log(
    `   ⚙ Splicing ${findings.layoutCells.length} layout cell(s) + ` +
      `${findings.fetchTopLevelAttributes.length} top-level fetch attribute(s) ` +
      `out of the SavedQuery body.`,
  );

  console.log(`   ⚙ PATCH savedqueries(${viewId}) …`);
  const patchResult = await patchSavedQuery(viewId, newFetchXml, newLayoutXml, token, envUrl);
  if (!patchResult.ok) bail(`PATCH savedqueries(${viewId}) failed: ${patchResult.error}`);
  console.log('   ✓ PATCH succeeded.');

  console.log(`   ⚙ Publishing view via PublishXml …`);
  const pubResult = await publishSavedQuery(
    viewId,
    view.returnedtypecode,
    token,
    envUrl,
  );
  if (!pubResult.ok) bail(`PublishXml(view) failed: ${pubResult.error}`);
  console.log('   ✓ Publish succeeded.');

  // Re-run dependency probe for the attribute the view was blocking.
  console.log('');
  console.log(
    `   ⚙ Re-running RetrieveDependenciesForDelete for ${table}.${attribute} …`,
  );
  const idResult = await getAttributeMetadataId(table, attribute, token, envUrl);
  if (idResult.ok) {
    const depResult = await retrieveDependenciesForDelete(
      COMPONENT_TYPE_ATTRIBUTE,
      idResult.metadataId,
      token,
      envUrl,
    );
    if (!depResult.ok) {
      console.log(`     ⚠ Re-probe failed: ${depResult.error}`);
    } else if (depResult.dependencies.length === 0) {
      console.log(`     ✓ ${table}.${attribute} has ZERO dependent components.`);
      console.log('       This view is no longer blocking the pseudo-column delete.');
    } else {
      console.log(
        `     ⚠ ${table}.${attribute} still has ${depResult.dependencies.length} dependent component(s).`,
      );
      console.log('       Run `--inspect-dependencies` for the full breakdown.');
    }
  }
  console.log('');
  console.log('✓ View cleanup commit complete.');
  return {
    ok: true,
    removed: findings.layoutCells.length + findings.fetchTopLevelAttributes.length,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 137G — Copilot Custom API metadata: plan builder + dry-run + inspect.
//
// Dry-run / read-only ONLY. The plan builder is pure (no IO). The dry-run
// printer is OFFLINE (no auth, no Web API call). The inspect mode uses
// read-only GETs against the Dataverse metadata Web API. NOTHING here
// writes, creates a plugin, calls Azure OpenAI, or enables live runtime.
// ---------------------------------------------------------------------------

/**
 * Pure: build the planned Dataverse Custom API metadata payloads for
 * cr664_RunLosCopilotAssist. No IO. The shapes mirror the Dataverse
 * CustomAPI / CustomAPIRequestParameter / CustomAPIResponseProperty
 * entities; a future commit phase (NOT this one) would POST them.
 *
 *   BindingType 0 = Global (unbound)  ← recommended (Phase 137F runbook)
 *   Parameter/property Type 10 = String
 *   AllowedCustomProcessingStepType 0 = None
 */
function buildCopilotCustomApiMetadataPlan() {
  const customApi = {
    uniquename: COPILOT_CUSTOM_API_NAME,
    name: COPILOT_CUSTOM_API_NAME,
    displayname: COPILOT_CUSTOM_API_DISPLAY_NAME,
    description:
      'Server-side Copilot assist (Phase 137B contract). Browser → this ' +
      'Custom API → server-side Azure OpenAI. Proposal-only; requireConfirmation.',
    isfunction: false, // Action, not Function
    isprivate: false, // callable by authorized LOS users
    bindingtype: 0, // 0 = Global (unbound) — recommended
    boundentitylogicalname: null,
    allowedcustomprocessingsteptype: 0, // None
    executeprivilegename: null, // gated by an existing LOS security role
  };
  const requestParameters = [
    {
      uniquename: COPILOT_CUSTOM_API_REQUEST_PARAM,
      name: COPILOT_CUSTOM_API_REQUEST_PARAM,
      displayname: 'Request payload (JSON)',
      type: 10, // String
      isoptional: false,
      description:
        'Phase 137B request JSON (already-authorized, minimized/redacted context).',
    },
    {
      uniquename: COPILOT_CUSTOM_API_CORRELATION_PARAM,
      name: COPILOT_CUSTOM_API_CORRELATION_PARAM,
      displayname: 'Correlation id',
      type: 10, // String
      isoptional: false,
      description: 'Correlation id for the audit / event ledger.',
    },
  ];
  const responseProperties = [
    {
      uniquename: COPILOT_CUSTOM_API_RESPONSE_PROP,
      name: COPILOT_CUSTOM_API_RESPONSE_PROP,
      displayname: 'Response payload (JSON)',
      type: 10, // String
      description:
        'Phase 137B response JSON (mode, isLive, answer?, proposals[], warnings[], audit).',
    },
  ];
  return { customApi, requestParameters, responseProperties };
}

function printCopilotExpectedContract() {
  console.log(
    'Expected contract (Phase 137B — docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md):',
  );
  console.log(`   Custom API name:   ${COPILOT_CUSTOM_API_NAME}`);
  console.log(`   Display name:      ${COPILOT_CUSTOM_API_DISPLAY_NAME}`);
  console.log('   Binding:           Unbound (Global) action — server-side execution.');
  console.log(
    `   Request params:    ${COPILOT_CUSTOM_API_REQUEST_PARAM} (String), ${COPILOT_CUSTOM_API_CORRELATION_PARAM} (String)`,
  );
  console.log(`   Response property: ${COPILOT_CUSTOM_API_RESPONSE_PROP} (String, JSON)`);
  console.log('   Behavior:          proposal-only, requireConfirmation=true, fail-closed.');
  console.log('   Azure OpenAI:      SERVER-SIDE ONLY. Browser never calls it directly.');
  console.log('');
}

/**
 * Phase 137G — DRY-RUN-ONLY metadata creation plan. Offline (no auth, no
 * Web API call). Prints the exact planned Dataverse payloads and returns
 * BEFORE any write. Commit is NOT implemented in this phase: passing
 * --commit-seed-copilot-custom-api-metadata prints a notice and still
 * performs no write.
 */
function runSeedCopilotCustomApiMetadataPlan() {
  console.log('Phase 137G — Copilot Custom API metadata creation PLAN (dry-run)');
  console.log('');
  console.log('NOTE: this mode is OFFLINE and DRY-RUN ONLY. It performs no pac auth,');
  console.log('      no Web API call, and no write. It plans the metadata for the');
  console.log(`      future ${COPILOT_CUSTOM_API_NAME} Dataverse Custom API.`);
  console.log('');
  printCopilotExpectedContract();

  const plan = buildCopilotCustomApiMetadataPlan();

  console.log('-'.repeat(70));
  console.log('Planned CustomAPI entity payload (future POST /api/data/v9.2/customapis):');
  console.log('-'.repeat(70));
  console.log(JSON.stringify(plan.customApi, null, 2));
  console.log('');
  console.log('-'.repeat(70));
  console.log('Planned CustomAPIRequestParameter payloads (one future POST each):');
  console.log('-'.repeat(70));
  for (const p of plan.requestParameters) {
    console.log(JSON.stringify(p, null, 2));
  }
  console.log('');
  console.log('-'.repeat(70));
  console.log('Planned CustomAPIResponseProperty payloads (one future POST each):');
  console.log('-'.repeat(70));
  for (const p of plan.responseProperties) {
    console.log(JSON.stringify(p, null, 2));
  }
  console.log('');

  if (FLAGS.commitSeedCopilotCustomApiMetadata) {
    console.log('⚠  --commit-seed-copilot-custom-api-metadata is NOT IMPLEMENTED in Phase');
    console.log('   138C; use dry-run plan only. No write has been or will be issued. COMMIT IS');
    console.log('   gated future-only.');
    console.log('');
    console.log('   Why (future-only): this repo has no proven Dataverse Custom API');
    console.log('   (customapis) creation pattern, and live Custom API creation requires the');
    console.log('   audit table (Phase 138B) plus Gate 1 (DLP / model policy) + governance');
    console.log('   approval in a TEST TENANT first (see PHASE_137M / PHASE_138A). The');
    console.log('   complete payload plan above is what a future, approved, guarded commit');
    console.log('   would create.');
    console.log('');
    console.log('   Future commit contract (when implemented, test tenant only):');
    console.log(`     - publisher prefix ${CR664_PUBLISHER_PREFIX} (forbidden prefix ${FORBIDDEN_PUBLISHER_PREFIX}_ rejected);`);
    console.log('     - INSPECT first; bail on ambiguous / duplicate existing Custom API;');
    console.log('     - idempotent: if cr664_RunLosCopilotAssist exists with the expected');
    console.log('       contract, verify + skip create;');
    console.log('     - create ONLY the Custom API + request/response metadata (137B/137F) —');
    console.log('       no plugin, no Azure Function, no Azure OpenAI, no secret, no runtime');
    console.log('       config, no UI change, no Copilot runtime enablement;');
    console.log('     - no metadata publish step; no bypass / suppress / force headers;');
    console.log('     - verify by re-reading the Custom API metadata.');
    console.log('');
  }

  console.log('No pac auth, no Web API call, no write, no plugin, no Azure resource.');
  console.log('Runtime Copilot connector remains not_configured.');
}

/**
 * Phase 137G — read-only inspection of the future Copilot Custom API
 * metadata. Pure GETs against the Dataverse Web API. Never writes.
 */
async function runInspectCopilotCustomApi(token, envUrl) {
  console.log('');
  console.log('Phase 137G — Copilot Custom API inspection (Web API metadata, read-only)');
  console.log(`   Target Custom API: ${COPILOT_CUSTOM_API_NAME}`);
  console.log('');
  printCopilotExpectedContract();

  const headers = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
  };
  const url =
    `${envUrl}/api/data/v9.2/customapis` +
    `?$filter=uniquename eq '${COPILOT_CUSTOM_API_NAME}'` +
    `&$select=customapiid,uniquename,name,displayname,isfunction,isprivate,bindingtype,boundentitylogicalname`;
  let res;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch (err) {
    bail(`Copilot Custom API inspection network error: ${err.message}`);
    return;
  }
  if (!res.ok) {
    const text = await res.text();
    bail(`customapis GET → ${res.status}: ${text}`);
    return;
  }
  const json = await res.json();
  const rows = Array.isArray(json.value) ? json.value : [];
  if (rows.length === 0) {
    console.log(`   RESULT: ${COPILOT_CUSTOM_API_NAME} does NOT exist in this environment.`);
    console.log('   (Expected in Phase 137G — the Custom API has not been created yet.)');
    console.log('');
    console.log('Read-only inspection. No write of any kind has been issued.');
    return;
  }
  const api = rows[0];
  console.log(`   RESULT: ${COPILOT_CUSTOM_API_NAME} EXISTS.`);
  console.log(`     customapiid:            ${api.customapiid}`);
  console.log(`     name:                   ${api.name}`);
  console.log(`     displayname:            ${api.displayname}`);
  console.log(`     isfunction:             ${api.isfunction}`);
  console.log(`     isprivate:              ${api.isprivate}`);
  console.log(`     bindingtype:            ${api.bindingtype}`);
  console.log(`     boundentitylogicalname: ${api.boundentitylogicalname ?? '(none — unbound)'}`);
  console.log('');

  // Read-only follow-up GETs: request parameters + response properties.
  const reqUrl =
    `${envUrl}/api/data/v9.2/customapirequestparameters` +
    `?$filter=_customapiid_value eq ${api.customapiid}` +
    `&$select=uniquename,name,type,isoptional`;
  const respUrl =
    `${envUrl}/api/data/v9.2/customapiresponseproperties` +
    `?$filter=_customapiid_value eq ${api.customapiid}` +
    `&$select=uniquename,name,type`;
  try {
    const [rq, rp] = await Promise.all([
      fetch(reqUrl, { method: 'GET', headers }),
      fetch(respUrl, { method: 'GET', headers }),
    ]);
    if (rq.ok) {
      const j = await rq.json();
      console.log(`   Request parameters (${(j.value ?? []).length}):`);
      for (const p of j.value ?? []) {
        console.log(`     - ${p.uniquename}  type=${p.type}  isoptional=${p.isoptional}`);
      }
    }
    if (rp.ok) {
      const j = await rp.json();
      console.log(`   Response properties (${(j.value ?? []).length}):`);
      for (const p of j.value ?? []) {
        console.log(`     - ${p.uniquename}  type=${p.type}`);
      }
    }
  } catch (err) {
    console.log(`   (could not fetch parameter metadata: ${err.message})`);
  }
  console.log('');
  console.log('Read-only inspection. No write, no plugin, no Azure resource touched.');
}

// ---------------------------------------------------------------------------
// Phase 137J — Copilot audit-event TABLE metadata: dry-run plan + inspect.
//
// Dry-run / read-only ONLY. The plan printer is OFFLINE (no auth, no Web
// API call). The inspect mode uses read-only GETs against the Dataverse
// metadata Web API. NOTHING here creates a table/attribute/index, runs a
// publish, calls Azure OpenAI, or enables live runtime.
// ---------------------------------------------------------------------------

function printCopilotAuditTableExpectedContract() {
  console.log(
    'Expected ledger contract (Phase 137I — docs/PHASE_137I_COPILOT_AUDIT_EVENT_LEDGER_DESIGN.md):',
  );
  console.log(`   Table logical/schema:   ${COPILOT_AUDIT_TABLE_LOGICAL_NAME}`);
  console.log(`   Display name:           ${COPILOT_AUDIT_TABLE_DISPLAY_NAME}`);
  console.log(`   Plural display name:    ${COPILOT_AUDIT_TABLE_PLURAL_DISPLAY_NAME}`);
  console.log(`   Primary name attribute: ${COPILOT_AUDIT_TABLE_PRIMARY_NAME}`);
  console.log('   Recommended ownership:  User/team-owned (unless an existing project');
  console.log('                           convention requires organization-owned).');
  console.log(
    '   Audit-before-model:     audit_start must be written BEFORE any Azure OpenAI /',
  );
  console.log(
    '                           model call; if it cannot, fail closed audit_unavailable.',
  );
  console.log('');
}

// Phase 138B — typed attribute classification for the audit-table fields.
// Most fields are single-line String; summaries / JSON blobs are Memo;
// cr664_islive is Boolean; cr664_proposalcount is Integer;
// cr664_eventtimestamp is DateTime. cr664_eventtype is text-first (a
// picklist is documented as FUTURE hardening per Phase 137J).
const COPILOT_AUDIT_MEMO_FIELDS = Object.freeze(
  new Set([
    'cr664_redactedpromptsummary',
    'cr664_contextsummary',
    'cr664_warningsjson',
    'cr664_proposalsjson',
    'cr664_errorsummary',
  ]),
);

function copilotAuditAttributeType(field) {
  if (field === 'cr664_islive') {
    return { odataType: 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', attributeType: 'Boolean' };
  }
  if (field === 'cr664_proposalcount') {
    return { odataType: 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', attributeType: 'Integer' };
  }
  if (field === 'cr664_eventtimestamp') {
    return { odataType: 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', attributeType: 'DateTime' };
  }
  if (COPILOT_AUDIT_MEMO_FIELDS.has(field)) {
    return { odataType: 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', attributeType: 'Memo' };
  }
  return { odataType: 'Microsoft.Dynamics.CRM.StringAttributeMetadata', attributeType: 'String' };
}

/**
 * Phase 138B — pure: build the planned (illustrative) AttributeDefinitions
 * payload for one audit field. NOT executed — printed in the dry-run plan
 * for a future, approved, guarded commit. No IO.
 */
function buildCopilotAuditAttributePayload(field) {
  const t = copilotAuditAttributeType(field);
  const payload = {
    '@odata.type': t.odataType,
    SchemaName: field,
    LogicalName: field,
    AttributeType: t.attributeType,
    RequiredLevel: { Value: 'None' },
  };
  if (t.attributeType === 'String') payload.MaxLength = 200;
  if (t.attributeType === 'Memo') {
    payload.MaxLength = 4000;
    payload.Format = 'TextArea';
  }
  if (field === 'cr664_eventtype') {
    payload._note =
      'Text-first. A cr664_eventtype Picklist is FUTURE hardening (Phase 137J).';
  }
  return payload;
}

/** Phase 138B — the embedded primary-name String attribute (cr664_name). */
function buildCopilotAuditPrimaryNamePayload() {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: COPILOT_AUDIT_TABLE_PRIMARY_NAME,
    LogicalName: COPILOT_AUDIT_TABLE_PRIMARY_NAME,
    AttributeType: 'String',
    RequiredLevel: { Value: 'ApplicationRequired' },
    IsPrimaryName: true,
    MaxLength: 200,
  };
}

/**
 * Phase 137J + 138B — DRY-RUN-ONLY audit-table metadata plan. Offline (no
 * auth, no Web API call). Prints the COMPLETE planned metadata — full
 * EntityDefinitions table payload + a typed AttributeDefinitions payload per
 * field — and returns BEFORE any write. Commit is NOT implemented:
 * passing --commit-seed-copilot-audit-table-metadata prints a clear
 * future-only notice and still performs no write.
 */
function runSeedCopilotAuditTableMetadataPlan() {
  console.log('Phase 137J — Copilot audit-event TABLE metadata creation PLAN (dry-run)');
  console.log('');
  console.log('NOTE: this mode is OFFLINE and DRY-RUN ONLY. It performs no pac auth,');
  console.log('      no Web API call, and no write. It plans the metadata for the');
  console.log(`      future ${COPILOT_AUDIT_TABLE_LOGICAL_NAME} Dataverse table.`);
  console.log('');
  printCopilotAuditTableExpectedContract();

  console.log('-'.repeat(70));
  console.log('Planned TABLE metadata (future EntityDefinitions POST):');
  console.log('-'.repeat(70));
  console.log(
    JSON.stringify(
      {
        LogicalName: COPILOT_AUDIT_TABLE_LOGICAL_NAME,
        SchemaName: COPILOT_AUDIT_TABLE_LOGICAL_NAME,
        DisplayName: COPILOT_AUDIT_TABLE_DISPLAY_NAME,
        DisplayCollectionName: COPILOT_AUDIT_TABLE_PLURAL_DISPLAY_NAME,
        PrimaryNameAttribute: COPILOT_AUDIT_TABLE_PRIMARY_NAME,
        OwnershipType: 'UserOwned',
        HasNotes: false,
        HasActivities: false,
      },
      null,
      2,
    ),
  );
  console.log('');

  console.log('-'.repeat(70));
  console.log('Planned PRIMARY-NAME attribute (embedded in the table create):');
  console.log('-'.repeat(70));
  console.log(JSON.stringify(buildCopilotAuditPrimaryNamePayload(), null, 2));
  console.log('');

  console.log('-'.repeat(70));
  console.log(`Planned FIELDS (${COPILOT_AUDIT_FIELDS.length}) — one future attribute each:`);
  console.log('-'.repeat(70));
  for (const field of COPILOT_AUDIT_FIELDS) {
    const t = copilotAuditAttributeType(field);
    console.log(`   - ${field}   (${t.attributeType})`);
  }
  console.log('');

  console.log('-'.repeat(70));
  console.log(
    `Planned ATTRIBUTE payloads (future AttributeDefinitions POST — one per field):`,
  );
  console.log('-'.repeat(70));
  for (const field of COPILOT_AUDIT_FIELDS) {
    console.log(JSON.stringify(buildCopilotAuditAttributePayload(field), null, 2));
  }
  console.log('');

  console.log('-'.repeat(70));
  console.log(`Planned cr664_eventtype option values (${COPILOT_AUDIT_EVENT_TYPES.length}):`);
  console.log('-'.repeat(70));
  for (const ev of COPILOT_AUDIT_EVENT_TYPES) {
    console.log(`   - ${ev}`);
  }
  console.log('');

  console.log('-'.repeat(70));
  console.log(`Recommended indexes (${COPILOT_AUDIT_RECOMMENDED_INDEXES.length}):`);
  console.log('-'.repeat(70));
  for (const idx of COPILOT_AUDIT_RECOMMENDED_INDEXES) {
    console.log(`   - ${idx}`);
  }
  console.log('   (No uniqueness on cr664_correlationid — lifecycle events share it.)');
  console.log('');

  if (FLAGS.commitSeedCopilotAuditTableMetadata) {
    console.log('⚠  --commit-seed-copilot-audit-table-metadata is NOT IMPLEMENTED in Phase');
    console.log('   138B; run dry-run only. No write has been or will be issued.');
    console.log('');
    console.log('   Why (future-only): this repo has no proven Dataverse table');
    console.log('   (EntityDefinitions) or attribute (AttributeDefinitions) creation');
    console.log('   pattern, and live audit-table creation requires Gate 1 (DLP / model');
    console.log('   policy) + Gate 2 approval in a TEST TENANT first (see PHASE_137M /');
    console.log('   PHASE_138A). The complete payload plan above is what a future,');
    console.log('   approved, guarded commit would create.');
    console.log('');
    console.log('   Future commit contract (when implemented, test tenant only):');
    console.log(`     - publisher prefix ${CR664_PUBLISHER_PREFIX} (forbidden prefix ${FORBIDDEN_PUBLISHER_PREFIX}_ rejected);`);
    console.log('     - INSPECT first; bail on ambiguous / duplicate existing table;');
    console.log('     - idempotent: if cr664_copilotauditevent exists, verify + skip create;');
    console.log('     - create ONLY the audit table + audit fields — no Custom API, no');
    console.log('       plugin, no Azure resource, no Copilot runtime enablement;');
    console.log('     - no metadata publish step; no bypass / suppress / force headers;');
    console.log('     - verify by re-reading the table metadata + expected fields.');
    console.log('');
  }

  console.log('No table is created. No attributes are created. No indexes are created.');
  console.log('No publish is run. This is a metadata plan only.');
  console.log('No pac auth, no Web API call, no write, no plugin, no Azure resource.');
  console.log('Runtime Copilot connector remains not_configured.');
}

/**
 * Phase 137J — read-only inspection of the future Copilot audit-event table
 * metadata. Pure GETs against the Dataverse Web API. Never writes.
 */
async function runInspectCopilotAuditTable(token, envUrl) {
  console.log('');
  console.log('Phase 137J — Copilot audit-event table inspection (Web API metadata, read-only)');
  console.log(`   Target table: ${COPILOT_AUDIT_TABLE_LOGICAL_NAME}`);
  console.log('');
  printCopilotAuditTableExpectedContract();

  const headers = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
  };
  const url =
    `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${COPILOT_AUDIT_TABLE_LOGICAL_NAME}')` +
    `?$select=LogicalName,SchemaName,PrimaryNameAttribute,PrimaryIdAttribute,OwnershipType` +
    `&$expand=Attributes($select=LogicalName,AttributeType)`;
  let res;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch (err) {
    bail(`Copilot audit-table inspection network error: ${err.message}`);
    return;
  }
  if (res.status === 404) {
    console.log(`   RESULT: ${COPILOT_AUDIT_TABLE_LOGICAL_NAME} does NOT exist in this environment.`);
    console.log('   (Expected in Phase 137J — the audit table has not been created yet.)');
    console.log('');
    console.log('Read-only inspection. No write of any kind has been issued.');
    return;
  }
  if (!res.ok) {
    const text = await res.text();
    bail(`EntityDefinitions GET → ${res.status}: ${text}`);
    return;
  }
  const table = await res.json();
  console.log(`   RESULT: ${COPILOT_AUDIT_TABLE_LOGICAL_NAME} EXISTS.`);
  console.log(`     SchemaName:           ${table.SchemaName}`);
  console.log(`     PrimaryNameAttribute: ${table.PrimaryNameAttribute}`);
  console.log(`     PrimaryIdAttribute:   ${table.PrimaryIdAttribute}`);
  console.log(`     OwnershipType:        ${table.OwnershipType}`);
  console.log('');

  // Report which expected audit fields are present (read-only).
  const present = new Set(
    (table.Attributes ?? []).map((a) => String(a.LogicalName).toLowerCase()),
  );
  console.log('   Expected audit-contract field presence:');
  let missing = 0;
  for (const field of COPILOT_AUDIT_FIELDS) {
    const has = present.has(field.toLowerCase());
    if (!has) missing += 1;
    console.log(`     ${has ? '✓' : '✗'} ${field}`);
  }
  console.log('');
  console.log(`   ${COPILOT_AUDIT_FIELDS.length - missing}/${COPILOT_AUDIT_FIELDS.length} expected fields present; ${missing} missing.`);
  console.log('');
  console.log('Read-only inspection. No write, no plugin, no Azure resource touched.');
}

// ---------------------------------------------------------------------------
// Phase 140I — Portfolio Boarding Dataverse schema inspect / plan (READ-ONLY)
//
// Both modes below issue ONLY GET requests against the Web API metadata
// endpoints. They never write, never call the publish endpoint, never send
// bypass or suppress headers, and expose NO commit flag. Phase 140I inspects
// and plans only — it does not create Dataverse schema.
// ---------------------------------------------------------------------------

const PORTFOLIO_BOARDING_PREFIX = CR664_PUBLISHER_PREFIX; // 'cr664'
const PORTFOLIO_BOARDING_ROOT_TABLE = 'cr664_portfolioboardedloan';

// The 13 candidate boarded-loan tables (root first, then children).
const PORTFOLIO_BOARDING_CANDIDATE_TABLES = [
  { logical: 'cr664_portfolioboardedloan', display: 'Portfolio Boarded Loan', root: true },
  { logical: 'cr664_portfolioboardedloanborrower', display: 'Portfolio Boarded Loan Borrower', root: false },
  { logical: 'cr664_portfolioboardedloancollateral', display: 'Portfolio Boarded Loan Collateral', root: false },
  { logical: 'cr664_portfolioboardedloanguarantor', display: 'Portfolio Boarded Loan Guarantor', root: false },
  { logical: 'cr664_portfolioboardedloancovenant', display: 'Portfolio Boarded Loan Covenant', root: false },
  { logical: 'cr664_portfolioboardedloantickler', display: 'Portfolio Boarded Loan Tickler', root: false },
  { logical: 'cr664_portfolioboardedloaninsurance', display: 'Portfolio Boarded Loan Insurance', root: false },
  { logical: 'cr664_portfolioboardedloandocument', display: 'Portfolio Boarded Loan Document', root: false },
  { logical: 'cr664_portfolioboardedloanexception', display: 'Portfolio Boarded Loan Exception', root: false },
  { logical: 'cr664_portfolioboardedloanreview', display: 'Portfolio Boarded Loan Review', root: false },
  { logical: 'cr664_portfolioboardedloanevidence', display: 'Portfolio Boarded Loan Evidence', root: false },
  { logical: 'cr664_portfolioboardedloanauditentry', display: 'Portfolio Boarded Loan Audit Entry', root: false },
  { logical: 'cr664_portfolioboardedloanexaminernote', display: 'Portfolio Boarded Loan Examiner Note', root: false },
];

// Existing project tables the boarded loan may reuse / link to.
const PORTFOLIO_BOARDING_RELATED_TABLES = [
  'cr664_loandeal',
  'cr664_clientrelationship',
  'cr664_banker',
  'cr664_team',
  'cr664_platformuser',
];

// Seed order for the plan output.
const PORTFOLIO_BOARDING_SEED_ORDER = PORTFOLIO_BOARDING_CANDIDATE_TABLES.map(
  (t) => t.logical,
);

function metadataHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
  };
}

// Read-only GET of one EntityDefinition. Returns { exists, table } or
// { exists: false }. Never writes.
async function getEntityDefinition(token, envUrl, logicalName) {
  const url =
    `${envUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')` +
    `?$select=LogicalName,SchemaName,DisplayName,EntitySetName,OwnershipType,` +
    `PrimaryIdAttribute,PrimaryNameAttribute,IsActivity,HasActivities,HasNotes` +
    `&$expand=Attributes($select=LogicalName,AttributeType)`;
  const res = await fetch(url, { method: 'GET', headers: metadataHeaders(token) });
  if (res.status === 404) return { exists: false };
  if (!res.ok) {
    const text = await res.text();
    bail(`EntityDefinitions GET for ${logicalName} → ${res.status}: ${text}`);
    return { exists: false };
  }
  return { exists: true, table: await res.json() };
}

function classifyBoardingTable(meta) {
  if (!meta.exists) return 'MISSING_CAN_SEED';
  const table = meta.table;
  const schema = String(table.SchemaName ?? '');
  // Wrong-prefix or non-cr664 artifact occupying the name → conflict.
  if (!schema.toLowerCase().startsWith(PORTFOLIO_BOARDING_PREFIX)) {
    return 'BLOCKED_BY_CONFLICT';
  }
  // Exists under the right prefix — reusable, pending operator review.
  return 'EXISTS_NEEDS_REVIEW';
}

async function runInspectPortfolioBoardingSchema(token, envUrl) {
  console.log('');
  console.log('Phase 140I — Portfolio boarding schema inspection (Web API metadata, read-only)');
  console.log(`   Expected publisher prefix: ${PORTFOLIO_BOARDING_PREFIX}`);
  console.log('   This mode issues GET requests only. No write of any kind is issued.');
  console.log('');

  const classifications = {};
  for (const cand of PORTFOLIO_BOARDING_CANDIDATE_TABLES) {
    const meta = await getEntityDefinition(token, envUrl, cand.logical);
    const classification = classifyBoardingTable(meta);
    classifications[cand.logical] = classification;
    console.log('-'.repeat(70));
    console.log(`-- ${cand.display}${cand.root ? '  (ROOT)' : ''}`);
    console.log(`   logicalName:   ${cand.logical}`);
    console.log(`   classification: ${classification}`);
    if (meta.exists) {
      const t = meta.table;
      console.log(`   schemaName:    ${t.SchemaName}`);
      console.log(`   entitySetName: ${t.EntitySetName}`);
      console.log(`   ownershipType: ${t.OwnershipType}`);
      console.log(`   primaryId:     ${t.PrimaryIdAttribute}`);
      console.log(`   primaryName:   ${t.PrimaryNameAttribute}`);
      console.log(`   isActivity:    ${t.IsActivity}`);
      console.log(`   hasNotes:      ${t.HasNotes}`);
      console.log(`   attributeCount: ${(t.Attributes ?? []).length}`);
    } else {
      console.log('   (table does not exist — MISSING_CAN_SEED is expected in Phase 140I)');
    }
  }

  console.log('');
  console.log('-'.repeat(70));
  console.log('Existing related tables (reuse / lookup-target candidates):');
  for (const rel of PORTFOLIO_BOARDING_RELATED_TABLES) {
    const meta = await getEntityDefinition(token, envUrl, rel);
    if (meta.exists) {
      const t = meta.table;
      console.log(`   ✓ ${rel}  (id=${t.PrimaryIdAttribute}, name=${t.PrimaryNameAttribute}, set=${t.EntitySetName}) — candidate lookup target`);
    } else {
      console.log(`   ✗ ${rel}  (not found — lookups to this target must be deferred)`);
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('PORTFOLIO_BOARDING_SCHEMA_RECOMMENDATION');
  console.log('='.repeat(70));
  const missing = Object.entries(classifications).filter(([, c]) => c === 'MISSING_CAN_SEED');
  const conflicts = Object.entries(classifications).filter(([, c]) => c === 'BLOCKED_BY_CONFLICT');
  const reusable = Object.entries(classifications).filter(([, c]) => c === 'EXISTS_REUSABLE' || c === 'EXISTS_NEEDS_REVIEW');
  console.log(`   tables to create (MISSING_CAN_SEED): ${missing.length}`);
  for (const [name] of missing) console.log(`     - ${name}`);
  console.log(`   tables to reuse / review:            ${reusable.length}`);
  for (const [name] of reusable) console.log(`     - ${name}`);
  console.log(`   conflicts to resolve manually:       ${conflicts.length}`);
  for (const [name] of conflicts) console.log(`     - ${name}`);
  console.log('   relationships to create: child → root cr664_portfolioboardedloan lookups + optional external links.');
  console.log('   blockers before live persistence: any BLOCKED_BY_CONFLICT, unconfirmed prefix, or missing required lookup target.');
  console.log('   recommended next script mode: --plan-portfolio-boarding-schema');
  console.log('');

  // --- Phase 140K verification section (read-only) ----------------------
  await printPortfolioBoardingVerification(token, envUrl);

  console.log('');
  console.log('Read-only inspection. No table, column, relationship, or option set was created.');
}

// Phase 140K — concise post-seed verification (read-only). Resolves internal
// portfolio boarding tables as valid lookup targets and distinguishes required
// items (blockers) from the optional evidence→document lookup (warning).
async function printPortfolioBoardingVerification(token, envUrl) {
  let foundTables = 0;
  const missingTables = [];
  let expectedColumns = 0;
  const missingColumns = [];
  let requiredRelExpected = 0;
  let requiredRelFound = 0;
  const requiredRelMissing = [];
  let optionalRelExpected = 0;
  let optionalRelFound = 0;
  const optionalRelMissing = [];
  let conflicts = 0;

  for (const t of PB_SEED_TABLES) {
    const meta = await getEntityDefinition(token, envUrl, t.logical);
    const present = meta.exists
      ? new Set((meta.table.Attributes ?? []).map((a) => String(a.LogicalName).toLowerCase()))
      : new Set();
    if (meta.exists && classifyBoardingTable(meta) === 'BLOCKED_BY_CONFLICT') conflicts += 1;
    if (meta.exists) foundTables += 1;
    else missingTables.push(t.logical);

    for (const [name] of t.columns) {
      expectedColumns += 1;
      const logical = `cr664_${name}`;
      if (!meta.exists || !present.has(logical)) missingColumns.push(`${t.logical}.${logical}`);
    }
    for (const lk of t.lookups) {
      const has = meta.exists && present.has(lk.schema.toLowerCase());
      if (lk.required) {
        requiredRelExpected += 1;
        if (has) requiredRelFound += 1;
        else requiredRelMissing.push(`${t.logical}.${lk.schema}`);
      } else {
        optionalRelExpected += 1;
        if (has) optionalRelFound += 1;
        else optionalRelMissing.push(`${t.logical}.${lk.schema} → ${lk.target}`);
      }
    }
  }

  const safeForRuntimePersistenceCandidate =
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    requiredRelMissing.length === 0 &&
    conflicts === 0;

  console.log('='.repeat(70));
  console.log('PORTFOLIO_BOARDING_SCHEMA_VERIFICATION');
  console.log('='.repeat(70));
  console.log(`   target tables expected:            ${PB_SEED_TABLES.length}`);
  console.log(`   target tables found:               ${foundTables}`);
  console.log(`   target tables missing:             ${missingTables.length}`);
  for (const x of missingTables) console.log(`      - ${x}`);
  console.log(`   target columns expected:           ${expectedColumns}`);
  console.log(`   target columns missing:            ${missingColumns.length}`);
  console.log(`   required child→root lookups expected: ${requiredRelExpected}`);
  console.log(`   required child→root lookups found:    ${requiredRelFound}`);
  console.log(`   required child→root lookups missing:  ${requiredRelMissing.length}`);
  for (const x of requiredRelMissing) console.log(`      - ${x}`);
  console.log(`   optional relationships expected:   ${optionalRelExpected}`);
  console.log(`   optional relationships found:      ${optionalRelFound}`);
  console.log(`   optional relationships missing:    ${optionalRelMissing.length} (warning only)`);
  for (const x of optionalRelMissing) console.log(`      ~ ${x}`);
  console.log(`   safeForRuntimePersistenceCandidate: ${safeForRuntimePersistenceCandidate}`);
  console.log('   NOTE: app runtime persistence is NOT enabled. This is a schema-readiness');
  console.log('   signal only — no portfolio boarding writes happen from the app.');
}

async function runPlanPortfolioBoardingSchema(token, envUrl) {
  console.log('');
  console.log('Phase 140I — Portfolio boarding schema PLAN (read-only)');
  console.log('   Phase 140I does not create Dataverse schema. It only inspects and plans.');
  console.log('');
  console.log('   DRY_RUN_ONLY: true');
  console.log('   LIVE_WRITES_ENABLED: false');
  console.log('   COMMIT_FLAG_AVAILABLE: false');
  console.log('');

  // Same read-only GET inspection feeds the plan.
  const classifications = {};
  for (const cand of PORTFOLIO_BOARDING_CANDIDATE_TABLES) {
    const meta = await getEntityDefinition(token, envUrl, cand.logical);
    classifications[cand.logical] = classifyBoardingTable(meta);
  }

  console.log('Planned tables (seed order):');
  PORTFOLIO_BOARDING_SEED_ORDER.forEach((logical, idx) => {
    console.log(`   ${idx + 1}. ${logical}  [${classifications[logical]}]`);
  });
  console.log('');
  console.log('Planned columns: see src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts');
  console.log('   (PORTFOLIO_BOARDING_TARGET_COLUMNS) — primary name + typed scalars + child→root lookup per table.');
  console.log('');
  console.log('Planned relationships (seed order): each child table gets a required');
  console.log(`   ${'cr664_PortfolioBoardedLoan'} lookup → ${PORTFOLIO_BOARDING_ROOT_TABLE}, plus optional external links`);
  console.log('   (cr664_OriginatedLoanDeal → cr664_loandeal, cr664_Client → cr664_clientrelationship).');
  console.log('');
  console.log('Planned option sets (metadata plan only — NOT created in Phase 140I):');
  console.log('   boarding status, boarding source, loan status, document type, document status,');
  console.log('   exception severity, exception status, review type, readiness status, collateral type,');
  console.log('   guarantee type, covenant status, tickler status, insurance status.');
  console.log('');
  const conflicts = Object.entries(classifications).filter(([, c]) => c === 'BLOCKED_BY_CONFLICT');
  console.log('Blockers:');
  if (conflicts.length === 0) {
    console.log('   - none detected by metadata (operator must still confirm publisher prefix + lookup targets).');
  } else {
    for (const [name] of conflicts) console.log(`   - BLOCKED_BY_CONFLICT: ${name}`);
  }
  console.log('');
  console.log('Required manual review before any future seed:');
  console.log('   - confirm publisher prefix cr664 owns every name');
  console.log('   - confirm systemuser vs banker target for portfolio manager / servicing owner lookups');
  console.log('   - confirm no legacy artifact occupies a candidate name');
  console.log('');
  console.log('Future seed command (NOT available in Phase 140I):');
  console.log('   Phase 140J would add a guarded seed mode behind an explicit --commit-* flag.');
  console.log('   Schema seeding is intentionally disabled in Phase 140I.');
  console.log('');
  console.log('Read-only plan. No table, column, relationship, or option set was created.');
}

// ---------------------------------------------------------------------------
// Phase 140J — Guarded Portfolio Boarding schema SEED (dry-run-first)
//
// Dry-run is the default and is READ-ONLY (GET only). Live metadata creation
// happens ONLY inside the commit branch of runSeedPortfolioBoardingSchema,
// which is reached only when --commit-seed-portfolio-boarding-schema is set
// AND every inspection gate passes. There is NO DELETE, no column mutation,
// no publish call, no bypass header, and no loan-record / sample-data write.
// ---------------------------------------------------------------------------

// Script-local seed plan. Columns are [shortName, typeCode]; type codes:
//   s=string, m=memo(multiline), i=integer, d=decimal, n=money, b=boolean,
//   t=datetime. Picklist plan columns are seeded as TEXT (option sets are
//   deferred — see the schema plan safety note). JSON fields are memo.
const PB_ROOT = 'cr664_portfolioboardedloan';
const PB_ROOT_LOOKUP_SCHEMA = 'cr664_PortfolioBoardedLoan';

function pbRootLookup() {
  return { schema: PB_ROOT_LOOKUP_SCHEMA, target: PB_ROOT, label: 'Portfolio Boarded Loan', required: true };
}

const PB_SEED_TABLES = [
  {
    logical: PB_ROOT,
    display: 'Portfolio Boarded Loan',
    plural: 'Portfolio Boarded Loans',
    columns: [
      ['loannumber', 's'], ['borrowerlegalname', 's'], ['borrowerdba', 's'],
      ['relationshipname', 's'], ['loanstatus', 's'], ['boardingstatus', 's'],
      ['boardingsource', 's'], ['originateddealid', 's'], ['legacysystemid', 's'],
      ['coresystemloanid', 's'], ['originalcommitmentamount', 'n'],
      ['currentoutstandingprincipal', 'n'], ['availablebalance', 'n'],
      ['interestratetype', 's'], ['index', 's'], ['spread', 'd'], ['floor', 'd'],
      ['ceiling', 'd'], ['paymentfrequency', 's'], ['amortizationmonths', 'i'],
      ['termmonths', 'i'], ['bookingdate', 't'], ['closingdate', 't'],
      ['maturitydate', 't'], ['renewaldate', 't'], ['paidoffdate', 't'],
      ['currentriskrating', 's'], ['priorriskrating', 's'], ['riskratingdate', 't'],
      ['nextreviewdate', 't'], ['watchlistflag', 'b'], ['criticizedclassifiedstatus', 's'],
      ['accrualstatus', 's'], ['pastduedays', 'i'], ['exceptioncount', 'i'],
      ['highseverityexceptioncount', 'i'], ['fdicready', 'b'], ['boardready', 'b'],
      ['portfoliomonitoringready', 'b'], ['boardingready', 'b'], ['readinessjson', 'm'],
      ['snapshotjson', 'm'],
    ],
    lookups: [
      { schema: 'cr664_OriginatedLoanDeal', target: 'cr664_loandeal', label: 'Originated loan deal', required: false },
      { schema: 'cr664_Client', target: 'cr664_clientrelationship', label: 'Client', required: false },
      { schema: 'cr664_PortfolioManager', target: 'systemuser', label: 'Portfolio manager', required: false },
      { schema: 'cr664_AssignedServicingOwner', target: 'systemuser', label: 'Assigned servicing owner', required: false },
      { schema: 'cr664_Team', target: 'cr664_team', label: 'Team', required: false },
    ],
  },
  {
    logical: 'cr664_portfolioboardedloanborrower', display: 'Portfolio Boarded Loan Borrower', plural: 'Portfolio Boarded Loan Borrowers',
    columns: [['legalentitytype', 's'], ['taxidentifier', 's'], ['naicsindustry', 's'], ['address', 'm'], ['stateofformation', 's'], ['ownershipsummary', 'm'], ['managementsummary', 'm'], ['depositrelationshipsummary', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloancollateral', display: 'Portfolio Boarded Loan Collateral', plural: 'Portfolio Boarded Loan Collateral',
    columns: [['collateralid', 's'], ['collateraltype', 's'], ['description', 'm'], ['lienposition', 's'], ['perfected', 'b'], ['perfectionmethod', 's'], ['uccfilingnumber', 's'], ['uccfilingdate', 't'], ['ucccontinuationdate', 't'], ['mortgageinstrumentnumber', 's'], ['deedoftrustinstrumentnumber', 's'], ['titlepolicynumber', 's'], ['titlepolicyamount', 'n'], ['appraisalrequired', 'b'], ['appraisaldate', 't'], ['appraisedvalue', 'n'], ['valuationdate', 't'], ['valuationamount', 'n'], ['advancerate', 'd'], ['environmentalstatus', 's'], ['flooddeterminationstatus', 's'], ['insurancerequired', 'b'], ['collateralexceptionsjson', 'm'], ['releasestatus', 's']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloanguarantor', display: 'Portfolio Boarded Loan Guarantor', plural: 'Portfolio Boarded Loan Guarantors',
    columns: [['guarantorid', 's'], ['guarantorname', 's'], ['guarantortype', 's'], ['guaranteetype', 's'], ['limitedorunlimited', 's'], ['guaranteeamount', 'n'], ['spouseconsentrequired', 'b'], ['spouseconsentreceived', 'b'], ['pfsdate', 't'], ['liquidity', 'n'], ['networth', 'n'], ['contingentliabilitiessummary', 'm'], ['globaldebtservicesupportnotes', 'm'], ['exceptionsjson', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloancovenant', display: 'Portfolio Boarded Loan Covenant', plural: 'Portfolio Boarded Loan Covenants',
    columns: [['covenantid', 's'], ['covenantname', 's'], ['covenanttype', 's'], ['testingfrequency', 's'], ['nextduedate', 't'], ['requiredthreshold', 's'], ['currentstatus', 's'], ['lasttesteddate', 't'], ['lastreportedvalue', 's'], ['waiverhistoryjson', 'm'], ['breachhistoryjson', 'm'], ['owner', 's'], ['severity', 's'], ['evidencedocumentidsjson', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloantickler', display: 'Portfolio Boarded Loan Tickler', plural: 'Portfolio Boarded Loan Ticklers',
    columns: [['ticklerid', 's'], ['ticklername', 's'], ['ticklertype', 's'], ['owner', 's'], ['duedate', 't'], ['frequency', 's'], ['status', 's'], ['severity', 's'], ['relateddocumenttype', 's'], ['relatedcovenantid', 's'], ['notes', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloaninsurance', display: 'Portfolio Boarded Loan Insurance', plural: 'Portfolio Boarded Loan Insurance',
    columns: [['insuranceid', 's'], ['insurancetype', 's'], ['carrier', 's'], ['policynumber', 's'], ['coverageamount', 'n'], ['effectivedate', 't'], ['expirationdate', 't'], ['requiredcoverageamount', 'n'], ['evidencedocumentid', 's'], ['status', 's'], ['stale', 'b'], ['exception', 'b']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloandocument', display: 'Portfolio Boarded Loan Document', plural: 'Portfolio Boarded Loan Documents',
    columns: [['documentid', 's'], ['documenttype', 's'], ['documentname', 's'], ['category', 's'], ['borrowerorobligorassociation', 's'], ['effectivedate', 't'], ['periodenddate', 't'], ['receiveddate', 't'], ['revieweddate', 't'], ['reviewer', 's'], ['source', 's'], ['status', 's'], ['exceptionflag', 'b'], ['missingflag', 'b'], ['staleflag', 'b'], ['filereference', 's'], ['extractedfactidsjson', 'm'], ['evidencelinkidsjson', 'm'], ['notes', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloanexception', display: 'Portfolio Boarded Loan Exception', plural: 'Portfolio Boarded Loan Exceptions',
    columns: [['exceptionid', 's'], ['exceptiontype', 's'], ['severity', 's'], ['status', 's'], ['openeddate', 't'], ['duedate', 't'], ['resolveddate', 't'], ['owner', 's'], ['description', 'm'], ['remediationplan', 'm'], ['evidencedocumentidsjson', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloanreview', display: 'Portfolio Boarded Loan Review', plural: 'Portfolio Boarded Loan Reviews',
    columns: [['reviewid', 's'], ['reviewtype', 's'], ['reviewer', 's'], ['reviewdate', 't'], ['outcome', 's'], ['notes', 'm'], ['nextreviewdate', 't'], ['evidencedocumentidsjson', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloanevidence', display: 'Portfolio Boarded Loan Evidence', plural: 'Portfolio Boarded Loan Evidence',
    columns: [['evidenceid', 's'], ['sourcetype', 's'], ['sourceid', 's'], ['documentid', 's'], ['factkey', 's'], ['description', 'm'], ['createdbytext', 's'], ['createdat', 't']],
    lookups: [pbRootLookup(), { schema: 'cr664_PortfolioBoardedLoanDocument', target: 'cr664_portfolioboardedloandocument', label: 'Portfolio Boarded Loan Document', required: false }],
  },
  {
    logical: 'cr664_portfolioboardedloanauditentry', display: 'Portfolio Boarded Loan Audit Entry', plural: 'Portfolio Boarded Loan Audit Entries',
    columns: [['auditid', 's'], ['actor', 's'], ['action', 's'], ['timestamp', 't'], ['fieldkey', 's'], ['previousvaluesummary', 'm'], ['newvaluesummary', 'm'], ['reason', 'm'], ['evidencelinkidsjson', 'm']],
    lookups: [pbRootLookup()],
  },
  {
    logical: 'cr664_portfolioboardedloanexaminernote', display: 'Portfolio Boarded Loan Examiner Note', plural: 'Portfolio Boarded Loan Examiner Notes',
    columns: [['noteid', 's'], ['examinerrequestid', 's'], ['note', 'm'], ['responsestatus', 's'], ['owner', 's'], ['createdat', 't'], ['updatedat', 't'], ['relatedevidenceidsjson', 'm']],
    lookups: [pbRootLookup()],
  },
];

function pbLabel(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [
      { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
    ],
  };
}

// Single guarded metadata POST. The ONLY mutation verb the seed path uses is
// POST (create). There is no PATCH and no DELETE anywhere in this path.
async function pbMetadataCreate(token, envUrl, path, payload) {
  const res = await fetch(`${envUrl}/api/data/v9.2/${path}`, {
    method: 'POST',
    headers: {
      ...metadataHeaders(token),
      'Content-Type': 'application/json',
      'MSCRM.SolutionUniqueName': SOLUTION_FOR_CR664,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    bail(`metadata create ${path} → ${res.status}: ${text}`);
  }
  return res;
}

function buildPrimaryNameAttribute() {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: 'cr664_Name',
    RequiredLevel: { Value: 'ApplicationRequired' },
    MaxLength: 200,
    FormatName: { Value: 'Text' },
    DisplayName: pbLabel('Name'),
    IsPrimaryName: true,
  };
}

function buildTablePayload(tablePlan) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: `cr664_${tablePlan.logical.replace(/^cr664_/, '').replace(/^./, (s) => s.toUpperCase())}`,
    DisplayName: pbLabel(tablePlan.display),
    DisplayCollectionName: pbLabel(tablePlan.plural),
    Description: pbLabel(`${tablePlan.display} — portfolio boarding system of record.`),
    OwnershipType: 'UserOwned',
    HasActivities: false,
    HasNotes: false,
    IsActivity: false,
    Attributes: [buildPrimaryNameAttribute()],
  };
}

async function createCustomTableFromPlan(token, envUrl, tablePlan) {
  return pbMetadataCreate(token, envUrl, 'EntityDefinitions', buildTablePayload(tablePlan));
}

function pbColumnSchema(shortName) {
  return `cr664_${shortName.replace(/^./, (s) => s.toUpperCase())}`;
}

async function pbCreateAttribute(token, envUrl, tableLogical, payload) {
  return pbMetadataCreate(
    token,
    envUrl,
    `EntityDefinitions(LogicalName='${tableLogical}')/Attributes`,
    payload,
  );
}

async function createTextColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  return pbCreateAttribute(token, envUrl, tableLogical, {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: pbColumnSchema(shortName),
    RequiredLevel: { Value: 'None' },
    MaxLength: 4000,
    FormatName: { Value: 'Text' },
    DisplayName: pbLabel(label),
  });
}

async function createMemoColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  return pbCreateAttribute(token, envUrl, tableLogical, {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    SchemaName: pbColumnSchema(shortName),
    RequiredLevel: { Value: 'None' },
    MaxLength: 100000,
    DisplayName: pbLabel(label),
  });
}

async function createIntegerColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  return pbCreateAttribute(token, envUrl, tableLogical, {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    SchemaName: pbColumnSchema(shortName),
    RequiredLevel: { Value: 'None' },
    Format: 'None',
    DisplayName: pbLabel(label),
  });
}

async function createDecimalColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  return pbCreateAttribute(token, envUrl, tableLogical, {
    '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
    SchemaName: pbColumnSchema(shortName),
    RequiredLevel: { Value: 'None' },
    Precision: 4,
    DisplayName: pbLabel(label),
  });
}

async function createMoneyColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  return pbCreateAttribute(token, envUrl, tableLogical, {
    '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
    SchemaName: pbColumnSchema(shortName),
    RequiredLevel: { Value: 'None' },
    Precision: 2,
    PrecisionSource: 2,
    DisplayName: pbLabel(label),
  });
}

async function createBooleanColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  return pbCreateAttribute(token, envUrl, tableLogical, {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: pbColumnSchema(shortName),
    RequiredLevel: { Value: 'None' },
    DisplayName: pbLabel(label),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: pbLabel('Yes') },
      FalseOption: { Value: 0, Label: pbLabel('No') },
    },
  });
}

async function createDateTimeColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  return pbCreateAttribute(token, envUrl, tableLogical, {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName: pbColumnSchema(shortName),
    RequiredLevel: { Value: 'None' },
    Format: 'DateOnly',
    DisplayName: pbLabel(label),
  });
}

// Choice columns are intentionally NOT created as choices in Phase 140J —
// global/local option-set metadata is deferred. Picklist plan columns are
// routed to createTextColumnFromPlan above, and this helper records that.
async function createChoiceColumnFromPlan(token, envUrl, tableLogical, shortName, label) {
  console.log(`   (choice deferred) ${tableLogical}.${pbColumnSchema(shortName)} seeded as TEXT; option set deferred to a later phase.`);
  return createTextColumnFromPlan(token, envUrl, tableLogical, shortName, label);
}

async function createLookupRelationshipFromPlan(token, envUrl, referencingEntity, lookup) {
  return pbMetadataCreate(
    token,
    envUrl,
    'RelationshipDefinitions',
    buildLookupRelationshipPayload({
      referencingEntity,
      schemaName: lookup.schema,
      displayLabel: lookup.label,
      target: lookup.target,
    }),
  );
}

async function verifyTableCreated(token, envUrl, tableLogical) {
  const meta = await getEntityDefinition(token, envUrl, tableLogical);
  return meta.exists === true;
}

async function verifyColumnCreated(token, envUrl, tableLogical, shortName) {
  const meta = await getEntityDefinition(token, envUrl, tableLogical);
  if (!meta.exists) return false;
  const present = new Set((meta.table.Attributes ?? []).map((a) => String(a.LogicalName).toLowerCase()));
  return present.has(`cr664_${shortName}`.toLowerCase());
}

async function verifyRelationshipCreated(token, envUrl, tableLogical, lookupColumnLogical) {
  const meta = await getEntityDefinition(token, envUrl, tableLogical);
  if (!meta.exists) return false;
  const present = new Set((meta.table.Attributes ?? []).map((a) => String(a.LogicalName).toLowerCase()));
  return present.has(lookupColumnLogical.toLowerCase());
}

function pbColumnCreatorForType(typeCode) {
  switch (typeCode) {
    case 'm': return createMemoColumnFromPlan;
    case 'i': return createIntegerColumnFromPlan;
    case 'd': return createDecimalColumnFromPlan;
    case 'n': return createMoneyColumnFromPlan;
    case 'b': return createBooleanColumnFromPlan;
    case 't': return createDateTimeColumnFromPlan;
    case 's':
    default: return createTextColumnFromPlan;
  }
}

// Phase 140K — resolve whether a lookup target table exists. Internal
// portfolio boarding candidate tables count as available when they already
// exist (inspected) OR are being created in this same seed run. External
// related tables fall back to the pre-existing related-table probe.
function pbIsCandidateTable(logical) {
  return PB_SEED_TABLES.some((t) => t.logical === logical) || logical === PB_ROOT;
}

function pbResolveTargetExists(target, inspected, lookupTargetExists, tablesBeingCreated) {
  if (target === PB_ROOT) return true; // root is created in-plan
  if (pbIsCandidateTable(target)) {
    const info = inspected[target];
    return (info && info.exists === true) || tablesBeingCreated.includes(target);
  }
  return lookupTargetExists[target] === true;
}

// Phase 140K — the only optional relationship this repair mode targets.
const PB_OPTIONAL_REPAIR = Object.freeze({
  sourceTable: 'cr664_portfolioboardedloanevidence',
  targetTable: 'cr664_portfolioboardedloandocument',
  lookup: {
    schema: 'cr664_PortfolioBoardedLoanDocument',
    target: 'cr664_portfolioboardedloandocument',
    label: 'Portfolio Boarded Loan Document',
    required: false,
  },
});

async function runRepairPortfolioBoardingOptionalRelationships(token, envUrl, commit) {
  console.log('');
  console.log('Phase 140K — Portfolio boarding optional-relationship REPAIR');
  console.log('   Targets ONLY the optional evidence→document lookup.');
  console.log('   Creates no tables, no records, no documents; no app-runtime persistence.');
  console.log(`   DRY_RUN_ONLY: ${commit ? 'false' : 'true'}`);
  if (commit) console.log('   COMMIT_CONFIRMED: true');
  console.log('');

  const { sourceTable, targetTable, lookup } = PB_OPTIONAL_REPAIR;

  // Read-only inspection of just the source + target tables.
  const sourceMeta = await getEntityDefinition(token, envUrl, sourceTable);
  const targetMeta = await getEntityDefinition(token, envUrl, targetTable);

  if (!targetMeta.exists) {
    bail(`Refusing to repair: target table ${targetTable} is missing.`);
    return;
  }
  if (!sourceMeta.exists) {
    bail(`Refusing to repair: source table ${sourceTable} is missing.`);
    return;
  }

  const present = new Set(
    (sourceMeta.table.Attributes ?? []).map((a) => String(a.LogicalName).toLowerCase()),
  );
  const relationshipExists = present.has(lookup.schema.toLowerCase());

  if (relationshipExists) {
    console.log(`No-op: ${sourceTable}.${lookup.schema} → ${targetTable} already exists (reused).`);
    console.log('No write issued.');
    return;
  }

  console.log('Missing optional relationship to create:');
  console.log(`   + ${sourceTable}.${lookup.schema} → ${targetTable}`);
  console.log('');

  if (!commit) {
    console.log('Dry-run only — no metadata write issued. Re-run with');
    console.log('--repair-portfolio-boarding-optional-relationships --commit-repair-portfolio-boarding-optional-relationships.');
    console.log('No table, column, record, or document was created.');
    return;
  }

  // Commit: create ONLY the optional lookup relationship.
  await createLookupRelationshipFromPlan(token, envUrl, sourceTable, lookup);
  console.log(`   created relationship ${sourceTable}.${lookup.schema}`);

  // Verify by re-reading metadata.
  const ok = await verifyRelationshipCreated(token, envUrl, sourceTable, lookup.schema);
  console.log('');
  console.log(`Verification: ${sourceTable}.${lookup.schema} present = ${ok}`);
  console.log('Done. Only the optional evidence→document lookup was created.');
}

async function runSeedPortfolioBoardingSchema(token, envUrl, commit) {
  console.log('');
  console.log('Phase 140J — Portfolio boarding schema SEED');
  console.log('   Phase 140J creates schema metadata only — never loan records, never');
  console.log('   document uploads, never app-runtime portfolio boarding writes.');
  console.log(`   DRY_RUN_ONLY: ${commit ? 'false' : 'true'}`);
  if (commit) console.log('   COMMIT_CONFIRMED: true');
  console.log('');

  // --- Read-only inspection (GET only) ----------------------------------
  const inspected = {};
  for (const t of PB_SEED_TABLES) {
    const meta = await getEntityDefinition(token, envUrl, t.logical);
    const classification = classifyBoardingTable(meta);
    const present = meta.exists
      ? new Set((meta.table.Attributes ?? []).map((a) => String(a.LogicalName).toLowerCase()))
      : new Set();
    inspected[t.logical] = { exists: meta.exists, classification, present };
  }

  // Related lookup targets (external).
  const lookupTargetExists = {};
  for (const rel of PORTFOLIO_BOARDING_RELATED_TABLES) {
    const meta = await getEntityDefinition(token, envUrl, rel);
    lookupTargetExists[rel] = meta.exists;
  }
  const systemUserMeta = await getEntityDefinition(token, envUrl, 'systemuser');
  lookupTargetExists['systemuser'] = systemUserMeta.exists;

  // --- Build the create / reuse / skip lists ----------------------------
  const prefixConfirmed = CR664_PUBLISHER_PREFIX === PORTFOLIO_BOARDING_PREFIX;
  const blockers = [];
  const warnings = [];
  if (!prefixConfirmed) blockers.push(`Publisher prefix not confirmed (expected ${PORTFOLIO_BOARDING_PREFIX}).`);

  const tablesToCreate = [];
  const tablesToReuse = [];
  const columnCreates = []; // { table, name, type }
  const relCreates = []; // { referencingEntity, lookup }
  const skippedOptionalRelationships = [];

  for (const t of PB_SEED_TABLES) {
    const info = inspected[t.logical];
    if (info.classification === 'BLOCKED_BY_CONFLICT') {
      blockers.push(`BLOCKED_BY_CONFLICT: ${t.logical} (legacy / wrong-prefix artifact).`);
      continue;
    }
    if (info.exists) tablesToReuse.push(t.logical);
    else tablesToCreate.push(t.logical);

    for (const [name, type] of t.columns) {
      const logical = `cr664_${name}`;
      if (!info.exists || !info.present.has(logical)) {
        columnCreates.push({ table: t.logical, name, type });
      }
    }
    for (const lk of t.lookups) {
      const lookupLogical = lk.schema.toLowerCase();
      const alreadyPresent = info.exists && info.present.has(lookupLogical);
      if (alreadyPresent) continue;
      // Phase 140K fix: an optional lookup target that is itself a portfolio
      // boarding candidate table (e.g. cr664_portfolioboardedloandocument) is
      // resolved from the inspected candidate results — and from the in-plan
      // create list — not only from the pre-existing external related tables.
      const targetExists = pbResolveTargetExists(
        lk.target,
        inspected,
        lookupTargetExists,
        tablesToCreate,
      );
      if (!targetExists) {
        if (lk.required) {
          blockers.push(`Required lookup target ${lk.target} is missing for ${lk.schema}.`);
        } else {
          skippedOptionalRelationships.push(`${t.logical}.${lk.schema} → ${lk.target}`);
          warnings.push(`Optional lookup target ${lk.target} absent; skipping ${lk.schema}.`);
        }
        continue;
      }
      relCreates.push({ referencingEntity: t.logical, lookup: lk });
    }
  }

  const safeToCommit = blockers.length === 0 && prefixConfirmed;

  // --- Print the plan ----------------------------------------------------
  console.log(`Tables to create (${tablesToCreate.length}):`);
  for (const x of tablesToCreate) console.log(`   + ${x}`);
  console.log(`Tables to reuse (${tablesToReuse.length}):`);
  for (const x of tablesToReuse) console.log(`   = ${x}`);
  console.log(`Columns to create: ${columnCreates.length}`);
  console.log(`Relationships to create (${relCreates.length}):`);
  for (const r of relCreates) console.log(`   + ${r.referencingEntity}.${r.lookup.schema} → ${r.lookup.target}`);
  console.log(`Skipped optional relationships (${skippedOptionalRelationships.length}):`);
  for (const x of skippedOptionalRelationships) console.log(`   ~ ${x}`);
  console.log('Blockers:');
  if (blockers.length === 0) console.log('   (none)');
  for (const b of blockers) console.log(`   ! ${b}`);
  for (const w of warnings) console.log(`   (warn) ${w}`);
  console.log(`safeToCommit: ${safeToCommit}`);
  console.log('');

  // --- Dry-run stops here (no write of any kind) ------------------------
  if (!commit) {
    console.log('Dry-run only — no metadata write issued. Review this plan, then re-run');
    console.log('with --seed-portfolio-boarding-schema --commit-seed-portfolio-boarding-schema.');
    console.log('No table, column, relationship, or record was created.');
    return;
  }

  // --- Commit gate (fail closed) ----------------------------------------
  if (!safeToCommit) {
    bail(`Refusing to commit: ${blockers.length} blocker(s). Resolve them and re-inspect.`);
    return;
  }

  console.log('Creating missing schema in seed order (metadata only)…');
  for (const tableLogical of tablesToCreate) {
    const plan = PB_SEED_TABLES.find((t) => t.logical === tableLogical);
    await createCustomTableFromPlan(token, envUrl, plan);
    console.log(`   created table ${tableLogical}`);
  }
  for (const cc of columnCreates) {
    const creator = pbColumnCreatorForType(cc.type);
    await creator(token, envUrl, cc.table, cc.name, cc.name);
    console.log(`   created column ${cc.table}.cr664_${cc.name}`);
  }
  for (const r of relCreates) {
    await createLookupRelationshipFromPlan(token, envUrl, r.referencingEntity, r.lookup);
    console.log(`   created relationship ${r.referencingEntity}.${r.lookup.schema}`);
  }

  // --- Verification read -------------------------------------------------
  console.log('');
  console.log('Verification (re-reading metadata):');
  let okTables = 0;
  for (const tableLogical of tablesToCreate) {
    if (await verifyTableCreated(token, envUrl, tableLogical)) okTables += 1;
  }
  console.log(`   tables verified: ${okTables}/${tablesToCreate.length}`);
  console.log('Done. Schema metadata created. No loan records, no documents, no app-runtime writes.');
}

async function main() {
  // === Pure diagnostic: print the lookup-creation payload(s) ===
  // No pac auth, no Web API call, no write. Useful when an operator
  // wants to eyeball the exact RelationshipDefinitions POST body
  // before re-running --commit after a payload-shape fix.
  if (FLAGS.printRelationshipPayload) {
    console.log('Phase 122B — Relationship-create payload preview');
    console.log('');
    console.log('NOTE: these are the JSON bodies POSTed to');
    console.log('      /api/data/v9.2/RelationshipDefinitions');
    console.log('      with header `MSCRM.SolutionUniqueName: ' + SOLUTION_FOR_CR664 + '`.');
    console.log('');
    for (const t of CANDIDATE_CHILD_TABLES) {
      console.log('-'.repeat(70));
      console.log(`-- ${t} → ${LOOKUP_TARGET_LOAN_DEAL}  (${NEW_DEAL_COLUMN_SCHEMA_NAME})`);
      console.log('-'.repeat(70));
      console.log(
        JSON.stringify(
          buildLookupRelationshipPayload({
            referencingEntity: t,
            schemaName: NEW_DEAL_COLUMN_SCHEMA_NAME,
            displayLabel: 'Deal',
            target: LOOKUP_TARGET_LOAN_DEAL,
          }),
          null,
          2,
        ),
      );
      console.log('');
    }
    console.log('-'.repeat(70));
    console.log(
      `-- cr664_dealtask1 → ${LOOKUP_TARGET_SYSTEMUSER}  (${NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME})`,
    );
    console.log('-'.repeat(70));
    console.log(
      JSON.stringify(
        buildLookupRelationshipPayload({
          referencingEntity: 'cr664_dealtask1',
          schemaName: NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME,
          displayLabel: 'Assigned to',
          target: LOOKUP_TARGET_SYSTEMUSER,
        }),
        null,
        2,
      ),
    );
    console.log('');
    console.log('No pac call, no Web API call, no write.');
    return;
  }

  // === Phase 137G — Copilot Custom API metadata PLAN (offline dry-run) ===
  // Pure / offline: prints the planned metadata payloads and returns BEFORE
  // any auth or network. Commit is not implemented (no write path exists).
  if (FLAGS.seedCopilotCustomApiMetadata) {
    runSeedCopilotCustomApiMetadataPlan();
    return;
  }

  // === Phase 137J — Copilot audit-table metadata PLAN (offline dry-run) ===
  // Pure / offline: prints the planned table/field/index metadata and
  // returns BEFORE any auth or network. Commit is not implemented.
  if (FLAGS.seedCopilotAuditTableMetadata) {
    runSeedCopilotAuditTableMetadataPlan();
    return;
  }

  assertPacAuth();

  // Acquire shared envUrl + bearer token early. Every remaining mode
  // (dry-run audit, --verify-lookups, all inspect/cleanup modes, and
  // --commit) needs both, and the Web-API-based audit is now the
  // primary source of truth — pac env fetch was returning stale
  // metadata answers on the operator's 2026-06-08 dry-run.
  const mainEnvUrl = await resolveEnvUrl();
  const mainToken = await acquireBearerToken(mainEnvUrl);

  // === Standalone Web API metadata verification (read-only) ===
  if (FLAGS.verifyLookups) {
    await runVerifyLookups(mainToken, mainEnvUrl);
    return;
  }

  // === Read-only Dataverse table schema inspection (Phase 122D) ===
  if (FLAGS.inspectTableName !== null) {
    await runInspectTable(FLAGS.inspectTableName, mainToken, mainEnvUrl);
    return;
  }

  // === Phase 137G — read-only Copilot Custom API metadata inspection ===
  if (FLAGS.inspectCopilotCustomApi) {
    await runInspectCopilotCustomApi(mainToken, mainEnvUrl);
    return;
  }

  // === Phase 137J — read-only Copilot audit-event table inspection ===
  if (FLAGS.inspectCopilotAuditTable) {
    await runInspectCopilotAuditTable(mainToken, mainEnvUrl);
    return;
  }

  // === Phase 140I — read-only portfolio boarding schema inspection ===
  if (FLAGS.inspectPortfolioBoardingSchema) {
    await runInspectPortfolioBoardingSchema(mainToken, mainEnvUrl);
    return;
  }

  // === Phase 140I — read-only portfolio boarding schema PLAN ===
  if (FLAGS.planPortfolioBoardingSchema) {
    await runPlanPortfolioBoardingSchema(mainToken, mainEnvUrl);
    return;
  }

  // === Phase 140J — guarded portfolio boarding schema SEED ===
  // Dry-run by default; live metadata creation only with the commit flag.
  if (FLAGS.seedPortfolioBoardingSchema) {
    await runSeedPortfolioBoardingSchema(
      mainToken,
      mainEnvUrl,
      FLAGS.commitSeedPortfolioBoardingSchema,
    );
    return;
  }

  // === Phase 140K — guarded optional-relationship REPAIR ===
  // Dry-run by default; creates ONLY the optional evidence→document lookup,
  // and only with the commit flag.
  if (FLAGS.repairPortfolioBoardingOptionalRelationships) {
    await runRepairPortfolioBoardingOptionalRelationships(
      mainToken,
      mainEnvUrl,
      FLAGS.commitRepairPortfolioBoardingOptionalRelationships,
    );
    return;
  }

  // === Read-only targeted attribute inspection (Phase 122E Pt 1) ===
  if (FLAGS.inspectAttributeItems !== null) {
    await runInspectAttributes(FLAGS.inspectAttributeItems, mainToken, mainEnvUrl);
    return;
  }

  // === TEST Client / Relationship seed (Phase 122D Pt 2) ===
  // Dry-run by default; writes require --commit-seed-client. The
  // mode is idempotent on both ends: reuses an existing
  // cr664_clientrelationship row whose cr664_clientname matches the
  // supplied --client-name, and short-circuits with no-op success
  // when the deal's cr664_Client lookup already points at the
  // resolved client.
  if (FLAGS.seedClientRelationship) {
    await runSeedClientRelationship(
      {
        dealName: FLAGS.seedDealName,
        clientName: FLAGS.seedClientName,
        borrowerType: FLAGS.seedBorrowerType,
        doCommit: FLAGS.commitSeedClient,
      },
      mainToken,
      mainEnvUrl,
    );
    return;
  }

  // === Product / Loan Structure / Pricing reference seed (Phase 122E Pt 2) ===
  // Dry-run by default; writes require --commit-seed-product-references.
  // Idempotent: reuses existing rows matched by cr664_code (then
  // cr664_name), and skips the PATCH when all three deal lookups
  // already point at the resolved ids.
  if (FLAGS.seedProductReferences) {
    await runSeedProductReferences(
      {
        dealName: FLAGS.seedDealName,
        doCommit: FLAGS.commitSeedProductReferences,
      },
      mainToken,
      mainEnvUrl,
    );
    return;
  }

  // === Manager-entitlement seed (Phase 124D) ===
  // Dry-run by default; writes require
  // --commit-seed-manager-entitlement. Bridges the Phase 124C
  // workspace switcher to a live entitlement path by linking one
  // Banker (resolved by --upn) and one Loan Deal (resolved by
  // --deal-name) to the same Team (resolved by --team-name; created
  // on commit if missing). PATCH bodies set ONLY
  // cr664_Team@odata.bind on both rows. Idempotent at both ends.
  if (FLAGS.seedManagerEntitlement) {
    await runSeedManagerEntitlement(
      {
        upn: FLAGS.seedUpn,
        teamName: FLAGS.seedTeamName,
        dealName: FLAGS.seedDealName,
        doCommit: FLAGS.commitSeedManagerEntitlement,
      },
      mainToken,
      mainEnvUrl,
    );
    return;
  }

  // === Executive primary-workspace seed (Phase 133C) ===
  // Dry-run by default; writes require
  // --commit-seed-executive-primary-workspace. Resolves one Platform
  // User (by --upn / cr664_email) and at most one Platform Workspace
  // (by --workspace-name; created on commit if missing) and PATCHes
  // ONLY the Platform User cr664_PrimaryWorkspace lookup. No other
  // table or column is touched. Idempotent.
  if (FLAGS.seedExecutivePrimaryWorkspace) {
    await runSeedExecutivePrimaryWorkspace(
      {
        upn: FLAGS.seedUpn,
        workspaceName: FLAGS.seedWorkspaceName,
        doCommit: FLAGS.commitSeedExecutivePrimaryWorkspace,
      },
      mainToken,
      mainEnvUrl,
    );
    return;
  }

  // === Broad SystemForm inspection (read-only) ===
  if (FLAGS.inspectFormId !== null) {
    const result = await runFormInspect(
      FLAGS.inspectFormId,
      FLAGS.inspectFormAttribute,
      mainToken,
      mainEnvUrl,
    );
    if (!result.ok) process.exit(7);
    return;
  }

  // === Targeted SystemForm cleanup ===
  if (FLAGS.cleanupFormId !== null) {
    const result = await runFormCleanup(
      FLAGS.cleanupFormId,
      FLAGS.inspectFormAttribute, // optional — null defaults to cr664_deal
      mainToken,
      mainEnvUrl,
      FLAGS.commitFormCleanup,
    );
    if (!result.ok) process.exit(6);
    return;
  }

  // === Read-only SavedQuery (view) inspection ===
  if (FLAGS.inspectViewId !== null) {
    const result = await runViewInspect(
      FLAGS.inspectViewId,
      FLAGS.inspectFormAttribute,
      mainToken,
      mainEnvUrl,
    );
    if (!result.ok) process.exit(11);
    return;
  }

  // === Targeted SavedQuery (view) cleanup ===
  if (FLAGS.cleanupViewId !== null) {
    const result = await runViewCleanup(
      FLAGS.cleanupViewId,
      FLAGS.inspectFormAttribute,
      mainToken,
      mainEnvUrl,
      FLAGS.commitViewCleanup,
    );
    if (!result.ok) process.exit(12);
    return;
  }

  // === Targeted subgrid cleanup (by control id) ===
  if (FLAGS.cleanupSubgridFormId !== null) {
    const result = await runSubgridCleanup(
      FLAGS.cleanupSubgridFormId,
      FLAGS.cleanupSubgridControlId,
      mainToken,
      mainEnvUrl,
      FLAGS.commitSubgridCleanup,
    );
    if (!result.ok) process.exit(9);
    return;
  }

  // === Phase A: audit ===
  const publisherAudit = auditPublishers();
  console.log('  Publisher join:');
  for (const [sln, prefix] of Object.entries(publisherAudit)) {
    console.log(`    - ${sln}: prefix=${prefix ?? 'UNKNOWN'}`);
  }
  console.log('');

  console.log('Phase B — Auditing candidate child tables for column state (Web API metadata)…');
  const tableAudits = await Promise.all(
    CANDIDATE_CHILD_TABLES.map((t) => auditTable(t, mainToken, mainEnvUrl)),
  );
  console.log('');
  console.log('Table audit summary (source: Dataverse Web API metadata):');
  for (const t of tableAudits) {
    console.log(`  ${t.table}:`);
    console.log(`    cr664_deal classification:      ${t.dealClassification}`);
    if (t.dealAttributeType) {
      console.log(`    cr664_deal AttributeType:       ${t.dealAttributeType}`);
    }
    if (t.dealClassification === 'real-lookup' && Array.isArray(t.dealLookupTargets)) {
      console.log(`    cr664_deal Lookup Targets:      ${JSON.stringify(t.dealLookupTargets)}`);
    }
    console.log(`    pseudo cr664_deal exists:       ${t.pseudoDealColumnExists}`);
    console.log(`    standard Lookup attribute:      ${t.standardLookupFkExists}`);
    if (t.pseudoDealColumnExists) {
      console.log(`    non-NULL row count:             ${t.pseudoDealColumnPopulated}`);
    }
    if (t.table === 'cr664_dealtask1') {
      console.log(`    cr664_assignedto classification:${t.assignedToClassification}`);
      if (t.assignedToAttributeType) {
        console.log(`    cr664_assignedto AttributeType: ${t.assignedToAttributeType}`);
      }
      if (
        t.assignedToClassification === 'real-lookup' &&
        Array.isArray(t.assignedToLookupTargets)
      ) {
        console.log(`    cr664_assignedto Targets:       ${JSON.stringify(t.assignedToLookupTargets)}`);
      }
      console.log(`    pseudo cr664_assignedto:        ${t.pseudoAssignedToColumnExists}`);
      console.log(`    standard Lookup attribute:      ${t.standardAssignedToFkExists}`);
      if (t.pseudoAssignedToColumnExists) {
        console.log(`    AssignedTo non-NULL count:      ${t.pseudoAssignedToColumnPopulated}`);
      }
    }
  }
  console.log('');

  const audit = { publishers: publisherAudit, tables: tableAudits };
  const plan = buildPlan(audit);

  // Emit runbook to .phase122/phase122-runbook.json
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    RUNBOOK_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), mode: MODE, audit, plan },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`📋 Plan written to ${RUNBOOK_PATH}`);
  console.log('');

  // === Print plan ===
  console.log('Phase C — Planned actions:');
  for (const [i, step] of plan.entries()) {
    const tag =
      step.kind === 'stop-condition'
        ? '🛑'
        : step.kind === 'manual-inspection'
          ? '🔍'
          : step.kind === 'noop'
            ? '✓ '
            : step.kind === 'webapi'
              ? '🔧'
              : step.kind === 'webapi-verify'
                ? '🧪'
                : '·';
    console.log(`  ${tag} [${i + 1}] ${step.label}`);
  }
  console.log('');

  // === Refuse to commit if any STOP conditions ===
  const stops = plan.filter((s) => s.kind === 'stop-condition');
  if (stops.length > 0 && FLAGS.commit) {
    console.error('Safety gate: plan contains stop conditions. Refusing to commit.');
    for (const s of stops) console.error(`  - ${s.label}: ${s.details ?? ''}`);
    process.exit(3);
  }

  // === Inspect-dependencies mode (read-only) ===
  if (FLAGS.inspectDependencies) {
    const depResult = await inspectPseudoColumnDependencies(plan, mainToken, mainEnvUrl);
    if (depResult.blocked) {
      console.error('');
      console.error(`✗ ${depResult.blockers.length} pseudo-column(s) have dependencies that block delete.`);
      console.error('  See the per-column breakdown above. Resolve the dependencies in Maker Portal,');
      console.error('  then re-run `node scripts/phase122-lookup-repair.mjs --inspect-dependencies`');
      console.error('  to confirm the blocker is cleared before attempting `--commit`.');
      process.exit(5);
    }
    console.log(`✓ Inspected ${depResult.inspected} pseudo-column delete step(s); none have dependencies.`);
    console.log('  You can safely run `node scripts/phase122-lookup-repair.mjs --commit`.');
    return;
  }

  // === Safety gates for commit mode ===
  if (FLAGS.commit) {
    refuseIfForbiddenPrefix(publisherAudit);

    // Rollback gate (pre-execution):
    //   - When the operator passes `--skip-rollback-export`, they have
    //     promised to pre-export both solution zips. Refuse to commit
    //     if either zip is missing on disk.
    //   - In the default (auto-export) mode the plan's first two steps
    //     export the zips themselves. We do NOT pre-check here — that
    //     would create a chicken-and-egg failure where the gate trips
    //     before the export step has a chance to run. Instead we
    //     verify the zips post-export, before any destructive step
    //     proceeds (see the explicit verify call below).
    if (FLAGS.skipRollback) {
      ensureRollbackArtifactsExist(
        '`--skip-rollback-export` was passed but the operator has not ' +
          'pre-exported the solution zips. Either drop `--skip-rollback-export` ' +
          'and let the script export them automatically, or run the manual ' +
          '`pac solution export` commands listed in ' +
          'docs/PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md §4.3 first.',
      );
    } else {
      // Auto-export path: make sure the destination directory exists
      // so `pac solution export --path .phase122/rollback/...zip` lands.
      mkdirSync(ROLLBACK_DIR, { recursive: true });
    }

    console.log('All pre-execution safety gates passed. Beginning commit execution…');
    console.log('');
    const ctx = { token: mainToken, envUrl: mainEnvUrl };

    // ----- Phase 1: rollback export steps (auto-export path only) -----
    // Idempotency: pac solution export fails if the destination zip
    // already exists. On a repeat --commit run after a previous PATCH-
    // and-publish ran, the zips from the earlier run are still on disk
    // and a naive re-export would crash before the script could reach
    // its destructive step. The skip-helper below treats an existing
    // non-empty rollback zip as a valid checkpoint (we never silently
    // overwrite it) and bails honestly on a zero-byte file.
    const rollbackSteps = plan.filter((s) =>
      typeof s.id === 'string' && s.id.startsWith('rollback-export-'),
    );
    for (const step of rollbackSteps) {
      if (shouldSkipRollbackExportStep(step)) continue;
      const r = await executeStep(step, ctx);
      if (!r.ok) {
        console.error(`Step "${step.label}" failed: ${r.error}`);
        process.exit(4);
      }
    }

    // ----- Phase 1 verify: zips actually on disk -----
    ensureRollbackArtifactsExist(
      FLAGS.skipRollback
        ? 'Rollback artifact disappeared between pre-execution check and now.'
        : 'Rollback export step exited cleanly but the expected zip is not on disk. ' +
            'Refusing to proceed to dependency inspection or any destructive step.',
    );
    console.log('');
    console.log('✓ Rollback artifacts verified on disk.');

    // ----- Phase 2: dependency inspection (read-only) -----
    const depResult = await inspectPseudoColumnDependencies(plan, mainToken, mainEnvUrl);
    if (depResult.blocked) {
      console.error('');
      console.error('✗ Safety gate: one or more pseudo-columns have dependent components.');
      console.error('  Refusing to delete any pseudo-column or create any new lookup.');
      console.error('  No destructive step has run.');
      console.error('');
      console.error('  Remediation path:');
      console.error('    1. For each dependency listed above, remove or repoint the');
      console.error('       reference in Maker Portal (see the inline `remediation:` hint');
      console.error('       printed under each dependent component).');
      console.error('    2. Re-run `node scripts/phase122-lookup-repair.mjs --inspect-dependencies`');
      console.error('       to confirm the dependency is gone.');
      console.error('    3. Re-run `node scripts/phase122-lookup-repair.mjs --commit`.');
      console.error('');
      console.error('  The script will NOT attempt a force-delete or any other bypass.');
      process.exit(5);
    }
    console.log(`✓ Inspected ${depResult.inspected} pseudo-column delete step(s); none have dependencies.`);
    console.log('  Proceeding to destructive steps.');
    console.log('');

    // ----- Phase 3: remaining (destructive + verify) steps -----
    const remainingSteps = plan.filter(
      (s) => !(typeof s.id === 'string' && s.id.startsWith('rollback-export-')),
    );
    for (const step of remainingSteps) {
      const r = await executeStep(step, ctx);
      if (!r.ok) {
        console.error(`Step "${step.label}" failed: ${r.error}`);
        process.exit(4);
      }
    }
    console.log('');
    console.log('✓ Commit execution complete. Re-run the script in dry-run mode to confirm');
    console.log('  the new columns now resolve via `pac env fetch`.');
    return;
  }

  // === Dry-run summary ===
  console.log('Dry-run complete. Nothing was written to Dataverse.');
  console.log('');
  console.log('Next steps:');
  console.log(
    '  1. Review the plan above + the runbook JSON at ' + RUNBOOK_PATH + '.',
  );
  console.log('  2. Inspect Dataverse dependency state for each pseudo-column the');
  console.log('     plan would delete (recommended before --commit):');
  console.log('       node scripts/phase122-lookup-repair.mjs --inspect-dependencies');
  console.log('  2a. If a form blocks the delete, clean it up (read-only preview first):');
  console.log('       node scripts/phase122-lookup-repair.mjs --cleanup-form <form-guid>');
  console.log('       node scripts/phase122-lookup-repair.mjs --cleanup-form <form-guid> --commit-form-cleanup');
  console.log('  3. To let the script execute the plan:');
  console.log('       node scripts/phase122-lookup-repair.mjs --commit');
  console.log('     Commit mode acquires a token via this priority order:');
  console.log(`       a. ${DV_BEARER_TOKEN_ENV_VAR} env var (if set + JWT-shaped).`);
  console.log('       b. Cached device-code token from a previous run.');
  console.log('       c. OAuth2 device-code flow (no admin install — prompts in terminal).');
  console.log('  4. OR copy/paste the commands from the runbook JSON manually.');
  console.log('');
  console.log('Hard non-goals (this script):');
  console.log(`  - never creates a column with the "${FORBIDDEN_PUBLISHER_PREFIX}_" prefix`);
  console.log(`  - never binds to legacy /cr664_deals(<id>)`);
  console.log('  - never deletes a column that has non-NULL rows');
  console.log('  - never modifies React app code');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Bail error type. Throwing this from anywhere inside main() lets the
 * event loop drain naturally instead of triggering `process.exit()`
 * mid-flight. On Windows we hit a libuv assertion
 *
 *   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)
 *
 * when calling `process.exit(1)` while a `fetch` keep-alive socket
 * was still closing. The clean fix is to throw a typed error, catch
 * it at the main()-level handler, and set `process.exitCode` — the
 * runtime then exits after the event loop drains, no abrupt
 * termination.
 */
class BailError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'BailError';
    this.isBail = true;
    this.exitCode = exitCode;
  }
}

function bail(msg, exitCode = 1) {
  throw new BailError(`✗ ${msg}`, exitCode);
}

function printHelp() {
  console.log(`Phase 122B — Dataverse lookup repair (dry-run default)

Usage:
  node scripts/phase122-lookup-repair.mjs                                                       # dry-run (default)
  node scripts/phase122-lookup-repair.mjs --dry-run                                             # explicit dry-run
  node scripts/phase122-lookup-repair.mjs --inspect-dependencies                                # read-only dependency probe
  node scripts/phase122-lookup-repair.mjs --cleanup-form <form-guid>                            # read-only form cleanup preview
  node scripts/phase122-lookup-repair.mjs --cleanup-form <form-guid> --commit-form-cleanup      # execute the form cleanup
  node scripts/phase122-lookup-repair.mjs --commit                                              # execute writes after every safety gate passes
  node scripts/phase122-lookup-repair.mjs --help

Modes:
  --dry-run / (default)
      Audit live env + emit plan to .phase122/phase122-runbook.json.
      Nothing else.
  --inspect-dependencies
      Same as dry-run PLUS: for each pseudo-column the plan would
      delete, query the Dataverse RetrieveDependenciesForDelete API
      and print every dependent component. Short-circuits at the
      first column with dependencies. Read-only (GET only). Acquires
      a bearer token via the same priority order as --commit.
  --cleanup-form <form-guid> [--attribute <table>.<column>]
      Targets one SystemForm by GUID. Without --attribute the cleanup
      targets the default cr664_deal pseudo-column (back-compat).
      With --attribute, the cleanup targets the supplied column
      logical name instead — useful for clearing form dependencies on
      sibling attributes (e.g. cr664_assignedto) discovered after the
      cr664_deal cleanup loop closes.

      Read-only by default: prints every <cell> whose control
      references the target attribute. Pair with --commit-form-cleanup
      to splice those cells out, PATCH the form, publish via
      PublishXml, and re-probe the dependency to confirm the blocker
      cleared. Never deletes the pseudo-column itself.

      The post-commit re-probe runs against:
        - the supplied table.column when --attribute was passed; or
        - the form's parent entity + cr664_deal in the default case.

      Without --attribute, when no direct field control is found but
      the form has INDIRECT references (subgrid, quick-view,
      relationship name, NavBar) to a candidate child table, the
      script REFUSES to write and points the operator at
      --inspect-form for a full breakdown. With --attribute, the
      cleanup mode is strictly direct-cell only — no indirect-refs
      diagnostic; use --inspect-form for that.

  --inspect-form <form-guid> --attribute <table>.<column>
      Read-only broad inspection of one SystemForm. Walks the form's
      persisted XML and groups every reference to the supplied
      qualified attribute into per-category findings (direct field
      cell, subgrid control, quick-view control, TargetEntityType,
      RelationshipName, NavBar item, bare logical-name occurrence).
      Useful when --cleanup-form reports no direct field but the
      dependency probe still names this form. Never writes; never
      publishes.

  --cleanup-subgrid <form-guid> --control-id <id>
      Targeted removal of ONE subgrid identified by its control id.
      Read-only by default; pair with --commit-subgrid-cleanup to
      execute. Validates (a) exactly one <cell> on the form contains
      that control, (b) the control's classid is the subgrid classid,
      (c) the TargetEntityType is in CANDIDATE_CHILD_TABLES, and
      (d) the RelationshipName references cr664_deal. If any gate
      fails the script bails. On commit, splices ONLY the matched
      <cell>, PATCHes the form, publishes, then re-inspects and
      exits non-zero if any residual reference to that target table
      remains on the form. Useful for hidden subgrids that the form
      designer does not surface for removal.

  --inspect-view <view-guid> --attribute <table>.<column>
      Read-only inspection of one SavedQuery (Dataverse view). Walks
      fetchxml + layoutxml and groups every reference to the supplied
      attribute into per-category findings (displayed layoutxml cell,
      top-level fetchxml <attribute>, link-entity-nested <attribute>,
      <condition>, <order>, <link-entity from|to>). Classifies the
      overall view state as no-references / safe / unsafe. Never
      writes; never publishes.

  --cleanup-view <view-guid> --attribute <table>.<column>
      Targeted removal of safely-removable attribute references in a
      SavedQuery. Read-only by default; pair with
      --commit-view-cleanup to execute. Refuses (no write) when the
      view contains filter / sort / link-entity references — those
      carry semantic meaning the operator must judge in Maker Portal.
      On commit, PATCHes the SavedQuery + PublishXml + re-runs the
      dependency probe for <table>.<column>.

  --print-relationship-payload
      Pure diagnostic. Prints the exact JSON body the script would
      POST to /api/data/v9.2/RelationshipDefinitions for every
      planned cr664_Deal + cr664_AssignedTo Lookup. No pac call, no
      Web API call, no write. Useful for eyeballing payload shape
      after a 400-response (e.g. the 2026-06-08 IsCustomizable bug).

  --verify-lookups
      Read-only Web API metadata verification. For every Phase 122
      target attribute (5 cr664_Deal lookups + 1 cr664_AssignedTo
      lookup) queries the Dataverse Web API metadata endpoint and
      reports whether the attribute is missing, a legacy pseudo
      scalar, or a true LookupAttributeMetadata — including the
      resolved Targets[] and ManyToOne relationship SchemaName.
      Authoritative; does NOT use pac env fetch. The same metadata
      check is used by the post-commit verify plan steps.

  --inspect-table <logical-name>
      Read-only Web API table schema inspection (Phase 122D). Fetches
      EntityDefinitions metadata for the supplied table and prints
      every column grouped by RequiredLevel (REQUIRED FOR CREATE,
      RECOMMENDED, OPTIONAL). For each required Lookup column the
      mode also fetches the resolved Targets[]; for each required
      Picklist (choice) column it fetches the OptionSet values.
      Useful for seeding a record into a table the SDK has no
      generated model for (e.g. cr664_clientrelationship). Pure GETs,
      no write of any kind.

  --inspect-attributes <comma-separated list of <table>.<attribute>>
      Read-only targeted attribute inspection (Phase 122E Pt 1). For
      each operator-supplied <table>.<attribute>, walks one level
      deep:
        - GETs the parent table + the attribute (LogicalName,
          SchemaName, AttributeType, RequiredLevel, IsCustomAttribute,
          DisplayName).
        - If Lookup: GETs the resolved Targets[] AND, for each
          target table, prints LogicalName / EntitySetName /
          PrimaryNameAttribute / PrimaryIdAttribute / IsCustomEntity,
          plus the target's REQUIRED FOR CREATE columns. Required
          nested Lookups print their Targets; required nested
          Picklists print their OptionSet values.
        - If Picklist: prints the OptionSet values.
      Designed for OPTIONAL reference lookups that --inspect-table
      doesn't detail-print (e.g. cr664_loandeal.cr664_producttypereference).
      Pure GETs, no write of any kind.

  --seed-product-references --deal-name <text>
      [--commit-seed-product-references]
      Phase 122E Pt 2 — guarded seed of the three optional Product /
      Loan Structure / Pricing reference lookups on a Loan Deal. All
      three target the same cr664_producttypereference table per the
      Pt 1 audit. Dry-run by default. Idempotent per row (find by
      cr664_code → find by cr664_name → create) and per deal (no
      PATCH if all three lookups already point at the resolved ids).
      The POST body sets ONLY cr664_name + cr664_code +
      cr664_activeflag; the PATCH body sets ONLY the three
      product-reference @odata.bind values — no other Loan Deal
      column is touched. Bails ambiguously on duplicate rows by
      either probe.

  --seed-client-relationship
      --deal-name <text> --client-name <text> --borrower-type <int>
      [--commit-seed-client]
      Phase 122D Pt 2 — guarded seed of one cr664_clientrelationship
      row and the deal-link PATCH. All three inputs required. Dry-run
      by default. The mode:
        1. GETs the Loan Deal by cr664_dealname; refuses if zero or
           multiple matches.
        2. GETs the Client by cr664_clientname. If found, reuses;
           if not, plans a POST that creates one with the supplied
           name + borrower-type integer.
        3. If the deal's _cr664_client_value already equals the
           resolved client id, no-op success (idempotent).
        4. With --commit-seed-client: executes the POST (if needed)
           and PATCHes the deal with cr664_Client@odata.bind. The
           PATCH body sets ONLY that field — Product Type / Loan
           Structure / Pricing Type stay untouched.
        5. Re-reads the deal post-write and verifies the link.
      Valid --borrower-type values:
        788190000=Individual, 788190001=LLC, 788190002=Corporation,
        788190003=Partnership, 788190004=Trust, 788190005=Non-Profit.

  --inspect-copilot-custom-api
      Phase 137G — read-only inspection of the future
      ${COPILOT_CUSTOM_API_NAME} Dataverse Custom API. Pure GETs against
      the customapis metadata endpoint; reports whether it exists and its
      request/response parameter metadata if found, plus the expected
      Phase 137B contract. Never writes.

  --seed-copilot-custom-api-metadata [--commit-seed-copilot-custom-api-metadata]
      Phase 137G — DRY-RUN-ONLY plan for creating the
      ${COPILOT_CUSTOM_API_NAME} Custom API metadata (CustomAPI +
      request parameters + response property). OFFLINE: no pac auth, no
      Web API call, no write. Prints the exact planned Dataverse payloads.
      COMMIT IS NOT IMPLEMENTED in Phase 137G — passing
      --commit-seed-copilot-custom-api-metadata prints a notice and still
      performs no write. No plugin, no Azure resource, no live enablement.

  --inspect-copilot-audit-table
      Phase 137J — read-only inspection of the future
      ${COPILOT_AUDIT_TABLE_LOGICAL_NAME} Dataverse audit-event table. Pure
      GETs against the EntityDefinitions metadata endpoint; reports whether
      it exists and which expected Phase 137I audit fields are present.
      Never writes.

  --seed-copilot-audit-table-metadata [--commit-seed-copilot-audit-table-metadata]
      Phase 137J — DRY-RUN-ONLY plan for creating the
      ${COPILOT_AUDIT_TABLE_LOGICAL_NAME} table metadata (table + ${COPILOT_AUDIT_FIELDS.length}
      fields + cr664_eventtype options + recommended indexes). OFFLINE: no
      pac auth, no Web API call, no write. Prints the planned metadata.
      COMMIT IS NOT IMPLEMENTED in Phase 137J — passing
      --commit-seed-copilot-audit-table-metadata prints a notice and still
      performs no write. No table/attribute/index is created; no publish is
      run; no live enablement.

  --commit
      Run the plan against the live env. Refuses to run unless every
      safety gate (publisher prefix, rollback artifacts, dependency
      inspection, no stop conditions) passes.

Safety gates for --commit:
  - solution ${SOLUTION_FOR_CR664} must have publisher prefix "${CR664_PUBLISHER_PREFIX}"
    (refuses if it shows "${FORBIDDEN_PUBLISHER_PREFIX}" or anything else)
  - rollback artifacts at .phase122/rollback/*_PRE_PHASE_122B.zip must exist
    on disk after Phase 1 (auto-export by default; pre-supplied when
    --skip-rollback-export is passed)
  - a Dataverse bearer token must be obtainable from at least ONE of:
      a. ${DV_BEARER_TOKEN_ENV_VAR} env var (operator pre-acquired),
      b. cached device-code token from a previous run, or
      c. an interactive OAuth2 device-code flow (no admin install).
  - no plan step may be a stop-condition
  - any column scheduled for deletion must have ZERO non-NULL rows
  - dependency inspection (Phase 2) must report ZERO dependent
    components for every pseudo-column the plan would delete. The
    script refuses to attempt a force-delete or any bypass header.
`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  // BailError is the script's own typed failure marker — print the
  // message and set process.exitCode so the runtime exits cleanly
  // after the event loop drains. Avoid process.exit() here: with
  // fetch keep-alive sockets still closing it can trip a libuv
  // assertion (`!(handle->flags & UV_HANDLE_CLOSING)`) on Windows.
  if (err && err.isBail) {
    if (err.message) console.error(err.message);
    process.exitCode = typeof err.exitCode === 'number' ? err.exitCode : 1;
    return;
  }
  console.error('Uncaught error:', err);
  process.exitCode = 99;
});

// Silence import-not-used lint when execSync isn't used at runtime
void execSync;
