import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX-IDENTITY-AUDIT-GRAPH-WORKSPACECONTEXT-NODE-1 — script contract pins.
 *
 * WorkspaceContext (cr664_workspacecontext) is now a first-class recursive
 * dependency of WorkspaceType: the walker probes the LookupAttributeMetadata
 * cast (authoritative) to recognise cr664_workspacetype.cr664_workspacecontext
 * as a lookup, descends into the target table, classifies/seeds it with its own
 * policy, and binds it on the WorkspaceType create — instead of blocking it as
 * an "uncovered required field". Source-level pins only.
 */

const SCRIPT = readFileSync(
  resolve(__dirname, '..', '..', '..', 'scripts', 'phase122-lookup-repair.mjs'),
  'utf8',
);

const SECTION_START = SCRIPT.indexOf('// SPEC — canonical identity/audit graph provisioning.');
const SECTION_END = SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SECTION_START);
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

  it('WorkspaceType is no longer blocked merely because cr664_workspacecontext is required', () => {
    // The uncovered-scalar block fires only when the probe found NO lookup target,
    // so a resolvable WorkspaceContext lookup is walked, not blocked.
    expect(SECTION).toMatch(/uncoveredScalars\.length > 0/);
    expect(SECTION).toMatch(/REJECTED_MISSING_REQUIRED_FIELD/);
  });
});

describe('WorkspaceContext is a first-class dependency node', () => {
  it('has an explicit policy with the approved names + OGB LOS seed', () => {
    expect(SECTION).toMatch(/cr664_workspacecontext:\s*\{/);
    expect(SECTION).toMatch(/seedName:\s*'OGB LOS'/);
    expect(SECTION).toMatch(/seedCode:\s*'OGB_LOS'/);
    for (const name of ['lending os', 'commercial lending los', 'commercial lending', 'ogb los', 'banker workspace context']) {
      expect(SECTION).toMatch(new RegExp(`'${name}'`));
    }
  });

  it('reuse/create/classification flows through the same generic node resolver', () => {
    // No bespoke WorkspaceContext code path — it uses classifyIdentityRow +
    // listReferenceRows + the seed policy like every other reference node.
    expect(SECTION).toMatch(/classifyIdentityRow\(r, info, policy\)/);
    expect(SECTION).toMatch(/listReferenceRows\(info/);
  });

  it('WorkspaceType create binds the resolved WorkspaceContext via its metadata nav property', () => {
    expect(SECTION).toMatch(/binds = children\.map\(\(c\) => \(\{ nav: `\$\{c\.navProperty\}@odata\.bind`/);
    expect(SECTION).toMatch(/payloadKeys = \[\.\.\.scalarKeys, \.\.\.binds\.map\(\(b\) => b\.nav\)\]/);
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

describe('fail-closed candidate policy for WorkspaceContext', () => {
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
