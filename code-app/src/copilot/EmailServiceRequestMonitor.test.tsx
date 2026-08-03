import { render, screen } from '@testing-library/react';
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EmailServiceRequestMonitor } from './EmailServiceRequestMonitor';
import { rowsFromEmailServiceRequestResult } from './emailServiceRequestMonitorData';

describe('EmailServiceRequestMonitor', () => {
  it('shows governed monitored-task and triage counts', async () => {
    render(<EmailServiceRequestMonitor assigneeSystemUserId="user-1" load={async () => [
      { id: '1', subject: 'Insurance request', senderAddress: 'a@example.com', receivedAt: '2026-07-31T00:00:00Z', category: 'servicing_request', confidence: .98, status: 'TASK_CREATED', statusReason: 'Authorized.' },
      { id: '2', subject: 'Unknown loan', senderAddress: 'b@example.com', receivedAt: '2026-07-31T00:00:00Z', category: 'other', confidence: .6, status: 'TRIAGE_REQUIRED', statusReason: 'Ambiguous deal.' },
    ]} />);
    expect(await screen.findByText('1 monitored tasks')).toBeTruthy();
    expect(screen.getByText('1 need review')).toBeTruthy();
    expect(screen.getByText('Ambiguous deal.')).toBeTruthy();
  });

  it('maps only safe monitoring fields from the Dataverse response', () => {
    expect(rowsFromEmailServiceRequestResult({ success: true, data: [{ cr664_emailservicerequestintakeid: '1', cr664_subject: 'Request', cr664_status: 'TASK_CREATED' }] })).toEqual([
      expect.objectContaining({ id: '1', subject: 'Request', status: 'TASK_CREATED' }),
    ]);
  });
});
