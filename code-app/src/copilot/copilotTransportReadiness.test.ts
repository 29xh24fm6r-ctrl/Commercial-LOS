import { describe, it, expect } from 'vitest';

import { getCopilotTransportReadiness } from './copilotTransportReadiness';
import type { CopilotConnectorConfig } from './copilotConnectorConfig';

/**
 * Phase 137E — pure transport readiness checklist.
 */

const LIVE_CONFIG: CopilotConnectorConfig = {
  mode: 'proposal_only',
  customApiName: 'cr664_RunLosCopilotAssist',
  endpointAlias: 'dataverse-custom-api',
  policyVersion: 'v1',
};

describe('Phase 137E — getCopilotTransportReadiness', () => {
  it('is never ready in Phase 137E (live transport is not implemented)', () => {
    for (const mode of ['not_configured', 'disabled', 'live_read_only', 'proposal_only'] as const) {
      const r = getCopilotTransportReadiness({ mode });
      expect(r.ready, mode).toBe(false);
      expect(r.blockers.length, mode).toBeGreaterThan(0);
    }
  });

  it('always lists the missing-implementation + registration + audit + policy + secret-store blockers', () => {
    const r = getCopilotTransportReadiness(LIVE_CONFIG);
    const joined = r.blockers.join(' | ');
    expect(joined).toMatch(/transport is not implemented/i);
    expect(joined).toMatch(/Custom API registration .*not verified/i);
    expect(joined).toMatch(/Audit \/ event ledger logger is not wired/i);
    expect(joined).toMatch(/DLP and Azure OpenAI model policy are not approved/i);
    expect(joined).toMatch(/secret store \/ managed identity is not configured/i);
  });

  it('adds a config blocker when the config is not in a live mode', () => {
    const r = getCopilotTransportReadiness({ mode: 'not_configured' });
    expect(r.blockers.join(' | ')).toMatch(/not in a live mode/i);
  });

  it('omits the config blocker when a live mode is resolved (but still not ready)', () => {
    const r = getCopilotTransportReadiness(LIVE_CONFIG);
    expect(r.blockers.join(' | ')).not.toMatch(/not in a live mode/i);
    expect(r.ready).toBe(false);
  });

  it('pairs every checklist with actionable next steps', () => {
    const r = getCopilotTransportReadiness(LIVE_CONFIG);
    expect(r.nextSteps.length).toBeGreaterThan(0);
    expect(r.nextSteps.join(' | ')).toMatch(/managed identity/i);
  });
});
