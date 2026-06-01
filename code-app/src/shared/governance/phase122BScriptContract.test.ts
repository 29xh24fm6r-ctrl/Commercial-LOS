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
    // Now part of the broader three-way mutex with --cleanup-form.
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, and --cleanup-view are mutually exclusive/,
    );
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

describe('Phase 122B — script supports targeted SystemForm cleanup', () => {
  it('parses --cleanup-form <GUID>', () => {
    expect(SCRIPT).toMatch(/'--cleanup-form'/);
    expect(SCRIPT).toMatch(/flags\.cleanupFormId\s*=/);
  });

  it('--cleanup-form refuses any value that is not a GUID', () => {
    // The argument validator must reject non-GUID input before
    // anything else fires.
    expect(SCRIPT).toMatch(
      /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/,
    );
    expect(SCRIPT).toMatch(/--cleanup-form expects a GUID/);
  });

  it('--commit-form-cleanup gates the write path', () => {
    expect(SCRIPT).toMatch(/'--commit-form-cleanup'/);
    expect(SCRIPT).toMatch(/flags\.commitFormCleanup\s*=\s*true/);
    // Without --cleanup-form the write flag is a no-op and the script
    // refuses to start.
    expect(SCRIPT).toMatch(
      /--commit-form-cleanup has no effect without --cleanup-form/,
    );
  });

  it('cleanup-form is mutually exclusive with every other mode', () => {
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, and --cleanup-view are mutually exclusive\./,
    );
  });

  it('without --commit-form-cleanup the cleanup path is a no-op dry-run', () => {
    // The write branch inside runFormCleanup must be guarded by
    // `if (!doCommit)` returning before any PATCH or PublishXml call.
    expect(SCRIPT).toMatch(/if\s*\(\s*!doCommit\s*\)/);
    expect(SCRIPT).toMatch(/Dry-run only — no PATCH or PublishXml issued/);
    // Ordering: the dry-run return must appear BEFORE the PATCH call site
    // inside runFormCleanup.
    const fnStart = SCRIPT.indexOf('async function runFormCleanup');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart);
    const dryReturnIdx = body.indexOf('Dry-run only — no PATCH or PublishXml issued');
    const patchCallIdx = body.indexOf('patchSystemFormXml(');
    expect(dryReturnIdx).toBeGreaterThan(-1);
    expect(patchCallIdx).toBeGreaterThan(-1);
    expect(dryReturnIdx).toBeLessThan(patchCallIdx);
  });

  it('reads the form first via GET systemforms(<id>)?$select=formxml', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+readSystemFormXml/);
    expect(SCRIPT).toMatch(/\$select=formxml/);
    expect(SCRIPT).toMatch(/method:\s*'GET'/);
  });

  it('locates ONLY cr664_deal references in the formxml', () => {
    expect(SCRIPT).toMatch(/function\s+findCr664DealReferences/);
    expect(SCRIPT).toMatch(/datafieldname="cr664_deal"/i);
  });

  it('removes the cr664_deal cell (whole <cell> element) — not surrounding fields', () => {
    expect(SCRIPT).toMatch(/function\s+removeCr664DealReferences/);
    // The removal target is bounded by <cell>…</cell>, not the whole
    // form or any larger container.
    expect(SCRIPT).toMatch(/<cell\\b/);
    expect(SCRIPT).toMatch(/<\\\/cell>/);
  });

  it('writes go via PATCH systemforms(<id>) and POST PublishXml — no other entity touched', () => {
    expect(SCRIPT).toMatch(/PATCH systemforms/);
    expect(SCRIPT).toMatch(/\/api\/data\/v9\.2\/PublishXml/);
    expect(SCRIPT).toMatch(/method:\s*'PATCH'/);
  });

  it('uses the form GUID supplied on the command line — no hardcoded form id', () => {
    expect(SCRIPT).toMatch(/FLAGS\.cleanupFormId/);
    // Negative pin: the script must NOT bake in the operator's specific
    // blocking form GUID. The cleanup mode targets whichever GUID the
    // operator supplies.
    expect(SCRIPT).not.toMatch(/653f9d5e-767f-4363-9eb8-13b2b1f24ceb/i);
  });

  it('re-runs RetrieveDependenciesForDelete after a write to confirm the blocker cleared', () => {
    expect(SCRIPT).toMatch(/Re-running RetrieveDependenciesForDelete/);
    // Pin ordering: the re-probe must come AFTER the PATCH/Publish
    // calls inside runFormCleanup.
    const fnStart = SCRIPT.indexOf('async function runFormCleanup');
    const body = SCRIPT.slice(fnStart);
    const patchIdx = body.indexOf('patchSystemFormXml(');
    const reprobeIdx = body.indexOf('Re-running RetrieveDependenciesForDelete');
    expect(patchIdx).toBeGreaterThan(-1);
    expect(reprobeIdx).toBeGreaterThan(patchIdx);
  });

  it('no force-delete / bypass path was introduced by the cleanup mode', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });

  it('cleanup-form branch in main() returns before audit/plan or commit code is reachable', () => {
    const cleanupGuardIdx = SCRIPT.indexOf('if (FLAGS.cleanupFormId !== null)');
    expect(cleanupGuardIdx).toBeGreaterThan(-1);
    const auditMarkerIdx = SCRIPT.indexOf('// === Phase A: audit ===');
    expect(auditMarkerIdx).toBeGreaterThan(cleanupGuardIdx);
    const between = SCRIPT.slice(cleanupGuardIdx, auditMarkerIdx);
    expect(between).toMatch(/return;/);
  });
});

