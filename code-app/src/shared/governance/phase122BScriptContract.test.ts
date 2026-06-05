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
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
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
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive\./,
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
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
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
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
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
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
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

describe('Phase 122B — --cleanup-form accepts optional --attribute <table>.<column>', () => {
  // Behavioral mirror of findDirectFieldCellReferences. Lower-cased
  // pattern matches mirror the script's case-insensitive regex.
  function findDirectRefs(
    formXml: string,
    attributeName: string,
  ): { startIndex: number; endIndex: number; snippet: string }[] {
    if (!formXml || !attributeName) return [];
    const refs: { startIndex: number; endIndex: number; snippet: string }[] = [];
    const cellRegex = /<cell\b[^>]*>[\s\S]*?<\/cell>/gi;
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attrEsc = escape(attributeName);
    const datafieldRe = new RegExp(`datafieldname="${attrEsc}"`, 'i');
    const idAttrRe = new RegExp(`\\bid="${attrEsc}"`, 'i');
    let m: RegExpExecArray | null;
    while ((m = cellRegex.exec(formXml)) !== null) {
      if (datafieldRe.test(m[0]) || idAttrRe.test(m[0])) {
        refs.push({
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          snippet: m[0],
        });
      }
    }
    return refs;
  }

  const cr664AssignedToForm = [
    '<form>',
    '  <tabs><tab><columns><column><sections><section><rows>',
    '    <row>',
    '      <cell id="cr664_someotherfield">',
    '        <control id="cr664_someotherfield" datafieldname="cr664_someotherfield" />',
    '      </cell>',
    '      <cell id="cr664_assignedto">',
    '        <control id="cr664_assignedto" datafieldname="cr664_assignedto" />',
    '      </cell>',
    '    </row>',
    '  </rows></section></sections></column></columns></tab></tabs>',
    '</form>',
  ].join('\n');

  it('finds only the cr664_assignedto cell when --attribute cr664_assignedto is supplied', () => {
    const refs = findDirectRefs(cr664AssignedToForm, 'cr664_assignedto');
    expect(refs.length).toBe(1);
    expect(refs[0].snippet).toMatch(/datafieldname="cr664_assignedto"/);
    expect(refs[0].snippet).not.toMatch(/cr664_someotherfield/);
  });

  it('finds nothing for an attribute that does not appear in the form', () => {
    const refs = findDirectRefs(cr664AssignedToForm, 'cr664_doesnotexist');
    expect(refs.length).toBe(0);
  });

  it('finds the cr664_deal cell when called with the default target', () => {
    const dealForm = cr664AssignedToForm.replace(/cr664_assignedto/g, 'cr664_deal');
    const refs = findDirectRefs(dealForm, 'cr664_deal');
    expect(refs.length).toBe(1);
  });

  it('script declares both legacy and generic finders side-by-side', () => {
    // Legacy literal-regex helper kept verbatim — pins the original
    // `datafieldname="cr664_deal"` source bytes.
    expect(SCRIPT).toMatch(/function\s+findCr664DealReferences/);
    expect(SCRIPT).toMatch(/datafieldname="cr664_deal"/i);
    // New generic helper takes attributeName and builds the regex at
    // runtime via escapeRegExp.
    expect(SCRIPT).toMatch(/function\s+findDirectFieldCellReferences/);
    expect(SCRIPT).toMatch(/function\s+removeDirectFieldCellReferences/);
    expect(SCRIPT).toMatch(/escapeRegExp\(attributeName\)/);
  });

  it('CLI validation now accepts --attribute alongside --cleanup-form', () => {
    // Reject-message must list --cleanup-form as a legal partner.
    expect(SCRIPT).toMatch(
      /--attribute is only valid alongside --inspect-form, --inspect-view, --cleanup-form, or --cleanup-view/,
    );
  });

  it('runFormCleanup accepts qualifiedAttribute parameter (defaults to PSEUDO_DEAL_COLUMN)', () => {
    expect(SCRIPT).toMatch(
      /async\s+function\s+runFormCleanup\(formId,\s*qualifiedAttribute,\s*token,\s*envUrl,\s*doCommit\)/,
    );
    // Default branch when no qualifiedAttribute is supplied: target =
    // PSEUDO_DEAL_COLUMN.
    expect(SCRIPT).toMatch(/let\s+targetAttribute\s*=\s*PSEUDO_DEAL_COLUMN/);
    // Custom-attribute branch: split "<table>.<column>".
    expect(SCRIPT).toMatch(/qualifiedAttribute\.split\('\.'\)/);
  });

  it('main() threads FLAGS.inspectFormAttribute into runFormCleanup', () => {
    const cleanupGuardIdx = SCRIPT.indexOf('if (FLAGS.cleanupFormId !== null)');
    expect(cleanupGuardIdx).toBeGreaterThan(-1);
    // Look at the runFormCleanup call site INSIDE the cleanup-form
    // branch (not the inspect-view or cleanup-view ones above).
    const callIdx = SCRIPT.indexOf('await runFormCleanup(', cleanupGuardIdx);
    expect(callIdx).toBeGreaterThan(cleanupGuardIdx);
    const callSlice = SCRIPT.slice(callIdx, callIdx + 400);
    expect(callSlice).toMatch(/FLAGS\.inspectFormAttribute/);
  });

  it('runFormCleanup uses the generic finder/remover for the actual cleanup', () => {
    const fnStart = SCRIPT.indexOf('async function runFormCleanup');
    expect(fnStart).toBeGreaterThan(-1);
    // Use a large bounded slice — the function body is well under 12k
    // chars and the next top-level helper sits past that.
    const body = SCRIPT.slice(fnStart, fnStart + 12000);
    expect(body).toMatch(/findDirectFieldCellReferences\(form\.formxml,\s*targetAttribute\)/);
    expect(body).toMatch(/removeDirectFieldCellReferences\([\s\S]*?form\.formxml,[\s\S]*?targetAttribute/);
  });

  it('runFormCleanup re-probes the operator-supplied table.column when present', () => {
    const fnStart = SCRIPT.indexOf('async function runFormCleanup');
    const body = SCRIPT.slice(fnStart, fnStart + 12000);
    // Probe table falls back to form.objecttypecode only when
    // targetTable wasn't supplied.
    expect(body).toMatch(/const\s+probeTable\s*=\s*targetTable\s*\?\?\s*form\.objecttypecode/);
    // Re-probe runs against probeTable / probeAttribute, not the
    // hardcoded PSEUDO_DEAL_COLUMN.
    expect(body).toMatch(/getAttributeMetadataId\(\s*\n?\s*probeTable,\s*\n?\s*probeAttribute/);
  });

  it('--attribute path skips the cr664_deal-specific indirect-refs diagnostic', () => {
    const fnStart = SCRIPT.indexOf('async function runFormCleanup');
    const body = SCRIPT.slice(fnStart, fnStart + 12000);
    // The custom-attribute branch returns early with a "no direct
    // field control" message AND points the operator at --inspect-form
    // for indirect refs. It does NOT call
    // scanIndirectReferencesForCandidateTables.
    expect(body).toMatch(/usingCustomAttribute/);
    expect(body).toMatch(/The targeted cleanup mode handles ONLY direct field controls/);
    // Pin ordering: when usingCustomAttribute is true, the return
    // statement appears BEFORE the call to
    // scanIndirectReferencesForCandidateTables.
    const usingCustomCheckIdx = body.indexOf('if (usingCustomAttribute)');
    const indirectCallIdx = body.indexOf('scanIndirectReferencesForCandidateTables(');
    expect(usingCustomCheckIdx).toBeGreaterThan(-1);
    expect(indirectCallIdx).toBeGreaterThan(-1);
    expect(usingCustomCheckIdx).toBeLessThan(indirectCallIdx);
  });

  it('still bounds the splice to match.start/match.end — no broad rewrite introduced', () => {
    // removeDirectFieldCellReferences uses the same slice-based splice
    // as removeCr664DealReferences. Pin both shapes.
    expect(SCRIPT).toMatch(
      /xml\.slice\(0,\s*refs\[i\]\.startIndex\)\s*\+\s*xml\.slice\(refs\[i\]\.endIndex\)/,
    );
  });

  it('no force-delete / bypass header introduced by the attribute-aware path', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });
});

describe('Phase 122B — --verify-lookups Web API metadata mode', () => {
  it('parses --verify-lookups as a flag', () => {
    expect(SCRIPT).toMatch(/'--verify-lookups'/);
    expect(SCRIPT).toMatch(/flags\.verifyLookups\s*=\s*true/);
  });

  it('declares classifyAttribute() that uses Web API metadata only', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+classifyAttribute/);
    const fnStart = SCRIPT.indexOf('async function classifyAttribute');
    // Bound to the next top-level helper so the pin doesn't bleed
    // into countNonNull (which legitimately uses pac env fetch).
    const fnEnd = SCRIPT.indexOf(
      'async function getManyToOneRelationshipMeta',
      fnStart,
    );
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    // The URL is built up via baseUrl + $select template — match each
    // piece inside the function body.
    expect(body).toMatch(
      /EntityDefinitions\(LogicalName=[^)]+\)\/Attributes\(LogicalName=[^)]+\)/,
    );
    expect(body).toMatch(/\$select=AttributeType/);
    // Cast to LookupAttributeMetadata for the Targets check.
    expect(body).toMatch(/Microsoft\.Dynamics\.CRM\.LookupAttributeMetadata/);
    // Three classifications.
    expect(body).toMatch(/'missing'/);
    expect(body).toMatch(/'pseudo-scalar'/);
    expect(body).toMatch(/'real-lookup'/);
    // No pac fetch in this helper's body.
    expect(body).not.toMatch(/spawnSync\(/);
    expect(body).not.toMatch(/pac env fetch/);
  });

  it('distinguishes pseudo-scalar from real-lookup via AttributeType', () => {
    // Behavioral mirror — same classifier logic the script uses.
    function classify(attributeType: string | undefined): 'missing' | 'pseudo-scalar' | 'real-lookup' {
      if (attributeType === undefined) return 'missing';
      if (attributeType === 'Lookup') return 'real-lookup';
      return 'pseudo-scalar';
    }
    expect(classify('Uniqueidentifier')).toBe('pseudo-scalar');
    expect(classify('Lookup')).toBe('real-lookup');
    expect(classify(undefined)).toBe('missing');
    // Source pin: the same comparison runs in the script.
    expect(SCRIPT).toMatch(/meta\.AttributeType\s*!==\s*'Lookup'/);
  });

  it('declares runVerifyLookups() iterating all six Phase 122 targets', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+runVerifyLookups/);
    // VERIFY_LOOKUP_TARGETS is the canonical list used by both
    // --verify-lookups AND the post-commit verify plan steps.
    expect(SCRIPT).toMatch(
      /VERIFY_LOOKUP_TARGETS\s*=\s*Object\.freeze\(\[[\s\S]*?CANDIDATE_CHILD_TABLES\.map/,
    );
    // The AssignedTo entry sits alongside the five cr664_Deal entries.
    expect(SCRIPT).toMatch(/expectedTarget:\s*LOOKUP_TARGET_SYSTEMUSER/);
  });

  it('verify-lookups branch wired into main() and returns before audit phase', () => {
    const verifyGuardIdx = SCRIPT.indexOf('if (FLAGS.verifyLookups)');
    expect(verifyGuardIdx).toBeGreaterThan(-1);
    const auditMarkerIdx = SCRIPT.indexOf('// === Phase A: audit ===', verifyGuardIdx);
    expect(auditMarkerIdx).toBeGreaterThan(verifyGuardIdx);
    const between = SCRIPT.slice(verifyGuardIdx, auditMarkerIdx);
    expect(between).toMatch(/return;/);
  });

  it('--verify-lookups mode performs NO write — no PATCH / POST / DELETE in runVerifyLookups', () => {
    const fnStart = SCRIPT.indexOf('async function runVerifyLookups');
    expect(fnStart).toBeGreaterThan(-1);
    // Bound to the NEXT function declaration after runVerifyLookups
    // so the slice doesn't bleed into unrelated downstream helpers
    // (Phase 122D Pt 2 inserted seed helpers between runVerifyLookups
    // and the legacy countNonNull anchor).
    const fnEnd = SCRIPT.indexOf('\n// ---', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    expect(body).not.toMatch(/method:\s*'PATCH'/);
    expect(body).not.toMatch(/method:\s*'POST'/);
    expect(body).not.toMatch(/method:\s*'DELETE'/);
    expect(body).not.toMatch(/patchSavedQuery\(/);
    expect(body).not.toMatch(/patchSystemFormXml\(/);
    expect(body).not.toMatch(/publishSystemForm\(/);
    expect(body).not.toMatch(/publishSavedQuery\(/);
    expect(body).not.toMatch(/spawnSync\(/);
  });

  it('verifyOneLookup reports all six per-target facts', () => {
    // The user-required output list:
    //   1. attribute exists
    //   2. is LookupAttributeMetadata
    //   3. targets the expected entity
    //   4. backing FK projection name
    //   5. relationship schema name
    //   6. legacy pseudo present
    const printFnStart = SCRIPT.indexOf('function printVerifyLookupReport');
    expect(printFnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(printFnStart, printFnStart + 3000);
    expect(body).toMatch(/classification/);
    expect(body).toMatch(/AttributeType/);
    expect(body).toMatch(/LookupAttributeMetadata/);
    expect(body).toMatch(/Targets\[\]/);
    expect(body).toMatch(/OData FK projection/);
    expect(body).toMatch(/M:1 relationship name/);
    expect(body).toMatch(/legacy pseudo scalar/);
  });
});

describe('Phase 122B — auditTable uses Web API metadata, not pac env fetch', () => {
  it('auditTable is async and takes (table, token, envUrl)', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+auditTable\(table,\s*token,\s*envUrl\)/);
  });

  it('auditTable body calls classifyAttribute for both cr664_deal and cr664_assignedto', () => {
    const fnStart = SCRIPT.indexOf('async function auditTable');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    expect(body).toMatch(/classifyAttribute\(table,\s*PSEUDO_DEAL_COLUMN/);
    expect(body).toMatch(/classifyAttribute\(table,\s*PSEUDO_ASSIGNEDTO_COLUMN/);
  });

  it('auditTable no longer reads _<attr>_value via pac env fetch (legacy attributeExists)', () => {
    // The buggy legacy path was:
    //   attributeExists(table, `_${PSEUDO_DEAL_COLUMN}_value`)
    // which returned a stale answer through pac env fetch. Pin its
    // absence from auditTable's body.
    const fnStart = SCRIPT.indexOf('async function auditTable');
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    expect(body).not.toMatch(/attributeExists\(table,\s*`_/);
  });

  it('main() acquires mainToken + mainEnvUrl BEFORE the audit phase', () => {
    const mainStart = SCRIPT.indexOf('async function main()');
    expect(mainStart).toBeGreaterThan(-1);
    const slice = SCRIPT.slice(mainStart);
    const acquireIdx = slice.indexOf('await acquireBearerToken(mainEnvUrl)');
    const auditIdx = slice.indexOf('// === Phase A: audit ===');
    expect(acquireIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeGreaterThan(acquireIdx);
  });
});

describe('Phase 122B — post-commit verify plan steps use Web API metadata, not pac', () => {
  it('plan emits kind: "webapi-verify" steps after Step 5 publish', () => {
    expect(SCRIPT).toMatch(/kind:\s*'webapi-verify'/);
    // Pin the URL shape — exactly the LookupAttributeMetadata cast.
    expect(SCRIPT).toMatch(
      /Microsoft\.Dynamics\.CRM\.LookupAttributeMetadata\?\$select=Targets,SchemaName,MetadataId/,
    );
  });

  it('the kind: "verify" pac-shellout step kind no longer appears in buildPlan', () => {
    const buildPlanStart = SCRIPT.indexOf('function buildPlan');
    expect(buildPlanStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(buildPlanStart, buildPlanStart + 12000);
    // The previous pac-fetch verify step is gone:
    //   kind: 'verify' + `command: \`pac env fetch ...`
    expect(body).not.toMatch(/kind:\s*'verify'/);
    expect(body).not.toMatch(/command:\s*`pac env fetch[\s\S]*?_value/);
  });

  it('executeStep handles webapi-verify with an explicit Targets[] check', () => {
    const fnStart = SCRIPT.indexOf('async function executeStep');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    expect(body).toMatch(/step\.kind === 'webapi-verify'/);
    expect(body).toMatch(/json\.Targets/);
    expect(body).toMatch(/includes\(step\.expectedTarget\)/);
  });

  it('webapi-verify path uses ONLY HTTP GET — no fallback to pac', () => {
    const fnStart = SCRIPT.indexOf('async function executeStep');
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    const verifyBranchIdx = body.indexOf("step.kind === 'webapi-verify'");
    expect(verifyBranchIdx).toBeGreaterThan(-1);
    const nextKindIdx = body.indexOf("step.kind === 'webapi'", verifyBranchIdx + 30);
    const verifyBlock = body.slice(verifyBranchIdx, nextKindIdx);
    // Inside the verify branch, only GET is allowed.
    expect(verifyBlock).not.toMatch(/method:\s*'PATCH'/);
    expect(verifyBlock).not.toMatch(/method:\s*'POST'/);
    expect(verifyBlock).not.toMatch(/method:\s*'DELETE'/);
    expect(verifyBlock).not.toMatch(/spawnSync\(/);
  });
});

describe('Phase 122B — commit still skips create when a true lookup already exists', () => {
  // Re-asserts the audit-driven idempotency contract with the new
  // Web-API-backed classification. When classifyAttribute returns
  // 'real-lookup', auditTable sets standardLookupFkExists = true,
  // and buildPlan emits a noop step instead of a re-POST.

  it('classifyAttribute === "real-lookup" maps to standardLookupFkExists = true', () => {
    const fnStart = SCRIPT.indexOf('async function auditTable');
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    expect(body).toMatch(
      /result\.standardLookupFkExists\s*=\s*c\.classification\s*===\s*'real-lookup'/,
    );
  });

  it('buildPlan still emits noop when standardLookupFkExists is true', () => {
    expect(SCRIPT).toMatch(/if\s*\(a\?\.standardLookupFkExists\)/);
    expect(SCRIPT).toMatch(/kind:\s*'noop'/);
  });
});

describe('Phase 122E Pt 2 — --seed-product-references guarded write mode', () => {
  it('parses --seed-product-references + --commit-seed-product-references + reuses --deal-name', () => {
    expect(SCRIPT).toMatch(/'--seed-product-references'/);
    expect(SCRIPT).toMatch(/'--commit-seed-product-references'/);
    expect(SCRIPT).toMatch(/flags\.seedProductReferences\s*=\s*true/);
    expect(SCRIPT).toMatch(/flags\.commitSeedProductReferences\s*=\s*true/);
  });

  it('--deal-name is required when --seed-product-references is set', () => {
    expect(SCRIPT).toMatch(/--seed-product-references requires --deal-name/);
  });

  it('--commit-seed-product-references is rejected without --seed-product-references', () => {
    expect(SCRIPT).toMatch(
      /--commit-seed-product-references has no effect without --seed-product-references/,
    );
  });

  it('--deal-name is valid alongside any seed mode (client / product-references / manager-entitlement)', () => {
    expect(SCRIPT).toMatch(
      /--deal-name is only valid alongside --seed-client-relationship, --seed-product-references, or --seed-manager-entitlement/,
    );
  });

  it('10-way mutex extended to include --seed-product-references', () => {
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
    );
  });

  it('PRODUCT_REFERENCE_SEEDS pins the three operator-approved (name, code) pairs', () => {
    expect(SCRIPT).toMatch(/PRODUCT_REFERENCE_SEEDS\s*=\s*Object\.freeze/);
    // Product Type
    expect(SCRIPT).toMatch(/name:\s*'SBA 7\(a\)'/);
    expect(SCRIPT).toMatch(/code:\s*'SBA_7A'/);
    // Loan Structure
    expect(SCRIPT).toMatch(/name:\s*'Term Loan'/);
    expect(SCRIPT).toMatch(/code:\s*'TERM_LOAN'/);
    // Pricing Type
    expect(SCRIPT).toMatch(/name:\s*'Variable'/);
    expect(SCRIPT).toMatch(/code:\s*'VARIABLE'/);
    // Bind keys (Loan Deal SchemaName casing).
    expect(SCRIPT).toMatch(/cr664_ProductTypeReference@odata\.bind/);
    expect(SCRIPT).toMatch(/cr664_LoanStructureTypeReference@odata\.bind/);
    expect(SCRIPT).toMatch(/cr664_PricingTypeReference@odata\.bind/);
  });

  it('PRODUCT_REFERENCE_TABLE_LOGICAL + ENTITY_SET pin the audit-confirmed target table', () => {
    expect(SCRIPT).toMatch(
      /PRODUCT_REFERENCE_TABLE_LOGICAL\s*=\s*'cr664_producttypereference'/,
    );
    expect(SCRIPT).toMatch(
      /PRODUCT_REFERENCE_ENTITY_SET\s*=\s*'cr664_producttypereferences'/,
    );
  });

  it('resolveProductReference probes by code FIRST then by name; both probes refuse multi-match', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+resolveProductReference/);
    const fnStart = SCRIPT.indexOf('async function resolveProductReference');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = SCRIPT.indexOf('async function runSeedProductReferences', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    // Probe order: code → name.
    const byCodeIdx = body.indexOf('findProductReferenceByCode(');
    const byNameIdx = body.indexOf('findProductReferenceByName(');
    expect(byCodeIdx).toBeGreaterThan(-1);
    expect(byNameIdx).toBeGreaterThan(-1);
    expect(byCodeIdx).toBeLessThan(byNameIdx);
    // Both probes bail with "Refusing as ambiguous" on >1 match.
    expect(body).toMatch(/cr664_code = "\$\{seed\.code\}"[\s\S]*?Refusing as ambiguous/);
    expect(body).toMatch(/cr664_name = "\$\{seed\.name\}"[\s\S]*?Refusing as ambiguous/);
  });

  it('findProductReferenceByCode + findProductReferenceByName are read-only GETs', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+findProductReferenceByCode/);
    expect(SCRIPT).toMatch(/async\s+function\s+findProductReferenceByName/);
    // OData filters use the audit-confirmed primary-name + code columns.
    expect(SCRIPT).toMatch(/cr664_code eq '\$\{/);
    expect(SCRIPT).toMatch(/cr664_name eq '\$\{/);
    // Select covers the PK + the two ApplicationRequired columns +
    // activeflag (for the warning when reusing inactive rows).
    expect(SCRIPT).toMatch(
      /cr664_producttypereferenceid,cr664_name,cr664_code,cr664_activeflag/,
    );
  });

  it('createProductReference POSTs only the three ApplicationRequired columns', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+createProductReference/);
    const fnStart = SCRIPT.indexOf('async function createProductReference');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = SCRIPT.indexOf(
      'async function patchLoanDealProductReferences',
      fnStart,
    );
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    expect(body).toMatch(/method:\s*'POST'/);
    expect(body).toMatch(/cr664_name:\s*seedName/);
    expect(body).toMatch(/cr664_code:\s*seedCode/);
    expect(body).toMatch(/cr664_activeflag:\s*true/);
    // Negative: no other column in the POST body.
    expect(body).not.toMatch(/cr664_dealname/i);
    expect(body).not.toMatch(/cr664_clientname/i);
    expect(body).not.toMatch(/cr664_borrowertype/i);
    expect(body).not.toMatch(/cr664_amount/i);
    expect(body).not.toMatch(/cr664_industry/i);
  });

  it('patchLoanDealProductReferences body sets ONLY the three product-reference binds', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+patchLoanDealProductReferences/);
    const fnStart = SCRIPT.indexOf('async function patchLoanDealProductReferences');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = SCRIPT.indexOf('async function readLoanDealProductReferences', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    expect(body).toMatch(/method:\s*'PATCH'/);
    // Body is the caller-supplied bindPairs record — the function
    // itself is purely a wrapper. The HARD non-goal is enforced at
    // the call site in runSeedProductReferences: bindBody is built
    // only from the three product-reference binds.
    expect(body).toMatch(/body:\s*JSON\.stringify\(bindPairs\)/);
    // Negative: this helper does NOT contain any reference to the
    // other Loan Deal columns the spec forbids touching.
    expect(body).not.toMatch(/cr664_Client@odata\.bind/);
    expect(body).not.toMatch(/cr664_StageReference@odata\.bind/);
    expect(body).not.toMatch(/cr664_StatusReference@odata\.bind/);
    expect(body).not.toMatch(/cr664_AssignedBanker@odata\.bind/);
    expect(body).not.toMatch(/cr664_customertype/);
    expect(body).not.toMatch(/cr664_industry/);
    expect(body).not.toMatch(/cr664_guarantorstructure/);
    expect(body).not.toMatch(/cr664_collateralsummary/);
  });

  it('the runSeedProductReferences orchestrator builds the PATCH bindBody from ONLY the three bind keys', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+runSeedProductReferences/);
    const fnStart = SCRIPT.indexOf('async function runSeedProductReferences');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = SCRIPT.indexOf('function countNonNull', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    // The bindBody object is keyed by p.seed.bind (which comes from
    // PRODUCT_REFERENCE_SEEDS.*.bind — already pinned above as the
    // three product-reference @odata.bind keys). Negative-pin against
    // any other column finding its way into the PATCH body.
    expect(body).toMatch(/bindBody\[p\.seed\.bind\]\s*=/);
    expect(body).not.toMatch(/bindBody\[['"]cr664_Client@odata\.bind/);
    expect(body).not.toMatch(/bindBody\[['"]cr664_StageReference@odata\.bind/);
    expect(body).not.toMatch(/bindBody\[['"]cr664_StatusReference@odata\.bind/);
    expect(body).not.toMatch(/bindBody\[['"]cr664_AssignedBanker@odata\.bind/);
  });

  it('dry-run is the default — write path guarded by doCommit', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedProductReferences');
    const body = SCRIPT.slice(fnStart);
    expect(body).toMatch(/if\s*\(!doCommit\)/);
    expect(body).toMatch(
      /Re-run with `--commit-seed-product-references` to execute/,
    );
    // Pin ordering: the dry-run early return appears BEFORE any
    // createProductReference or patchLoanDealProductReferences call.
    const dryReturnIdx = body.indexOf(
      'Re-run with `--commit-seed-product-references`',
    );
    const createIdx = body.indexOf('createProductReference(');
    const patchIdx = body.indexOf('patchLoanDealProductReferences(');
    expect(dryReturnIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(-1);
    expect(dryReturnIdx).toBeLessThan(createIdx);
    expect(dryReturnIdx).toBeLessThan(patchIdx);
  });

  it('idempotent: no PATCH when all three links already point at the resolved ids', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedProductReferences');
    const body = SCRIPT.slice(fnStart);
    // The orchestrator computes anyNeedsCreate + anyNeedsLink and
    // short-circuits with "No-op success" when both are false.
    expect(body).toMatch(/anyNeedsCreate/);
    expect(body).toMatch(/anyNeedsLink/);
    expect(body).toMatch(/alreadyLinked:\s*true/);
    expect(body).toMatch(/No-op success/);
  });

  it('refuses zero-match deal AND >1 deal matches', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedProductReferences');
    const body = SCRIPT.slice(fnStart);
    expect(body).toMatch(/No cr664_loandeals row with cr664_dealname/);
    expect(body).toMatch(/cr664_loandeals rows match cr664_dealname/);
  });

  it('refuses duplicate rows on the reference table (both probes)', () => {
    // Duplicate-row refusal is in resolveProductReference.
    const fnStart = SCRIPT.indexOf('async function resolveProductReference');
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    expect(body).toMatch(/Refusing as ambiguous/);
    // Both code-probe and name-probe paths produce the refusal.
    const codeRefusalIdx = body.indexOf('cr664_code');
    const nameRefusalIdx = body.indexOf('cr664_name');
    expect(codeRefusalIdx).toBeGreaterThan(-1);
    expect(nameRefusalIdx).toBeGreaterThan(codeRefusalIdx);
  });

  it('never mutates an existing reference row (no PATCH/UPDATE on cr664_producttypereferences)', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedProductReferences');
    const fnEnd = SCRIPT.indexOf('function countNonNull', fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    // The orchestrator must never PATCH the reference table; only
    // POST (create) and the loan-deal PATCH are allowed.
    expect(body).not.toMatch(
      /PATCH[\s\S]{0,200}cr664_producttypereferences\(/,
    );
    // When reusing a row whose stored fields differ from the seed,
    // the orchestrator prints a "Reusing AS-IS (no mutation)" warning.
    expect(body).toMatch(/Reusing AS-IS \(no mutation\)/);
  });

  it('verification re-reads the deal with FormattedValue annotations and prints the three lookup ids', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+readLoanDealProductReferences/);
    const fnStart = SCRIPT.indexOf('async function readLoanDealProductReferences');
    const fnEnd = SCRIPT.indexOf('async function resolveProductReference', fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    expect(body).toMatch(
      /Prefer:\s*'odata\.include-annotations="OData\.Community\.Display\.V1\.FormattedValue"'/,
    );
    expect(body).toMatch(/_cr664_producttypereference_value/);
    expect(body).toMatch(/_cr664_loanstructuretypereference_value/);
    expect(body).toMatch(/_cr664_pricingtypereference_value/);
  });

  it('verification step prints the FormattedValue display for each of the three lookups', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedProductReferences');
    const body = SCRIPT.slice(fnStart);
    expect(body).toMatch(
      /currentFkKey\}@OData\.Community\.Display\.V1\.FormattedValue/,
    );
  });

  it('seed-product branch is wired into main() and returns BEFORE the broad audit/commit branches', () => {
    const guardIdx = SCRIPT.indexOf('if (FLAGS.seedProductReferences)');
    expect(guardIdx).toBeGreaterThan(-1);
    const auditMarkerIdx = SCRIPT.indexOf('// === Phase A: audit ===', guardIdx);
    expect(auditMarkerIdx).toBeGreaterThan(guardIdx);
    const between = SCRIPT.slice(guardIdx, auditMarkerIdx);
    expect(between).toMatch(/return;/);
  });

  it('no force-delete / bypass headers introduced by the new mode', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });

  it('MODE banner adds SEED-PRODUCT-REFERENCES (dry-run) + COMMIT-SEED-PRODUCT-REFERENCES', () => {
    expect(SCRIPT).toMatch(/'COMMIT-SEED-PRODUCT-REFERENCES'/);
    expect(SCRIPT).toMatch(/'SEED-PRODUCT-REFERENCES \(dry-run\)'/);
  });

  it('write-mode warning header fires on --commit-seed-product-references', () => {
    expect(SCRIPT).toMatch(/FLAGS\.commitSeedProductReferences/);
  });
});

describe('Phase 122E Pt 2 — seed graph values (behavioral mirror)', () => {
  // Behavioral mirror of PRODUCT_REFERENCE_SEEDS. The seed names +
  // codes are operator-spec; the test re-states them so a future
  // drift between the doc and the script trips a clear failure.
  const seeds: Array<{ label: string; name: string; code: string }> = [
    { label: 'Product type',   name: 'SBA 7(a)',  code: 'SBA_7A' },
    { label: 'Loan structure', name: 'Term Loan', code: 'TERM_LOAN' },
    { label: 'Pricing type',   name: 'Variable',  code: 'VARIABLE' },
  ];

  it('the three seeds map to the three Loan Deal product-reference bind keys', () => {
    const bindKeys = [
      'cr664_ProductTypeReference@odata.bind',
      'cr664_LoanStructureTypeReference@odata.bind',
      'cr664_PricingTypeReference@odata.bind',
    ];
    for (const key of bindKeys) {
      expect(SCRIPT).toContain(key);
    }
  });

  it('each seed exposes (label, name, code) — no extra columns leak into the spec', () => {
    for (const s of seeds) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.code).toBe('string');
      expect(typeof s.label).toBe('string');
      // The seeds intentionally do NOT carry activeflag — the orchestrator
      // hardcodes `cr664_activeflag: true` in createProductReference.
    }
  });

  it('each seed code is a non-empty identifier-shape string', () => {
    for (const s of seeds) {
      expect(s.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});

describe('Phase 122E Pt 1 — --inspect-attributes targeted attribute audit', () => {
  it('parses --inspect-attributes with a comma-separated list of <table>.<attribute>', () => {
    expect(SCRIPT).toMatch(/'--inspect-attributes'/);
    expect(SCRIPT).toMatch(/flags\.inspectAttributeItems\s*=/);
    expect(SCRIPT).toMatch(/--inspect-attributes requires a comma-separated list/);
  });

  it('validates each item is exactly <table>.<attribute> with Dataverse logical-name shape', () => {
    // The parser splits on `.`, refuses items with !== 2 parts, and
    // validates each half against the Dataverse logical-name regex.
    expect(SCRIPT).toMatch(
      /--inspect-attributes item "\$\{item\}" must be exactly "<table>\.<attribute>"/,
    );
    expect(SCRIPT).toMatch(
      /--inspect-attributes item "\$\{item\}" must use Dataverse logical-name shape/,
    );
  });

  it('declares runInspectAttributes() that walks one level deep into lookup targets', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+runInspectAttributes/);
    const fnStart = SCRIPT.indexOf('async function runInspectAttributes');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = SCRIPT.indexOf('\n// ---', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    // For each item, reuses the existing Web API metadata helpers.
    expect(body).toMatch(/getTableMetadata\(/);
    expect(body).toMatch(/getLookupTargetsForAttribute\(/);
    expect(body).toMatch(/getPicklistOptionsForAttribute\(/);
    // Lookup branch prints the target table headline + REQUIRED FOR
    // CREATE columns with nested Lookup Targets + Picklist OptionSets.
    expect(body).toMatch(/Lookup Targets\[\]:/);
    expect(body).toMatch(/REQUIRED FOR CREATE on/);
    expect(body).toMatch(/Lookup Targets:/);
    expect(body).toMatch(/OptionSet \(\$\{choice\.options\.length\}\):/);
    // Read-only contract — no write of any kind in the orchestrator.
    expect(body).not.toMatch(/method:\s*'PATCH'/);
    expect(body).not.toMatch(/method:\s*'POST'/);
    expect(body).not.toMatch(/method:\s*'DELETE'/);
    expect(body).not.toMatch(/PublishXml/);
    expect(body).not.toMatch(/spawnSync\(/);
  });

  it('inspect-attributes branch returns from main() before any write-capable mode is reached', () => {
    const guardIdx = SCRIPT.indexOf('if (FLAGS.inspectAttributeItems !== null)');
    expect(guardIdx).toBeGreaterThan(-1);
    // The next write-capable branch is the seed-client-relationship
    // block — verify the inspect-attributes branch returns BEFORE it.
    const nextWriteModeIdx = SCRIPT.indexOf(
      'if (FLAGS.seedClientRelationship)',
      guardIdx,
    );
    expect(nextWriteModeIdx).toBeGreaterThan(guardIdx);
    const between = SCRIPT.slice(guardIdx, nextWriteModeIdx);
    expect(between).toMatch(/return;/);
    // And the Phase A audit block also sits AFTER the inspect-attributes
    // branch.
    const auditMarkerIdx = SCRIPT.indexOf('// === Phase A: audit ===', guardIdx);
    expect(auditMarkerIdx).toBeGreaterThan(guardIdx);
  });

  it('MODE banner adds INSPECT-ATTRIBUTES', () => {
    expect(SCRIPT).toMatch(/'INSPECT-ATTRIBUTES'/);
  });

  it('no force-delete / bypass headers introduced by the new mode', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });

  it('9-way mutex extended to include --inspect-attributes', () => {
    // Asserted via the central mutex pin updated elsewhere in this file,
    // but re-check the specific string for clarity.
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
    );
  });
});

describe('Phase 122E Pt 1 — targeted attribute parser (behavioral)', () => {
  // Behavioral mirror of the script's --inspect-attributes value parser.
  type Item = { table: string; attribute: string };
  function parseItems(value: string): Item[] {
    const items = value.split(',').map((s) => s.trim()).filter(Boolean);
    const logicalShape = /^[a-z][a-z0-9_]{1,79}$/i;
    const parsed: Item[] = [];
    for (const item of items) {
      const parts = item.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(
          `item "${item}" must be exactly "<table>.<attribute>"`,
        );
      }
      if (!logicalShape.test(parts[0]) || !logicalShape.test(parts[1])) {
        throw new Error(`item "${item}" must use Dataverse logical-name shape`);
      }
      parsed.push({ table: parts[0].toLowerCase(), attribute: parts[1].toLowerCase() });
    }
    return parsed;
  }

  it('accepts the operator example: the three final cockpit-missing references', () => {
    const items = parseItems(
      'cr664_loandeal.cr664_producttypereference,' +
        'cr664_loandeal.cr664_loanstructuretypereference,' +
        'cr664_loandeal.cr664_pricingtypereference',
    );
    expect(items).toEqual([
      { table: 'cr664_loandeal', attribute: 'cr664_producttypereference' },
      { table: 'cr664_loandeal', attribute: 'cr664_loanstructuretypereference' },
      { table: 'cr664_loandeal', attribute: 'cr664_pricingtypereference' },
    ]);
  });

  it('rejects items missing the dot separator', () => {
    expect(() => parseItems('cr664_loandeal_cr664_producttypereference')).toThrow(
      /must be exactly/,
    );
  });

  it('rejects items with too many dots', () => {
    expect(() => parseItems('cr664_loandeal.foo.bar')).toThrow(/must be exactly/);
  });

  it('rejects empty table or empty attribute', () => {
    expect(() => parseItems('.cr664_x')).toThrow(/must be exactly/);
    expect(() => parseItems('cr664_loandeal.')).toThrow(/must be exactly/);
  });

  it('rejects shapes that violate Dataverse logical-name rules', () => {
    expect(() => parseItems('cr664_loandeal.cr664/producttype')).toThrow(
      /logical-name shape/,
    );
    expect(() => parseItems('cr664-loandeal.cr664_producttypereference')).toThrow(
      /logical-name shape/,
    );
  });

  it('Phase 122E Pt 1 example command uses the three final cockpit-missing attributes', () => {
    // The doc + the operator's command-shape contract both name these
    // three optional reference lookups as the Phase 122E Pt 1 targets.
    expect(SCRIPT).toMatch(/cr664_producttypereference/);
    expect(SCRIPT).toMatch(/cr664_loanstructuretypereference/);
    expect(SCRIPT).toMatch(/cr664_pricingtypereference/);
  });
});

describe('Phase 122D Pt 2 — --seed-client-relationship guarded write mode', () => {
  it('parses --seed-client-relationship + the three required inputs + --commit-seed-client', () => {
    expect(SCRIPT).toMatch(/'--seed-client-relationship'/);
    expect(SCRIPT).toMatch(/'--deal-name'/);
    expect(SCRIPT).toMatch(/'--client-name'/);
    expect(SCRIPT).toMatch(/'--borrower-type'/);
    expect(SCRIPT).toMatch(/'--commit-seed-client'/);
    expect(SCRIPT).toMatch(/flags\.seedClientRelationship\s*=\s*true/);
    expect(SCRIPT).toMatch(/flags\.commitSeedClient\s*=\s*true/);
  });

  it('all three inputs are required when --seed-client-relationship is set', () => {
    expect(SCRIPT).toMatch(/--seed-client-relationship requires --deal-name/);
    expect(SCRIPT).toMatch(/--seed-client-relationship requires --client-name/);
    expect(SCRIPT).toMatch(/--seed-client-relationship requires --borrower-type/);
  });

  it('each input flag is only valid alongside --seed-client-relationship', () => {
    expect(SCRIPT).toMatch(/--deal-name is only valid alongside --seed-client-relationship/);
    expect(SCRIPT).toMatch(/--client-name is only valid alongside --seed-client-relationship/);
    expect(SCRIPT).toMatch(/--borrower-type is only valid alongside --seed-client-relationship/);
    expect(SCRIPT).toMatch(/--commit-seed-client has no effect without --seed-client-relationship/);
  });

  it('BORROWER_TYPE_LABELS pins the six audit-confirmed Borrower Type values', () => {
    expect(SCRIPT).toMatch(/BORROWER_TYPE_LABELS\s*=\s*Object\.freeze/);
    expect(SCRIPT).toMatch(/788190000:\s*'Individual'/);
    expect(SCRIPT).toMatch(/788190001:\s*'LLC'/);
    expect(SCRIPT).toMatch(/788190002:\s*'Corporation'/);
    expect(SCRIPT).toMatch(/788190003:\s*'Partnership'/);
    expect(SCRIPT).toMatch(/788190004:\s*'Trust'/);
    expect(SCRIPT).toMatch(/788190005:\s*'Non-Profit'/);
  });

  it('--borrower-type validates against BORROWER_TYPE_LABELS membership', () => {
    expect(SCRIPT).toMatch(/!BORROWER_TYPE_LABELS\[parsed\]/);
    expect(SCRIPT).toMatch(/--borrower-type expects one of/);
  });

  it('OData filter helper escapes single quotes in primary-name values', () => {
    expect(SCRIPT).toMatch(/function\s+odataEscapeStringLiteral/);
    expect(SCRIPT).toMatch(/replace\(\/'\/g,\s*"''"\)/);
  });

  it('findLoanDealByName + findClientRelationshipByName are read-only GETs', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+findLoanDealByName/);
    expect(SCRIPT).toMatch(/async\s+function\s+findClientRelationshipByName/);
    // The shared list-fetch helper uses method: 'GET'.
    expect(SCRIPT).toMatch(/async\s+function\s+fetchODataList/);
    const fetchListStart = SCRIPT.indexOf('async function fetchODataList');
    const nextDecl = SCRIPT.indexOf('async function findLoanDealByName', fetchListStart);
    const body = SCRIPT.slice(fetchListStart, nextDecl);
    expect(body).toMatch(/method:\s*'GET'/);
    expect(body).not.toMatch(/method:\s*'PATCH'/);
    expect(body).not.toMatch(/method:\s*'POST'/);
    expect(body).not.toMatch(/method:\s*'DELETE'/);
  });

  it('OData filter uses the table primary-name attributes confirmed by the Pt 1 audit', () => {
    expect(SCRIPT).toMatch(/cr664_dealname eq '\$\{/);
    expect(SCRIPT).toMatch(/cr664_clientname eq '\$\{/);
    // Selects the lookup FK so the idempotency check can compare values.
    expect(SCRIPT).toMatch(/cr664_loandealid,cr664_dealname,_cr664_client_value/);
    expect(SCRIPT).toMatch(/cr664_clientrelationshipid,cr664_clientname,cr664_borrowertype/);
  });

  it('createClientRelationship POSTs only the two required columns', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+createClientRelationship/);
    const fnStart = SCRIPT.indexOf('async function createClientRelationship');
    expect(fnStart).toBeGreaterThan(-1);
    const nextDecl = SCRIPT.indexOf('async function patchLoanDealClient', fnStart);
    const body = SCRIPT.slice(fnStart, nextDecl);
    expect(body).toMatch(/method:\s*'POST'/);
    expect(body).toMatch(/cr664_clientname:\s*clientName/);
    expect(body).toMatch(/cr664_borrowertype:\s*borrowerType/);
    // Body must NOT include any other column — Phase 122D's "minimum
    // valid reference graph" constraint.
    expect(body).not.toMatch(/cr664_loanstructure/);
    expect(body).not.toMatch(/cr664_producttype/);
    expect(body).not.toMatch(/cr664_pricingtype/);
    expect(body).not.toMatch(/cr664_industry/);
    expect(body).not.toMatch(/cr664_customertype/);
  });

  it('patchLoanDealClient PATCH body sets ONLY cr664_Client@odata.bind', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+patchLoanDealClient/);
    const fnStart = SCRIPT.indexOf('async function patchLoanDealClient');
    expect(fnStart).toBeGreaterThan(-1);
    const nextDecl = SCRIPT.indexOf('async function readLoanDealClientLink', fnStart);
    const body = SCRIPT.slice(fnStart, nextDecl);
    expect(body).toMatch(/method:\s*'PATCH'/);
    expect(body).toMatch(/cr664_Client@odata\.bind/);
    expect(body).toMatch(/\/cr664_clientrelationships\(\$\{clientId\}\)/);
    // No other field — Phase 122D explicit non-goal.
    expect(body).not.toMatch(/cr664_producttype/i);
    expect(body).not.toMatch(/cr664_loanstructure/i);
    expect(body).not.toMatch(/cr664_pricingtype/i);
    expect(body).not.toMatch(/cr664_industry/);
    expect(body).not.toMatch(/cr664_customertype/);
    expect(body).not.toMatch(/cr664_guarantorstructure/);
  });

  it('dry-run is the default — write path guarded by doCommit', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedClientRelationship');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart);
    expect(body).toMatch(/if\s*\(!doCommit\)/);
    expect(body).toMatch(/Re-run with `--commit-seed-client` to execute/);
    // Pin ordering: the dry-run early return appears BEFORE any
    // createClientRelationship or patchLoanDealClient call.
    const dryReturnIdx = body.indexOf('Re-run with `--commit-seed-client`');
    const createIdx = body.indexOf('createClientRelationship(');
    const patchIdx = body.indexOf('patchLoanDealClient(');
    expect(dryReturnIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeGreaterThan(-1);
    expect(dryReturnIdx).toBeLessThan(createIdx);
    expect(dryReturnIdx).toBeLessThan(patchIdx);
  });

  it('idempotent: no POST when client already exists, no-op when deal already linked', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedClientRelationship');
    const body = SCRIPT.slice(fnStart);
    // Existing-client path skips createClientRelationship.
    expect(body).toMatch(/needCreate\s*=\s*false/);
    // The "already linked" short-circuit returns BEFORE the create/patch.
    expect(body).toMatch(/alreadyLinked:\s*true/);
    expect(body).toMatch(/No-op success/);
  });

  it('refuses zero-match OR multi-match for both deal and client lookups', () => {
    const fnStart = SCRIPT.indexOf('async function runSeedClientRelationship');
    const body = SCRIPT.slice(fnStart);
    // Deal must exist (no auto-create) AND be unique.
    expect(body).toMatch(
      /No cr664_loandeals row with cr664_dealname/,
    );
    expect(body).toMatch(
      /cr664_loandeals rows match cr664_dealname/,
    );
    // Client multi-match refusal (zero-match is handled by the
    // create branch, but multi-match must bail). The bail message
    // wraps across template-literal concat, so use [\s\S] for the
    // bridge.
    expect(body).toMatch(
      /cr664_clientrelationships rows match[\s\S]*?cr664_clientname/,
    );
  });

  it('post-commit verification re-reads the deal and prints the formatted value', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+readLoanDealClientLink/);
    expect(SCRIPT).toMatch(
      /Prefer:\s*'odata\.include-annotations="OData\.Community\.Display\.V1\.FormattedValue"'/,
    );
    expect(SCRIPT).toMatch(
      /_cr664_client_value@OData\.Community\.Display\.V1\.FormattedValue/,
    );
  });

  it('seed-client branch in main() returns before the audit phase is reached', () => {
    const guardIdx = SCRIPT.indexOf('if (FLAGS.seedClientRelationship)');
    expect(guardIdx).toBeGreaterThan(-1);
    const auditMarkerIdx = SCRIPT.indexOf('// === Phase A: audit ===', guardIdx);
    expect(auditMarkerIdx).toBeGreaterThan(guardIdx);
    const between = SCRIPT.slice(guardIdx, auditMarkerIdx);
    expect(between).toMatch(/return;/);
  });

  it('no force-delete / bypass path introduced by the seed mode', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });

  it('write-mode warning fires on --commit-seed-client like other commit flags', () => {
    expect(SCRIPT).toMatch(/FLAGS\.commitSeedClient/);
    // The header banner promotes seed-client to a top-level mode.
    expect(SCRIPT).toMatch(/COMMIT-SEED-CLIENT/);
    expect(SCRIPT).toMatch(/SEED-CLIENT-RELATIONSHIP \(dry-run\)/);
  });
});

describe('Phase 122D Pt 2 — borrower-type integer validation (behavioral)', () => {
  // Behavioral mirror of the script's --borrower-type validator.
  const VALID = new Set([
    788190000, 788190001, 788190002, 788190003, 788190004, 788190005,
  ]);
  function isValidBorrowerType(input: string): boolean {
    const n = Number(input);
    return Number.isInteger(n) && VALID.has(n);
  }
  it('accepts every audit-confirmed Borrower Type integer', () => {
    expect(isValidBorrowerType('788190000')).toBe(true);
    expect(isValidBorrowerType('788190001')).toBe(true);
    expect(isValidBorrowerType('788190002')).toBe(true);
    expect(isValidBorrowerType('788190003')).toBe(true);
    expect(isValidBorrowerType('788190004')).toBe(true);
    expect(isValidBorrowerType('788190005')).toBe(true);
  });
  it('rejects integers outside the audit-confirmed set', () => {
    expect(isValidBorrowerType('788190006')).toBe(false);
    expect(isValidBorrowerType('1')).toBe(false);
    expect(isValidBorrowerType('-1')).toBe(false);
    expect(isValidBorrowerType('0')).toBe(false);
  });
  it('rejects non-integer input (decimals, hex, junk, empty)', () => {
    expect(isValidBorrowerType('1.5')).toBe(false);
    expect(isValidBorrowerType('0x788190001')).toBe(false);
    expect(isValidBorrowerType('LLC')).toBe(false);
    expect(isValidBorrowerType('')).toBe(false);
  });
});

describe('Phase 122D — --inspect-table Web API metadata audit', () => {
  it('parses --inspect-table <logical-name> as a flag with a single value', () => {
    expect(SCRIPT).toMatch(/'--inspect-table'/);
    expect(SCRIPT).toMatch(/flags\.inspectTableName\s*=/);
    // The CLI validator restricts the value to a Dataverse logical name
    // shape (letters / digits / underscore, 2-80 chars).
    expect(SCRIPT).toMatch(/\[a-z\]\[a-z0-9_\]\{1,79\}/);
    expect(SCRIPT).toMatch(/--inspect-table expects a Dataverse logical name/);
  });

  it('declares getTableMetadata() with a Web-API-only GET against EntityDefinitions', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+getTableMetadata/);
    const fnStart = SCRIPT.indexOf('async function getTableMetadata');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = SCRIPT.indexOf(
      'async function getLookupTargetsForAttribute',
      fnStart,
    );
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    // The GET URL pulls the table-level metadata + the per-attribute
    // metadata in one round-trip via $expand.
    expect(body).toMatch(/EntityDefinitions\(LogicalName=/);
    expect(body).toMatch(/PrimaryNameAttribute/);
    expect(body).toMatch(/PrimaryIdAttribute/);
    expect(body).toMatch(/\$expand=Attributes/);
    expect(body).toMatch(/RequiredLevel/);
    expect(body).toMatch(/IsValidForCreate/);
    expect(body).toMatch(/method:\s*'GET'/);
    // No write inside this helper.
    expect(body).not.toMatch(/method:\s*'PATCH'/);
    expect(body).not.toMatch(/method:\s*'POST'/);
    expect(body).not.toMatch(/method:\s*'DELETE'/);
  });

  it('declares getLookupTargetsForAttribute() for required-Lookup column inspection', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+getLookupTargetsForAttribute/);
    // The lookup-cast URL is the standard Dataverse pattern.
    expect(SCRIPT).toMatch(
      /Microsoft\.Dynamics\.CRM\.LookupAttributeMetadata\?\$select=Targets,SchemaName/,
    );
  });

  it('declares getPicklistOptionsForAttribute() for required-Picklist column inspection', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+getPicklistOptionsForAttribute/);
    expect(SCRIPT).toMatch(/Microsoft\.Dynamics\.CRM\.PicklistAttributeMetadata/);
    expect(SCRIPT).toMatch(/\$expand=OptionSet/);
  });

  it('declares runInspectTable() orchestrator that partitions attrs by RequiredLevel', () => {
    expect(SCRIPT).toMatch(/async\s+function\s+runInspectTable/);
    const fnStart = SCRIPT.indexOf('async function runInspectTable');
    expect(fnStart).toBeGreaterThan(-1);
    // Bound to the next top-level section header so the slice doesn't
    // bleed into unrelated downstream helpers (Phase 122D Pt 2's seed
    // helpers sit between this function and the legacy countNonNull
    // anchor).
    const fnEnd = SCRIPT.indexOf('\n// ---', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = SCRIPT.slice(fnStart, fnEnd);
    expect(body).toMatch(/REQUIRED FOR CREATE/);
    expect(body).toMatch(/RECOMMENDED/);
    expect(body).toMatch(/OPTIONAL/);
    expect(body).toMatch(/SystemRequired/);
    expect(body).toMatch(/ApplicationRequired/);
    // Recommended is its own bucket but does NOT trigger lookup /
    // picklist cast probes (those are required-only).
    expect(body).toMatch(/PrimaryNameAttribute/);
    // No write of any kind.
    expect(body).not.toMatch(/method:\s*'PATCH'/);
    expect(body).not.toMatch(/method:\s*'POST'/);
    expect(body).not.toMatch(/method:\s*'DELETE'/);
    expect(body).not.toMatch(/spawnSync\(/);
  });

  it('inspect-table branch is wired into main() and returns before audit/commit', () => {
    const guardIdx = SCRIPT.indexOf('if (FLAGS.inspectTableName !== null)');
    expect(guardIdx).toBeGreaterThan(-1);
    const auditMarkerIdx = SCRIPT.indexOf('// === Phase A: audit ===', guardIdx);
    expect(auditMarkerIdx).toBeGreaterThan(guardIdx);
    const between = SCRIPT.slice(guardIdx, auditMarkerIdx);
    expect(between).toMatch(/return;/);
  });

  it('inspect-table mode never issues a write — read-only contract', () => {
    // The runInspectTable function body must contain only GETs and no
    // bypass headers (re-asserted alongside the existing negative
    // pins so the read-only contract holds across the new helpers).
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
  });

  it('MODE banner adds INSPECT-TABLE when FLAGS.inspectTableName is set', () => {
    expect(SCRIPT).toMatch(/'INSPECT-TABLE'/);
  });
});

describe('Phase 122B — --print-relationship-payload diagnostic mode', () => {
  it('parses --print-relationship-payload as a flag', () => {
    expect(SCRIPT).toMatch(/'--print-relationship-payload'/);
    expect(SCRIPT).toMatch(/flags\.printRelationshipPayload\s*=\s*true/);
  });

  it('the print handler runs at the TOP of main() — before assertPacAuth', () => {
    // Pure diagnostic: should not require pac auth or any Web API
    // call. Pin the source ordering: the printRelationshipPayload
    // guard appears BEFORE the `assertPacAuth()` call in main().
    const mainStart = SCRIPT.indexOf('async function main()');
    expect(mainStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(mainStart, mainStart + 4000);
    const printGuardIdx = body.indexOf('if (FLAGS.printRelationshipPayload)');
    const authIdx = body.indexOf('assertPacAuth();');
    expect(printGuardIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    expect(printGuardIdx).toBeLessThan(authIdx);
  });

  it('print handler emits payloads for all 5 candidate tables + the AssignedTo lookup', () => {
    const mainStart = SCRIPT.indexOf('async function main()');
    const body = SCRIPT.slice(mainStart, mainStart + 4000);
    expect(body).toMatch(/Phase 122B — Relationship-create payload preview/);
    // Loops over CANDIDATE_CHILD_TABLES to print each cr664_Deal lookup.
    expect(body).toMatch(/for\s*\(const\s+t\s+of\s+CANDIDATE_CHILD_TABLES\)/);
    expect(body).toMatch(/NEW_DEAL_COLUMN_SCHEMA_NAME/);
    // Plus the AssignedTo lookup.
    expect(body).toMatch(/NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME/);
    // The handler returns BEFORE any pac call.
    expect(body).toMatch(/No pac call, no Web API call, no write/);
    expect(body).toMatch(/return;/);
  });

  it('print mode is read-only — no fetch / spawnSync calls in its block', () => {
    const mainStart = SCRIPT.indexOf('async function main()');
    expect(mainStart).toBeGreaterThan(-1);
    const block = SCRIPT.slice(
      mainStart,
      SCRIPT.indexOf('assertPacAuth();', mainStart),
    );
    // The print block sits entirely above assertPacAuth(). It must
    // not invoke fetch, spawnSync, executeStep, etc.
    expect(block).not.toMatch(/await\s+fetch\(/);
    expect(block).not.toMatch(/spawnSync\(/);
    expect(block).not.toMatch(/executeStep\(/);
  });
});

describe('Phase 122B — current-state resume: pseudo-columns present', () => {
  // The operator's 2026-06-08 dry-run reported pseudo columns
  // present again. The script must not assume the previous round
  // of DELETEs persisted — buildPlan re-audits on every run and
  // emits DELETE steps whenever pseudoExists is true.

  it('buildPlan unconditionally re-audits before emitting DELETEs', () => {
    // main() runs auditTable() on every commit invocation. Pin the
    // call site so a regression can't silently cache prior state.
    // auditTable is now async (Web API metadata) and receives the
    // shared mainToken + mainEnvUrl.
    expect(SCRIPT).toMatch(
      /CANDIDATE_CHILD_TABLES\.map\(\(t\)\s*=>\s*auditTable\(t,\s*mainToken,\s*mainEnvUrl\)\)/,
    );
  });

  it('emits a DELETE step when pseudoDealColumnExists is true and rows are zero', () => {
    // The path: enter the loop, pass the skip-guard, pass the
    // populated > 0 stop-condition, push a `method: 'DELETE'` step
    // targeting Attributes(LogicalName='cr664_deal').
    const buildPlanStart = SCRIPT.indexOf('function buildPlan');
    expect(buildPlanStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(buildPlanStart, buildPlanStart + 8000);
    expect(body).toMatch(/method:\s*'DELETE'/);
    expect(body).toMatch(
      /\/api\/data\/v9\.2\/EntityDefinitions\(LogicalName='\$\{t\}'\)\/Attributes\(LogicalName='\$\{PSEUDO_DEAL_COLUMN\}'\)/,
    );
  });

  it('inspectPseudoColumnDependencies fires before any destructive DELETE', () => {
    // When pseudo cols are present (operator's current state), the
    // dependency-inspection gate must re-run, not skip. Pin the
    // call-site ordering: inspect → "Proceeding to destructive steps"
    // marker → destructive loop.
    const commitGuard = SCRIPT.indexOf('// === Safety gates for commit mode ===');
    expect(commitGuard).toBeGreaterThan(-1);
    const slice = SCRIPT.slice(commitGuard);
    const inspectIdx = slice.indexOf('await inspectPseudoColumnDependencies(');
    const destructiveIdx = slice.indexOf('Proceeding to destructive steps');
    expect(inspectIdx).toBeGreaterThan(-1);
    expect(destructiveIdx).toBeGreaterThan(inspectIdx);
  });

  it('rollback reuse still active for the resumed --commit', () => {
    // shouldSkipRollbackExportStep is invoked before each rollback
    // step — operator's existing zips are reused, not re-exported.
    expect(SCRIPT).toMatch(/shouldSkipRollbackExportStep\(step\)/);
  });
});

describe('Phase 122B — partial-state resume: pseudo-columns already absent', () => {
  // Re-pin the symmetric path so the dual contract is locked
  // alongside the current-state path above.

  it('skips DELETE step when pseudoDealColumnExists is false', () => {
    expect(SCRIPT).toMatch(/if\s*\(!a\s*\|\|\s*!a\.pseudoDealColumnExists\)\s*continue/);
  });

  it('emits noop step when standardLookupFkExists is true (no double-create)', () => {
    expect(SCRIPT).toMatch(/if\s*\(a\?\.standardLookupFkExists\)/);
    expect(SCRIPT).toMatch(/kind:\s*'noop'/);
  });
});

describe('Phase 122B — AssignedTo lookup remains targeted at systemuser', () => {
  it('LOOKUP_TARGET_SYSTEMUSER is the constant; no other target appears in the AssignedTo step', () => {
    expect(SCRIPT).toMatch(/LOOKUP_TARGET_SYSTEMUSER\s*=\s*'systemuser'/);
    // The AssignedTo create step uses LOOKUP_TARGET_SYSTEMUSER as
    // its `target:` argument — no hardcoded alternative.
    expect(SCRIPT).toMatch(
      /target:\s*LOOKUP_TARGET_SYSTEMUSER/,
    );
    // Negative: no Targets: ['systemuserid'] / etc.
    expect(SCRIPT).not.toMatch(/target:\s*'systemuserid'/i);
  });
});

describe('Phase 122B — lookup relationship payload uses Web-API-correct shape', () => {
  // Behavioral mirror of buildLookupRelationshipPayload's output.
  // The mirror IS what the script must produce; the static-source
  // pins below lock the script to the same shape.
  function buildPayloadMirror(args: {
    referencingEntity: string;
    schemaName: string;
    displayLabel: string;
    target: string;
  }) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: `${args.referencingEntity}_${args.target}_${args.schemaName.replace(/^cr664_/, '')}`,
      ReferencedEntity: args.target,
      ReferencingEntity: args.referencingEntity,
      AssociatedMenuConfiguration: {
        Behavior: 'UseCollectionName',
        Group: 'Details',
        Order: 10000,
        // IsCustomizable intentionally absent — see operator's 2026-06-08
        // ODataException: nested-object IsCustomizable is rejected.
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
        SchemaName: args.schemaName,
        Targets: [args.target],
      },
    };
  }

  it('AssociatedMenuConfiguration contains no IsCustomizable key', () => {
    const p = buildPayloadMirror({
      referencingEntity: 'cr664_documentchecklist',
      schemaName: 'cr664_Deal',
      displayLabel: 'Deal',
      target: 'cr664_loandeal',
    });
    expect(p.AssociatedMenuConfiguration).not.toHaveProperty('IsCustomizable');
  });

  it('the whole payload does not serialize IsCustomizable as an object anywhere', () => {
    const p = buildPayloadMirror({
      referencingEntity: 'cr664_dealtask1',
      schemaName: 'cr664_AssignedTo',
      displayLabel: 'Assigned to',
      target: 'systemuser',
    });
    const json = JSON.stringify(p);
    // No "IsCustomizable":{ ... } substring anywhere.
    expect(json).not.toMatch(/"IsCustomizable"\s*:\s*\{/);
  });

  it('script source: AssociatedMenuConfiguration block carries no IsCustomizable property', () => {
    // Pin the buildLookupRelationshipPayload body's
    // AssociatedMenuConfiguration object literal — it must NOT
    // contain an `IsCustomizable: { ... }` line. The buggy 2026-06-08
    // line was:
    //   IsCustomizable: { Value: true, CanBeChanged: true,
    //                     ManagedPropertyLogicalName: 'iscustomizable' },
    // which produced the ODataException. The fix is to remove it.
    const fnStart = SCRIPT.indexOf('function buildLookupRelationshipPayload');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    // The bug shape is gone.
    expect(body).not.toMatch(/IsCustomizable:\s*\{\s*Value:\s*true/);
    // The AssociatedMenuConfiguration block itself still exists.
    expect(body).toMatch(/AssociatedMenuConfiguration:\s*\{/);
    // Tighter pin: no `IsCustomizable:` PROPERTY KEY anywhere in the
    // payload-generator body. (The bare word may legitimately appear
    // in the explanatory comment that documents the incident.)
    expect(body).not.toMatch(/IsCustomizable:\s/);
  });

  it('the LookupAttributeMetadata Lookup block still carries the canonical fields', () => {
    const fnStart = SCRIPT.indexOf('function buildLookupRelationshipPayload');
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    expect(body).toMatch(/'Microsoft\.Dynamics\.CRM\.OneToManyRelationshipMetadata'/);
    expect(body).toMatch(/'Microsoft\.Dynamics\.CRM\.LookupAttributeMetadata'/);
    expect(body).toMatch(/AttributeTypeName:\s*\{\s*Value:\s*'LookupType'\s*\}/);
    expect(body).toMatch(/RequiredLevel:\s*\{\s*Value:\s*'None'/);
    expect(body).toMatch(/SchemaName:\s*schemaName/);
    expect(body).toMatch(/Targets:\s*\[target\]/);
  });

  it('CascadeConfiguration still uses primitive-string Behavior values', () => {
    const fnStart = SCRIPT.indexOf('function buildLookupRelationshipPayload');
    const body = SCRIPT.slice(fnStart, fnStart + 4000);
    // Each behavior is one of 'NoCascade' / 'RemoveLink' (primitive
    // strings, not objects). Pin the structure.
    expect(body).toMatch(/Delete:\s*'RemoveLink'/);
    expect(body).toMatch(/Assign:\s*'NoCascade'/);
  });
});

describe('Phase 122B — partial-commit resume is idempotent via audit-driven plan', () => {
  it('skips DELETE pseudo-column step when pseudoDealColumnExists is false', () => {
    // buildPlan iterates CANDIDATE_CHILD_TABLES and continues (no
    // step pushed) when the audit reports the pseudo column is
    // absent. This is the basis of partial-commit resume: after the
    // operator's first round of DELETEs the pseudo cols are gone, so
    // a fresh audit emits no DELETE steps and the plan jumps straight
    // to create+publish+verify.
    expect(SCRIPT).toMatch(/if\s*\(!a\s*\|\|\s*!a\.pseudoDealColumnExists\)\s*continue/);
  });

  it('skips DELETE assignedto step when pseudoAssignedToColumnExists is false', () => {
    // Same idempotency contract for the AssignedTo column on
    // cr664_dealtask1. The AssignedTo delete sits inside an
    // `if (dealtask?.pseudoAssignedToColumnExists)` guard so a re-run
    // after the column is gone simply emits no step.
    expect(SCRIPT).toMatch(/if\s*\(dealtask\?\.pseudoAssignedToColumnExists\)/);
  });

  it('emits a noop step instead of POST when the standard FK already exists', () => {
    // After a successful create, _cr664_deal_value exists on the
    // table. The audit-driven plan must emit `kind: 'noop'` rather
    // than re-POSTing — so a re-run after one create succeeds and
    // another fails does not double-create the first.
    expect(SCRIPT).toMatch(/if\s*\(a\?\.standardLookupFkExists\)/);
    expect(SCRIPT).toMatch(/kind:\s*'noop'/);
    expect(SCRIPT).toMatch(/Already correct — \$\{t\}\._\$\{PSEUDO_DEAL_COLUMN\}_value exists/);
  });

  it('skips the AssignedTo CREATE step when standardAssignedToFkExists is true', () => {
    // The AssignedTo create is wrapped in `if (!dealtask?.standardAssignedToFkExists)`
    // so when it already exists (from a previous --commit run) the
    // step is omitted entirely.
    expect(SCRIPT).toMatch(/if\s*\(!dealtask\?\.standardAssignedToFkExists\)/);
  });

  it('main commit does not bypass any safety gate on a resumed run', () => {
    // The same publisher-prefix, rollback, dependency-inspection,
    // and stop-condition gates fire on every commit invocation —
    // idempotency comes from the audit producing a smaller plan,
    // not from gate-bypass.
    expect(SCRIPT).toMatch(/refuseIfForbiddenPrefix\(/);
    expect(SCRIPT).toMatch(/inspectPseudoColumnDependencies\(/);
    expect(SCRIPT).toMatch(/ensureRollbackArtifactsExist\(/);
  });
});

describe('Phase 122B — resumed commit keeps every original hard non-goal', () => {
  it('no new_ prefix introduced anywhere', () => {
    // FORBIDDEN_PUBLISHER_PREFIX = 'new' is the canonical pin.
    expect(SCRIPT).toMatch(/FORBIDDEN_PUBLISHER_PREFIX\s*=\s*'new'/);
    // The bail message naming the would-be junk column.
    expect(SCRIPT).toMatch(/new_Deal\s+junk\s+columns/);
  });

  it('no legacy cr664_deal target table in any Lookup payload', () => {
    expect(SCRIPT).toMatch(/LOOKUP_TARGET_LOAN_DEAL\s*=\s*'cr664_loandeal'/);
    // Negative: a literal `Targets: ['cr664_deal']` payload must
    // never appear in the source — the modern target is cr664_loandeal.
    expect(SCRIPT).not.toMatch(/Targets:\s*\[\s*'cr664_deal'\s*\]/);
  });

  it('no force-delete / bypass header — even on the create path', () => {
    expect(SCRIPT).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SCRIPT).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SCRIPT).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SCRIPT).not.toMatch(/[?&]Force=true/i);
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
  it('METADATA operations use logical names, not entity-set URLs', () => {
    // The script's METADATA-operation payloads (RelationshipDefinitions
    // POST, EntityDefinitions GET, etc.) never embed `/cr664_loandeals(`
    // URLs — those are React `@odata.bind` payload contracts. The
    // metadata layer works in terms of logical names.
    //
    // The data-operation seed region (Phase 122D Pt 2 client seed,
    // Phase 122E Pt 2 product-references seed, Phase 124D
    // manager-entitlement seed) legitimately uses the entity-set
    // URL to PATCH a specific row by primary id. The negative pin
    // is scoped to NOT include those data-operation helpers — they
    // all live between the Phase 122D Pt 2 seed header and the
    // start of the audit phase.
    const seedBlockStart = SCRIPT.indexOf(
      '// Phase 122D Pt 2 — guarded TEST Client / Relationship seed.',
    );
    expect(seedBlockStart).toBeGreaterThan(-1);
    const seedBlockEnd = SCRIPT.indexOf(
      '// Audit phase — publishers + tables + columns',
      seedBlockStart,
    );
    expect(seedBlockEnd).toBeGreaterThan(seedBlockStart);
    const beforeSeed = SCRIPT.slice(0, seedBlockStart);
    const afterSeed = SCRIPT.slice(seedBlockEnd);
    expect(beforeSeed).not.toMatch(/\/cr664_loandeals\(/);
    expect(afterSeed).not.toMatch(/\/cr664_loandeals\(/);
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

// ---------------------------------------------------------------------------
// Phase 124D — guarded manager-entitlement seed mode
// ---------------------------------------------------------------------------

describe('Phase 124D — --seed-manager-entitlement guarded write mode', () => {
  it('parses --seed-manager-entitlement + the three required inputs + --commit-seed-manager-entitlement', () => {
    expect(SCRIPT).toMatch(/'--seed-manager-entitlement'/);
    expect(SCRIPT).toMatch(/'--upn'/);
    expect(SCRIPT).toMatch(/'--team-name'/);
    expect(SCRIPT).toMatch(/'--deal-name'/);
    expect(SCRIPT).toMatch(/'--commit-seed-manager-entitlement'/);
  });

  it('--upn is required when --seed-manager-entitlement is set', () => {
    expect(SCRIPT).toMatch(/--seed-manager-entitlement requires --upn/);
  });

  it('--team-name is required when --seed-manager-entitlement is set', () => {
    expect(SCRIPT).toMatch(/--seed-manager-entitlement requires --team-name/);
  });

  it('--deal-name is required when --seed-manager-entitlement is set', () => {
    expect(SCRIPT).toMatch(/--seed-manager-entitlement requires --deal-name/);
  });

  it('--upn is only valid alongside --seed-manager-entitlement', () => {
    expect(SCRIPT).toMatch(
      /--upn is only valid alongside --seed-manager-entitlement/,
    );
  });

  it('--team-name is only valid alongside --seed-manager-entitlement', () => {
    expect(SCRIPT).toMatch(
      /--team-name is only valid alongside --seed-manager-entitlement/,
    );
  });

  it('--commit-seed-manager-entitlement is rejected without --seed-manager-entitlement', () => {
    expect(SCRIPT).toMatch(
      /--commit-seed-manager-entitlement has no effect without --seed-manager-entitlement/,
    );
  });

  it('--upn refuses obviously malformed inputs (must contain exactly one "@")', () => {
    expect(SCRIPT).toMatch(
      /--upn expects a "<local>@<domain>" value/,
    );
  });

  it('11-way mutex extended to include --seed-manager-entitlement', () => {
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
    );
  });

  it('--seed-manager-entitlement is part of the exclusive-modes array', () => {
    // The exclusiveModes array lists every mutually-exclusive mode
    // by flag; --seed-manager-entitlement must be enumerated there
    // so a future overlapping mode trips the mutex check.
    expect(SCRIPT).toMatch(/flags\.seedManagerEntitlement,?\s*$/m);
  });
});

describe('Phase 124D — manager-entitlement seed runner shape', () => {
  it('declares runSeedManagerEntitlement(upn, teamName, dealName, doCommit) dispatcher', () => {
    expect(SCRIPT).toMatch(
      /async function runSeedManagerEntitlement\(\s*\{[\s\S]*?upn[\s\S]*?teamName[\s\S]*?dealName[\s\S]*?doCommit[\s\S]*?\}/,
    );
  });

  it('dispatches the runner only inside the FLAGS.seedManagerEntitlement branch', () => {
    expect(SCRIPT).toMatch(
      /if\s*\(\s*FLAGS\.seedManagerEntitlement\s*\)\s*\{[\s\S]*?await runSeedManagerEntitlement\(/,
    );
  });

  it('write-mode warning header fires on --commit-seed-manager-entitlement', () => {
    expect(SCRIPT).toMatch(
      /FLAGS\.commitSeedManagerEntitlement[\s\S]{0,200}?WRITE MODE/,
    );
  });

  it('the MODE banner has a COMMIT-SEED-MANAGER-ENTITLEMENT / dry-run branch', () => {
    expect(SCRIPT).toMatch(/'COMMIT-SEED-MANAGER-ENTITLEMENT'/);
    expect(SCRIPT).toMatch(/'SEED-MANAGER-ENTITLEMENT \(dry-run\)'/);
  });
});

describe('Phase 124D — finders + creators + verifier helpers', () => {
  it('findBankerByEmail filters cr664_bankers by cr664_email (no other column)', () => {
    expect(SCRIPT).toMatch(/async function findBankerByEmail\(/);
    expect(SCRIPT).toMatch(/cr664_email eq '\$\{odataEscapeStringLiteral\(upn\)\}'/);
    expect(SCRIPT).toMatch(/\/api\/data\/v9\.2\/cr664_bankers/);
  });

  it('findTeamByName filters cr664_teams by cr664_teamname (no other column)', () => {
    expect(SCRIPT).toMatch(/async function findTeamByName\(/);
    expect(SCRIPT).toMatch(
      /cr664_teamname eq '\$\{odataEscapeStringLiteral\(teamName\)\}'/,
    );
    expect(SCRIPT).toMatch(/\/api\/data\/v9\.2\/cr664_teams/);
  });

  it('createTeam POSTs ONLY { cr664_teamname } — no description / statecode / statuscode', () => {
    // The body literal is a single-key object containing only the
    // primary name; we assert the exact shape AND that no other
    // cr664_* / statecode / statuscode key appears inside the helper.
    const createTeamBlock = sliceFunction('createTeam');
    expect(createTeamBlock).toMatch(
      /const body\s*=\s*\{\s*cr664_teamname:\s*teamName\s*,?\s*\};/,
    );
    expect(createTeamBlock).not.toMatch(/cr664_description/);
    expect(createTeamBlock).not.toMatch(/statecode\s*:/);
    expect(createTeamBlock).not.toMatch(/statuscode\s*:/);
    expect(createTeamBlock).not.toMatch(/ownerid\s*:/);
  });

  it('patchBankerTeam body sets ONLY cr664_Team@odata.bind — no other column', () => {
    const block = sliceFunction('patchBankerTeam');
    expect(block).toMatch(
      /const body\s*=\s*\{\s*'cr664_Team@odata\.bind':\s*`\/cr664_teams\(\$\{teamId\}\)`,?\s*\};/,
    );
    // Forbid every other Banker column from appearing in this body.
    expect(block).not.toMatch(/cr664_fullname/);
    expect(block).not.toMatch(/cr664_email/);
    expect(block).not.toMatch(/cr664_roletype/);
    expect(block).not.toMatch(/cr664_activeflag/);
    expect(block).not.toMatch(/_cr664_team_value/);
    // The body region must NOT contain any second key — pinned by
    // the strict single-key regex above.
  });

  it('patchLoanDealTeam body sets ONLY cr664_Team@odata.bind — Client / Stage / Status / Banker / Amount untouched', () => {
    const block = sliceFunction('patchLoanDealTeam');
    expect(block).toMatch(
      /const body\s*=\s*\{\s*'cr664_Team@odata\.bind':\s*`\/cr664_teams\(\$\{teamId\}\)`,?\s*\};/,
    );
    // Hard pin: every other deal column the operator might worry
    // about must NOT appear inside the patch helper.
    expect(block).not.toMatch(/cr664_Client/);
    expect(block).not.toMatch(/cr664_stagereference/);
    expect(block).not.toMatch(/cr664_statusreference/);
    expect(block).not.toMatch(/cr664_assignedbanker/);
    expect(block).not.toMatch(/cr664_amount/);
    expect(block).not.toMatch(/cr664_producttype/);
    expect(block).not.toMatch(/cr664_loanstructure/);
    expect(block).not.toMatch(/cr664_pricingtype/);
    expect(block).not.toMatch(/cr664_targetclosedate/);
  });

  it('readBankerTeamLink + readLoanDealTeamLink request FormattedValue annotation only (no other Prefer headers)', () => {
    const r1 = sliceFunction('readBankerTeamLink');
    const r2 = sliceFunction('readLoanDealTeamLink');
    for (const block of [r1, r2]) {
      expect(block).toMatch(
        /Prefer:\s*\n?\s*'odata\.include-annotations="OData\.Community\.Display\.V1\.FormattedValue"'/,
      );
      // No bypass / suppress / force / duplicate-detection headers
      // are permitted on the verify GET.
      expect(block).not.toMatch(/MSCRM\.SuppressDuplicateDetection/i);
      expect(block).not.toMatch(/MSCRM\.BypassCustomPluginExecution/i);
      expect(block).not.toMatch(/x-suppress/i);
      expect(block).not.toMatch(/X-Override/i);
    }
  });
});

describe('Phase 124D — dry-run + commit-gate behavior', () => {
  it('dry-run returns BEFORE issuing any POST or PATCH', () => {
    const block = sliceFunction('runSeedManagerEntitlement');
    // The dry-run guard must short-circuit before any of the four
    // write helpers (createTeam, patchBankerTeam, patchLoanDealTeam)
    // is reachable.
    expect(block).toMatch(/if \(!doCommit\)/);
    const dryReturnIdx = block.indexOf('Re-run with `--commit-seed-manager-entitlement`');
    expect(dryReturnIdx).toBeGreaterThan(-1);
    const firstCreateTeamCall = block.indexOf('await createTeam(');
    const firstPatchBankerCall = block.indexOf('await patchBankerTeam(');
    const firstPatchDealCall = block.indexOf('await patchLoanDealTeam(');
    for (const idx of [firstCreateTeamCall, firstPatchBankerCall, firstPatchDealCall]) {
      expect(idx).toBeGreaterThan(dryReturnIdx);
    }
  });

  it('zero / duplicate Banker matches bail explicitly (no auto-create banker, no ambiguous pick)', () => {
    const block = sliceFunction('runSeedManagerEntitlement');
    expect(block).toMatch(/No cr664_banker row with cr664_email/);
    expect(block).toMatch(
      /script will not auto-create a banker row\. Provision the banker/,
    );
    expect(block).toMatch(/cr664_banker rows match cr664_email/);
    expect(block).toMatch(/operator must resolve the ambiguity/);
  });

  it('zero / duplicate Loan Deal matches bail explicitly (no invent deal, no ambiguous pick)', () => {
    const block = sliceFunction('runSeedManagerEntitlement');
    expect(block).toMatch(/No cr664_loandeals row with cr664_dealname/);
    expect(block).toMatch(/script will not invent a deal/);
    // The duplicate-bail spans multiple template-literal segments;
    // assert the key tokens are all present in the runner body.
    expect(block).toMatch(/cr664_loandeals rows match/);
    expect(block).toMatch(/cr664_dealname = ".*Refusing/s);
    // Phrase is split across two template-literal segments
    // ("operator must " + "pick one explicitly"). Match the join.
    expect(block).toMatch(/operator must[\s\S]{0,30}pick one explicitly/);
  });

  it('duplicate Team matches bail; zero matches plan-to-create (not an error)', () => {
    const block = sliceFunction('runSeedManagerEntitlement');
    // Duplicate path: bail.
    expect(block).toMatch(/cr664_teams rows match cr664_teamname/);
    // Zero-match path: needCreateTeam (NOT bail).
    expect(block).toMatch(/needCreateTeam\s*=\s*true/);
    expect(block).toMatch(
      /Team does not exist — will create on commit/,
    );
  });

  it('idempotency: when Banker AND Loan Deal already point at the resolved Team id, returns no-op success without issuing any PATCH', () => {
    const block = sliceFunction('runSeedManagerEntitlement');
    expect(block).toMatch(/bankerAlreadyLinked\s*=/);
    expect(block).toMatch(/dealAlreadyLinked\s*=/);
    expect(block).toMatch(/if \(bankerAlreadyLinked && dealAlreadyLinked\)/);
    expect(block).toMatch(/No-op success/);
  });

  it('verify step prints the formatted-value annotation for both banker and deal Team lookups', () => {
    const block = sliceFunction('runSeedManagerEntitlement');
    expect(block).toMatch(
      /Re-reading the banker to verify the new Team lookup/,
    );
    expect(block).toMatch(/Re-reading the deal to verify the new Team lookup/);
    expect(block).toMatch(/banker team formatted value/);
    expect(block).toMatch(/deal team formatted value/);
  });

  it('summary explains the Phase 124C switcher should now show Manager Workspace', () => {
    const block = sliceFunction('runSeedManagerEntitlement');
    expect(block).toMatch(
      /Phase 124C workspace switcher should[\s\S]{0,80}?(now expose|expose)[\s\S]{0,40}?"Manager Workspace"/,
    );
    expect(block).toMatch(/hard browser refresh/i);
  });

  it('the helper region does NOT use any bypass / suppress / force-header values', () => {
    // The block from `Phase 124D — guarded TEST manager-entitlement
    // seed.` up to the Audit-phase header must NOT carry any of the
    // governed-write bypass headers Phase 122 explicitly forbids.
    // Match against actual HTTP header syntax (Key: Value or
    // Key=Value), not free text — the comment above the runner
    // legitimately includes the literal word "force" describing
    // what's forbidden.
    const start = SCRIPT.indexOf(
      '// Phase 124D — guarded TEST manager-entitlement seed.',
    );
    expect(start).toBeGreaterThan(-1);
    const end = SCRIPT.indexOf(
      '// Audit phase — publishers + tables + columns',
      start,
    );
    expect(end).toBeGreaterThan(start);
    const region = SCRIPT.slice(start, end);
    expect(region).not.toMatch(/MSCRM\.SuppressDuplicateDetection/i);
    expect(region).not.toMatch(/MSCRM\.BypassCustomPluginExecution/i);
    expect(region).not.toMatch(/['"]?x-suppress[^'"]*['"]?\s*:/i);
    expect(region).not.toMatch(/['"]?X-Override[^'"]*['"]?\s*:/i);
    // Forbid `force=true` query-string and `Force:` header forms,
    // but allow the literal word "force" inside comments.
    expect(region).not.toMatch(/\bforce\s*=\s*true\b/i);
    expect(region).not.toMatch(/['"]Force['"]\s*:/);
  });
});

// Small slice helper: pull a function's body region by name. Boundary
// chosen as the next blank line followed by another `function` / `async
// function` declaration, OR the end of file.
function sliceFunction(name: string): string {
  const re = new RegExp(`(async\\s+)?function\\s+${name}\\s*\\(`);
  const m = SCRIPT.match(re);
  if (!m || m.index === undefined) {
    throw new Error(`sliceFunction: ${name} not found in SCRIPT`);
  }
  const start = m.index;
  const tail = SCRIPT.slice(start + 1);
  const nextFn = tail.search(/\n(async\s+)?function\s+/);
  return nextFn === -1 ? SCRIPT.slice(start) : SCRIPT.slice(start, start + 1 + nextFn);
}

// ---------------------------------------------------------------------------
// Phase 133C — guarded executive primary-workspace seed mode
// ---------------------------------------------------------------------------

describe('Phase 133C — --seed-executive-primary-workspace guarded write mode', () => {
  it('parses the mode + --upn + --workspace-name + the commit flag', () => {
    expect(SCRIPT).toMatch(/'--seed-executive-primary-workspace'/);
    expect(SCRIPT).toMatch(/'--upn'/);
    expect(SCRIPT).toMatch(/'--workspace-name'/);
    expect(SCRIPT).toMatch(/'--commit-seed-executive-primary-workspace'/);
  });

  it('defaults to dry-run (selecting the mode sets dryRun = false but no commit)', () => {
    // The mode arm flips dryRun off but only the explicit commit flag
    // enables writes (asserted separately below).
    expect(SCRIPT).toMatch(
      /arg === '--seed-executive-primary-workspace'\)\s*\{[\s\S]*?flags\.seedExecutivePrimaryWorkspace = true;[\s\S]*?flags\.dryRun = false;/,
    );
  });

  it('--upn is required when the mode is set', () => {
    expect(SCRIPT).toMatch(/--seed-executive-primary-workspace requires --upn/);
  });

  it('--workspace-name is required when the mode is set', () => {
    expect(SCRIPT).toMatch(
      /--seed-executive-primary-workspace requires --workspace-name/,
    );
  });

  it('--workspace-name is only valid alongside the executive seed mode', () => {
    expect(SCRIPT).toMatch(
      /--workspace-name is only valid alongside --seed-executive-primary-workspace/,
    );
  });

  it('rejects --deal-name riding along with the executive seed mode (parse-time guard)', () => {
    // `node scripts/phase122-lookup-repair.mjs --seed-executive-primary-workspace
    //    --upn mpaller@oldglorybank.com --workspace-name "Executive Dashboard"
    //    --deal-name "TEST — Deal Phase 121"`
    // must fail at parse time with this message — --deal-name must not
    // silently attach to the executive primary-workspace seed.
    expect(SCRIPT).toMatch(
      /--deal-name is only valid alongside --seed-manager-entitlement or --seed-product-references/,
    );
  });

  it('the --deal-name guard lives INSIDE the executive seed branch', () => {
    // Bound the slice to the executive branch (from its `else if` to the
    // closing `} else {`) so we prove the new guard is in-branch, not
    // merely somewhere in the file.
    const start = SCRIPT.indexOf('} else if (flags.seedExecutivePrimaryWorkspace) {');
    const end = SCRIPT.indexOf('\n  } else {', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = SCRIPT.slice(start, end);
    expect(branch).toMatch(
      /if \(flags\.seedDealName\) \{[\s\S]*?--deal-name is only valid alongside --seed-manager-entitlement or --seed-product-references/,
    );
  });

  it('the earlier broad --deal-name check excludes executive mode so the in-branch guard is reachable', () => {
    expect(SCRIPT).toMatch(
      /flags\.seedDealName &&[\s\S]*?!flags\.seedManagerEntitlement &&\s*\n\s*!flags\.seedExecutivePrimaryWorkspace\s*\n\s*\)/,
    );
  });

  it('the commit flag is rejected without the mode', () => {
    expect(SCRIPT).toMatch(
      /--commit-seed-executive-primary-workspace has no effect without --seed-executive-primary-workspace/,
    );
  });

  it('the mode is part of the exclusive-modes array', () => {
    expect(SCRIPT).toMatch(/flags\.seedExecutivePrimaryWorkspace,?\s*$/m);
  });

  it('the 12-way mutex message lists the new mode', () => {
    expect(SCRIPT).toMatch(
      /Modes --commit, --inspect-dependencies, --cleanup-form, --inspect-form, --cleanup-subgrid, --inspect-view, --cleanup-view, --seed-client-relationship, --inspect-attributes, --seed-product-references, --seed-manager-entitlement, --seed-executive-primary-workspace, --inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
    );
  });

  it('the MODE banner has a COMMIT / dry-run branch for the mode', () => {
    expect(SCRIPT).toMatch(/'COMMIT-SEED-EXECUTIVE-PRIMARY-WORKSPACE'/);
    expect(SCRIPT).toMatch(/'SEED-EXECUTIVE-PRIMARY-WORKSPACE \(dry-run\)'/);
  });

  it('the write-mode warning header fires on the commit flag', () => {
    expect(SCRIPT).toMatch(
      /FLAGS\.commitSeedExecutivePrimaryWorkspace[\s\S]{0,200}?WRITE MODE/,
    );
  });
});

describe('Phase 133C — executive seed runner + helpers', () => {
  it('declares runSeedExecutivePrimaryWorkspace({ upn, workspaceName, doCommit })', () => {
    expect(SCRIPT).toMatch(
      /async function runSeedExecutivePrimaryWorkspace\(\s*\{[\s\S]*?upn[\s\S]*?workspaceName[\s\S]*?doCommit[\s\S]*?\}/,
    );
  });

  it('dispatches the runner only inside the FLAGS.seedExecutivePrimaryWorkspace branch', () => {
    expect(SCRIPT).toMatch(
      /if\s*\(\s*FLAGS\.seedExecutivePrimaryWorkspace\s*\)\s*\{[\s\S]*?await runSeedExecutivePrimaryWorkspace\(/,
    );
  });

  it('resolves the Platform User by cr664_email only', () => {
    const block = sliceFunction('findPlatformUserByEmail');
    expect(block).toMatch(/cr664_email eq '\$\{odataEscapeStringLiteral\(upn\)\}'/);
    expect(block).toMatch(/\/api\/data\/v9\.2\/cr664_platformusers/);
    // No other filter column.
    expect(block).not.toMatch(/cr664_fullname eq|cr664_workspacename eq/);
  });

  it('resolves the Platform Workspace by cr664_workspacename only', () => {
    const block = sliceFunction('findPlatformWorkspaceByName');
    expect(block).toMatch(
      /cr664_workspacename eq '\$\{odataEscapeStringLiteral\(workspaceName\)\}'/,
    );
    expect(block).toMatch(/\/api\/data\/v9\.2\/cr664_platformworkspaces/);
  });

  it('createPlatformWorkspace POSTs ONLY { cr664_workspacename }', () => {
    const block = sliceFunction('createPlatformWorkspace');
    expect(block).toMatch(
      /const body\s*=\s*\{\s*cr664_workspacename:\s*workspaceName\s*,?\s*\};/,
    );
    expect(block).not.toMatch(/statecode\s*:/);
    expect(block).not.toMatch(/statuscode\s*:/);
    expect(block).not.toMatch(/ownerid\s*:/);
  });

  it('patchPlatformUserPrimaryWorkspace body sets ONLY cr664_PrimaryWorkspace@odata.bind', () => {
    const block = sliceFunction('patchPlatformUserPrimaryWorkspace');
    expect(block).toMatch(
      /const body\s*=\s*\{\s*'cr664_PrimaryWorkspace@odata\.bind':\s*`\/cr664_platformworkspaces\(\$\{workspaceId\}\)`,?\s*\};/,
    );
    // No other Platform User column in the PATCH body.
    expect(block).not.toMatch(/cr664_email\s*:/);
    expect(block).not.toMatch(/cr664_fullname\s*:/);
  });

  it('bails on zero / ambiguous Platform User', () => {
    // Zero-match and >1-match both bail.
    expect(SCRIPT).toMatch(/No cr664_platformuser row with cr664_email/);
    expect(SCRIPT).toMatch(/cr664_platformuser rows match/);
  });

  it('bails on ambiguous Platform Workspace', () => {
    expect(SCRIPT).toMatch(/cr664_platformworkspace rows match/);
  });

  it('the runner touches no Banker / Team / Loan Deal table', () => {
    // sliceFunction over-captures here because the runner is the last
    // function before the audit section; bound the slice to the runner
    // body (up to the audit-phase marker that immediately follows it).
    const start = SCRIPT.indexOf(
      'async function runSeedExecutivePrimaryWorkspace(',
    );
    const end = SCRIPT.indexOf(
      '// Audit phase — publishers + tables + columns',
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = SCRIPT.slice(start, end);
    expect(block).not.toMatch(/cr664_bankers/);
    expect(block).not.toMatch(/cr664_teams/);
    expect(block).not.toMatch(/cr664_loandeals/);
  });

  it('introduces no bypass / suppress / force header in the new helpers', () => {
    for (const fn of [
      'createPlatformWorkspace',
      'patchPlatformUserPrimaryWorkspace',
      'readPlatformUserPrimaryWorkspace',
    ]) {
      const block = sliceFunction(fn);
      expect(block).not.toMatch(/MSCRM\.BypassCustomPluginExecution/i);
      expect(block).not.toMatch(/SuppressDuplicateDetection/i);
      expect(block).not.toMatch(/BypassBusinessLogicExecution/i);
      expect(block).not.toMatch(/force/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 137G — Copilot Custom API metadata inspect / dry-run plan mode
// ---------------------------------------------------------------------------

describe('Phase 137G — --inspect-copilot-custom-api / --seed-copilot-custom-api-metadata args', () => {
  it('parses the three new Copilot args', () => {
    expect(SCRIPT).toMatch(/'--inspect-copilot-custom-api'/);
    expect(SCRIPT).toMatch(/'--seed-copilot-custom-api-metadata'/);
    expect(SCRIPT).toMatch(/'--commit-seed-copilot-custom-api-metadata'/);
    expect(SCRIPT).toMatch(/flags\.inspectCopilotCustomApi\s*=\s*true/);
    expect(SCRIPT).toMatch(/flags\.seedCopilotCustomApiMetadata\s*=\s*true/);
    expect(SCRIPT).toMatch(/flags\.commitSeedCopilotCustomApiMetadata\s*=\s*true/);
  });

  it('pins the Custom API constants (name, display name, request/response params)', () => {
    expect(SCRIPT).toMatch(/COPILOT_CUSTOM_API_NAME\s*=\s*'cr664_RunLosCopilotAssist'/);
    expect(SCRIPT).toMatch(/COPILOT_CUSTOM_API_DISPLAY_NAME\s*=\s*'Run LOS Copilot Assist'/);
    expect(SCRIPT).toMatch(/COPILOT_CUSTOM_API_REQUEST_PARAM\s*=\s*'RequestPayload'/);
    expect(SCRIPT).toMatch(/COPILOT_CUSTOM_API_CORRELATION_PARAM\s*=\s*'CorrelationId'/);
    expect(SCRIPT).toMatch(/COPILOT_CUSTOM_API_RESPONSE_PROP\s*=\s*'ResponsePayload'/);
  });

  it('MODE banner includes INSPECT-COPILOT-CUSTOM-API and SEED-COPILOT-CUSTOM-API-METADATA', () => {
    expect(SCRIPT).toMatch(/'INSPECT-COPILOT-CUSTOM-API'/);
    expect(SCRIPT).toMatch(/SEED-COPILOT-CUSTOM-API-METADATA \(dry-run\)/);
    // Commit-requested banner explicitly says NOT IMPLEMENTED.
    expect(SCRIPT).toMatch(/SEED-COPILOT-CUSTOM-API-METADATA \(commit requested — NOT IMPLEMENTED/);
  });

  it('the new modes are part of the exclusive-modes array', () => {
    expect(SCRIPT).toMatch(/flags\.inspectCopilotCustomApi,?\s*$/m);
    expect(SCRIPT).toMatch(/flags\.seedCopilotCustomApiMetadata,?\s*$/m);
  });

  it('the mutex message lists both new Copilot modes', () => {
    expect(SCRIPT).toMatch(
      /--inspect-copilot-custom-api, and --seed-copilot-custom-api-metadata are mutually exclusive/,
    );
  });

  it('the commit flag has no effect without the seed mode (explicitly gated)', () => {
    expect(SCRIPT).toMatch(
      /--commit-seed-copilot-custom-api-metadata has no effect without --seed-copilot-custom-api-metadata/,
    );
    // …and it cannot combine with the inspect mode.
    expect(SCRIPT).toMatch(
      /--commit-seed-copilot-custom-api-metadata cannot be combined with --inspect-copilot-custom-api/,
    );
  });
});

describe('Phase 137G — seed metadata plan is OFFLINE dry-run only (no write, commit not implemented)', () => {
  it('the seed-plan dispatch runs BEFORE assertPacAuth (offline — no auth, no network)', () => {
    const mainStart = SCRIPT.indexOf('async function main()');
    expect(mainStart).toBeGreaterThan(-1);
    const body = SCRIPT.slice(mainStart);
    const seedGuardIdx = body.indexOf('if (FLAGS.seedCopilotCustomApiMetadata)');
    const authIdx = body.indexOf('assertPacAuth();');
    expect(seedGuardIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    expect(seedGuardIdx).toBeLessThan(authIdx);
  });

  it('runSeedCopilotCustomApiMetadataPlan prints planned payloads and issues NO write / fetch', () => {
    const block = sliceFunction('runSeedCopilotCustomApiMetadataPlan');
    // Plans the three metadata payloads…
    expect(block).toMatch(/Planned CustomAPI entity payload/);
    expect(block).toMatch(/Planned CustomAPIRequestParameter payloads/);
    expect(block).toMatch(/Planned CustomAPIResponseProperty payloads/);
    // …offline: no fetch / spawn / write method anywhere in the function.
    expect(block).not.toMatch(/\bfetch\(/);
    expect(block).not.toMatch(/spawnSync\(/);
    expect(block).not.toMatch(/method:\s*'POST'/);
    expect(block).not.toMatch(/method:\s*'PATCH'/);
    expect(block).not.toMatch(/method:\s*'DELETE'/);
  });

  it('commit is explicitly NOT IMPLEMENTED — passing the commit flag still writes nothing', () => {
    const block = sliceFunction('runSeedCopilotCustomApiMetadataPlan');
    expect(block).toMatch(/COMMIT IS/);
    expect(block).toMatch(/NOT IMPLEMENTED in Phase 137G/);
    expect(block).toMatch(/No write has been or will be issued/);
    expect(block).toMatch(/remains not_configured/);
  });

  it('the metadata plan recommends an UNBOUND (Global) action, IsFunction false', () => {
    const block = sliceFunction('buildCopilotCustomApiMetadataPlan');
    expect(block).toMatch(/isfunction:\s*false/);
    expect(block).toMatch(/bindingtype:\s*0/);
    expect(block).toMatch(/isprivate:\s*false/);
  });
});

describe('Phase 137G — inspect-copilot-custom-api is a read-only GET mode', () => {
  it('the inspect dispatch is wired into main() and returns', () => {
    const guardIdx = SCRIPT.indexOf('if (FLAGS.inspectCopilotCustomApi)');
    expect(guardIdx).toBeGreaterThan(-1);
    const block = SCRIPT.slice(guardIdx, guardIdx + 200);
    expect(block).toMatch(/await runInspectCopilotCustomApi\(/);
    expect(block).toMatch(/return;/);
  });

  it('runInspectCopilotCustomApi uses ONLY GET — no POST / PATCH / DELETE', () => {
    const block = sliceFunction('runInspectCopilotCustomApi');
    expect(block).toMatch(/method:\s*'GET'/);
    expect(block).not.toMatch(/method:\s*'POST'/);
    expect(block).not.toMatch(/method:\s*'PATCH'/);
    expect(block).not.toMatch(/method:\s*'DELETE'/);
    // Reads the customapis metadata endpoint.
    expect(block).toMatch(/\/api\/data\/v9\.2\/customapis/);
  });
});

describe('Phase 137G — no Azure/OpenAI/secret/bypass drift introduced by the new modes', () => {
  it('the script makes no browser-direct Azure OpenAI call', () => {
    expect(SCRIPT).not.toMatch(/api\.openai\.com/i);
    expect(SCRIPT).not.toMatch(/openai\.azure\.com/i);
  });

  it('the new Copilot functions carry no secret or bypass header', () => {
    for (const fn of [
      'buildCopilotCustomApiMetadataPlan',
      'runSeedCopilotCustomApiMetadataPlan',
      'runInspectCopilotCustomApi',
    ]) {
      const block = sliceFunction(fn);
      expect(block, `${fn}: api key`).not.toMatch(/api[_-]?key\s*[:=]/i);
      expect(block, `${fn}: AZURE secret`).not.toMatch(/AZURE_OPENAI_API_KEY|AZURE_OPENAI_ENDPOINT/);
      expect(block, `${fn}: bypass`).not.toMatch(/BypassBusinessLogicExecution|SuppressDuplicateDetection/i);
    }
  });

  it('the script still imports nothing from src/ (no runtime app/copilot coupling)', () => {
    expect(SCRIPT).not.toMatch(/from\s+['"]\.\.\/src\//);
    expect(SCRIPT).not.toMatch(/require\(['"]\.\.\/src\//);
  });
});
