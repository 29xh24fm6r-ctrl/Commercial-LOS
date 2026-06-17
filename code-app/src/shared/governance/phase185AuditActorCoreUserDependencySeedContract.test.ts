import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX-AUDIT-ACTOR-COREUSER-DEPENDENCY-SEED-1 — script contract pins.
 *
 * The operator script gained guarded modes to inspect and (guardedly) seed the
 * production-safe PrimaryWorkspace + Banker Role rows the cr664_user create
 * depends on. These pins guard the safety rails at the SOURCE level — the suite
 * never runs the script, never calls Dataverse, never touches app behaviour.
 */

const SCRIPT = readFileSync(
  resolve(__dirname, '..', '..', '..', 'scripts', 'phase122-lookup-repair.mjs'),
  'utf8',
);

// This section ends where the canonical identity-graph section begins (it has
// its own contract test), falling back to the audit-phase marker.
const NEXT_SECTION = '// SPEC — canonical identity/audit graph provisioning.';
const AUDIT_PHASE = '// Audit phase — publishers + tables + columns';
function sectionEnd(start: number): number {
  const next = SCRIPT.indexOf(NEXT_SECTION, start);
  return next !== -1 ? next : SCRIPT.indexOf(AUDIT_PHASE, start);
}

const SECTION_START = SCRIPT.indexOf('// BUGFIX — CoreUser DEPENDENCY seed.');
const SECTION = SCRIPT.slice(SECTION_START, sectionEnd(SECTION_START));

const INSPECT_START = SCRIPT.indexOf('async function runInspectCoreUserDependencySeeds');
const INSPECT_END = SCRIPT.indexOf('async function runSeedCoreUserDependencies');
const INSPECT = SCRIPT.slice(INSPECT_START, INSPECT_END);

const SEED_START = SCRIPT.indexOf('async function runSeedCoreUserDependencies');
const SEED_END = sectionEnd(SEED_START);
const SEED = SCRIPT.slice(SEED_START, SEED_END);

describe('flags & dry-run default', () => {
  it('defines the three new flags', () => {
    expect(SCRIPT).toMatch(/arg === '--inspect-coreuser-dependency-seeds'/);
    expect(SCRIPT).toMatch(/arg === '--seed-coreuser-dependencies'/);
    expect(SCRIPT).toMatch(/arg === '--commit-seed-coreuser-dependencies'/);
  });

  it('initializes the new flags to a non-writing default', () => {
    expect(SCRIPT).toMatch(/inspectCoreUserDependencySeeds:\s*false/);
    expect(SCRIPT).toMatch(/seedCoreUserDependencies:\s*false/);
    expect(SCRIPT).toMatch(/commitSeedCoreUserDependencies:\s*false/);
  });

  it('commit flag is inert without the seed mode (parse-time guard)', () => {
    expect(SCRIPT).toMatch(
      /commitSeedCoreUserDependencies &&\s*\n?\s*!flags\.seedCoreUserDependencies/,
    );
    expect(SCRIPT).toMatch(
      /--commit-seed-coreuser-dependencies has no effect without --seed-coreuser-dependencies/,
    );
  });

  it('both modes are added to the mutually-exclusive set', () => {
    expect(SCRIPT).toMatch(
      /flags\.inspectCoreUserDependencySeeds,\s*\n\s*flags\.seedCoreUserDependencies,/,
    );
  });
});

describe('inspect mode — read-only', () => {
  it('issues NO write (no POST/PATCH/DELETE)', () => {
    expect(INSPECT).not.toMatch(/method:\s*'POST'/);
    expect(INSPECT).not.toMatch(/method:\s*'PATCH'/);
    expect(INSPECT).not.toMatch(/method:\s*'DELETE'/);
  });

  it('resolves one active platform user and inspects cr664_user + both target tables', () => {
    expect(INSPECT).toMatch(/findAuditActorPlatformUser/);
    expect(INSPECT).toMatch(/No cr664_platformusers row matches/);
    expect(INSPECT).toMatch(/Platform user is inactive/);
    expect(INSPECT).toMatch(/getAuditActorCoreUserCreateRequirements/);
    expect(INSPECT).toMatch(/COREUSER_PW_ATTR/);
    expect(INSPECT).toMatch(/COREUSER_ROLE_ATTR/);
    expect(INSPECT).toMatch(/printDependencyClassification/);
  });
});

