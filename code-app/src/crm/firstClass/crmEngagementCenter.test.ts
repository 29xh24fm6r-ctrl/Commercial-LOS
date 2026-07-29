import { describe, expect, it } from 'vitest';
import { CRM_M365_CAPABILITIES } from './crmM365Capabilities';

describe('CRM-6 Microsoft 365 truth labels', () => {
  it('never claims inbox synchronization from send/calendar capability', () => {
    expect(CRM_M365_CAPABILITIES.inboxSynchronization).toBe('not-claimed');
  });
  it('keeps communication and meeting writes human-confirmed and governed', () => {
    expect(CRM_M365_CAPABILITIES.governedEmailSend).toContain('confirmed');
    expect(CRM_M365_CAPABILITIES.meetingCreation).toContain('human-confirmed');
  });
});
