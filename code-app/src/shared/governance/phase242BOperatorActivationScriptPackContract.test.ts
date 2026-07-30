import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 242B — operator environment activation script pack governance.
 *
 * Proves the activation scripts are READ-ONLY: no Power Platform deploy
 * (`pac code push`), no Outlook send (`SendEmailV2`), no Dataverse
 * create/update/delete mutation, no feature-flag flip, no route enablement, and
 * no repository/file write. This pack flips no live gate.
 *
 * It adds a new contract only; it weakens no existing governance test and reads
 * no Phase 242A / New Deal create file.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const ACTIVATION_DIR = resolve(here(), '..', 'scripts', 'activation');

const SCRIPTS = [
  'verify-crm-schema.ps1',
  'verify-checklist-rules.ps1',
  'verify-outlook-connector.ps1',
  'verify-stage-advancement-sinks.ps1',
  'verify-portfolio-boarding-schema.ps1',
  'collect-activation-evidence.ps1',
];

const readScript = (name: string) => readFileSync(resolve(ACTIVATION_DIR, name), 'utf8');

describe('the pack is present', () => {
  it('all six scripts + the README exist', () => {
    for (const s of SCRIPTS) expect(existsSync(resolve(ACTIVATION_DIR, s)), s).toBe(true);
    expect(existsSync(resolve(ACTIVATION_DIR, 'README.md'))).toBe(true);
  });

  it('the phase doc exists', () => {
    expect(existsSync(resolve(here(), '..', 'docs', 'PHASE_242B_OPERATOR_ENVIRONMENT_ACTIVATION_SCRIPT_PACK.md'))).toBe(true);
  });

  it('the six phase-owned scripts remain the complete governed pack', () => {
    const ps1 = readdirSync(ACTIVATION_DIR).filter((f) => f.endsWith('.ps1'));
    for (const script of SCRIPTS) expect(ps1, script).toContain(script);
    expect(new Set(SCRIPTS).size).toBe(SCRIPTS.length);
  });
});

describe('every script is read-only and flips no live gate', () => {
  for (const name of SCRIPTS) {
    it(`${name} performs no Power Platform deploy / send / mutation / flag flip / route change / file write`, () => {
      const code = readScript(name);

      // No deploy.
      expect(code, name).not.toMatch(/pac\s+code\s+push/i);
      // No Outlook send.
      expect(code, name).not.toMatch(/SendEmailV2|\bsendEmail\b|sendSms/i);
      // No Dataverse data mutation.
      expect(code, name).not.toMatch(/\b(createRecord|updateRecord|deleteRecord|CreateMultiple|UpdateMultiple|DeleteMultiple)\b/);
      // No feature-flag flip (assignment to a *_ENABLED flag).
      expect(code, name).not.toMatch(/[A-Za-z0-9_]*_ENABLED\s*=/);
      // No route enablement.
      expect(code, name).not.toMatch(/\b(addRoute|registerRoute)\b|ROUTE_ENABLED\s*=/);
      // No network calls.
      expect(code, name).not.toMatch(/Invoke-RestMethod|Invoke-WebRequest/i);
      // No file/repo writes (read-only: inspect + print only).
      expect(code, name).not.toMatch(/\b(Set-Content|Add-Content|Out-File|Remove-Item|New-Item|Clear-Content)\b/);
    });
  }

  it('the scripts touch no protected Phase 242A / New Deal create file', () => {
    for (const name of SCRIPTS) {
      const code = readScript(name);
      expect(code, name).not.toMatch(/productionEnvironmentVerification|newDealCreateActivation|newDealCreateFeatureFlags|dealOriginationFeatureFlags|fullActivationLaunchCertificationModel|FullSystemActivationLaunchPanel/);
    }
  });
});
