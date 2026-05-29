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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    help: false,
  };
  for (const arg of argv.slice(2)) {
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
    } else if (arg === '--help' || arg === '-h') flags.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      console.error(
        'Usage: node scripts/phase122-lookup-repair.mjs [--dry-run | --commit | --inspect-dependencies] [--help]',
      );
      process.exit(2);
    }
  }
  if (flags.commit && flags.inspectDependencies) {
    console.error('Refusing to run: --commit and --inspect-dependencies are mutually exclusive.');
    process.exit(2);
  }
  return flags;
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

if (FLAGS.commit) {
  console.log('⚠  COMMIT MODE — script may perform live Dataverse writes if every');
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
  const xml = `<fetch count='1'><entity name='${table}'><attribute name='${table}id'/><attribute name='${attribute}'/></entity></fetch>`;
  return fetchXml(xml).ok;
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

function auditTable(table) {
  console.log(`  · ${table}`);
  const result = {
    table,
    pseudoDealColumnExists: attributeExists(table, PSEUDO_DEAL_COLUMN),
    standardLookupFkExists: attributeExists(table, `_${PSEUDO_DEAL_COLUMN}_value`),
    pseudoDealColumnPopulated: undefined,
  };
  if (result.pseudoDealColumnExists) {
    const c = countNonNull(table, PSEUDO_DEAL_COLUMN);
    if (!c.ok) {
      result.pseudoDealColumnPopulated = null; // unknown
    } else {
      result.pseudoDealColumnPopulated = c.count;
    }
  }
  if (table === 'cr664_dealtask1') {
    result.pseudoAssignedToColumnExists = attributeExists(table, PSEUDO_ASSIGNEDTO_COLUMN);
    result.standardAssignedToFkExists = attributeExists(
      table,
      `_${PSEUDO_ASSIGNEDTO_COLUMN}_value`,
    );
    if (result.pseudoAssignedToColumnExists) {
      const c = countNonNull(table, PSEUDO_ASSIGNEDTO_COLUMN);
      result.pseudoAssignedToColumnPopulated = c.ok ? c.count : null;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Plan emission — every Web API payload + verification command
// ---------------------------------------------------------------------------

function buildLookupRelationshipPayload({ referencingEntity, schemaName, displayLabel, target }) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${referencingEntity}_${target}_${schemaName.replace(/^cr664_/, '')}`,
    ReferencedEntity: target,
    ReferencingEntity: referencingEntity,
    AssociatedMenuConfiguration: {
      Behavior: 'UseCollectionName',
      Group: 'Details',
      Order: 10000,
      IsCustomizable: { Value: true, CanBeChanged: true, ManagedPropertyLogicalName: 'iscustomizable' },
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

  // Step 6 — verification probes
  for (const t of CANDIDATE_CHILD_TABLES) {
    steps.push({
      id: `verify-${t}`,
      kind: 'verify',
      label: `Verify _${PSEUDO_DEAL_COLUMN}_value resolves on ${t}`,
      command: `pac env fetch -x "<fetch count='1'><entity name='${t}'><attribute name='${t}id'/><attribute name='_${PSEUDO_DEAL_COLUMN}_value'/></entity></fetch>"`,
    });
  }
  steps.push({
    id: 'verify-assignedto',
    kind: 'verify',
    label: 'Verify _cr664_assignedto_value resolves on cr664_dealtask1',
    command: `pac env fetch -x "<fetch count='1'><entity name='cr664_dealtask1'><attribute name='cr664_dealtask1id'/><attribute name='_${PSEUDO_ASSIGNEDTO_COLUMN}_value'/></entity></fetch>"`,
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

// ---------------------------------------------------------------------------
// Commit execution (Web API + pac shellouts)
// ---------------------------------------------------------------------------

async function executeStep(step, ctx) {
  console.log(`> EXECUTING: ${step.label}`);
  if (step.kind === 'noop') return { ok: true, skipped: true };
  if (step.kind === 'manual-inspection' || step.kind === 'stop-condition') {
    bail(`Stop condition reached during commit: ${step.label}`);
  }
  if (step.kind === 'pac' || step.kind === 'verify') {
    const cmd = step.command.split(' ');
    const res = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', stdio: 'inherit' });
    if (res.status !== 0) {
      return { ok: false, error: `pac command exited with status ${res.status}` };
    }
    return { ok: true };
  }
  if (step.kind === 'webapi') {
    const envUrl = await resolveEnvUrl();
    const url = `${envUrl}${step.url}`;
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  assertPacAuth();

  // === Phase A: audit ===
  const publisherAudit = auditPublishers();
  console.log('  Publisher join:');
  for (const [sln, prefix] of Object.entries(publisherAudit)) {
    console.log(`    - ${sln}: prefix=${prefix ?? 'UNKNOWN'}`);
  }
  console.log('');

  console.log('Phase B — Auditing candidate child tables for column state…');
  const tableAudits = CANDIDATE_CHILD_TABLES.map(auditTable);
  console.log('');
  console.log('Table audit summary:');
  for (const t of tableAudits) {
    console.log(`  ${t.table}:`);
    console.log(`    pseudo cr664_deal exists:       ${t.pseudoDealColumnExists}`);
    console.log(`    standard _cr664_deal_value:     ${t.standardLookupFkExists}`);
    if (t.pseudoDealColumnExists) {
      console.log(`    non-NULL row count:             ${t.pseudoDealColumnPopulated}`);
    }
    if (t.table === 'cr664_dealtask1') {
      console.log(`    pseudo cr664_assignedto:        ${t.pseudoAssignedToColumnExists}`);
      console.log(`    standard _cr664_assignedto_v:   ${t.standardAssignedToFkExists}`);
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
              : step.kind === 'verify'
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
    const envUrl = await resolveEnvUrl();
    const token = await acquireBearerToken(envUrl);
    const depResult = await inspectPseudoColumnDependencies(plan, token, envUrl);
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

    const envUrl = await resolveEnvUrl();
    const token = await acquireBearerToken(envUrl);
    console.log('All pre-execution safety gates passed. Beginning commit execution…');
    console.log('');
    const ctx = { token, envUrl };

    // ----- Phase 1: rollback export steps (auto-export path only) -----
    const rollbackSteps = plan.filter((s) =>
      typeof s.id === 'string' && s.id.startsWith('rollback-export-'),
    );
    for (const step of rollbackSteps) {
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
    const depResult = await inspectPseudoColumnDependencies(plan, token, envUrl);
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

function bail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Phase 122B — Dataverse lookup repair (dry-run default)

Usage:
  node scripts/phase122-lookup-repair.mjs                          # dry-run (default)
  node scripts/phase122-lookup-repair.mjs --dry-run                # explicit dry-run
  node scripts/phase122-lookup-repair.mjs --inspect-dependencies   # read-only dependency probe
  node scripts/phase122-lookup-repair.mjs --commit                 # execute writes after every safety gate passes
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
  console.error('Uncaught error:', err);
  process.exit(99);
});

// Silence import-not-used lint when execSync isn't used at runtime
void execSync;
