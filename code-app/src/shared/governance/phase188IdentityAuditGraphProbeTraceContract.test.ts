import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX-IDENTITY-AUDIT-GRAPH-WORKSPACECONTEXT-PROBE-LIVE-PATH-1 — script pins.
 *
 * The required-field lookup-vs-scalar decision is centralized into ONE
 * probe-based classifier used by every graph mode, with a per-field probe trace
 * and a version marker so an operator can PROVE which logic ran and what
 * getLookupTargetsForAttribute returned for cr664_workspacetype.cr664_workspacecontext.
 * Source-level pins only (never runs the script / Dataverse).
 */

const SCRIPT = readFileSync(
  resolve(__dirname, '..', '..', '..', 'scripts', 'phase122-lookup-repair.mjs'),
  'utf8',
);

const SECTION_START = SCRIPT.indexOf('// SPEC — canonical identity/audit graph provisioning.');
const SECTION_END = (() => {
  const next = SCRIPT.indexOf('// Phase 188B — Document checklist pilot readiness inspector', SECTION_START);
  return next !== -1 ? next : SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SECTION_START);
})();
const SECTION = SCRIPT.slice(SECTION_START, SECTION_END);

const CLASSIFIER = SCRIPT.slice(
  SCRIPT.indexOf('async function classifyRequiredFieldForGraph'),
  SCRIPT.indexOf('// Recursively resolve one graph node'),
);

describe('version marker', () => {
  it('defines probe-required-lookups-v2 and prints it in every mode', () => {
    expect(SECTION).toMatch(/IDENTITY_WALKER_VERSION = 'probe-required-lookups-v2'/);
    // inspect, plan (printIdentityPlan, used by provision), and verify all print it.
    const markers = SCRIPT.match(/Identity graph walker: \$\{IDENTITY_WALKER_VERSION\}/g) ?? [];
    expect(markers.length).toBeGreaterThanOrEqual(3);
  });
});

