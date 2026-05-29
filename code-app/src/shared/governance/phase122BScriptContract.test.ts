import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 122B — Lookup-repair-script contract pins.
 *
 * The repair script (scripts/phase122-lookup-repair.mjs) carries
 * safety guards that prevent foot-gun executions. This file pins
 * those guards at the source level — if a future contributor
 * weakens any of them, CI fails honestly.
 *
 * What this file does NOT do:
 *   - It does not run the script.
 *   - It does not call the Dataverse Web API.
 *   - It does not change any React app behavior.
 *
 * Every assertion below is a `expect(SCRIPT).toMatch(/.../)` or
 * `expect(SCRIPT).not.toMatch(/.../)` against the script's
 * source text.
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

describe('Phase 122B — script defaults to dry-run', () => {
  it('FLAGS object initializes with dryRun: true', () => {
    expect(SCRIPT).toMatch(/dryRun:\s*true/);
  });

  it('--dry-run keyword is recognised and writes nothing', () => {
    expect(SCRIPT).toMatch(/arg === '--dry-run'/);
  });
});

describe('Phase 122B — --commit is required for writes', () => {
  it('the script only takes commit branches when FLAGS.commit is true', () => {
    // The commit-execution loop is guarded by an `if (FLAGS.commit)`.
    expect(SCRIPT).toMatch(/if\s*\(\s*FLAGS\.commit\s*\)/);
  });

  it('parsing --commit explicitly flips dryRun off', () => {
    // Recognising --commit must clear the dry-run guard so the
    // commit code path is reachable.
    expect(SCRIPT).toMatch(/flags\.commit\s*=\s*true;\s*\n\s*flags\.dryRun\s*=\s*false/);
  });
});

describe('Phase 122B — script refuses the new_ prefix', () => {
  it('declares FORBIDDEN_PUBLISHER_PREFIX = "new"', () => {
    expect(SCRIPT).toMatch(/FORBIDDEN_PUBLISHER_PREFIX\s*=\s*'new'/);
  });

  it('exposes refuseIfForbiddenPrefix() that bails with a clear message', () => {
    expect(SCRIPT).toMatch(/function\s+refuseIfForbiddenPrefix/);
    // Bail message mentions the would-be junk column name verbatim.
    expect(SCRIPT).toMatch(/new_Deal\s+junk\s+columns/);
  });

  it('declares CR664_PUBLISHER_PREFIX = "cr664" — the canonical target', () => {
    expect(SCRIPT).toMatch(/CR664_PUBLISHER_PREFIX\s*=\s*'cr664'/);
  });
});

describe('Phase 122B — script checks for non-NULL pseudo-column values before delete', () => {
  it('countNonNull() probes the pseudo-column before any delete is emitted', () => {
    expect(SCRIPT).toMatch(/function\s+countNonNull/);
    expect(SCRIPT).toMatch(/operator='not-null'/);
  });

  it('emits a STOP step when populated > 0', () => {
    expect(SCRIPT).toMatch(/kind:\s*'stop-condition'/);
    expect(SCRIPT).toMatch(/has \$\{populated\} non-NULL row\(s\)/);
  });

  it('refuses to commit when any plan step is a stop-condition', () => {
    expect(SCRIPT).toMatch(/Refusing to commit/);
    expect(SCRIPT).toMatch(/plan\.filter\(\(s\)\s*=>\s*s\.kind\s*===\s*'stop-condition'\)/);
  });
});

