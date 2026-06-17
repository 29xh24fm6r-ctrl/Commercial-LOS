import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX-AUDIT-ACTOR-COREUSER-BRIDGE-SEED-1 — script contract pins.
 *
 * The operator script (scripts/phase122-lookup-repair.mjs) gained guarded
 * modes to inspect and repair the Platform User -> Core User bridge that the
 * New Deal audit needs to bind cr664_ChangedBy = /cr664_users(<id>). This file
 * pins the safety guards at the SOURCE level (it never runs the script, never
 * calls Dataverse, never touches app behaviour). If a future change weakens a
 * guard, CI fails honestly.
 */

const SCRIPT_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'phase122-lookup-repair.mjs',
);
const SCRIPT = readFileSync(SCRIPT_PATH, 'utf8');

/** Slice the bridge section so write/no-write assertions are scoped to it. */
const BRIDGE_START = SCRIPT.indexOf(
  '// BUGFIX — audit actor CoreUser bridge inspect + guarded seed/repair.',
);
const BRIDGE_END = SCRIPT.indexOf(
  '// Audit phase — publishers + tables + columns',
  BRIDGE_START,
);
const BRIDGE = SCRIPT.slice(BRIDGE_START, BRIDGE_END);

/** Slice just the read-only inspect handler. */
const INSPECT_START = SCRIPT.indexOf('async function runInspectAuditActorBridge');
const INSPECT_END = SCRIPT.indexOf('async function runSeedAuditActorBridge');
const INSPECT = SCRIPT.slice(INSPECT_START, INSPECT_END);

/** Slice the seed/repair handler. */
const SEED_START = SCRIPT.indexOf('async function runSeedAuditActorBridge');
const SEED_END = SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SEED_START);
const SEED = SCRIPT.slice(SEED_START, SEED_END);

