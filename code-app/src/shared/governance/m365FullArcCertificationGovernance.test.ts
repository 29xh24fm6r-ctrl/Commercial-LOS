import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('M365-6 live certification framework', () => {
  it('ships live certification runbook and GO/NO-GO verdict doc', () => {
    expect(read('docs/governance/M365_CALENDAR_TEAMS_LIVE_CERTIFICATION_RUNBOOK_2026-07-28.md')).toMatch(/Lane A - Calendar runtime/);
    const verdict = read('docs/governance/M365_CALENDAR_TEAMS_GO_NO_GO_2026-07-28.md');
    for (const lane of ['OUTLOOK_EMAIL', 'OUTLOOK_CALENDAR_READ', 'OUTLOOK_CALENDAR_WRITE', 'TEAMS_MEETING', 'TEAMS_APP', 'TEAMS_CHANNEL_POST', 'OVERALL']) {
      expect(verdict).toContain(lane);
    }
  });

  it('evidence templates do not pre-populate PASS verdicts', () => {
    const dir = resolve(REPO_ROOT, 'docs/operator-evidence/m365-calendar-teams');
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.md'))) {
      const body = read(`docs/operator-evidence/m365-calendar-teams/${file}`);
      expect(body).not.toMatch(/Verdict.*PASS(?!\|)/i);
    }
  });

  it('full arc verifier reports separate lane verdicts and has no live operation commands', () => {
    const src = read('scripts/activation/verify-m365-calendar-teams-full-arc.ps1');
    for (const lane of ['OUTLOOK_EMAIL', 'OUTLOOK_CALENDAR_READ', 'OUTLOOK_CALENDAR_WRITE', 'TEAMS_MEETING', 'TEAMS_APP', 'TEAMS_CHANNEL_POST', 'OVERALL']) {
      expect(src).toContain(lane);
    }
    expect(src).not.toMatch(/pac code push|Invoke-RestMethod|Invoke-WebRequest|SendEmailV2|CalendarPostItem|Teams Admin Center upload/i);
  });
});
