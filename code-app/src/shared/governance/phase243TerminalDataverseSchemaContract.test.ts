import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PORTFOLIO_BOARDING_TARGET_TABLES } from '../../portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan';

/**
 * Phase 243 — terminal Dataverse schema creation governance.
 *
 * Proves the scripts default to dry-run, gate mutation behind -Apply, never
 * delete/overwrite, never flip flags / send email / `pac code push`, use internal
 * OGB naming only (no nCino/Salesforce tables), and that the schema table lists
 * match the Phase 242B verifier (CRM) and the portfolio schema plan exactly.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const DV = resolve(here(), '..', 'scripts', 'dataverse');
const SCHEMA = resolve(DV, 'schema');

const readJson = (name: string) => JSON.parse(readFileSync(resolve(SCHEMA, name), 'utf8'));
// Strip PowerShell comments (<# #> blocks and # line comments) so disclaimers in
// comments aren't mistaken for executable forbidden operations.
function stripPsComments(src: string): string {
  return src.replace(/<#[\s\S]*?#>/g, ' ').replace(/#.*$/gm, ' ');
}
const ps1Files = () => readdirSync(DV).filter((f) => f.endsWith('.ps1'));
const code = (name: string) => stripPsComments(readFileSync(resolve(DV, name), 'utf8'));

describe('pack is present', () => {
  it('schema files + required scripts exist', () => {
    for (const f of ['crm-spine.schema.json', 'portfolio-boarding.schema.json']) {
      expect(existsSync(resolve(SCHEMA, f)), f).toBe(true);
    }
    for (const s of ['create-crm-spine.ps1', 'create-portfolio-boarding.ps1', 'publish-customizations.ps1', 'regenerate-powerapps-sdk.ps1', 'verify-full-schema.ps1', 'run-full-activation-verification.ps1']) {
      expect(existsSync(resolve(DV, s)), s).toBe(true);
    }
  });

  it('no loan-workflow schema/script was created (stage sinks PASS — not needed)', () => {
    expect(existsSync(resolve(SCHEMA, 'loan-workflow.schema.json'))).toBe(false);
    expect(existsSync(resolve(DV, 'create-loan-workflow.ps1'))).toBe(false);
  });
});

describe('every script is safe (comments stripped)', () => {
  it('no pac code push, no email send, no flag flip, no delete/overwrite metadata', () => {
    for (const f of ps1Files()) {
      const c = code(f);
      expect(c, f).not.toMatch(/pac\s+code\s+push/i);
      expect(c, f).not.toMatch(/SendEmailV2|\bsendEmail\b/);
      expect(c, f).not.toMatch(/[A-Za-z0-9_]+_ENABLED\s*=/);
      // No metadata delete / destructive verbs.
      expect(c, f).not.toMatch(/-Method\s+Delete/i);
      expect(c, f).not.toMatch(/\b(DeleteEntity|DeleteAttribute|DeleteRelationship|Remove-Item|Remove-AdtEntity)\b/);
      // Create-missing-only: no PATCH (overwrite) of existing metadata.
      expect(c, f).not.toMatch(/-Method\s+Patch/i);
      // Internal naming only.
      expect(c, f).not.toMatch(/ncino|salesforce/i);
    }
  });

  it('mutating scripts default to dry-run and gate writes behind -Apply', () => {
    for (const f of ['create-crm-spine.ps1', 'create-portfolio-boarding.ps1', 'publish-customizations.ps1', 'regenerate-powerapps-sdk.ps1']) {
      expect(code(f), f).toMatch(/\[switch\]\s*\$Apply/);
    }
    // Every Web API write helper in _common is guarded by an -Apply check before POST.
    const common = code('_common.ps1');
    expect(common).toMatch(/if\s*\(\s*-not\s*\$Apply\s*\)/);
    expect(common).toMatch(/-Method\s+Post/);
    // publish guards its POST behind the dry-run early return.
    expect(code('publish-customizations.ps1')).toMatch(/if\s*\(\s*-not\s*\$Apply\s*\)/);
  });

  it('verification scripts are read-only (no POST)', () => {
    for (const f of ['verify-full-schema.ps1', 'run-full-activation-verification.ps1']) {
      expect(code(f), f).not.toMatch(/-Method\s+Post/i);
    }
  });
});

describe('schema definitions use internal OGB naming and match sources', () => {
  const crm = readJson('crm-spine.schema.json');
  const portfolio = readJson('portfolio-boarding.schema.json');

  it('all table logical names use the cr664_ prefix; none vendor-branded', () => {
    for (const s of [crm, portfolio]) {
      for (const t of s.tables) {
        expect(t.logicalName).toMatch(/^cr664_/);
        expect(`${t.logicalName} ${t.schemaName}`).not.toMatch(/ncino|salesforce/i);
      }
    }
  });

  it('CRM entity-set list matches the Phase 242B verifier expectation', () => {
    const expected = ['cr664_crmorganizations', 'cr664_crmpersons', 'cr664_crmrelationships', 'cr664_crmroleassignments', 'cr664_crmtimelineevents'].sort();
    expect(crm.tables.map((t: { entitySetName: string }) => t.entitySetName).sort()).toEqual(expected);
  });

  it('portfolio table list matches the schema plan exactly', () => {
    const planTables = PORTFOLIO_BOARDING_TARGET_TABLES.map((t) => t.logicalName).sort();
    const jsonTables = portfolio.tables.map((t: { logicalName: string }) => t.logicalName).sort();
    expect(jsonTables).toEqual(planTables);
  });

  it('each schema carries non-destructive rollback guidance', () => {
    for (const s of [crm, portfolio]) {
      expect(s.rollback.posture).toMatch(/create-missing-only/);
      expect(JSON.stringify(s.rollback)).toMatch(/never delete|non-destructive/i);
    }
  });
});