describe('bridge seed — flags & dry-run default', () => {
  it('defines the three new flags', () => {
    expect(SCRIPT).toMatch(/arg === '--inspect-audit-actor-bridge'/);
    expect(SCRIPT).toMatch(/arg === '--seed-audit-actor-bridge'/);
    expect(SCRIPT).toMatch(/arg === '--commit-seed-audit-actor-bridge'/);
  });

  it('initializes the bridge flags to a non-writing default', () => {
    expect(SCRIPT).toMatch(/inspectAuditActorBridge:\s*false/);
    expect(SCRIPT).toMatch(/seedAuditActorBridge:\s*false/);
    expect(SCRIPT).toMatch(/commitSeedAuditActorBridge:\s*false/);
  });

  it('commit flag is inert without the seed mode (parse-time guard)', () => {
    expect(SCRIPT).toMatch(
      /commitSeedAuditActorBridge && !flags\.seedAuditActorBridge/,
    );
    expect(SCRIPT).toMatch(
      /--commit-seed-audit-actor-bridge has no effect without --seed-audit-actor-bridge/,
    );
  });

  it('both modes require --upn', () => {
    expect(SCRIPT).toMatch(/requires --upn <email>/);
    expect(INSPECT).toMatch(/runInspectAuditActorBridge\(\{ upn \}/);
    expect(SEED).toMatch(/runSeedAuditActorBridge\(\{ upn, doCommit \}/);
  });

  it('adds both modes to the mutually-exclusive set', () => {
    expect(SCRIPT).toMatch(/flags\.inspectAuditActorBridge,\s*\n\s*flags\.seedAuditActorBridge,/);
  });
});

describe('inspect mode — read-only, fail closed', () => {
  it('the inspect handler issues NO write (no POST/PATCH/DELETE)', () => {
    expect(INSPECT).not.toMatch(/method:\s*'POST'/);
    expect(INSPECT).not.toMatch(/method:\s*'PATCH'/);
    expect(INSPECT).not.toMatch(/method:\s*'DELETE'/);
  });

  it('fails closed on zero / multiple / inactive platform users', () => {
    expect(INSPECT).toMatch(/No cr664_platformusers row matches/);
    expect(INSPECT).toMatch(/rows match.*resolve the ambiguity/s);
    expect(INSPECT).toMatch(/Platform user is inactive/);
    // Each of these is a bail() (fail-closed exit).
    expect(INSPECT.match(/bail\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('verifies a populated CoreUser target exists and is active', () => {
    expect(INSPECT).toMatch(/readAuditActorCoreUserById/);
    expect(INSPECT).toMatch(/does NOT exist \(dangling CoreUser\)/);
    expect(INSPECT).toMatch(/BRIDGE STATUS/);
  });
});

describe('seed mode — guarded write surface', () => {
  it('existing active CoreUser is a no-op success', () => {
    expect(SEED).toMatch(/already points at an active cr664_user/);
    expect(SEED).toMatch(/No-op success/);
  });

  it('a populated-but-broken CoreUser target fails closed (no silent re-point)', () => {
    expect(SEED).toMatch(/populated.*but the referenced/s);
    expect(SEED).toMatch(/refusing to silently/);
  });

  it('multiple platform users / multiple cr664_user matches fail closed', () => {
    expect(SEED).toMatch(/rows match.*resolve the ambiguity/s);
    expect(SEED).toMatch(/distinct active cr664_user rows match/);
    expect(SEED).toMatch(/will not guess/);
  });

  it('reuses one existing active cr664_user before any create', () => {
    expect(SEED).toMatch(/findAuditActorCoreUsers/);
    expect(SEED).toMatch(/Reusing existing active cr664_user/);
  });

  it('only PATCHes cr664_CoreUser@odata.bind on the platform user', () => {
    // The patch helper body sets exactly one key.
    const PATCH_START = SCRIPT.indexOf('async function patchPlatformUserCoreUser');
    const PATCH_END = SCRIPT.indexOf('async function createAuditActorCoreUser');
    const PATCH = SCRIPT.slice(PATCH_START, PATCH_END);
    expect(PATCH).toMatch(/\$\{AUDIT_ACTOR_COREUSER_NAV\}@odata\.bind/);
    // No other platform-user field name appears in the PATCH body.
    expect(PATCH).not.toMatch(/cr664_email:/);
    expect(PATCH).not.toMatch(/cr664_fullname:/);
    expect(PATCH).not.toMatch(/cr664_activestatus:/);
  });
});

describe('cr664_user create — metadata-gated, allow-listed, never guesses', () => {
  it('only allow-lists username / email / activeaccessflag', () => {
    expect(SCRIPT).toMatch(
      /AUDIT_ACTOR_CORE_USER_CREATE_ALLOWLIST = Object\.freeze\(\[\s*'cr664_username',\s*'cr664_email',\s*'cr664_activeaccessflag',\s*\]\)/,
    );
  });

  it('stops with operator instructions when a required field is outside the allow-list', () => {
    expect(SEED).toMatch(/reqs\.blocking\.length > 0/);
    expect(SEED).toMatch(/Cannot safely create a cr664_user/);
    expect(SEED).toMatch(/NOT guessing these values/);
    expect(SEED).toMatch(/Operator action:/);
    expect(SEED).toMatch(/audit stays blocked/);
  });

  it('the create helper refuses any field outside the allow-list', () => {
    const POST_START = SCRIPT.indexOf('async function createAuditActorCoreUser');
    const POST_END = SCRIPT.indexOf('async function printAuditActorCoreUserCreateMetadata');
    const POST = SCRIPT.slice(POST_START, POST_END);
    expect(POST).toMatch(/disallowed field/);
    expect(POST).toMatch(/AUDIT_ACTOR_CORE_USER_CREATE_ALLOWLIST\.includes/);
  });

  it('derives required-for-create fields from live metadata', () => {
    expect(SCRIPT).toMatch(/getAuditActorCoreUserCreateRequirements/);
    expect(SCRIPT).toMatch(/SystemRequired.*ApplicationRequired/s);
  });
});

describe('commit flag is required for any write', () => {
  it('dry-run returns a plan and issues no write', () => {
    expect(SEED).toMatch(/if \(!doCommit\)/);
    expect(SEED).toMatch(/Dry-run only — no write issued/);
    expect(SEED).toMatch(/planned:\s*true/);
  });

  it('the POST and PATCH happen only after the dry-run guard', () => {
    const guardIdx = SEED.indexOf('if (!doCommit)');
    const postIdx = SEED.indexOf('createAuditActorCoreUser(plannedCreateBody');
    const patchIdx = SEED.indexOf('patchPlatformUserCoreUser(');
    expect(guardIdx).toBeGreaterThan(0);
    expect(postIdx).toBeGreaterThan(guardIdx);
    expect(patchIdx).toBeGreaterThan(guardIdx);
  });
});

describe('hard non-goals — no Loan Deal / audit / gate', () => {
  it('the bridge code never touches a Loan Deal', () => {
    expect(BRIDGE).not.toMatch(/cr664_loandeals/);
    expect(BRIDGE).not.toMatch(/cr664_loandealid/);
  });

  it('the bridge code never writes an audit row', () => {
    // It may MENTION cr664_auditevents in an explanatory comment, but it must
    // never hit the audit entity set via the data API or set a ChangedBy bind.
    expect(BRIDGE).not.toMatch(/data\/v9\.2\/cr664_auditevents/);
    expect(BRIDGE).not.toMatch(/Cr664_auditevents/);
    expect(BRIDGE).not.toMatch(/cr664_ChangedBy@odata\.bind':/);
  });

  it('the bridge code never enables a gate / pilot / feature flag', () => {
    expect(BRIDGE).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(BRIDGE).not.toMatch(/PILOT_ENABLED/);
    expect(BRIDGE).not.toMatch(/productionRolloutApproved/);
  });

  it('the only write verbs in the bridge code are the CoreUser PATCH + the gated cr664_user POST', () => {
    const posts = BRIDGE.match(/method:\s*'POST'/g) ?? [];
    const patches = BRIDGE.match(/method:\s*'PATCH'/g) ?? [];
    const deletes = BRIDGE.match(/method:\s*'DELETE'/g) ?? [];
    expect(posts.length).toBe(1);
    expect(patches.length).toBe(1);
    expect(deletes.length).toBe(0);
  });
});

describe('help + no hardcoded GUIDs', () => {
  it('help text documents all three flags', () => {
    expect(SCRIPT).toMatch(/--inspect-audit-actor-bridge --upn <email>/);
    expect(SCRIPT).toMatch(/--seed-audit-actor-bridge --upn <email> \[--commit-seed-audit-actor-bridge\]/);
  });

  it('the bridge code hardcodes no Dataverse record GUID', () => {
    expect(BRIDGE).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });
});
