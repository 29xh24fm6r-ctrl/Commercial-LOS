import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('M365-A7 production certification system', () => {
  const lanes = [
    'OUTLOOK_EMAIL',
    'OUTLOOK_CALENDAR_READ',
    'OUTLOOK_AVAILABILITY',
    'OUTLOOK_CALENDAR_WRITE',
    'TEAMS_MEETING',
    'TEAMS_APP',
    'TEAMS_CHANNEL_POST',
    'OVERALL',
  ];

  it('ships the single production activation runbook with controlled order and rollback', () => {
    const runbook = read('docs/governance/M365_CALENDAR_TEAMS_PRODUCTION_ACTIVATION_RUNBOOK_2026-07-28.md');
    expect(runbook).toMatch(/PREDEPLOYMENT/);
    expect(runbook).toMatch(/DEPLOYMENT/);
    expect(runbook).toMatch(/pac code push/);
    for (const phrase of [
      'Outlook Calendar read-only',
      'Outlook availability',
      'Outlook Calendar write',
      'Teams meeting creation',
      'Teams app installation',
      'Teams channel posting',
      'Rollback',
      'Evidence file',
    ]) {
      expect(runbook).toContain(phrase);
    }
  });

  it('ships a read-only certification harness with every lane verdict', () => {
    const script = read('scripts/activation/run-m365-calendar-teams-production-certification.ps1');
    for (const lane of lanes) {
      expect(script).toContain(lane);
    }
    for (const verifier of [
      'verify-outlook-connector.ps1',
      'verify-outlook-calendar-connector.ps1',
      'verify-microsoft365-integration.ps1',
      'verify-teams-channel-posting-boundary.ps1',
      'verify-teams-channel-posting-transport.ps1',
      'build-teams-package.ps1',
      'verify-m365-calendar-teams-full-arc.ps1',
    ]) {
      expect(script).toContain(verifier);
    }
    expect(script).not.toMatch(/^\s*pac code push\b/mi);
    expect(script).not.toMatch(/^\s*(Invoke-RestMethod|Invoke-WebRequest)\b/mi);
    expect(script).not.toMatch(/^\s*(SendEmailV2|CalendarPostItem)\b/mi);
  });

  it('requires all lanes PASS for GO and marks any BLOCKED lane NO_GO', () => {
    const script = read('scripts/activation/run-m365-calendar-teams-production-certification.ps1');
    expect(script).toMatch(/\$overall = 'NO_GO'/);
    expect(script).toMatch(/\$overall = 'GO'/);
    expect(script).toMatch(/Where-Object \{ \$_ -eq 'BLOCKED' \}/);
    expect(script).toMatch(/Where-Object \{ \$_ -ne 'PASS' \}/);
  });

  it('ships evidence register and final GO/NO-GO document without pre-filled PASS', () => {
    const register = read('docs/operator-evidence/m365-calendar-teams/PRODUCTION_CERTIFICATION_REGISTER.md');
    const finalDecision = read('docs/governance/M365_CALENDAR_TEAMS_FINAL_GO_NO_GO_2026-07-28.md');
    for (const lane of lanes) {
      expect(`${register}\n${finalDecision}`).toContain(lane);
    }
    const evidenceDir = resolve(REPO_ROOT, 'docs/operator-evidence/m365-calendar-teams');
    for (const file of readdirSync(evidenceDir).filter((name) => name.endsWith('.md'))) {
      const body = read(`docs/operator-evidence/m365-calendar-teams/${file}`);
      expect(body).not.toMatch(/^\s*-\s*Verdict[^\r\n:]*:\s*PASS\s*$/mi);
    }
  });
});
