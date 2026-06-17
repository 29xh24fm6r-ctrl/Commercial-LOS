import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX-AUDIT-ACTOR-COREUSER-REQUIRED-LOOKUP-SEED-1 — script contract pins.
 *
 * The operator script gained guarded modes to resolve the REQUIRED
 * cr664_primaryworkspace + cr664_role lookups, create/reuse one cr664_user for
 * the audit actor, and PATCH only cr664_platformuser.cr664_CoreUser. These pins
 * guard the safety rails at the SOURCE level — the suite never runs the script,
 * never calls Dataverse, never touches app behaviour.
 */

const SCRIPT = readFileSync(
  resolve(__dirname, '..', '..', '..', 'scripts', 'phase122-lookup-repair.mjs'),
  'utf8',
);

/** Slice the CoreUser required-lookup seed section. */
const SECTION_START = SCRIPT.indexOf('// BUGFIX — CoreUser required-lookup seed.');
const SECTION_END = SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SECTION_START);
const SECTION = SCRIPT.slice(SECTION_START, SECTION_END);

const INSPECT_START = SCRIPT.indexOf('async function runInspectCoreUserCreateDependencies');
const INSPECT_END = SCRIPT.indexOf('async function runSeedCoreUserForPlatformUser');
const INSPECT = SCRIPT.slice(INSPECT_START, INSPECT_END);

const SEED_START = SCRIPT.indexOf('async function runSeedCoreUserForPlatformUser');
const SEED_END = SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SEED_START);
const SEED = SCRIPT.slice(SEED_START, SEED_END);

