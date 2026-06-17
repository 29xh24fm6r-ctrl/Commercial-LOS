import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * SPEC-IDENTITY-AUDIT-GRAPH-CANONICAL-PROVISIONING-1 — script contract pins.
 *
 * One canonical recursive walker maps the ENTIRE audit-actor identity
 * dependency graph before any write, then provisions it in dependency order.
 * These pins guard the safety rails at the SOURCE level — the suite never runs
 * the script, never calls Dataverse, never touches app behaviour.
 */

const SCRIPT = readFileSync(
  resolve(__dirname, '..', '..', '..', 'scripts', 'phase122-lookup-repair.mjs'),
  'utf8',
);

const SECTION_START = SCRIPT.indexOf('// SPEC — canonical identity/audit graph provisioning.');
const SECTION_END = SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SECTION_START);
const SECTION = SCRIPT.slice(SECTION_START, SECTION_END);

const INSPECT = SCRIPT.slice(
  SCRIPT.indexOf('async function runInspectIdentityAuditGraph'),
  SCRIPT.indexOf('function printIdentityPlan'),
);
const PROVISION = SCRIPT.slice(
  SCRIPT.indexOf('async function runProvisionIdentityAuditGraph'),
  SCRIPT.indexOf('async function runVerifyIdentityAuditGraph'),
);

describe('flags, modes & dry-run default', () => {
  it('defines the four canonical flags + the commit flag', () => {
    expect(SCRIPT).toMatch(/arg === '--inspect-identity-audit-graph'/);
    expect(SCRIPT).toMatch(/arg === '--plan-identity-audit-provisioning'/);
    expect(SCRIPT).toMatch(/arg === '--provision-identity-audit-graph'/);
    expect(SCRIPT).toMatch(/arg === '--commit-provision-identity-audit-graph'/);
    expect(SCRIPT).toMatch(/arg === '--verify-identity-audit-graph'/);
  });

  it('initializes the new flags false and adds the modes to the exclusive set', () => {
    expect(SCRIPT).toMatch(/inspectIdentityAuditGraph:\s*false/);
    expect(SCRIPT).toMatch(/provisionIdentityAuditGraph:\s*false/);
    expect(SCRIPT).toMatch(/flags\.inspectIdentityAuditGraph,\s*\n\s*flags\.planIdentityAuditProvisioning,/);
  });

  it('the provision commit flag is inert without the provision mode', () => {
    expect(SCRIPT).toMatch(/commitProvisionIdentityAuditGraph &&\s*\n?\s*!flags\.provisionIdentityAuditGraph/);
    expect(SCRIPT).toMatch(/--commit-provision-identity-audit-graph has no effect without --provision-identity-audit-graph/);
  });
});