describe('Phase 122B — script targets /cr664_loandeals, never /cr664_deals', () => {
  it('declares LOOKUP_TARGET_LOAN_DEAL = "cr664_loandeal" (modern target)', () => {
    expect(SCRIPT).toMatch(/LOOKUP_TARGET_LOAN_DEAL\s*=\s*'cr664_loandeal'/);
  });

  it('never embeds a runtime call to the legacy /cr664_deals( URL', () => {
    // The script DOES mention `/cr664_deals(<id>)` in its
    // header comment + console-log reassurance ("never binds to
    // legacy /cr664_deals(<id>)"). Those are governance prose,
    // not runtime URLs. Filter out comments + console.log lines
    // before asserting.
    const codeOnly = SCRIPT.split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) return false;
        if (trimmed.startsWith('*')) return false;
        if (trimmed.startsWith('console.log')) return false;
        if (trimmed.startsWith('console.error')) return false;
        return true;
      })
      .join('\n');
    expect(codeOnly).not.toMatch(/\/cr664_deals\(/);
  });

  it('never targets the legacy cr664_deal table in a Lookup payload', () => {
    // The buildLookupRelationshipPayload sets `Targets: [target]`
    // where `target` is one of LOOKUP_TARGET_LOAN_DEAL or
    // LOOKUP_TARGET_SYSTEMUSER. Make sure no hardcoded legacy
    // target slipped in.
    expect(SCRIPT).not.toMatch(/Targets:\s*\[\s*'cr664_deal'\s*\]/);
  });
});

describe('Phase 122B — script includes AssignedTo systemuser repair', () => {
  it('declares LOOKUP_TARGET_SYSTEMUSER = "systemuser"', () => {
    expect(SCRIPT).toMatch(/LOOKUP_TARGET_SYSTEMUSER\s*=\s*'systemuser'/);
  });

  it('declares NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME = "cr664_AssignedTo"', () => {
    expect(SCRIPT).toMatch(
      /NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME\s*=\s*'cr664_AssignedTo'/,
    );
  });

  it('plans the AssignedTo Lookup creation on cr664_dealtask1', () => {
    expect(SCRIPT).toMatch(/Create cr664_AssignedTo Lookup on cr664_dealtask1/);
  });

  it('plans the AssignedTo pseudo-column delete (only when row count is 0)', () => {
    expect(SCRIPT).toMatch(/Delete pseudo-column cr664_dealtask1\.\$\{PSEUDO_ASSIGNEDTO_COLUMN\}/);
  });
});

describe('Phase 122B — script enumerates the five candidate child tables', () => {
  const REQUIRED_TABLES = [
    'cr664_documentchecklist',
    'cr664_dealtask1',
    'cr664_creditmemo1',
    'cr664_creditmemodraftsection',
    'cr664_dealtimelineevent',
  ];

  for (const t of REQUIRED_TABLES) {
    it(`declares ${t} in the CANDIDATE_CHILD_TABLES list`, () => {
      expect(SCRIPT).toMatch(new RegExp(`'${t}'`));
    });
  }
});

describe('Phase 122B — script declares the correct rollback-export pair', () => {
  it('rollback step targets BOTH CommercialLendingLOS and LoanOpsExport', () => {
    expect(SCRIPT).toMatch(/Rollback export — CommercialLendingLOS/);
    expect(SCRIPT).toMatch(/Rollback export — LoanOpsExport/);
  });

  it('ensureRollbackArtifactsExist() checks both rollback zips', () => {
    expect(SCRIPT).toMatch(/function\s+ensureRollbackArtifactsExist/);
    expect(SCRIPT).toMatch(/PRE_PHASE_122B\.zip/);
  });
});