describe('Phase 122B — broad SystemForm inspection for indirect dependencies', () => {
  it('parses --inspect-form <GUID> --attribute <table>.<column>', () => {
    expect(SCRIPT).toMatch(/'--inspect-form'/);
    expect(SCRIPT).toMatch(/flags\.inspectFormId\s*=/);
    expect(SCRIPT).toMatch(/'--attribute'/);
    expect(SCRIPT).toMatch(/flags\.inspectFormAttribute\s*=/);
  });

  it('--attribute requires a "<table>.<column>" shape', () => {
    expect(SCRIPT).toMatch(/--attribute expects "<table>\.<column>"/);
    // The validator regex enforces dotted, table-then-column form.
    expect(SCRIPT).toMatch(
      /\[a-z\]\[a-z0-9_\]\*\\\.\[a-z\]\[a-z0-9_\]\*/,
    );
  });

  it('--inspect-form is mutually exclusive with every other mode', () => {
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, and --cleanup-view are mutually exclusive/,
    );
  });

  it('--inspect-form requires --attribute (no implicit attribute)', () => {
    expect(SCRIPT).toMatch(
      /--inspect-form requires --attribute <table>\.<column>/,
    );
  });

  it('--attribute without --inspect-form is rejected', () => {
    expect(SCRIPT).toMatch(/--attribute is only valid alongside --inspect-form/);
  });

  it('declares findFormReferences() that returns per-category findings', () => {
    expect(SCRIPT).toMatch(/function\s+findFormReferences/);
    // Pin each category the operator depends on.
    for (const key of [
      'direct',
      'subgrids',
      'quickViews',
      'targetEntities',
      'relationships',
      'navBar',
      'bareAttributeName',
    ]) {
      expect(SCRIPT).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it('matches subgrid controls by the canonical Dataverse classid', () => {
    expect(SCRIPT).toMatch(
      /SUBGRID_CONTROL_CLASSID\s*=\s*'\{E7A81278-8635-4d9e-8D4D-59480B391C5B\}'/,
    );
  });

  it('matches quick-view controls by the canonical Dataverse classid', () => {
    expect(SCRIPT).toMatch(/QUICKVIEW_CONTROL_CLASSID\s*=\s*'\{[0-9A-Fa-f-]+\}'/);
  });

  it('inspects <TargetEntityType>, <RelationshipName>, and <NavBar*> elements', () => {
    expect(SCRIPT).toMatch(/<TargetEntityType>/);
    expect(SCRIPT).toMatch(/<RelationshipName>/);
    expect(SCRIPT).toMatch(/<NavBar/);
    expect(SCRIPT).toMatch(/<NavBarByRelationshipItem/);
  });

  it('declares runFormInspect() as the read-only orchestrator', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+runFormInspect/);
  });

  it('runFormInspect performs NO write — never calls PATCH or PublishXml', () => {
    const fnStart = SCRIPT.indexOf('async function runFormInspect');
    expect(fnStart).toBeGreaterThan(-1);
    // Find the end of runFormInspect — next top-level helper.
    const nextDeclIdx = SCRIPT.indexOf('function printFindingsSection', fnStart);
    expect(nextDeclIdx).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, nextDeclIdx);
    expect(body).not.toMatch(/patchSystemFormXml\(/);
    expect(body).not.toMatch(/publishSystemForm\(/);
    expect(body).not.toMatch(/method:\s*'PATCH'/);
    expect(body).not.toMatch(/method:\s*'POST'/);
    expect(body).not.toMatch(/method:\s*'DELETE'/);
  });

  it('flags parent-entity-vs-attribute-table mismatch explicitly', () => {
    // When the SystemForm's objecttypecode is different from the
    // attribute's table, the script must call that out for the
    // operator (the dependency is indirect — subgrid / NavBar / etc.).
    expect(SCRIPT).toMatch(/DIFFERS from the/);
    expect(SCRIPT).toMatch(/attribute's table/);
  });

  it('inspect-form branch in main() returns before any write-capable mode is reachable', () => {
    const inspectFormGuardIdx = SCRIPT.indexOf('if (FLAGS.inspectFormId !== null)');
    expect(inspectFormGuardIdx).toBeGreaterThan(-1);
    const cleanupGuardIdx = SCRIPT.indexOf(
      'if (FLAGS.cleanupFormId !== null)',
      inspectFormGuardIdx,
    );
    expect(cleanupGuardIdx).toBeGreaterThan(inspectFormGuardIdx);
    const between = SCRIPT.slice(inspectFormGuardIdx, cleanupGuardIdx);
    expect(between).toMatch(/return;/);
  });
});

describe('Phase 122B — targeted subgrid cleanup by control id', () => {
  it('parses --cleanup-subgrid <GUID> --control-id <id>', () => {
    expect(SCRIPT).toMatch(/'--cleanup-subgrid'/);
    expect(SCRIPT).toMatch(/'--control-id'/);
    expect(SCRIPT).toMatch(/flags\.cleanupSubgridFormId\s*=/);
    expect(SCRIPT).toMatch(/flags\.cleanupSubgridControlId\s*=/);
  });

  it('--control-id refuses non-identifier-shape values', () => {
    expect(SCRIPT).toMatch(/--control-id expects an identifier-shape value/);
    expect(SCRIPT).toMatch(/\[A-Za-z\]\[A-Za-z0-9_\]/);
  });

  it('--commit-subgrid-cleanup gates the write path', () => {
    expect(SCRIPT).toMatch(/'--commit-subgrid-cleanup'/);
    expect(SCRIPT).toMatch(/flags\.commitSubgridCleanup\s*=\s*true/);
    expect(SCRIPT).toMatch(
      /--commit-subgrid-cleanup has no effect without --cleanup-subgrid/,
    );
  });

  it('--cleanup-subgrid + --control-id must both appear (no orphans)', () => {
    expect(SCRIPT).toMatch(/--cleanup-subgrid requires --control-id/);
    expect(SCRIPT).toMatch(/--control-id is only valid alongside --cleanup-subgrid/);
  });

  it('5-way mutex includes --cleanup-subgrid', () => {
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, and --cleanup-view are mutually exclusive/,
    );
  });

  it('declares findCellContainingControl() — locates the enclosing <cell>', () => {
    expect(SCRIPT).toMatch(/function\s+findCellContainingControl/);
    // Match the enclosing <cell> element. Pin the regex literal bytes
    // that the implementation uses, without over-specifying the
    // surrounding control-id pattern (which embeds the operator-
    // supplied id via escapeRegExp).
    expect(SCRIPT).toMatch(/<cell\\b/);
    expect(SCRIPT).toMatch(/escapeRegExp\(controlId\)/);
  });

  it('declares validateSubgridCellForCleanup() with all four gates', () => {
    expect(SCRIPT).toMatch(/function\s+validateSubgridCellForCleanup/);
    // Gate 1: classid must match SUBGRID_CONTROL_CLASSID.
    expect(SCRIPT).toMatch(/SUBGRID_CONTROL_CLASSID/);
    expect(SCRIPT).toMatch(/is not a subgrid \(classid mismatch\)/);
    // Gate 2: TargetEntityType must be allowed by isAllowedSubgridTarget
    // (which covers CANDIDATE_CHILD_TABLES ∪ LEGACY_CR664_DEAL_CHILD_TABLES).
    expect(SCRIPT).toMatch(/isAllowedSubgridTarget\(targetEntity\)/);
    // Gate 3: RelationshipName must reference cr664_deal.
    expect(SCRIPT).toMatch(/does not reference \$\{PSEUDO_DEAL_COLUMN\}/);
  });

  it('refuses zero-match OR multi-match for the supplied control id', () => {
    // Zero matches → bail (script must not invent a target).
    expect(SCRIPT).toMatch(/No <cell> contains a control with id="\$\{controlId\}"/);
    // Multi-match → bail (single-control surgical removal).
    expect(SCRIPT).toMatch(
      /<cell> elements contain a control with id="\$\{controlId\}"/,
    );
  });

  it('declares runSubgridCleanup() as the orchestrator', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+runSubgridCleanup/);
  });

  it('dry-run is the default — write path guarded by doCommit', () => {
    // Pin ordering: the dry-run early return must appear BEFORE any
    // PATCH or PublishXml call inside runSubgridCleanup.
    const fnStart = SCRIPT.indexOf('async function runSubgridCleanup');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart);
    const dryReturnIdx = body.indexOf('Re-run with `--commit-subgrid-cleanup`');
    const patchCallIdx = body.indexOf('patchSystemFormXml(');
    expect(dryReturnIdx).toBeGreaterThan(-1);
    expect(patchCallIdx).toBeGreaterThan(-1);
    expect(dryReturnIdx).toBeLessThan(patchCallIdx);
  });

  it('removes ONLY the matched <cell> — no broader splicing', () => {
    // The splice is bounded to `slice(0, match.start) +
    // slice(match.end)`. Anything else (slicing across multiple
    // matches, removing an entire tab/section, etc.) is forbidden.
    expect(SCRIPT).toMatch(
      /form\.formxml\.slice\(0,\s*match\.start\)\s*\+\s*form\.formxml\.slice\(match\.end\)/,
    );
    expect(SCRIPT).toMatch(/Splicing one <cell> out of formxml/);
  });

  it('PATCH + PublishXml fire only after every validation gate passes', () => {
    const fnStart = SCRIPT.indexOf('async function runSubgridCleanup');
    const body = SCRIPT.slice(fnStart);
    const validationIdx = body.indexOf('validateSubgridCellForCleanup(');
    const patchIdx = body.indexOf('patchSystemFormXml(');
    expect(validationIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(-1);
    expect(validationIdx).toBeLessThan(patchIdx);
  });

  it('re-fetches the form and checks for residual refs after commit', () => {
    // Per task req 7: "fail if any cr664_documentchecklist
    // subgrid/reference remains".
    expect(SCRIPT).toMatch(/Re-inspecting form for residual/);
    expect(SCRIPT).toMatch(/findFormReferences\(/);
    // Non-zero exit on residual refs is now routed through bail() so
    // the libuv handle-closing assertion can't fire mid-fetch.
    expect(SCRIPT).toMatch(/bail\([\s\S]*?residual[\s\S]*?,\s*8/);
  });

  it('subgrid-cleanup branch in main() returns before the commit branch is reachable', () => {
    const subgridGuardIdx = SCRIPT.indexOf('if (FLAGS.cleanupSubgridFormId !== null)');
    expect(subgridGuardIdx).toBeGreaterThan(-1);
    const commitGuardIdx = SCRIPT.indexOf(
      '// === Safety gates for commit mode ===',
      subgridGuardIdx,
    );
    expect(commitGuardIdx).toBeGreaterThan(subgridGuardIdx);
    const between = SCRIPT.slice(subgridGuardIdx, commitGuardIdx);
    expect(between).toMatch(/return;/);
  });

  it('no force-delete / bypass path was introduced by the subgrid-cleanup mode', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });
});

