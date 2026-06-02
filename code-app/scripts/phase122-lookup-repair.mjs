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
  ].filter(Boolean);
  if (exclusiveModes.length > 1) {
    bailParseArgs(
      'Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, and --cleanup-view are mutually exclusive.',
    );
  }
  if (flags.commitFormCleanup && flags.cleanupFormId === null) {
    bailParseArgs('--commit-form-cleanup has no effect without --cleanup-form <id>.');
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
  FLAGS.commitViewCleanup
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