describe('centralized classifier', () => {
  it('exists and is the single decision point', () => {
    expect(SECTION).toMatch(/async function classifyRequiredFieldForGraph\(\s*tableLogical, attr, coveredLower, autodefaultedLower, picklistSeeds, token, envUrl\s*\)/);
    expect(SECTION).toMatch(/const c = await classifyRequiredFieldForGraph\(/);
  });

  it('probes getLookupTargetsForAttribute for every non-server-defaulted, non-allowlisted field', () => {
    // SERVER_DEFAULTED and ALLOWLISTED_SCALAR short-circuit BEFORE the probe;
    // everything else is decided by the live probe.
    expect(CLASSIFIER).toMatch(/autodefaultedLower\.has\(lnLower\)/);
    expect(CLASSIFIER).toMatch(/coveredLower\.has\(lnLower\)/);
    expect(CLASSIFIER).toMatch(/const tg = await getLookupTargetsForAttribute\(tableLogical, ln, token, envUrl\)/);
  });

  it('emits the five classifications (incl. the seeded-picklist case)', () => {
    for (const t of ['SERVER_DEFAULTED', 'ALLOWLISTED_SCALAR', 'ALLOWLISTED_PICKLIST', 'WALK_LOOKUP_DEPENDENCY', 'BLOCK_UNCOVERED_SCALAR']) {
      expect(CLASSIFIER).toMatch(new RegExp(`classification: '${t}'`));
    }
  });

  it('a required Picklist with a pinned seed (cr664_workspacecontext) is ALLOWLISTED_PICKLIST, not blocked', () => {
    // Live metadata: the LookupAttributeMetadata cast 404s for the picklist, so the
    // old "walk it as a lookup" path never worked; it is seeded instead.
    expect(CLASSIFIER).toMatch(/picklistSeeds && picklistSeeds\.has\(lnLower\)/);
    expect(CLASSIFIER).toMatch(/classification: 'ALLOWLISTED_PICKLIST'/);
  });

  it('targets present -> WALK_LOOKUP_DEPENDENCY', () => {
    expect(CLASSIFIER).toMatch(/tg\.ok && Array\.isArray\(tg\.targets\) && tg\.targets\.length > 0/);
    expect(CLASSIFIER).toMatch(/classification: 'WALK_LOOKUP_DEPENDENCY', targets: tg\.targets/);
  });

  it('no targets and not allow-listed -> BLOCK_UNCOVERED_SCALAR with the exact probe error surfaced', () => {
    expect(CLASSIFIER).toMatch(/classification: 'BLOCK_UNCOVERED_SCALAR'/);
    expect(CLASSIFIER).toMatch(/error: tg\.ok \? null : tg\.error/);
    expect(CLASSIFIER).toMatch(/lookup-target probe FAILED: \$\{tg\.error\}/);
  });

  it('decides lookup-vs-scalar from the live probe, never the $select-ed AttributeType', () => {
    // AttributeType is recorded for the trace only — never used as the decision.
    expect(CLASSIFIER).toMatch(/const attributeType = attr\.AttributeType/);
    expect(SECTION).not.toMatch(/AttributeType === 'Lookup'/);
  });
});

describe('probe trace output', () => {
  it('collects and prints the per-field probe across the whole tree', () => {
    expect(SECTION).toMatch(/function collectRequiredFieldTraces\(node, arr, seen\)/);
    expect(SECTION).toMatch(/function printRequiredFieldProbeTrace\(root\)/);
    expect(SECTION).toMatch(/console\.log\('Required field probe:'\)/);
    expect(SECTION).toMatch(/table=\$\{t\.table\} attribute=\$\{t\.attribute\}/);
    expect(SECTION).toMatch(/classification=\$\{t\.classification\}/);
  });

  it('the node carries its requiredFieldTrace and inspect prints it', () => {
    expect(SECTION).toMatch(/requiredFieldTrace,/);
    expect(SECTION).toMatch(/printRequiredFieldProbeTrace\(plan\.root\)/);
  });
});

describe('all modes share the same probe path', () => {
  it('inspect, plan and provision build the plan via the same walker', () => {
    // inspect + plan + provision all call buildIdentityAuditGraphPlan, which walks
    // resolveIdentityNode -> classifyRequiredFieldForGraph.
    const calls = SCRIPT.match(/await buildIdentityAuditGraphPlan\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(SECTION).toMatch(/async function runInspectIdentityAuditGraph/);
    expect(SECTION).toMatch(/async function runPlanIdentityAuditProvisioning/);
    expect(SECTION).toMatch(/async function runProvisionIdentityAuditGraph/);
  });

  it('plan trace prints inside printIdentityPlan (shared by plan + provision)', () => {
    expect(SECTION).toMatch(/if \(plan\.root\) printRequiredFieldProbeTrace\(plan\.root\)/);
  });

  it('verify prints the version marker too', () => {
    const verify = SCRIPT.slice(
      SCRIPT.indexOf('async function runVerifyIdentityAuditGraph'),
      SCRIPT.indexOf('function printVerifyResult'),
    );
    expect(verify).toMatch(/Identity graph walker: \$\{IDENTITY_WALKER_VERSION\}/);
  });
});

describe('still no writes / Loan Deal / audit / gate / GUIDs', () => {
  it('inspect + the classifier issue no writes', () => {
    expect(CLASSIFIER).not.toMatch(/method:\s*'POST'/);
    expect(CLASSIFIER).not.toMatch(/method:\s*'PATCH'/);
    const inspect = SCRIPT.slice(
      SCRIPT.indexOf('async function runInspectIdentityAuditGraph'),
      SCRIPT.indexOf('function printIdentityPlan'),
    );
    expect(inspect).not.toMatch(/method:\s*'POST'/);
    expect(inspect).not.toMatch(/method:\s*'PATCH'/);
  });

  it('no Loan Deal / audit / gate / GUID in the section', () => {
    expect(SECTION).not.toMatch(/cr664_loandeals/);
    expect(SECTION).not.toMatch(/data\/v9\.2\/cr664_auditevents/);
    expect(SECTION).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(SECTION).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });
});
