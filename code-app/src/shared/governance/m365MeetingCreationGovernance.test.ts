import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function stripComments(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('M365-3 governed meeting creation boundary', () => {
  it('write gates default false and are separate', () => {
    const src = read('src/calendar/meetingProposalFeatureFlags.ts');
    expect(src).toMatch(/VITE_OUTLOOK_CALENDAR_WRITE_ENABLED/);
    expect(src).toMatch(/VITE_TEAMS_MEETING_CREATION_ENABLED/);
    expect(src).toMatch(/=== 'true'/);
  });

  it('proposal fields include policy, provenance, correlation, attendees, timezone, and Teams request flag', () => {
    const src = read('src/calendar/meetingProposalWorkflow.ts');
    for (const field of [
      'dealId',
      'subject',
      'purpose',
      'start',
      'end',
      'timezone',
      'requiredAttendees',
      'optionalAttendees',
      'bodyPreview',
      'teamsMeetingRequested',
      'source',
      'policyVersion',
      'correlationId',
    ]) {
      expect(src).toContain(field);
    }
  });

  it('calendar write code has no direct Graph/fetch/generated service call', () => {
    for (const rel of [
      'src/calendar/meetingProposalFeatureFlags.ts',
      'src/calendar/meetingProposalWorkflow.ts',
      'src/calendar/meetingCreationAdapter.ts',
      'src/calendar/MeetingProposalControl.tsx',
    ]) {
      const src = stripComments(read(rel));
      expect(src, rel).not.toMatch(/fetch\s*\(/);
      expect(src, rel).not.toMatch(/XMLHttpRequest/);
      expect(src, rel).not.toMatch(/graph\.microsoft|microsoft-graph/i);
      expect(src, rel).not.toMatch(/Office365OutlookService/);
      expect(src, rel).not.toMatch(/CalendarPostItem\s*\(/);
    }
  });

  it('Copilot cannot schedule or confirm meetings', () => {
    const copilot = [
      'src/copilot/copilotConnector.ts',
      'src/copilot/copilotProposalEngine.ts',
      'src/copilot/CopilotAssistPanel.tsx',
    ].map(read).join('\n');
    expect(stripComments(copilot)).not.toMatch(/CalendarPostItem|MeetingProposalControl|Confirm creation request/);
  });

  it('UI distinguishes accepted/unknown retry posture', () => {
    const src = read('src/calendar/MeetingProposalControl.tsx');
    expect(src).toMatch(/Confirm creation request/);
    expect(src).toMatch(/No retry after an accepted or unknown outcome without reconciliation/);
    expect(src).toMatch(/Prepare meeting proposal/);
  });
});