describe('Phase 122B — subgrid relationship-name validation is case-insensitive and underscore-tolerant', () => {
  // Behavioral mirror of the script's normalize-then-substring check.
  // Kept in sync with the script via the static-source pins below.
  function relationshipReferencesPseudoColumn(relationshipName: string, pseudoColumn: string): boolean {
    return relationshipName.toLowerCase().includes(pseudoColumn.toLowerCase());
  }

  it('passes for cr664_DocumentChecklist_cr664_Deal_cr664_Deal (mixed-case D, underscore-sandwiched)', () => {
    expect(
      relationshipReferencesPseudoColumn(
        'cr664_DocumentChecklist_cr664_Deal_cr664_Deal',
        'cr664_deal',
      ),
    ).toBe(true);
  });

  it('passes for lowercase cr664_deal in a relationship name', () => {
    expect(
      relationshipReferencesPseudoColumn(
        'cr664_dealtimelineevent_cr664_deal',
        'cr664_deal',
      ),
    ).toBe(true);
  });

  it('fails for a relationship name with no deal reference at all', () => {
    expect(
      relationshipReferencesPseudoColumn(
        'cr664_DocumentChecklist_cr664_Owner_cr664_Owner',
        'cr664_deal',
      ),
    ).toBe(false);
  });

  it('fails for empty / missing relationship names', () => {
    expect(relationshipReferencesPseudoColumn('', 'cr664_deal')).toBe(false);
  });

  it('script implements the same normalize-then-substring logic for the subgrid relationship gate', () => {
    // Pin the exact substring the script uses inside
    // validateSubgridCellForCleanup. If a maintainer reverts to the
    // brittle `\\b…\\b` regex, this pin fails immediately.
    expect(SCRIPT).toMatch(
      /relationshipName\.toLowerCase\(\)\.includes\(PSEUDO_DEAL_COLUMN\)/,
    );
    // Negative pin: the old word-boundary regex must not reappear
    // anywhere near the relationship validation.
    const fnStart = SCRIPT.indexOf('function validateSubgridCellForCleanup');
    expect(fnStart).toBeGreaterThan(-1);
    const nextDecl = SCRIPT.indexOf('async function runSubgridCleanup', fnStart);
    expect(nextDecl).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, nextDecl);
    expect(body).not.toMatch(/\\\\b\$\{escapeRegExp\(PSEUDO_DEAL_COLUMN\)\}\\\\b/);
  });

  it('findFormReferences also normalizes the relationship-name check', () => {
    // Same fix in the broader inspection function — operator-facing
    // inspect-form output must surface mixed-case deal tokens.
    const fnStart = SCRIPT.indexOf('function findFormReferences');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart, fnStart + 6000);
    // The fixed implementation lowercases both sides and uses
    // `String#includes` rather than `\\b…\\b` regex.
    expect(body).toMatch(/nameLower\.includes\(tableLower\)/);
    expect(body).toMatch(/nameLower\.includes\(attrLower\)/);
  });
});