describe('classification — all seven tokens', () => {
  it('row-level classifier yields the six row tokens', () => {
    expect(SECTION).toMatch(/classification = 'REJECTED_INACTIVE'/);
    expect(SECTION).toMatch(/classification = 'REJECTED_PHASE'/);
    expect(SECTION).toMatch(/classification = 'REJECTED_TEST'/);
    expect(SECTION).toMatch(/classification = 'REJECTED_DEMO'/);
    expect(SECTION).toMatch(/classification = 'REJECTED_UNSUPPORTED'/);
    expect(SECTION).toMatch(/classification = 'APPROVED'/);
  });

  it('ambiguity surfaces REJECTED_AMBIGUOUS', () => {
    expect(SECTION).toMatch(/REJECTED_AMBIGUOUS \(\$\{approved\.length\}/);
  });

  it('System Super Admin / admin-only is rejected via the approved-name allow-list', () => {
    // Role approved-names exclude any admin role, so "System Super Admin" lands
    // in REJECTED_UNSUPPORTED (not in the approved list).
    expect(SECTION).toMatch(
      /DEP_APPROVED_ROLE_NAMES = Object\.freeze\(\[\s*'banker',\s*'commercial banker',\s*'lending banker',\s*'relationship manager',\s*\]\)/,
    );
    expect(SECTION.toLowerCase()).not.toMatch(/'system super admin'/);
  });

  it('approved workspace names are pinned', () => {
    expect(SECTION).toMatch(
      /DEP_APPROVED_WORKSPACE_NAMES = Object\.freeze\(\[\s*'banker workspace',\s*'banker',\s*'commercial lending',\s*'commercial lending los',\s*'lending os',\s*\]\)/,
    );
  });
});

describe('seed mode — reuse / create / fail closed', () => {
  it('reuses the single approved row and creates only when none is approved', () => {
    expect(SECTION).toMatch(/action: 'reuse'/);
    expect(SECTION).toMatch(/action: 'create'/);
    expect(SECTION).toMatch(/approved\.length === 1/);
    expect(SECTION).toMatch(/approved\.length > 1/);
  });

  it('multiple approved rows fail closed (ambiguous)', () => {
    expect(SEED).toMatch(/EXACTLY ONE active production-safe/);
  });

  it('unknown required-for-create fields stop without guessing', () => {
    expect(SECTION).toMatch(/buildDependencyCreatePlan/);
    expect(SEED).toMatch(/required-for-create field\(s\) unknown/);
    expect(SEED).toMatch(/NOT guessing/);
    expect(SEED).toMatch(/Operator action:/);
  });

  it('the seed pins the Banker Workspace + Banker Role create values', () => {
    expect(SECTION).toMatch(/DEP_WORKSPACE_SEED_NAME = 'Banker Workspace'/);
    expect(SECTION).toMatch(/DEP_WORKSPACE_SEED_CODE = 'BANKER_WORKSPACE'/);
    expect(SECTION).toMatch(/DEP_ROLE_SEED_NAME = 'Banker'/);
    expect(SECTION).toMatch(/DEP_ROLE_SEED_CODE = 'BANKER'/);
  });

  it('create body is allow-listed (name + optional code + optional active only)', () => {
    expect(SECTION).toMatch(/const body = \{ \[fields\.nameField\]: seedName \}/);
    expect(SECTION).toMatch(/if \(fields\.codeField\) body\[fields\.codeField\] = seedCode/);
    expect(SECTION).toMatch(/if \(fields\.activeField\) body\[fields\.activeField\] = true/);
    expect(SECTION).toMatch(/allowedKeys: Object\.keys\(body\)/);
  });

  it('the create helper rejects any field outside the allowed keys', () => {
    expect(SECTION).toMatch(/disallowed field/);
    expect(SECTION).toMatch(/Object\.keys\(body\)\.filter\(\(k\) => !allowedKeys\.includes\(k\)\)/);
  });
});

describe('commit flag required for any write', () => {
  it('dry-run returns a plan and issues no write', () => {
    expect(SEED).toMatch(/if \(!doCommit\)/);
    expect(SEED).toMatch(/Dry-run only — no write issued/);
    expect(SEED).toMatch(/planned:\s*true/);
  });

  it('the POST happens only after the dry-run guard', () => {
    const guardIdx = SEED.indexOf('if (!doCommit)');
    const postIdx = SEED.indexOf('createDependencyRow(info, sel.body');
    expect(guardIdx).toBeGreaterThan(0);
    expect(postIdx).toBeGreaterThan(guardIdx);
  });
});

describe('hard non-goals — no CoreUser patch / cr664_user / Loan Deal / audit / gate', () => {
  it('never patches PlatformUser.CoreUser in this mode', () => {
    expect(SECTION).not.toMatch(/patchPlatformUserCoreUser/);
    expect(SECTION).not.toMatch(/cr664_CoreUser@odata\.bind/);
  });

  it('never creates a cr664_user in this mode', () => {
    expect(SECTION).not.toMatch(/createCoreUserWithLookups/);
    expect(SECTION).not.toMatch(/createAuditActorCoreUser/);
  });

  it('never touches a Loan Deal', () => {
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

  it('the only write verb in the section is the dependency-row POST', () => {
    expect((SECTION.match(/method:\s*'POST'/g) ?? []).length).toBe(1);
    expect((SECTION.match(/method:\s*'PATCH'/g) ?? []).length).toBe(0);
    expect((SECTION.match(/method:\s*'DELETE'/g) ?? []).length).toBe(0);
  });
});

describe('help + no hardcoded GUIDs', () => {
  it('help documents both new flags', () => {
    expect(SCRIPT).toMatch(/--inspect-coreuser-dependency-seeds --upn <email>/);
    expect(SCRIPT).toMatch(/--seed-coreuser-dependencies --upn <email> \[--commit-seed-coreuser-dependencies\]/);
  });

  it('the section hardcodes no Dataverse record GUID', () => {
    expect(SECTION).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });
});
