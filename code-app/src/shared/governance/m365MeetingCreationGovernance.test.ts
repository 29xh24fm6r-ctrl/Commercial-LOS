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
    const canonical = read('src/microsoft365/m365ActivationConfig.ts');
    expect(canonical).toMatch(/VITE_OUTLOOK_CALENDAR_WRITE_ENABLED/);
    expect(canonical).toMatch(/VITE_TEAMS_MEETING_CREATION_ENABLED/);
    expect(src).toMatch(/resolveM365ActivationConfig/);
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

  it('calendar write code has no direct Graph/fetch and generated service use is isolated', () => {
    for (const rel of [
      'src/calendar/meetingProposalFeatureFlags.ts',
      'src/calendar/meetingProposalWorkflow.ts',
      'src/calendar/MeetingProposalControl.tsx',
    ]) {
      const src = stripComments(read(rel));
      expect(src, rel).not.toMatch(/fetch\s*\(/);
      expect(src, rel).not.toMatch(/XMLHttpRequest/);
      expect(src, rel).not.toMatch(/graph\.microsoft|microsoft-graph/i);
      expect(src, rel).not.toMatch(/CalendarPostItem\s*\(/);
    }
    const adapter = stripComments(read('src/calendar/meetingCreationAdapter.ts'));
    expect(adapter).toMatch(/Office365OutlookService/);
    expect(adapter).toMatch(/V4CalendarPostItem/);
  });

  it('ships an admin diagnostic surface with preview and confirmation language', () => {
    const src = read('src/calendar/AdminOutlookEventCreationDiagnosticPanel.tsx');
    expect(src).toMatch(/Admin Outlook event creation diagnostic/);
    expect(src).toMatch(/Submit governed diagnostic create request/);
    expect(src).toMatch(/approved internal diagnostic event/);
    expect(src).toMatch(/Returned event ID is evidence, not delivery confirmation/);
  });

  it('documents the Teams meeting join URL boundary and forbids fabricated URLs', () => {
    const contract = read('microsoft365/teams/teams-meeting-boundary-contract.json');
    const doc = read('docs/governance/M365_A4_TEAMS_MEETING_CREATION_BOUNDARY_2026-07-28.md');
    const src = read('src/calendar/teamsMeetingBoundary.ts');
    expect(contract).toMatch(/teamsJoinUrl/);
    expect(contract).toMatch(/fabricated join URLs/);
    expect(doc).toMatch(/does not expose a reliable Teams join URL field/);
    expect(src).toMatch(/server_side_boundary_required/);
    expect(src).toMatch(/validateTeamsJoinUrl/);
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