describe('Phase 122B — bail uses BailError + process.exitCode (no abrupt process.exit on Windows libuv)', () => {
  it('declares BailError class', () => {
    expect(SCRIPT).toMatch(/class\s+BailError\s+extends\s+Error/);
    expect(SCRIPT).toMatch(/this\.isBail\s*=\s*true/);
    expect(SCRIPT).toMatch(/this\.exitCode\s*=\s*exitCode/);
  });

  it('bail() throws a BailError instead of calling process.exit directly', () => {
    // Locate the bail function body and assert it throws rather than
    // immediately terminating the process — process.exit() while a
    // fetch keep-alive socket is still closing triggers a libuv
    // assertion on Windows.
    const bailFnIdx = SCRIPT.indexOf('function bail(');
    expect(bailFnIdx).toBeGreaterThan(-1);
    const slice = SCRIPT.slice(bailFnIdx, bailFnIdx + 400);
    expect(slice).toMatch(/throw new BailError/);
    expect(slice).not.toMatch(/process\.exit\(/);
  });

  it('main().catch handles BailError and sets process.exitCode (no abrupt exit)', () => {
    const catchIdx = SCRIPT.indexOf('main().catch(');
    expect(catchIdx).toBeGreaterThan(-1);
    const slice = SCRIPT.slice(catchIdx);
    expect(slice).toMatch(/err\.isBail/);
    expect(slice).toMatch(/process\.exitCode\s*=/);
    // Note: process.exit(99) was replaced by process.exitCode = 99
    // for the unexpected-error fallback path — same reason as above.
    expect(slice).toMatch(/process\.exitCode\s*=\s*99/);
  });

  it('residual-refs failure in runSubgridCleanup also routes through bail()', () => {
    // The "residual subgrid still present" path used to call
    // process.exit(8) directly; now it goes via bail(..., 8) so the
    // event loop drains cleanly.
    const fnIdx = SCRIPT.indexOf('async function runSubgridCleanup');
    expect(fnIdx).toBeGreaterThan(-1);
    const slice = SCRIPT.slice(fnIdx);
    expect(slice).toMatch(/bail\([\s\S]*?residual[\s\S]*?,\s*8/);
    // The old `process.exit(8)` inside the same function body must
    // not reappear.
    const nextDecl = slice.indexOf('\nasync function ', 1);
    const fnBody = nextDecl === -1 ? slice : slice.slice(0, nextDecl);
    expect(fnBody).not.toMatch(/process\.exit\(8\)/);
  });
});

describe('Phase 122B — subgrid target allow-list covers canonical + legacy child tables', () => {
  // Behavioral mirror of the script's isAllowedSubgridTarget.
  const CANONICAL = [
    'cr664_documentchecklist',
    'cr664_dealtask1',
    'cr664_creditmemo1',
    'cr664_creditmemodraftsection',
    'cr664_dealtimelineevent',
  ];
  const LEGACY = [
    'cr664_vendorperformance',
    'cr664_approvaltracking',
    'cr664_dealstagehistory',
  ];
  function isAllowedSubgridTarget(t: string): boolean {
    const lower = String(t ?? '').toLowerCase();
    return CANONICAL.includes(lower) || LEGACY.includes(lower);
  }

  it('accepts every canonical child table (case-insensitive)', () => {
    for (const t of CANONICAL) {
      expect(isAllowedSubgridTarget(t)).toBe(true);
      expect(isAllowedSubgridTarget(t.toUpperCase())).toBe(true);
    }
  });

  it('accepts every legacy operator-surfaced child table', () => {
    for (const t of LEGACY) {
      expect(isAllowedSubgridTarget(t)).toBe(true);
      // Mixed-case variant the operator actually hit:
      const mixed = t
        .split('_')
        .map((seg, i) => (i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)))
        .join('_');
      expect(isAllowedSubgridTarget(mixed)).toBe(true);
    }
  });

  it('rejects unrelated tables including the parent cr664_loandeal', () => {
    expect(isAllowedSubgridTarget('account')).toBe(false);
    expect(isAllowedSubgridTarget('cr664_loandeal')).toBe(false);
    expect(isAllowedSubgridTarget('')).toBe(false);
  });

  it('script declares LEGACY_CR664_DEAL_CHILD_TABLES with the three operator-surfaced names', () => {
    expect(SCRIPT).toMatch(/LEGACY_CR664_DEAL_CHILD_TABLES\s*=\s*Object\.freeze\(\[/);
    expect(SCRIPT).toMatch(/'cr664_vendorperformance'/);
    expect(SCRIPT).toMatch(/'cr664_approvaltracking'/);
    expect(SCRIPT).toMatch(/'cr664_dealstagehistory'/);
  });

  it('script declares ALLOWED_SUBGRID_TARGET_TABLES as the union of canonical + legacy', () => {
    expect(SCRIPT).toMatch(
      /ALLOWED_SUBGRID_TARGET_TABLES\s*=\s*Object\.freeze\(\[[\s\S]*?\.\.\.CANDIDATE_CHILD_TABLES[\s\S]*?\.\.\.LEGACY_CR664_DEAL_CHILD_TABLES/,
    );
  });

  it('isAllowedSubgridTarget() is the function used by gate 3', () => {
    expect(SCRIPT).toMatch(/function\s+isAllowedSubgridTarget/);
    expect(SCRIPT).toMatch(/isAllowedSubgridTarget\(targetEntity\)/);
  });
});

describe('Phase 122B — inspect-form prints enclosing control id for residual relationships', () => {
  it('declares findEnclosingControlForRelationship()', () => {
    expect(SCRIPT).toMatch(/function\s+findEnclosingControlForRelationship/);
  });

  it('findFormReferences relationship entries carry enclosing cell + control fields', () => {
    const fnStart = SCRIPT.indexOf('function findFormReferences');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart, fnStart + 8000);
    expect(body).toMatch(/enclosingCellId:/);
    expect(body).toMatch(/enclosingControlId:/);
    expect(body).toMatch(/enclosingControlClassid:/);
    expect(body).toMatch(/enclosingControlTargetEntity:/);
  });

  it('inspect-form output prints the enclosing context + safe-to-remove cleanup command', () => {
    expect(SCRIPT).toMatch(/function\s+printRelationshipFindings/);
    expect(SCRIPT).toMatch(/enclosing cell id:/);
    expect(SCRIPT).toMatch(/enclosing control id:/);
    expect(SCRIPT).toMatch(/TargetEntityType:/);
    expect(SCRIPT).toMatch(/Safely removable by control id/);
    // The printed cleanup command must reference the form id and the
    // surfaced control id verbatim.
    expect(SCRIPT).toMatch(/--cleanup-subgrid \$\{formId\}/);
    expect(SCRIPT).toMatch(/--control-id \$\{e\.enclosingControlId\}/);
  });

  it('does NOT print a cleanup command when the enclosing control is not a safely-removable subgrid', () => {
    // The print function gates the cleanup-command branch behind
    // isAllowedSubgridTarget + subgrid classid + enclosingControlId
    // truthy. Pin the gate condition.
    expect(SCRIPT).toMatch(/isSafelyRemovable\s*=[\s\S]*?isAllowedSubgridTarget/);
  });
});

describe('Phase 122B — rollback export is idempotent across repeated --commit runs', () => {
  it('declares shouldSkipRollbackExportStep()', () => {
    expect(SCRIPT).toMatch(/function\s+shouldSkipRollbackExportStep/);
  });

  it('the helper reuses an existing non-empty rollback zip', () => {
    const fnIdx = SCRIPT.indexOf('function shouldSkipRollbackExportStep');
    expect(fnIdx).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnIdx, fnIdx + 2000);
    expect(body).toMatch(/existsSync\(/);
    expect(body).toMatch(/statSync\(/);
    expect(body).toMatch(/stats\.size === 0/);
    expect(body).toMatch(/Reusing existing rollback artifact/);
  });

  it('the helper bails on a 0-byte rollback zip — never silently overwrites', () => {
    const fnIdx = SCRIPT.indexOf('function shouldSkipRollbackExportStep');
    const body = SCRIPT.slice(fnIdx, fnIdx + 2000);
    expect(body).toMatch(/bail\(/);
    expect(body).toMatch(/refusing to overwrite/);
  });

  it('Phase 1 rollback loop guards each step via the skip helper', () => {
    // Pin: the rollback-step for-loop checks shouldSkipRollbackExportStep
    // BEFORE calling executeStep, so an existing zip short-circuits the
    // pac export.
    const phase1Idx = SCRIPT.indexOf('Phase 1: rollback export steps');
    expect(phase1Idx).toBeGreaterThan(-1);
    const slice = SCRIPT.slice(phase1Idx, phase1Idx + 1500);
    expect(slice).toMatch(/shouldSkipRollbackExportStep\(step\)/);
    expect(slice).toMatch(/continue/);
    // The skip check must precede the executeStep call inside the loop.
    const skipIdx = slice.indexOf('shouldSkipRollbackExportStep(step)');
    const execIdx = slice.indexOf('await executeStep(step');
    expect(skipIdx).toBeGreaterThan(-1);
    expect(execIdx).toBeGreaterThan(-1);
    expect(skipIdx).toBeLessThan(execIdx);
  });

  it('post-export verification (ensureRollbackArtifactsExist) still runs after the skip-aware loop', () => {
    // The post-condition gate ("both zips on disk before destructive
    // steps") must still fire — skip-on-existing only avoids the pac
    // command, not the verification.
    const phase1Idx = SCRIPT.indexOf('Phase 1: rollback export steps');
    const verifyIdx = SCRIPT.indexOf('Rollback artifacts verified on disk', phase1Idx);
    expect(verifyIdx).toBeGreaterThan(phase1Idx);
  });
});

describe('Phase 122B — residual relationship cleanup keeps the no-force-delete contract', () => {
  it('no bypass headers anywhere in the source after this change', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });

  it('no broad removal: the splice in runSubgridCleanup remains bounded to match.start/match.end', () => {
    expect(SCRIPT).toMatch(
      /form\.formxml\.slice\(0,\s*match\.start\)\s*\+\s*form\.formxml\.slice\(match\.end\)/,
    );
  });
});

describe('Phase 122B — SavedQuery (view) inspection + targeted cleanup', () => {
  it('parses --inspect-view <GUID> --attribute and --cleanup-view <GUID> --attribute', () => {
    expect(SCRIPT).toMatch(/'--inspect-view'/);
    expect(SCRIPT).toMatch(/'--cleanup-view'/);
    expect(SCRIPT).toMatch(/flags\.inspectViewId\s*=/);
    expect(SCRIPT).toMatch(/flags\.cleanupViewId\s*=/);
  });

  it('--commit-view-cleanup gates the write path', () => {
    expect(SCRIPT).toMatch(/'--commit-view-cleanup'/);
    expect(SCRIPT).toMatch(/flags\.commitViewCleanup\s*=\s*true/);
    expect(SCRIPT).toMatch(
      /--commit-view-cleanup has no effect without --cleanup-view/,
    );
  });

  it('--inspect-view and --cleanup-view both require --attribute', () => {
    expect(SCRIPT).toMatch(/--inspect-view requires --attribute <table>\.<column>/);
    expect(SCRIPT).toMatch(/--cleanup-view requires --attribute <table>\.<column>/);
  });

  it('--attribute is now also valid alongside --inspect-view / --cleanup-view', () => {
    // Updated error message: --attribute can pair with any of the
    // three attribute-scoped modes (inspect-form, inspect-view,
    // cleanup-view), and the validator must mention all three.
    expect(SCRIPT).toMatch(/--attribute is only valid alongside/);
    expect(SCRIPT).toMatch(/--inspect-form/);
    expect(SCRIPT).toMatch(/--inspect-view/);
    expect(SCRIPT).toMatch(/--cleanup-view/);
  });

  it('7-way mutex includes --inspect-view and --cleanup-view', () => {
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, and --cleanup-view are mutually exclusive/,
    );
  });

  it('declares readSavedQuery() — GET /api/data/v9.2/savedqueries(<id>) read-only', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+readSavedQuery/);
    expect(SCRIPT).toMatch(/\/api\/data\/v9\.2\/savedqueries\(/);
    expect(SCRIPT).toMatch(
      /\$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml/,
    );
    const fnStart = SCRIPT.indexOf('async function readSavedQuery');
    expect(fnStart).toBeGreaterThan(-1);
    const nextDecl = SCRIPT.indexOf('function parseViewReferences', fnStart);
    const body = SCRIPT.slice(fnStart, nextDecl);
    expect(body).toMatch(/method:\s*'GET'/);
    expect(body).not.toMatch(/method:\s*'PATCH'/);
    expect(body).not.toMatch(/method:\s*'POST'/);
    expect(body).not.toMatch(/method:\s*'DELETE'/);
  });

  it('declares parseViewReferences() with all six categories', () => {
    expect(SCRIPT).toMatch(/function\s+parseViewReferences/);
    // Six finding categories the operator depends on.
    for (const key of [
      'layoutCells',
      'fetchTopLevelAttributes',
      'fetchLinkAttributes',
      'filterConditions',
      'orderClauses',
      'linkEntityFromTo',
    ]) {
      expect(SCRIPT).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it('distinguishes top-level <attribute> from link-entity-nested <attribute>', () => {
    // The parser pre-computes link-entity character ranges and tags
    // each <attribute> hit accordingly.
    const fnStart = SCRIPT.indexOf('function parseViewReferences');
    const body = SCRIPT.slice(fnStart, fnStart + 6000);
    expect(body).toMatch(/<link-entity\\b/);
    expect(body).toMatch(/linkEntityRanges/);
    expect(body).toMatch(/fetchLinkAttributes\.push/);
    expect(body).toMatch(/fetchTopLevelAttributes\.push/);
  });

  it('detects filter, order, and link-entity from|to references', () => {
    // The regexes are built via `new RegExp(\`<condition\\b…\`)` so the
    // literal source bytes are `<condition\\b` (template literal: two
    // backslashes + b). Match those literal bytes here.
    expect(SCRIPT).toMatch(/<condition\\\\b/);
    expect(SCRIPT).toMatch(/<order\\\\b/);
    expect(SCRIPT).toMatch(/from\|to/);
  });

  it('declares classifyViewCleanupSafety() with no-references / safe / unsafe states', () => {
    expect(SCRIPT).toMatch(/function\s+classifyViewCleanupSafety/);
    const fnStart = SCRIPT.indexOf('function classifyViewCleanupSafety');
    const body = SCRIPT.slice(fnStart, fnStart + 2000);
    expect(body).toMatch(/'no-references'/);
    expect(body).toMatch(/'safe'/);
    expect(body).toMatch(/'unsafe'/);
    // unsafe is triggered by any of filterConditions / orderClauses /
    // fetchLinkAttributes / linkEntityFromTo.
    expect(body).toMatch(/findings\.filterConditions\.length\s*>\s*0/);
    expect(body).toMatch(/findings\.orderClauses\.length\s*>\s*0/);
    expect(body).toMatch(/findings\.fetchLinkAttributes\.length\s*>\s*0/);
    expect(body).toMatch(/findings\.linkEntityFromTo\.length\s*>\s*0/);
  });

  it('removeSafeViewReferences only touches layoutCells + fetchTopLevelAttributes', () => {
    expect(SCRIPT).toMatch(/function\s+removeSafeViewReferences/);
    const fnStart = SCRIPT.indexOf('function removeSafeViewReferences');
    const nextDecl = SCRIPT.indexOf('async function patchSavedQuery', fnStart);
    const body = SCRIPT.slice(fnStart, nextDecl);
    // Splice bounds for both XMLs.
    expect(body).toMatch(/newLayoutXml\.slice\(0,\s*c\.startIndex\)\s*\+\s*newLayoutXml\.slice\(c\.endIndex\)/);
    expect(body).toMatch(/newFetchXml\.slice\(0,\s*a\.startIndex\)\s*\+\s*newFetchXml\.slice\(a\.endIndex\)/);
    // Must NOT touch any of the unsafe categories.
    expect(body).not.toMatch(/filterConditions/);
    expect(body).not.toMatch(/orderClauses/);
    expect(body).not.toMatch(/fetchLinkAttributes/);
    expect(body).not.toMatch(/linkEntityFromTo/);
  });

  it('PATCH savedqueries + PublishXml — declared and bounded to one SavedQuery', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+patchSavedQuery/);
    expect(SCRIPT).toMatch(/method:\s*'PATCH'/);
    expect(SCRIPT).toMatch(/async\s+function\s+publishSavedQuery/);
    // The PublishXml parameter envelope scopes to
    // <savedqueries><savedquery>{${viewId}}</savedquery></savedqueries>
    // — note the literal `{` before the template `${viewId}`.
    expect(SCRIPT).toMatch(/<savedqueries><savedquery>\{\$\{/);
  });

  it('cleanup-view refuses to write when classification is unsafe', () => {
    const fnStart = SCRIPT.indexOf('async function runViewCleanup');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart);
    // Refusal branch must include classification === 'unsafe' check
    // AND no PATCH/Publish call below it without classification
    // becoming 'safe'.
    expect(body).toMatch(/classification === 'unsafe'/);
    expect(body).toMatch(/Refusing to auto-clean/);
    expect(body).toMatch(/refusedAsUnsafe:\s*true/);
    // Pin ordering: the unsafe-refusal early return appears BEFORE
    // any PATCH call inside runViewCleanup.
    const unsafeIdx = body.indexOf("classification === 'unsafe'");
    const patchIdx = body.indexOf('patchSavedQuery(');
    expect(unsafeIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(-1);
    expect(unsafeIdx).toBeLessThan(patchIdx);
  });

  it('dry-run is the default — write path guarded by doCommit', () => {
    const fnStart = SCRIPT.indexOf('async function runViewCleanup');
    const body = SCRIPT.slice(fnStart);
    expect(body).toMatch(/if\s*\(\s*!doCommit\s*\)/);
    expect(body).toMatch(/Re-run with `--commit-view-cleanup`/);
    const dryIdx = body.indexOf('Re-run with `--commit-view-cleanup`');
    const patchIdx = body.indexOf('patchSavedQuery(');
    expect(dryIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(-1);
    expect(dryIdx).toBeLessThan(patchIdx);
  });

  it('re-runs RetrieveDependenciesForDelete after view PATCH+publish', () => {
    const fnStart = SCRIPT.indexOf('async function runViewCleanup');
    const body = SCRIPT.slice(fnStart);
    expect(body).toMatch(/Re-running RetrieveDependenciesForDelete/);
    // The re-probe must come AFTER patchSavedQuery + publishSavedQuery.
    const patchIdx = body.indexOf('patchSavedQuery(');
    const probeIdx = body.indexOf('retrieveDependenciesForDelete(');
    expect(patchIdx).toBeGreaterThan(-1);
    expect(probeIdx).toBeGreaterThan(patchIdx);
  });

  it('view modes wired into main() and return before subgrid-cleanup branch', () => {
    const inspectViewGuardIdx = SCRIPT.indexOf('if (FLAGS.inspectViewId !== null)');
    const cleanupViewGuardIdx = SCRIPT.indexOf(
      'if (FLAGS.cleanupViewId !== null)',
      inspectViewGuardIdx,
    );
    const subgridGuardIdx = SCRIPT.indexOf(
      'if (FLAGS.cleanupSubgridFormId !== null)',
      cleanupViewGuardIdx,
    );
    expect(inspectViewGuardIdx).toBeGreaterThan(-1);
    expect(cleanupViewGuardIdx).toBeGreaterThan(inspectViewGuardIdx);
    expect(subgridGuardIdx).toBeGreaterThan(cleanupViewGuardIdx);
    // Both view branches return before the subgrid branch is reached.
    const inspectViewBlock = SCRIPT.slice(inspectViewGuardIdx, cleanupViewGuardIdx);
    const cleanupViewBlock = SCRIPT.slice(cleanupViewGuardIdx, subgridGuardIdx);
    expect(inspectViewBlock).toMatch(/return;/);
    expect(cleanupViewBlock).toMatch(/return;/);
  });

  it('no force-delete / bypass path introduced by the view-cleanup mode', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });
});

describe('Phase 122B — view cleanup safety classifier behavior', () => {
  // Behavioral mirror of classifyViewCleanupSafety, kept in sync with
  // the script via the static-source pins above.
  function classify(findings: {
    layoutCells: unknown[];
    fetchTopLevelAttributes: unknown[];
    fetchLinkAttributes: unknown[];
    filterConditions: unknown[];
    orderClauses: unknown[];
    linkEntityFromTo: unknown[];
  }): 'no-references' | 'safe' | 'unsafe' {
    const unsafe =
      findings.fetchLinkAttributes.length > 0 ||
      findings.filterConditions.length > 0 ||
      findings.orderClauses.length > 0 ||
      findings.linkEntityFromTo.length > 0;
    const safeRefs =
      findings.layoutCells.length + findings.fetchTopLevelAttributes.length;
    if (unsafe) return 'unsafe';
    if (safeRefs === 0) return 'no-references';
    return 'safe';
  }
  const empty = {
    layoutCells: [],
    fetchTopLevelAttributes: [],
    fetchLinkAttributes: [],
    filterConditions: [],
    orderClauses: [],
    linkEntityFromTo: [],
  };

  it('classifies an empty findings set as no-references', () => {
    expect(classify(empty)).toBe('no-references');
  });

  it('classifies layout-cell-only as safe', () => {
    expect(classify({ ...empty, layoutCells: [{}] })).toBe('safe');
  });

  it('classifies top-level fetch attribute only as safe', () => {
    expect(classify({ ...empty, fetchTopLevelAttributes: [{}] })).toBe('safe');
  });

  it('classifies layout + top-level fetch attribute combined as safe', () => {
    expect(
      classify({ ...empty, layoutCells: [{}], fetchTopLevelAttributes: [{}] }),
    ).toBe('safe');
  });

  it('classifies a filter condition as unsafe', () => {
    expect(classify({ ...empty, filterConditions: [{}] })).toBe('unsafe');
  });

  it('classifies a sort/order clause as unsafe', () => {
    expect(classify({ ...empty, orderClauses: [{}] })).toBe('unsafe');
  });

  it('classifies a link-entity-nested attribute as unsafe', () => {
    expect(classify({ ...empty, fetchLinkAttributes: [{}] })).toBe('unsafe');
  });

  it('classifies a link-entity from|to binding as unsafe', () => {
    expect(classify({ ...empty, linkEntityFromTo: [{}] })).toBe('unsafe');
  });

  it('classifies layout-cell + filter (mixed safe and unsafe) as unsafe', () => {
    // Any unsafe element wins — never auto-clean partially.
    expect(
      classify({ ...empty, layoutCells: [{}], filterConditions: [{}] }),
    ).toBe('unsafe');
  });
});

describe('Phase 122B — cleanup refuses to write when only indirect refs exist', () => {
  it('runFormCleanup short-circuits with a Maker Portal hint when no direct cells but indirect refs found', () => {
    const fnStart = SCRIPT.indexOf('async function runFormCleanup');
    expect(fnStart).toBeGreaterThan(-1);
    expect(SCRIPT).toMatch(/scanIndirectReferencesForCandidateTables/);
    expect(SCRIPT).toMatch(/blockedByIndirect:\s*true/);
    expect(SCRIPT).toMatch(/Required operator action — Maker Portal/);
  });

  it('cleanup refusal path runs BEFORE any patch / publish call inside runFormCleanup', () => {
    const fnStart = SCRIPT.indexOf('async function runFormCleanup');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart);
    const indirectScanIdx = body.indexOf('scanIndirectReferencesForCandidateTables(');
    const patchCallIdx = body.indexOf('patchSystemFormXml(');
    expect(indirectScanIdx).toBeGreaterThan(-1);
    expect(patchCallIdx).toBeGreaterThan(-1);
    expect(indirectScanIdx).toBeLessThan(patchCallIdx);
  });

  it('cleanup remains fail-closed: no bypass headers introduced by the indirect-refs branch', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
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
    // The dry-run summary block (only reached when no mode flag is
    // set) must not acquire a token. Every `await acquireBearerToken(`
    // call site must live inside one of the mode-gated branches
    // (cleanup-form, inspect-dependencies, commit) — all of which run
    // BEFORE the dry-run summary block.
    const dryRunStart = SCRIPT.indexOf('// === Dry-run summary ===');
    expect(dryRunStart).toBeGreaterThan(-1);
    const mainCatchIdx = SCRIPT.indexOf('main().catch(', dryRunStart);
    expect(mainCatchIdx).toBeGreaterThan(dryRunStart);
    const dryRunBlock = SCRIPT.slice(dryRunStart, mainCatchIdx);
    expect(dryRunBlock).not.toMatch(/await\s+acquireBearerToken\(/);

    // And: at least one call site exists earlier in main() (the mode-
    // gated branches).
    const callRegex = /\bawait\s+acquireBearerToken\(/g;
    let calls = 0;
    while (callRegex.exec(SCRIPT) !== null) calls += 1;
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
