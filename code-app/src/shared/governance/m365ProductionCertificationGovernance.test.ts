import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function runHarness(args: string[] = []) {
  return execFileSync(
    'powershell',
    ['-NoProfile', '-File', resolve(REPO_ROOT, 'scripts/activation/run-m365-calendar-teams-production-certification.ps1'), '-RepoRoot', REPO_ROOT, ...args],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 180_000 },
  );
}

function withEvidenceRoot(body: string) {
  const root = mkdtempSync(resolve(tmpdir(), 'm365-evidence-'));
  const evidenceDir = resolve(root, 'docs/operator-evidence');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(resolve(evidenceDir, 'OUTLOOK_LIVE_SEND_CERTIFICATION_2026-07-28.md'), body);
  return root;
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
    expect(script).not.toMatch(/Set-Content|Add-Content|Out-File|New-Item|Remove-Item|pac code push|pac connection|pac code add-data-source/i);
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

  it('classifies the existing Outlook certification as PASS and leaves the other six live lanes UNKNOWN', () => {
    const output = runHarness();
    expect(output).toMatch(/OUTLOOK_EMAIL=PASS/);
    expect(output).toMatch(/OUTLOOK_EMAIL_EVIDENCE=.*OUTLOOK_LIVE_SEND_CERTIFICATION_2026-07-28\.md/);
    for (const lane of [
      'OUTLOOK_CALENDAR_READ',
      'OUTLOOK_AVAILABILITY',
      'OUTLOOK_CALENDAR_WRITE',
      'TEAMS_MEETING',
      'TEAMS_APP',
      'TEAMS_CHANNEL_POST',
    ]) {
      expect(output).toMatch(new RegExp(`${lane}=UNKNOWN`));
    }
    expect(output).toMatch(/OVERALL=UNKNOWN/);
    expect(output).toMatch(/STATUS=UNKNOWN/);
  }, 240_000);

  it('reports UNKNOWN when Outlook certification evidence is blank', () => {
    const root = withEvidenceRoot('');
    try {
      const output = runHarness(['-EvidenceRoot', root]);
      expect(output).toMatch(/OUTLOOK_EMAIL=UNKNOWN/);
      expect(output).toMatch(/OVERALL=UNKNOWN/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 240_000);

  it('does not pass malformed Outlook evidence that says PASS but omits required certification facts', () => {
    const root = withEvidenceRoot([
      '# Outlook LIVE send certification evidence — 2026-07-28',
      'Final verdict: CERTIFIED PASS',
      'Connector result: Connector accepted the smoke message.',
    ].join('\n'));
    try {
      const output = runHarness(['-EvidenceRoot', root]);
      expect(output).toMatch(/OUTLOOK_EMAIL=UNKNOWN/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 240_000);

  it('does not treat connector acceptance without inbox confirmation as live Outlook email PASS', () => {
    const root = withEvidenceRoot([
      '# Outlook LIVE send certification evidence — 2026-07-28',
      'This certifies only the internal diagnostic LIVE send path.',
      'Runtime binding observed',
      '"dataSourceType": "Connector"',
      'Connector result: Connector accepted the smoke message.',
      'Final verdict: CERTIFIED PASS',
      'Connector acceptance was treated as transport acceptance only.',
      'It does **not** claim borrower delivery or read receipt.',
    ].join('\n'));
    try {
      const output = runHarness(['-EvidenceRoot', root]);
      expect(output).toMatch(/OUTLOOK_EMAIL=UNKNOWN/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 240_000);
});
