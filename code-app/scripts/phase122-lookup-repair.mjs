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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

// Output paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT_DIR = resolve(REPO_ROOT, '.phase122');
const RUNBOOK_PATH = resolve(OUTPUT_DIR, 'phase122-runbook.json');
const ROLLBACK_DIR = resolve(REPO_ROOT, '.phase122', 'rollback');

// ---------------------------------------------------------------------------
// Argument parsing — DEFAULT is dry-run. Any unknown flag is rejected.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = { dryRun: true, commit: false, skipRollback: false, help: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--commit') {
      flags.commit = true;
      flags.dryRun = false;
    } else if (arg === '--skip-rollback-export') flags.skipRollback = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      console.error('Usage: node scripts/phase122-lookup-repair.mjs [--dry-run | --commit] [--help]');
      process.exit(2);
    }
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

const MODE = FLAGS.commit ? 'COMMIT' : 'DRY-RUN';
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

function refuseIfNoBearerToken() {
  const token = process.env[DV_BEARER_TOKEN_ENV_VAR];
  if (!token || token.trim().length === 0) {
    bail(
      `Safety gate: ${DV_BEARER_TOKEN_ENV_VAR} env var is not set. Commit mode requires a ` +
        `Dataverse bearer token. Acquire one via \`az account get-access-token --resource ` +
        `https://<env>.crm.dynamics.com\` and export it as ${DV_BEARER_TOKEN_ENV_VAR}.`,
    );
  }
  return token;
}

function ensureRollbackArtifactsExist() {
  for (const sln of [SOLUTION_FOR_REFERENCE, SOLUTION_FOR_CR664]) {
    const path = resolve(ROLLBACK_DIR, `${sln}_PRE_PHASE_122B.zip`);
    if (!existsSync(path)) {
      bail(
        `Safety gate: rollback artifact missing — ${path}. Run dry-run with ` +
          `--commit dropped first, OR pre-export the solution manually via Maker Portal, OR ` +
          `let the script export it (rerun without --skip-rollback-export).`,
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

  // === Safety gates for commit mode ===
  if (FLAGS.commit) {
    refuseIfForbiddenPrefix(publisherAudit);
    if (!FLAGS.skipRollback) ensureRollbackArtifactsExist();
    const token = refuseIfNoBearerToken();
    console.log('All safety gates passed. Beginning commit execution…');
    console.log('');
    const ctx = { token };
    for (const step of plan) {
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
  console.log('  2. If you want the script to execute it:');
  console.log(
    '       a. Acquire a Dataverse bearer token (e.g. `az account get-access-token ' +
      '--resource https://<env>.crm.dynamics.com`).',
  );
  console.log(`       b. Export it as ${DV_BEARER_TOKEN_ENV_VAR}.`);
  console.log('       c. Run `node scripts/phase122-lookup-repair.mjs --commit`.');
  console.log('  3. OR copy/paste the commands from the runbook JSON manually.');
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
  node scripts/phase122-lookup-repair.mjs                 # dry-run (default)
  node scripts/phase122-lookup-repair.mjs --dry-run       # explicit dry-run
  node scripts/phase122-lookup-repair.mjs --commit        # execute writes after every safety gate passes
  node scripts/phase122-lookup-repair.mjs --help

Safety gates for --commit:
  - solution ${SOLUTION_FOR_CR664} must have publisher prefix "${CR664_PUBLISHER_PREFIX}"
    (refuses if it shows "${FORBIDDEN_PUBLISHER_PREFIX}" or anything else)
  - rollback artifacts at .phase122/rollback/*_PRE_PHASE_122B.zip must exist
  - ${DV_BEARER_TOKEN_ENV_VAR} env var must be set
  - no plan step may be a stop-condition
  - any column scheduled for deletion must have ZERO non-NULL rows
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
