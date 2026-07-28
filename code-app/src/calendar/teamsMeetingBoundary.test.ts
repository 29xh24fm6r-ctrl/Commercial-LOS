import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assessGeneratedTeamsMeetingCapability,
  createDisabledTeamsMeetingBoundaryAdapter,
  validateTeamsJoinUrl,
} from './teamsMeetingBoundary';
import { createDefaultMeetingProposal } from './meetingProposalWorkflow';

const REPO_ROOT = resolve(__dirname, '..', '..');

describe('M365-A4 Teams meeting boundary', () => {
  it('classifies the current generated Outlook model as requiring a server boundary', () => {
    const service = readFileSync(resolve(REPO_ROOT, 'src/generated/services/Office365OutlookService.ts'), 'utf8');
    const model = readFileSync(resolve(REPO_ROOT, 'src/generated/models/Office365OutlookModel.ts'), 'utf8');
    const result = assessGeneratedTeamsMeetingCapability(`${service}\n${model}`);
    expect(result.decision).toBe('server_side_boundary_required');
    expect(result.reason).toMatch(/join URL/);
  });

  it('validates only real Teams meeting join URL shape', () => {
    expect(validateTeamsJoinUrl('https://teams.microsoft.com/l/meetup-join/abc')).toBe(true);
    expect(validateTeamsJoinUrl('https://contoso.example/meeting')).toBe(false);
    expect(validateTeamsJoinUrl('teams://invented')).toBe(false);
  });

  it('disabled adapter never fabricates a Teams URL', async () => {
    const proposal = createDefaultMeetingProposal({
      dealId: 'deal-1',
      dealName: 'Riverside',
      start: '2026-07-29T14:00:00Z',
      end: '2026-07-29T15:00:00Z',
      timezone: 'UTC',
      requiredAttendees: ['credit@oldglorybank.com'],
      teamsMeetingRequested: true,
      correlationId: 'corr',
    });
    const outcome = await createDisabledTeamsMeetingBoundaryAdapter().create({
      proposal,
      idempotencyKey: 'key',
      operatorConfirmed: true,
    });
    expect(outcome.kind).toBe('disabled');
    expect(outcome.teamsJoinUrl).toBeUndefined();
  });
});
