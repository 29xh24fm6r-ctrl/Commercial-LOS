import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 187H / G-2 — WorkspaceContext is a PICKLIST, not a table dependency.
 *
 * CORRECTION of the earlier "WorkspaceContext node" model: live Dataverse
 * metadata proves cr664_workspacecontext is a REQUIRED Picklist column on
 * cr664_workspacetype (OptionSet 788190000 EXECUTIVE_CONTEXT / 788190001
 * OPERATIONAL_CONTEXT / 788190002 ADMIN_CONTEXT) — NOT a lookup to a table. The
 * LookupAttributeMetadata cast 404s for it, so the old "walk it as a lookup"
 * path never worked and WorkspaceType create blocked as an uncovered required
 * field. The walker now SEEDS the picklist with a pinned production-safe value
 * (OPERATIONAL_CONTEXT for a Banker Workspace) via IDENTITY_REQUIRED_PICKLIST_SEED,
 * classifying it ALLOWLISTED_PICKLIST and setting it on the WorkspaceType create.
 * Source-level pins only.
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

describe('lookup detection is probe-based (robust to AttributeType mislabels)', () => {
  it('classifies each required field through the centralized probe-based classifier', () => {
    expect(SECTION).toMatch(/for \(const attr of fields\.required\)/);
    expect(SECTION).toMatch(/classifyRequiredFieldForGraph\(/);
    expect(SECTION).toMatch(/getLookupTargetsForAttribute\(tableLogical, ln, token, envUrl\)/);
  });

  it('a probed lookup is walked recursively; a non-lookup becomes an uncovered scalar', () => {
    expect(SECTION).toMatch(/const child = await resolveIdentityNode\(ctx, c\.targets\[0\], depth \+ 1\)/);
    expect(SECTION).toMatch(/uncoveredScalars\.push\(attr\.LogicalName\)/);
  });

  it('does NOT decide lookup-vs-scalar from the $select-ed AttributeType alone', () => {
    // The old, fragile `AttributeType === 'Lookup'` split is gone.
    expect(SECTION).not.toMatch(/AttributeType === 'Lookup'/);
  });

  it('WorkspaceType is not blocked by cr664_workspacecontext (seeded picklist, not uncovered)', () => {
    // The uncovered-scalar block still exists for genuinely-uncovered required
    // fields, but a seeded picklist short-circuits to ALLOWLISTED_PICKLIST before
    // the probe, so it never reaches the uncovered-scalar branch.
    expect(SECTION).toMatch(/uncoveredScalars\.length > 0/);
    expect(SECTION).toMatch(/REJECTED_MISSING_REQUIRED_FIELD/);
    expect(SECTION).toMatch(/classification: 'ALLOWLISTED_PICKLIST'/);
  });
});

describe('WorkspaceContext is a seeded picklist on WorkspaceType (not a node)', () => {
  it('has a metadata-backed picklist seed with the OPERATIONAL_CONTEXT value', () => {
    expect(SECTION).toMatch(/IDENTITY_REQUIRED_PICKLIST_SEED/);
    expect(SECTION).toMatch(/cr664_workspacetype:\s*\{\s*\n\s*cr664_workspacecontext:\s*\{\s*value:\s*788190001,\s*label:\s*'OPERATIONAL_CONTEXT'/);
  });

  it('removed the old WorkspaceContext-as-table node policy entry', () => {
    expect(SECTION).not.toMatch(/cr664_workspacecontext:\s*\{\s*\n\s*label:\s*'WorkspaceContext'/);
    expect(SECTION).not.toMatch(/seedName:\s*'OGB LOS'/);
  });

  it('the seed is classified ALLOWLISTED_PICKLIST and set on the WorkspaceType create body', () => {
    expect(SECTION).toMatch(/picklistSeeds && picklistSeeds\.has\(lnLower\)/);
    expect(SECTION).toMatch(/for \(const seed of node\.fields\.picklistSeeds/);
    expect(SECTION).toMatch(/body\[seed\.attr\] = seed\.value/);
  });

  it('WorkspaceType create payload allow-list includes the seeded picklist key', () => {
    expect(SECTION).toMatch(/const picklistKeys = \[\.\.\.fields\.picklistSeeds\.values\(\)\]\.map\(\(s\) => s\.attr\)/);
    expect(SECTION).toMatch(/payloadKeys = \[\.\.\.scalarKeys, \.\.\.picklistKeys, \.\.\.binds\.map\(\(b\) => b\.nav\)\]/);
  });
});

describe('dependency-safe ordering (context before type before coreuser)', () => {
  it('children are created before their parent (post-order create collection)', () => {
    expect(SECTION).toMatch(/function collectCreateOrder\(node, arr, seen\)/);
    expect(SECTION).toMatch(/for \(const c of node\.children \|\| \[\]\) collectCreateOrder\(c\.child, arr, seen\)/);
    // Parent pushed AFTER its children.
    const fn = SECTION.slice(SECTION.indexOf('function collectCreateOrder'));
    const childIdx = fn.indexOf('collectCreateOrder(c.child');
    const pushIdx = fn.indexOf('arr.push(node)');
    expect(childIdx).toBeGreaterThan(0);
    expect(pushIdx).toBeGreaterThan(childIdx);
  });
});

describe('fail-closed candidate policy for the reference nodes (WorkspaceType / UserRole)', () => {
  it('reuses one approved, blocks on multiple approved, plans a create on zero', () => {
    expect(SECTION).toMatch(/approved\.length === 1/);
    expect(SECTION).toMatch(/REJECTED_AMBIGUOUS/);
    expect(SECTION).toMatch(/else action = 'create'/);
  });

  it('rejects TEST / PHASE / demo / sample / inactive / blank', () => {
    for (const t of ['REJECTED_TEST', 'REJECTED_PHASE', 'REJECTED_DEMO', 'REJECTED_SAMPLE', 'REJECTED_INACTIVE']) {
      expect(SECTION).toMatch(new RegExp(t));
    }
    // blank name -> unsupported.
    expect(SECTION).toMatch(/lower\.length === 0/);
  });
});

describe('still no Loan Deal / audit / gate, commit-gated, no GUIDs', () => {
  it('dry-run guard precedes any write; commit refuses a BLOCKED plan', () => {
    expect(SECTION).toMatch(/if \(!doCommit\)/);
    expect(SECTION).toMatch(/Refusing to commit — plan is not READY_TO_COMMIT/);
  });

  it('never creates a Loan Deal, writes audit, or enables a gate', () => {
    expect(SECTION).not.toMatch(/cr664_loandeals/);
    expect(SECTION).not.toMatch(/data\/v9\.2\/cr664_auditevents/);
    expect(SECTION).not.toMatch(/_ENABLED\s*=\s*true/);
  });

  it('hardcodes no Dataverse record GUID', () => {
    expect(SECTION).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });
});
