import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NOT_WIRED } from './platformInventory';
import {
  NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED,
  NEW_DEAL_GOVERNED_CREATE_ADAPTER_WIRED,
} from '../../admin/adminNewDealIntakeModel';

/**
 * Phase 170K — controlled New Deal create smoke contract pins.
 *
 * Static-source guards over scripts/phase122-lookup-repair.mjs. They do NOT
 * run the script, call the Web API, or change app behavior. They pin the
 * safety shape of the new `--smoke-create-new-deal` mode so a future edit
 * that weakens a gate fails CI honestly.
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

// The smoke helpers + run handler, sliced out for scoped negative pins.
const SMOKE_BLOCK = (() => {
  const start = SCRIPT.indexOf('async function resolveActiveSmokeReference');
  const end = SCRIPT.indexOf(
    '// Phase 122D Pt 2 — guarded TEST Client / Relationship seed.',
    start,
  );
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SCRIPT.slice(start, end);
})();

describe('Phase 170K — smoke-create mode is gated and mutexed', () => {
  it('1. smoke-create mode joins the mutually-exclusive mode list', () => {
    expect(SCRIPT).toMatch(/flags\.smokeCreateNewDeal,/);
    expect(SCRIPT).toMatch(/arg === '--smoke-create-new-deal'/);
  });

  it('2. missing --deal-name bails', () => {
    expect(SCRIPT).toMatch(/--smoke-create-new-deal requires --deal-name <text>/);
  });

  it('3. commit flag is required for the create POST', () => {
    // The flag exists, gates the write, and is inert without the mode.
    expect(SCRIPT).toMatch(/arg === '--commit-smoke-create-new-deal'/);
    expect(SCRIPT).toMatch(
      /--commit-smoke-create-new-deal has no effect without --smoke-create-new-deal/,
    );
    // The create handler only POSTs after the dry-run early-return.
    expect(SMOKE_BLOCK).toMatch(/if \(!doCommit\)/);
    const dryReturnIdx = SMOKE_BLOCK.indexOf('Dry-run only — no POST issued');
    const postIdx = SMOKE_BLOCK.indexOf('await createLoanDealSmoke(payload');
    expect(dryReturnIdx).toBeGreaterThan(-1);
    expect(postIdx).toBeGreaterThan(-1);
    expect(dryReturnIdx).toBeLessThan(postIdx);
  });

  it('4. dry-run performs no write (default no commit)', () => {
    expect(SCRIPT).toMatch(/smokeCreateNewDeal:\s*false/);
    expect(SCRIPT).toMatch(/commitSmokeCreateNewDeal:\s*false/);
    // dry-run branch returns planned:true before any POST.
    expect(SMOKE_BLOCK).toMatch(/return \{ ok: true, planned: true \}/);
  });

  it('8. missing / ambiguous assigned banker fails closed', () => {
    expect(SCRIPT).toMatch(
      /--smoke-create-new-deal requires --assigned-banker-upn/,
    );
    expect(SMOKE_BLOCK).toMatch(/No cr664_banker row with cr664_email/);
    expect(SMOKE_BLOCK).toMatch(/cr664_banker rows match cr664_email/);
    expect(SMOKE_BLOCK).toMatch(/fail closed/i);
  });
});

describe('Phase 170K — BUGFIX: --deal-name is valid with --smoke-create-new-deal', () => {
  // The global "--deal-name is only valid alongside ..." guard previously
  // omitted the smoke-create mode, so an operator dry-run bailed at parse
  // time before entering the mode. The guard must now exempt smoke-create
  // WITHOUT loosening it for any unrelated mode.
  const GUARD_BLOCK = (() => {
    const idx = SCRIPT.indexOf('flags.seedDealName &&');
    expect(idx).toBeGreaterThan(-1);
    return SCRIPT.slice(idx, idx + 400);
  })();

  it('the global deal-name guard exempts --smoke-create-new-deal', () => {
    expect(GUARD_BLOCK).toMatch(/!flags\.smokeCreateNewDeal/);
  });

  it('the guard still requires one of the seed modes (not globally allowed)', () => {
    // All the original mode exclusions remain — the guard is narrowed by
    // adding smoke-create, never widened to allow deal-name everywhere.
    expect(GUARD_BLOCK).toMatch(/!flags\.seedClientRelationship/);
    expect(GUARD_BLOCK).toMatch(/!flags\.seedProductReferences/);
    expect(GUARD_BLOCK).toMatch(/!flags\.seedManagerEntitlement/);
    expect(GUARD_BLOCK).toMatch(/!flags\.seedExecutivePrimaryWorkspace/);
  });

  it('the bail message lists --smoke-create-new-deal', () => {
    // Phase 189A appended --inspect-crm-relationship-graph; Phase 188B appended
    // the two read-only document-checklist modes. Phase 188H unions all of them.
    // --smoke-create-new-deal remains a mid-list item, still named — smoke-create
    // stays separate from the document-checklist modes (no auto-run of either).
    expect(SCRIPT).toMatch(
      /--deal-name is only valid alongside --seed-client-relationship, --seed-product-references, --seed-manager-entitlement, --smoke-create-new-deal, --inspect-crm-relationship-graph, --inspect-document-checklist-graph, or --plan-document-checklist-generation/,
    );
  });

  it('unrelated workspace modes still reject --deal-name (guard not loosened)', () => {
    // The executive / primary-workspace branches keep their explicit
    // deal-name rejection so deal-name cannot silently attach to them.
    const rejections = SCRIPT.match(
      /--deal-name is only valid alongside --seed-manager-entitlement or --seed-product-references/g,
    );
    expect(rejections && rejections.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase 170K — Stage/Status resolved by code, fail-closed, no GUID', () => {
  it('5. Stage/Status are resolved by active CODE, never a hardcoded GUID', () => {
    expect(SCRIPT).toMatch(/SMOKE_NEW_DEAL_STAGE_CODE\s*=\s*'PHASE121_STAGE'/);
    expect(SCRIPT).toMatch(/SMOKE_NEW_DEAL_STATUS_CODE\s*=\s*'PHASE121_STATUS'/);
    expect(SMOKE_BLOCK).toMatch(/cr664_code eq '\$\{odataEscapeStringLiteral\(code\)\}'/);
    // No Dataverse record GUID anywhere in the smoke block.
    expect(SMOKE_BLOCK).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });

  it('7. zero / multiple / inactive Stage or Status fails closed', () => {
    expect(SMOKE_BLOCK).toMatch(/kind: 'missing'/);
    expect(SMOKE_BLOCK).toMatch(/kind: 'duplicate'/);
    expect(SMOKE_BLOCK).toMatch(/kind: 'inactive'/);
    expect(SMOKE_BLOCK).toMatch(/kind: 'serviceError'/);
    expect(SMOKE_BLOCK).toMatch(/cr664_activeflag !== true/);
    expect(SMOKE_BLOCK).toMatch(/function bailOnUnresolvedSmokeReference/);
  });
});

describe('Phase 170K — POST body discipline', () => {
  it('6. POST body is restricted to an allow-list of fields', () => {
    expect(SCRIPT).toMatch(/SMOKE_NEW_DEAL_ALLOWED_FIELDS\s*=\s*Object\.freeze\(\[/);
    for (const f of [
      'cr664_dealname',
      'cr664_StageReference@odata.bind',
      'cr664_StatusReference@odata.bind',
      'cr664_AssignedBanker@odata.bind',
      'cr664_stageentrydate',
      'cr664_amount',
      'cr664_Client@odata.bind',
    ]) {
      expect(SCRIPT).toMatch(new RegExp(`'${f.replace(/[.@]/g, '\\$&')}'`));
    }
    // The create helper refuses any key outside the allow-list.
    expect(SMOKE_BLOCK).toMatch(/payload contains disallowed field\(s\)/);
    expect(SMOKE_BLOCK).toMatch(/SMOKE_NEW_DEAL_ALLOWED_FIELDS\.includes/);
  });

  it('never sets ownerid / statecode (Dataverse defaults them)', () => {
    const post = SMOKE_BLOCK.slice(
      SMOKE_BLOCK.indexOf('const payload = {'),
      SMOKE_BLOCK.indexOf('// Masked plan'),
    );
    expect(post).not.toMatch(/ownerid|owneridtype|statecode|statuscode/);
  });

  it('the created deal name is unmistakably a TEST smoke record', () => {
    expect(SCRIPT).toMatch(/SMOKE_NEW_DEAL_NAME_PREFIX\s*=\s*'\[SMOKE TEST - PHASE 170K[^']*'/);
    expect(SMOKE_BLOCK).toMatch(/\$\{SMOKE_NEW_DEAL_NAME_PREFIX\}\$\{dealName\}/);
  });

  it('dry-run masks resolved record IDs in the printed plan', () => {
    expect(SMOKE_BLOCK).toMatch(/IDs masked/);
    expect(SMOKE_BLOCK).toMatch(/<resolved active \$\{SMOKE_NEW_DEAL_STAGE_CODE\} id>/);
    expect(SMOKE_BLOCK).toMatch(/<resolved banker id>/);
  });
});

describe('Phase 170K — verify, audit honesty, rollback', () => {
  it('verifies by re-reading the created deal with formatted values', () => {
    expect(SMOKE_BLOCK).toMatch(/Re-reading the created deal to verify/);
    expect(SMOKE_BLOCK).toMatch(/_cr664_stagereference_value/);
    expect(SMOKE_BLOCK).toMatch(/_cr664_statusreference_value/);
    expect(SMOKE_BLOCK).toMatch(/_cr664_assignedbanker_value/);
    expect(SMOKE_BLOCK).toMatch(/FormattedValue/);
  });

  it('documents the audit gap honestly (does not fabricate an audit row)', () => {
    expect(SMOKE_BLOCK).toMatch(/no governed cr664_auditevent row is written/i);
    expect(SMOKE_BLOCK).not.toMatch(/POST[\s\S]{0,40}cr664_auditevents/);
  });

  it('does not auto-delete; prints a manual rollback command', () => {
    expect(SMOKE_BLOCK).toMatch(/does NOT auto-delete/);
    expect(SMOKE_BLOCK).toMatch(/DELETE \/api\/data\/v9\.2\/cr664_loandeals\(\$\{dealId\}\)/);
    // No DELETE is ever issued by the smoke mode itself.
    expect(SMOKE_BLOCK).not.toMatch(/method:\s*'DELETE'/);
  });
});

describe('Phase 170K — no scope creep', () => {
  it('11. touches no Advance Stage / stage-progression logic (names it only as a separate blocker)', () => {
    // The block MAY name Advance Stage to state it is a separate concern; it
    // must not write to any stage-progression / history table, nor bind the
    // progression stage-reference table (cr664_stagereferences, distinct from
    // the New Deal cr664_dealstagereferences).
    expect(SMOKE_BLOCK).not.toMatch(/stagehistory/i);
    expect(SMOKE_BLOCK).not.toMatch(/cr664_stagereferences\b/i);
    expect(SMOKE_BLOCK).toMatch(/Separate from Advance Stage|stage-progression/i);
  });

  it('12. performs no CRM / portfolio writes and creates no client/borrower row', () => {
    expect(SMOKE_BLOCK).not.toMatch(/createClientRelationship\(/);
    expect(SMOKE_BLOCK).not.toMatch(/cr664_organization|cr664_person|cr664_portfolio|crmpersist/i);
    expect(SMOKE_BLOCK).toMatch(/EXISTING client only and never/i);
  });

  it('13. uses no Graph / external HTTP (only the pinned Dataverse env URL)', () => {
    expect(SMOKE_BLOCK).not.toMatch(/graph\.microsoft\.com/i);
    expect(SMOKE_BLOCK).not.toMatch(/https?:\/\//);
    // All fetches build on the script's resolved envUrl.
    expect(SMOKE_BLOCK).toMatch(/\$\{envUrl\}\/api\/data\/v9\.2\//);
  });

  it('9. + New Deal create stays disabled in the app truth model', () => {
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_GOVERNED_CREATE_ADAPTER_WIRED).toBe(false);
  });

  it('10. the redundant public/admin path is absent from current NOT_WIRED', () => {
    expect(NOT_WIRED.some((e) => e.id === 'new-deal-create')).toBe(false);
  });
});
