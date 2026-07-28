// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  classifyMeetingCreationResponse,
  allRecipientsAreApprovedInternal,
  buildMeetingIdempotencyKey,
  buildOutlookCalendarEventPayload,
  createDefaultMeetingProposal,
  validateMeetingProposal,
} from './meetingProposalWorkflow';
import { resolveMeetingWriteFeatureGates } from './meetingProposalFeatureFlags';
import {
  createDisabledMeetingCreationAdapter,
  createGovernedOutlookMeetingCreationAdapter,
  resetMeetingCreationAdapterForTest,
  setMeetingCreationAdapterForTest,
} from './meetingCreationAdapter';
import { MeetingProposalControl } from './MeetingProposalControl';

const BASE = createDefaultMeetingProposal({
  dealId: 'deal-1',
  dealName: 'Riverside',
  start: '2026-07-29T14:00:00Z',
  end: '2026-07-29T15:00:00Z',
  timezone: 'UTC',
  requiredAttendees: ['borrower@example.com'],
  teamsMeetingRequested: true,
  correlationId: 'corr-1',
});

afterEach(() => resetMeetingCreationAdapterForTest());

describe('M365-3 meeting proposal gates and validation', () => {
  it('write gates default off', () => {
    expect(resolveMeetingWriteFeatureGates({})).toEqual({
      outlookCalendarWriteEnabled: false,
      teamsMeetingCreationEnabled: false,
    });
  });

  it('malformed dates block', () => {
    const result = validateMeetingProposal({ ...BASE, start: 'not-a-date' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('start must be a valid date/time.');
  });

  it('start after end blocks', () => {
    const result = validateMeetingProposal({ ...BASE, start: '2026-07-29T16:00:00Z' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('start must be before end.');
  });

  it('missing attendees block when policy requires them', () => {
    const result = validateMeetingProposal({ ...BASE, requiredAttendees: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('at least one required attendee is required.');
  });

  it('timezone is required and preserved', () => {
    expect(validateMeetingProposal(BASE).ok).toBe(true);
    expect(validateMeetingProposal({ ...BASE, timezone: '' }).errors).toContain('timezone is required.');
    expect(BASE.timezone).toBe('UTC');
  });

  it('disabled adapter keeps read-only users from creating', async () => {
    const outcome = await createDisabledMeetingCreationAdapter().create(BASE);
    expect(outcome.kind).toBe('disabled');
    expect(outcome.message).toMatch(/Outlook calendar write is disabled/);
  });

  it('accepted versus confirmed are distinct', () => {
    expect(classifyMeetingCreationResponse({ accepted: true, confirmed: false, correlationId: 'c' }).kind).toBe('accepted');
    expect(classifyMeetingCreationResponse({ accepted: true, confirmed: true, eventId: 'evt', correlationId: 'c' }).kind).toBe('confirmed');
  });

  it('missing Teams URL is classified honestly', () => {
    const outcome = classifyMeetingCreationResponse({
      accepted: true,
      confirmed: true,
      eventId: 'evt',
      teamsMeetingRequested: true,
      correlationId: 'c',
    });
    expect(outcome.kind).toBe('confirmed');
    expect(outcome.teamsJoinUrl).toBeUndefined();
    expect(outcome.message).toMatch(/Teams join URL was not returned/);
  });

  it('connector failure and audit failure outcomes are structured', async () => {
    setMeetingCreationAdapterForTest({
      async create(proposal) {
        return {
          kind: 'audit_failed',
          message: 'Audit event failed before connector call.',
          correlationId: proposal.correlationId,
        };
      },
    });
    render(
      <MeetingProposalControl
        dealId="deal-1"
        dealName="Riverside"
        candidateStart="2026-07-29T14:00:00Z"
        candidateEnd="2026-07-29T15:00:00Z"
        timezone="UTC"
        requiredAttendees={['borrower@example.com']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prepare meeting proposal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm creation request' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/AUDIT_FAILED/);
  });

  it('maps proposals to the exact Outlook V4 event payload shape', () => {
    const payload = buildOutlookCalendarEventPayload({
      ...BASE,
      requiredAttendees: ['credit@oldglorybank.com'],
      optionalAttendees: ['manager@oldglorybank.com'],
      location: 'Conference Room A',
    });
    expect(payload).toMatchObject({
      subject: BASE.subject,
      start: '2026-07-29T14:00:00.000Z',
      end: '2026-07-29T15:00:00.000Z',
      timeZone: 'UTC',
      requiredAttendees: 'credit@oldglorybank.com',
      optionalAttendees: 'manager@oldglorybank.com',
      location: 'Conference Room A',
      isHtml: false,
      importance: 'normal',
      responseRequested: true,
    });
    expect(payload.body).toContain(BASE.correlationId);
  });

  it('enforces approved internal recipients before governed create', async () => {
    const adapter = createGovernedOutlookMeetingCreationAdapter({
      gates: { outlookCalendarWriteEnabled: true, teamsMeetingCreationEnabled: false },
      operationsProvider: async () => ({
        async V4CalendarPostItem() {
          throw new Error('should not submit external attendees');
        },
      }),
    });
    const proposal = { ...BASE, requiredAttendees: ['borrower@example.com'], teamsMeetingRequested: false };
    expect(allRecipientsAreApprovedInternal(proposal, ['credit@oldglorybank.com'])).toBe(false);
    const outcome = await adapter.createGoverned({
      calendarId: 'Calendar',
      proposal,
      idempotencyKey: buildMeetingIdempotencyKey(proposal),
      approvedInternalRecipients: ['credit@oldglorybank.com'],
      operatorConfirmed: true,
    });
    expect(outcome.kind).toBe('blocked');
    expect(outcome.message).toMatch(/approved internal test recipients/);
  });

  it('returns accepted with event ID and blocks duplicate idempotency keys', async () => {
    let calls = 0;
    const adapter = createGovernedOutlookMeetingCreationAdapter({
      gates: { outlookCalendarWriteEnabled: true, teamsMeetingCreationEnabled: false },
      operationsProvider: async () => ({
        async V4CalendarPostItem(calendarId, item) {
          calls += 1;
          expect(calendarId).toBe('Calendar');
          expect(item).toMatchObject({ subject: BASE.subject });
          return { success: true, data: { id: 'evt-123' } };
        },
      }),
    });
    const proposal = { ...BASE, requiredAttendees: ['credit@oldglorybank.com'], teamsMeetingRequested: false };
    const request = {
      calendarId: 'Calendar',
      proposal,
      idempotencyKey: buildMeetingIdempotencyKey(proposal),
      approvedInternalRecipients: ['credit@oldglorybank.com'],
      operatorConfirmed: true,
    };
    expect(await adapter.createGoverned(request)).toMatchObject({ kind: 'accepted', eventId: 'evt-123' });
    expect(await adapter.createGoverned(request)).toMatchObject({ kind: 'blocked' });
    expect(calls).toBe(1);
  });

  it('duplicate submission is blocked by correlation id', async () => {
    let calls = 0;
    setMeetingCreationAdapterForTest({
      async create(proposal) {
        calls += 1;
        return { kind: 'unknown', message: 'needs reconciliation', correlationId: proposal.correlationId };
      },
    });
    render(
      <MeetingProposalControl
        dealId="deal-1"
        dealName="Riverside"
        candidateStart="2026-07-29T14:00:00Z"
        candidateEnd="2026-07-29T15:00:00Z"
        timezone="UTC"
        requiredAttendees={['borrower@example.com']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prepare meeting proposal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm creation request' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/UNKNOWN/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm creation request' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Duplicate meeting creation submission blocked/);
    expect(calls).toBe(1);
  });
});