describe('flags & dry-run default', () => {
  it('defines the three new flags', () => {
    expect(SCRIPT).toMatch(/arg === '--inspect-coreuser-create-dependencies'/);
    expect(SCRIPT).toMatch(/arg === '--seed-coreuser-for-platform-user'/);
    expect(SCRIPT).toMatch(/arg === '--commit-seed-coreuser-for-platform-user'/);
  });

  it('initializes the new flags to a non-writing default', () => {
    expect(SCRIPT).toMatch(/inspectCoreUserCreateDependencies:\s*false/);
    expect(SCRIPT).toMatch(/seedCoreUserForPlatformUser:\s*false/);
    expect(SCRIPT).toMatch(/commitSeedCoreUserForPlatformUser:\s*false/);
  });

  it('commit flag is inert without the seed mode (parse-time guard)', () => {
    expect(SCRIPT).toMatch(
      /commitSeedCoreUserForPlatformUser &&\s*\n?\s*!flags\.seedCoreUserForPlatformUser/,
    );
    expect(SCRIPT).toMatch(
      /--commit-seed-coreuser-for-platform-user has no effect without --seed-coreuser-for-platform-user/,
    );
  });

  it('both modes are added to the mutually-exclusive set', () => {
    expect(SCRIPT).toMatch(
      /flags\.inspectCoreUserCreateDependencies,\s*\n\s*flags\.seedCoreUserForPlatformUser,/,
    );
  });

  it('both modes require --upn', () => {
    expect(SCRIPT).toMatch(/--inspect-coreuser-create-dependencies\n?.*requires --upn|requires --upn <email>/);
    expect(SEED).toMatch(/runSeedCoreUserForPlatformUser\(\{ upn, doCommit \}/);
  });
});

describe('inspect mode — read-only', () => {
  it('issues NO write (no POST/PATCH/DELETE)', () => {
    expect(INSPECT).not.toMatch(/method:\s*'POST'/);
    expect(INSPECT).not.toMatch(/method:\s*'PATCH'/);
    expect(INSPECT).not.toMatch(/method:\s*'DELETE'/);
  });

  it('fails closed on missing / multiple / inactive platform users', () => {
    expect(INSPECT).toMatch(/No cr664_platformusers row matches/);
    expect(INSPECT).toMatch(/rows match.*Fail closed/s);
    expect(INSPECT).toMatch(/Platform user is inactive/);
  });

  it('inspects metadata: entity set, required-for-create, PrimaryWorkspace + Role targets', () => {
    expect(INSPECT).toMatch(/EntitySetName/);
    expect(INSPECT).toMatch(/REQUIRED FOR CREATE/);
    expect(INSPECT).toMatch(/resolveCoreUserLookupTarget\(COREUSER_PW_ATTR/);
    expect(INSPECT).toMatch(/resolveCoreUserLookupTarget\(COREUSER_ROLE_ATTR/);
  });

  it('prints platform-user sourceable fields and classified candidates', () => {
    expect(INSPECT).toMatch(/_cr664_primaryworkspace_value/);
    expect(INSPECT).toMatch(/_cr664_role_value/);
    expect(INSPECT).toMatch(/printCoreUserLookupCandidates/);
  });
});

describe('classification — all five tokens exist & are sourced correctly', () => {
  it('classifyCoreUserLookupRow yields INACTIVE / TEST / UNSUPPORTED / APPROVED', () => {
    expect(SECTION).toMatch(/classification = 'REJECTED_INACTIVE'/);
    expect(SECTION).toMatch(/classification = 'REJECTED_TEST'/);
    expect(SECTION).toMatch(/classification = 'REJECTED_UNSUPPORTED'/);
    expect(SECTION).toMatch(/classification = 'APPROVED'/);
  });

  it('REJECTED_TEST uses the shared production-unsafe label guard', () => {
    expect(SECTION).toMatch(/isProductionUnsafeReferenceLabel\('',\s*name\)/);
  });

  it('ambiguity surfaces REJECTED_AMBIGUOUS', () => {
    expect(SECTION).toMatch(/REJECTED_AMBIGUOUS PrimaryWorkspace/);
    expect(SECTION).toMatch(/REJECTED_AMBIGUOUS Role/);
  });

  it('Role is limited to the approved banker names', () => {
    expect(SECTION).toMatch(
      /COREUSER_APPROVED_ROLE_NAMES = Object\.freeze\(\[\s*'banker',\s*'commercial banker',\s*'lending banker',\s*'relationship manager',\s*\]\)/,
    );
  });
});

describe('selection policy — fail closed on zero / multiple / inactive', () => {
  it('PrimaryWorkspace: missing blocks, ambiguous blocks, inactive rejected', () => {
    expect(SECTION).toMatch(/no APPROVED production-safe PrimaryWorkspace candidate/);
    expect(SECTION).toMatch(/REJECTED_AMBIGUOUS PrimaryWorkspace/);
    // inactive handled by the active check in classifyCoreUserLookupRow.
    expect(SEED).toMatch(/PrimaryWorkspace could not be resolved/);
  });

  it('Role: missing blocks, ambiguous blocks', () => {
    expect(SECTION).toMatch(/no APPROVED banker Role candidate/);
    expect(SECTION).toMatch(/REJECTED_AMBIGUOUS Role/);
    expect(SEED).toMatch(/Role could not be resolved/);
  });

  it('prefers the platform user\'s own active+safe workspace/role first', () => {
    expect(SECTION).toMatch(/platform user's existing primary workspace/);
    expect(SECTION).toMatch(/platform user's existing role/);
  });
});

describe('seed mode — create/reuse + guarded write', () => {
  it('existing valid CoreUser is a no-op success', () => {
    expect(SEED).toMatch(/already points at an active cr664_user/);
    expect(SEED).toMatch(/No-op success/);
  });

  it('reuses an existing active cr664_user match before creating', () => {
    expect(SEED).toMatch(/findAuditActorCoreUsers/);
    expect(SEED).toMatch(/Reusing existing active cr664_user/);
    expect(SEED).toMatch(/distinct active cr664_user rows match the actor/);
  });

  it('create payload allow-list is pinned (scalars + the two resolved lookup binds only)', () => {
    expect(SCRIPT).toMatch(
      /COREUSER_REQUIRED_SEED_SCALAR_ALLOWLIST = Object\.freeze\(\[\s*'cr664_username',\s*'cr664_email',\s*'cr664_activeaccessflag',\s*\]\)/,
    );
    // The create body binds exactly the two metadata-named lookups.
    expect(SEED).toMatch(/\[pwBindKey\]:/);
    expect(SEED).toMatch(/\[roleBindKey\]:/);
    expect(SEED).toMatch(/allowedKeys = \[\.\.\.COREUSER_REQUIRED_SEED_SCALAR_ALLOWLIST, pwBindKey, roleBindKey\]/);
  });

  it('the create helper rejects any field outside the allowed keys', () => {
    expect(SECTION).toMatch(/disallowed field/);
    expect(SECTION).toMatch(/Object\.keys\(body\)\.filter\(\(k\) => !allowedKeys\.includes\(k\)\)/);
  });

  it('stops (never guesses) when metadata shows a required field beyond the allow-list', () => {
    expect(SEED).toMatch(/blocking\.length > 0/);
    expect(SEED).toMatch(/Cannot safely create a cr664_user/);
    expect(SEED).toMatch(/NOT guessing these values/);
    expect(SEED).toMatch(/Operator action:/);
  });

  it('the PATCH sets ONLY cr664_CoreUser bind via the shared helper', () => {
    expect(SEED).toMatch(/patchPlatformUserCoreUser\(pu\.cr664_platformuserid, selectedCoreUserId/);
    expect(SEED).toMatch(/\$\{AUDIT_ACTOR_COREUSER_NAV\}@odata\.bind/);
  });
});

describe('commit flag required for any write', () => {
  it('dry-run returns a plan and issues no write', () => {
    expect(SEED).toMatch(/if \(!doCommit\)/);
    expect(SEED).toMatch(/Dry-run only — no write issued/);
    expect(SEED).toMatch(/planned:\s*true/);
  });

  it('the POST and PATCH happen only after the dry-run guard', () => {
    const guardIdx = SEED.indexOf('if (!doCommit)');
    const postIdx = SEED.indexOf('createCoreUserWithLookups(createBody');
    const patchIdx = SEED.indexOf('patchPlatformUserCoreUser(pu.cr664_platformuserid');
    expect(guardIdx).toBeGreaterThan(0);
    expect(postIdx).toBeGreaterThan(guardIdx);
    expect(patchIdx).toBeGreaterThan(guardIdx);
  });
});

describe('hard non-goals — no Loan Deal / audit / gate', () => {
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

  it('the only write verbs in the section are the cr664_user POST + the CoreUser PATCH', () => {
    expect((SECTION.match(/method:\s*'POST'/g) ?? []).length).toBe(1);
    expect((SECTION.match(/method:\s*'PATCH'/g) ?? []).length).toBe(0); // PATCH reuses the shared helper outside this section
    expect((SECTION.match(/method:\s*'DELETE'/g) ?? []).length).toBe(0);
  });
});

describe('help + no hardcoded GUIDs', () => {
  it('help documents both new flags', () => {
    expect(SCRIPT).toMatch(/--inspect-coreuser-create-dependencies --upn <email>/);
    expect(SCRIPT).toMatch(/--seed-coreuser-for-platform-user --upn <email> \[--commit-seed-coreuser-for-platform-user\]/);
  });

  it('the section hardcodes no Dataverse record GUID', () => {
    expect(SECTION).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });
});