describe('Phase 122B — script inspects dependencies before any pseudo-column delete', () => {
  it('declares inspectPseudoColumnDependencies()', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+inspectPseudoColumnDependencies/);
  });

  it('queries the RetrieveDependenciesForDelete Web API endpoint (GET only)', () => {
    // The unbound function call shape per the Dataverse Web API docs.
    expect(SCRIPT).toMatch(
      /RetrieveDependenciesForDelete\(ComponentType=@p1,ObjectId=@p2\)/,
    );
    // Pin: must be a GET, not a POST.
    expect(SCRIPT).toMatch(
      /retrieveDependenciesForDelete[\s\S]*?method:\s*'GET'/,
    );
  });

  it('resolves attribute MetadataId before each dependency probe', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+getAttributeMetadataId/);
    expect(SCRIPT).toMatch(/\$select=MetadataId/);
  });

  it('component type 2 = Attribute is pinned', () => {
    expect(SCRIPT).toMatch(/COMPONENT_TYPE_ATTRIBUTE\s*=\s*2/);
  });

  it('component-type name table covers the common dependency types', () => {
    // Each of these is a realistic dependent component an attribute can
    // be referenced by. The operator's printed remediation hint relies
    // on this table mapping numeric codes to readable names.
    expect(SCRIPT).toMatch(/SystemForm/);
    expect(SCRIPT).toMatch(/SavedQuery/);
    expect(SCRIPT).toMatch(/EntityRelationship/);
    expect(SCRIPT).toMatch(/Workflow/);
    expect(SCRIPT).toMatch(/FieldSecurityProfile/);
  });

  it('dependency inspection runs BEFORE any destructive step in commit mode', () => {
    // The commit branch must call inspectPseudoColumnDependencies AFTER
    // rollback verification and BEFORE the "Proceeding to destructive
    // steps" marker that gates the remaining-steps loop.
    const commitGuard = SCRIPT.indexOf('// === Safety gates for commit mode ===');
    expect(commitGuard).toBeGreaterThan(-1);
    const commitSlice = SCRIPT.slice(commitGuard);
    const inspectCallIdx = commitSlice.indexOf('await inspectPseudoColumnDependencies(');
    const destructiveMarkerIdx = commitSlice.indexOf('Proceeding to destructive steps');
    expect(inspectCallIdx).toBeGreaterThan(-1);
    expect(destructiveMarkerIdx).toBeGreaterThan(-1);
    expect(inspectCallIdx).toBeLessThan(destructiveMarkerIdx);
  });

  it('dependencies cause fail-closed before destructive steps', () => {
    expect(SCRIPT).toMatch(/depResult\.blocked/);
    expect(SCRIPT).toMatch(/Refusing to delete any pseudo-column/i);
    expect(SCRIPT).toMatch(/No destructive step has run/i);
  });

  it('short-circuits on the first table with a dependency', () => {
    // Per the task: "Do not continue to later tables after a dependency
    // is found." The inspection loop must therefore `break` once a
    // blocker is recorded, not collect every table's dependencies.
    const fnStart = SCRIPT.indexOf('async function inspectPseudoColumnDependencies');
    expect(fnStart).toBeGreaterThan(-1);
    const fnSlice = SCRIPT.slice(fnStart);
    // Match `blockers.push(...);\n    // ...break\n    break;` pattern —
    // i.e. at least one `break;` after a `blockers.push(` inside the loop.
    expect(fnSlice).toMatch(/blockers\.push\([\s\S]*?break;/);
  });

  it('prints dependent component type, object id, and remediation hint', () => {
    expect(SCRIPT).toMatch(/dependentcomponenttype/);
    expect(SCRIPT).toMatch(/dependentcomponentobjectid/);
    expect(SCRIPT).toMatch(/remediation:/);
    expect(SCRIPT).toMatch(/function\s+remediationHintForComponentType/);
  });

  it('no force-delete / bypass path exists anywhere in the script', () => {
    // The script must never attempt to bypass Dataverse safety checks.
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
    // The bail message explicitly promises no force-delete is attempted.
    expect(SCRIPT).toMatch(/will NOT attempt a force-delete/i);
  });
});