describe('recursive graph walk', () => {
  it('walks required-lookup children recursively (does NOT stop at PrimaryWorkspace)', () => {
    // The walker recurses per required lookup, so WorkspaceType -> WorkspaceContext
    // is reached via the generic recursion, not a hand-stop at one level.
    expect(SECTION).toMatch(/resolveIdentityNode\(ctx, c\.targets\[0\], depth \+ 1\)/);
    expect(SECTION).toMatch(/for \(const attr of fields\.required\)/);
    expect(SECTION).toMatch(/classifyRequiredFieldForGraph/);
    expect(SECTION).toMatch(/IDENTITY_MAX_DEPTH/);
  });

  it('has explicit policy nodes for WorkspaceContext, WorkspaceType and UserRole', () => {
    expect(SECTION).toMatch(/cr664_workspacecontext:\s*\{/);
    expect(SECTION).toMatch(/cr664_workspacetype:\s*\{/);
    expect(SECTION).toMatch(/cr664_userrole:\s*\{/);
  });

  it('honors metadata required-for-create fields (SystemRequired / ApplicationRequired)', () => {
    expect(SECTION).toMatch(/SystemRequired/);
    expect(SECTION).toMatch(/ApplicationRequired/);
    expect(SECTION).toMatch(/IsValidForCreate/);
  });

  it('reports server-defaulted required fields separately (ownerid/owneridtype etc.)', () => {
    expect(SECTION).toMatch(/IDENTITY_SERVER_DEFAULTED_LOOKUPS/);
    expect(SECTION).toMatch(/serverDefaultedRequired/);
  });

  it('prefers reuse over create', () => {
    expect(SECTION).toMatch(/action = 'reuse'/);
    expect(SECTION).toMatch(/else action = 'create'/);
  });

  it('a missing dependency (zero approved) becomes a planned create, not an immediate failure', () => {
    // approved.length === 0 -> action 'create' (the node then validates fields/children).
    expect(SECTION).toMatch(/approved\.length === 1/);
    expect(SECTION).toMatch(/REJECTED_AMBIGUOUS/);
  });
});

describe('classification — all eleven tokens', () => {
  const tokens = [
    'APPROVED',
    'REJECTED_TEST',
    'REJECTED_PHASE',
    'REJECTED_DEMO',
    'REJECTED_SAMPLE',
    'REJECTED_INACTIVE',
    'REJECTED_ADMIN_ONLY',
    'REJECTED_AMBIGUOUS',
    'REJECTED_UNSUPPORTED',
    'REJECTED_MISSING_REQUIRED_FIELD',
    'REJECTED_UNKNOWN_METADATA',
  ];
  for (const t of tokens) {
    it(`uses ${t}`, () => {
      expect(SECTION).toMatch(new RegExp(t));
    });
  }

  it('admin / super admin roles are rejected, and an unsupported required field names the field', () => {
    expect(SECTION).toMatch(/REJECTED_ADMIN_ONLY/);
    expect(SECTION).toMatch(/super admin/);
    expect(SECTION).toMatch(/required field\(s\) not covered by allow-list: \$\{uncoveredScalars\.join/);
  });
});

describe('blocking & fail-closed conditions', () => {
  it('zero / multiple / inactive platform users block', () => {
    expect(SECTION).toMatch(/no cr664_platformusers row matches/);
    expect(SECTION).toMatch(/cr664_platformusers rows match/);
    expect(SECTION).toMatch(/platform user is inactive/);
  });

  it('existing CoreUser pointing at an inactive/missing cr664_user blocks', () => {
    expect(SECTION).toMatch(/points at an INACTIVE cr664_user/);
    expect(SECTION).toMatch(/points at a MISSING cr664_user/);
  });

  it('multiple approved candidates block unless the platform user already points to one', () => {
    expect(SECTION).toMatch(/platformUserLookupValues\.includes\(c\.id\)/);
    expect(SECTION).toMatch(/\$\{approved\.length\} approved candidates/);
  });
});

describe('provisioning — dependency-safe order, allow-lists, guarded commit', () => {
  it('create order is dependency-safe (children before parents, post-order)', () => {
    expect(SECTION).toMatch(/function collectCreateOrder\(node, arr, seen\)/);
    expect(SECTION).toMatch(/for \(const c of node\.children \|\| \[\]\) collectCreateOrder\(c\.child, arr, seen\)/);
  });

  it('each create payload is allow-listed (scalar keys + only the resolved lookup binds)', () => {
    expect(SECTION).toMatch(/IDENTITY_COREUSER_SCALAR_ALLOWLIST = Object\.freeze\(\[\s*'cr664_username',\s*'cr664_email',\s*'cr664_activeaccessflag',\s*\]\)/);
    expect(SECTION).toMatch(/payloadKeys = \[\.\.\.scalarKeys, \.\.\.binds\.map\(\(b\) => b\.nav\)\]/);
    // createDependencyRow enforces body keys subset allowedKeys.
    expect(SECTION).toMatch(/built\.allowedKeys/);
  });

  it('the platform-user PATCH binds ONLY cr664_CoreUser', () => {
    expect(PROVISION).toMatch(/patchPlatformUserCoreUser\(plan\.platformUser\.cr664_platformuserid, coreUserId/);
    expect(PROVISION).not.toMatch(/cr664_email:/);
    expect(PROVISION).not.toMatch(/cr664_fullname:/);
  });

  it('commit requires the flag and refuses a BLOCKED plan', () => {
    expect(PROVISION).toMatch(/if \(!doCommit\)/);
    expect(PROVISION).toMatch(/Dry-run only — no write issued/);
    expect(PROVISION).toMatch(/Refusing to commit — plan is not READY_TO_COMMIT/);
  });

  it('writes happen only after the dry-run guard', () => {
    const guardIdx = PROVISION.indexOf('if (!doCommit)');
    const postIdx = PROVISION.indexOf('createDependencyRow(');
    const patchIdx = PROVISION.indexOf('patchPlatformUserCoreUser(');
    expect(guardIdx).toBeGreaterThan(0);
    expect(postIdx).toBeGreaterThan(guardIdx);
    expect(patchIdx).toBeGreaterThan(guardIdx);
  });
});

describe('inspect & plan output', () => {
  it('the inspector issues no writes', () => {
    expect(INSPECT).not.toMatch(/method:\s*'POST'/);
    expect(INSPECT).not.toMatch(/method:\s*'PATCH'/);
    expect(INSPECT).not.toMatch(/method:\s*'DELETE'/);
    expect(INSPECT).toMatch(/WRITES: 0/);
  });

  it('the plan prints the required header and status line', () => {
    expect(SECTION).toMatch(/IDENTITY AUDIT GRAPH PLAN/);
    expect(SECTION).toMatch(/WRITES: 0 in dry-run/);
    expect(SECTION).toMatch(/PLAN STATUS:/);
  });

  it('verify prints GRAPH STATUS', () => {
    expect(SECTION).toMatch(/GRAPH STATUS: \$\{ready \? 'READY' : 'BLOCKED'\}/);
  });
});

describe('hard non-goals — no Loan Deal / audit / gate', () => {
  it('never creates a Loan Deal', () => {
    expect(SECTION).not.toMatch(/cr664_loandeals/);
    expect(SECTION).not.toMatch(/cr664_loandealid/);
  });

  it('never writes an audit row', () => {
    expect(SECTION).not.toMatch(/data\/v9\.2\/cr664_auditevents/);
    expect(SECTION).not.toMatch(/cr664_ChangedBy@odata\.bind':/);
  });

  it('never enables a gate / pilot / feature flag', () => {
    expect(SECTION).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(SECTION).not.toMatch(/PILOT_ENABLED/);
    expect(SECTION).not.toMatch(/productionRolloutApproved/);
  });

  it('the only write verbs in the section are the dependency POST + the CoreUser PATCH helper', () => {
    // Row creates reuse createDependencyRow / the PATCH reuses
    // patchPlatformUserCoreUser; the section itself issues no inline fetch POST/PATCH.
    expect((SECTION.match(/method:\s*'POST'/g) ?? []).length).toBe(0);
    expect((SECTION.match(/method:\s*'PATCH'/g) ?? []).length).toBe(0);
    expect(SECTION).toMatch(/createDependencyRow\(/);
    expect(SECTION).toMatch(/patchPlatformUserCoreUser\(/);
  });
});

describe('help + no hardcoded GUIDs', () => {
  it('help documents all four canonical flags', () => {
    expect(SCRIPT).toMatch(/--inspect-identity-audit-graph --upn <email>/);
    expect(SCRIPT).toMatch(/--plan-identity-audit-provisioning --upn <email>/);
    expect(SCRIPT).toMatch(/--provision-identity-audit-graph --upn <email> \[--commit-provision-identity-audit-graph\]/);
    expect(SCRIPT).toMatch(/--verify-identity-audit-graph --upn <email>/);
  });

  it('the section hardcodes no Dataverse record GUID', () => {
    expect(SECTION).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });
});