describe('Phase 122B — script exposes a read-only --inspect-dependencies mode', () => {
  it('parses --inspect-dependencies as a flag', () => {
    expect(SCRIPT).toMatch(/'--inspect-dependencies'/);
    expect(SCRIPT).toMatch(/flags\.inspectDependencies\s*=\s*true/);
  });

  it('--inspect-dependencies is mutually exclusive with --commit', () => {
    expect(SCRIPT).toMatch(/--commit and --inspect-dependencies are mutually exclusive/);
  });

  it('inspect-dependencies branch returns before the commit branch is reachable', () => {
    // The inspect handler must `return;` so the commit branch below it
    // is never entered in the same invocation.
    const inspectGuardIdx = SCRIPT.indexOf('if (FLAGS.inspectDependencies)');
    expect(inspectGuardIdx).toBeGreaterThan(-1);
    const commitGuardInMain = SCRIPT.indexOf(
      '// === Safety gates for commit mode ===',
    );
    expect(commitGuardInMain).toBeGreaterThan(inspectGuardIdx);
    // The inspect block must `return;` before the commit guard.
    const between = SCRIPT.slice(inspectGuardIdx, commitGuardInMain);
    expect(between).toMatch(/return;/);
  });

  it('inspect-dependencies mode performs NO write operations', () => {
    // Easiest pin: inside the inspect handler block we must not see
    // any reference to FLAGS.commit / DELETE / POST that would couple
    // it to destructive flow.
    const inspectGuardIdx = SCRIPT.indexOf('if (FLAGS.inspectDependencies)');
    expect(inspectGuardIdx).toBeGreaterThan(-1);
    const commitGuardInMain = SCRIPT.indexOf(
      '// === Safety gates for commit mode ===',
    );
    const block = SCRIPT.slice(inspectGuardIdx, commitGuardInMain);
    expect(block).not.toMatch(/executeStep\(/);
    expect(block).not.toMatch(/method:\s*'POST'/);
    expect(block).not.toMatch(/method:\s*'DELETE'/);
  });
});

describe('Phase 122B — rollback gate fires at the correct phase', () => {
  it('pre-execution rollback check fires ONLY when --skip-rollback-export is passed', () => {
    // Auto-export is the default; if the pre-check ran on the auto-export
    // path it would trip on the missing zip before the export step had
    // a chance to create it (chicken-and-egg). The guard must therefore
    // be `if (FLAGS.skipRollback)`, NOT `if (!FLAGS.skipRollback)`.
    expect(SCRIPT).toMatch(
      /if\s*\(\s*FLAGS\.skipRollback\s*\)\s*\{[\s\S]*?ensureRollbackArtifactsExist/,
    );
    // The inverted (broken) form must NOT appear anywhere in the source.
    expect(SCRIPT).not.toMatch(
      /if\s*\(\s*!\s*FLAGS\.skipRollback\s*\)\s*ensureRollbackArtifactsExist/,
    );
  });

  it('auto-export path creates the .phase122/rollback directory first', () => {
    // pac solution export --path X/Y.zip needs Y's parent to exist.
    expect(SCRIPT).toMatch(/mkdirSync\(\s*ROLLBACK_DIR/);
  });

  it('post-export verification runs after Phase 1 rollback steps complete', () => {
    // The commit branch runs rollback-export steps in a dedicated
    // Phase 1 loop, then calls `ensureRollbackArtifactsExist` to verify
    // both zips landed on disk, then proceeds to Phase 2 (dependency
    // inspection). The verify marker proves the post-condition check
    // exists between the two phases.
    expect(SCRIPT).toMatch(/Rollback artifacts verified on disk/);
    // Pin the structural marker that Phase 1 + verify run before any
    // destructive step.
    const commitGuard = SCRIPT.indexOf('// === Safety gates for commit mode ===');
    expect(commitGuard).toBeGreaterThan(-1);
    const slice = SCRIPT.slice(commitGuard);
    const phase1FilterIdx = slice.indexOf("startsWith('rollback-export-')");
    const verifyIdx = slice.indexOf('Rollback artifacts verified on disk');
    const proceedIdx = slice.indexOf('Proceeding to destructive steps');
    expect(phase1FilterIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(phase1FilterIdx);
    expect(proceedIdx).toBeGreaterThan(verifyIdx);
  });
});

describe('Phase 122B — script never edits React app code', () => {
  it('declares LookupTarget constants pointing at Dataverse logical names, not URLs', () => {
    // The script never embeds `/cr664_loandeals(` URLs — that would
    // mean the script is bundling React bind-URL contracts in its
    // own logic. Dataverse Web API metadata operations work in terms
    // of logical names, not entity-set URLs.
    expect(SCRIPT).not.toMatch(/\/cr664_loandeals\(/);
  });

  it('does NOT import from src/ (script is its own module)', () => {
    expect(SCRIPT).not.toMatch(/from\s+['"]\.\.\/src\//);
    expect(SCRIPT).not.toMatch(/require\(['"]\.\.\/src\//);
  });
});

describe('Phase 122B — script bearer-token gate (env var + no-admin fallback)', () => {
  it('declares DV_BEARER_TOKEN_ENV_VAR = "DATAVERSE_BEARER_TOKEN"', () => {
    expect(SCRIPT).toMatch(
      /DV_BEARER_TOKEN_ENV_VAR\s*=\s*'DATAVERSE_BEARER_TOKEN'/,
    );
  });

  it('declares acquireBearerToken() that reads the env var', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+acquireBearerToken/);
    expect(SCRIPT).toMatch(/process\.env\[DV_BEARER_TOKEN_ENV_VAR\]/);
  });

  it('env-var token wins over the device-code fallback', () => {
    // Inside acquireBearerToken's body, the env-var read must appear
    // BEFORE the device-code call. We pin this by slicing the source
    // from the function declaration onward and checking the relative
    // ordering of the two markers.
    const fnStart = SCRIPT.indexOf('async function acquireBearerToken');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart);
    const envReadIdx = body.indexOf('process.env[DV_BEARER_TOKEN_ENV_VAR]');
    const dcCallIdx = body.indexOf('acquireTokenViaDeviceCode(');
    expect(envReadIdx).toBeGreaterThan(-1);
    expect(dcCallIdx).toBeGreaterThan(-1);
    expect(envReadIdx).toBeLessThan(dcCallIdx);
  });

  it('declares acquireTokenViaDeviceCode() — OAuth2 device-code (no admin install)', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+acquireTokenViaDeviceCode/);
    expect(SCRIPT).toMatch(/oauth2\/v2\.0\/devicecode/);
    expect(SCRIPT).toMatch(/oauth2\/v2\.0\/token/);
    expect(SCRIPT).toMatch(/grant-type:device_code/);
  });

  it('uses a Microsoft public client ID — no app registration needed', () => {
    // PUBLIC_CLIENT_ID must be a GUID-shaped constant. We pin shape
    // only so a swap to another well-known public client (e.g. Azure
    // CLI's `04b07795-...`) does not break this pin.
    expect(SCRIPT).toMatch(
      /PUBLIC_CLIENT_ID\s*=\s*['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/,
    );
  });

  it('commit fails closed when every token source fails', () => {
    expect(SCRIPT).toMatch(/could not acquire bearer token/);
    // The bail message must enumerate all three sources tried.
    // `.` without the `s` flag does not cross newlines, but the source
    // wraps the message across template-literal concatenation lines —
    // use `[\s\S]*` so the ordering pin tolerates the line break.
    expect(SCRIPT).toMatch(/env var[\s\S]*cached[\s\S]*device-code/i);
  });

  it('dry-run path does NOT call acquireBearerToken()', () => {
    // The only `await acquireBearerToken(` call site must live inside
    // the `if (FLAGS.commit)` block — i.e. after that guard and before
    // the "Dry-run complete" terminal message.
    const ifCommitIdx = SCRIPT.indexOf('if (FLAGS.commit)');
    expect(ifCommitIdx).toBeGreaterThan(-1);
    const dryRunMsgIdx = SCRIPT.indexOf('Dry-run complete');
    expect(dryRunMsgIdx).toBeGreaterThan(-1);
    const callRegex = /\bawait\s+acquireBearerToken\(/g;
    let calls = 0;
    let m;
    while ((m = callRegex.exec(SCRIPT)) !== null) {
      calls += 1;
      expect(m.index).toBeGreaterThan(ifCommitIdx);
      expect(m.index).toBeLessThan(dryRunMsgIdx);
    }
    expect(calls).toBeGreaterThan(0);
  });

  it('token cache is written under .phase122/ (already gitignored)', () => {
    expect(SCRIPT).toMatch(/DV_BEARER_TOKEN_CACHE_PATH/);
    expect(SCRIPT).toMatch(/\.token-cache\.json/);
    expect(SCRIPT).toMatch(/function\s+readTokenCache/);
    expect(SCRIPT).toMatch(/function\s+writeTokenCache/);
  });

  it('isJwtShape() validates that any token source returns a JWT-shaped string', () => {
    expect(SCRIPT).toMatch(/function\s+isJwtShape/);
  });
});

describe('Phase 122B — script writes a runbook artifact', () => {
  it('writes the plan as JSON to .phase122/phase122-runbook.json', () => {
    expect(SCRIPT).toMatch(/phase122-runbook\.json/);
    expect(SCRIPT).toMatch(/writeFileSync\(\s*RUNBOOK_PATH/);
  });
});
