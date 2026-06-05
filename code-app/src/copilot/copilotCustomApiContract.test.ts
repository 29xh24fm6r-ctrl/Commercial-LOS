import { describe, it, expect } from 'vitest';

import {
  ALLOWED_COPILOT_ACTION_TYPES,
  KNOWN_COPILOT_MODES,
  createDisabledCopilotResponse,
  createNotConfiguredCopilotResponse,
  isAllowedCopilotActionType,
  normalizeCopilotMode,
  validateCopilotResponse,
  type CopilotCustomApiResponse,
  type CopilotProposal,
} from './copilotCustomApiContract';

/**
 * Phase 137C — Copilot Custom API contract types + pure validators.
 */

function proposal(over: Partial<CopilotProposal> = {}): CopilotProposal {
  return {
    id: 'p1',
    actionType: 'create_task',
    title: 'Create follow-up task',
    summary: 'Propose a follow-up task on the deal.',
    payload: {},
    requireConfirmation: true,
    governedWritePath: 'task.create',
    riskLevel: 'low',
    auditReason: 'follow-up needed',
    ...over,
  };
}

function liveResponse(over: Partial<CopilotCustomApiResponse> = {}): CopilotCustomApiResponse {
  return {
    mode: 'proposal_only',
    isLive: true,
    answer: 'Here is a grounded summary.',
    citations: ['deal'],
    proposals: [proposal()],
    warnings: [],
    audit: { correlationId: 'c-1' },
    ...over,
  };
}

describe('Phase 137C — action-type allowlist', () => {
  it('accepts every allowlisted action type', () => {
    for (const t of ALLOWED_COPILOT_ACTION_TYPES) {
      expect(isAllowedCopilotActionType(t)).toBe(true);
    }
  });

  it('rejects an unknown action type', () => {
    expect(isAllowedCopilotActionType('send_email')).toBe(false);
    expect(isAllowedCopilotActionType('update_deal')).toBe(false);
    expect(isAllowedCopilotActionType('')).toBe(false);
  });
});

describe('Phase 137C — normalizeCopilotMode', () => {
  it('passes through known modes', () => {
    for (const m of KNOWN_COPILOT_MODES) {
      expect(normalizeCopilotMode(m)).toBe(m);
    }
  });

  it('maps unknown / empty / undefined to not_configured', () => {
    expect(normalizeCopilotMode('bogus')).toBe('not_configured');
    expect(normalizeCopilotMode('')).toBe('not_configured');
    expect(normalizeCopilotMode(undefined)).toBe('not_configured');
    expect(normalizeCopilotMode('  live_read_only  ')).toBe('live_read_only');
  });
});

describe('Phase 137C — fail-closed response helpers', () => {
  it('createNotConfiguredCopilotResponse is honest (no live, no answer, no proposals) and validates', () => {
    const r = createNotConfiguredCopilotResponse('c-1', 'no transport');
    expect(r.mode).toBe('not_configured');
    expect(r.isLive).toBe(false);
    expect(r.answer).toBeUndefined();
    expect(r.proposals).toEqual([]);
    expect(r.failClosedCode).toBe('missing_config');
    expect(r.warnings).toContain('no transport');
    expect(validateCopilotResponse(r).ok).toBe(true);
  });

  it('createDisabledCopilotResponse names the fail-closed code and validates', () => {
    const r = createDisabledCopilotResponse('c-1', 'dlp_blocked', 'DLP says no');
    expect(r.mode).toBe('disabled');
    expect(r.isLive).toBe(false);
    expect(r.failClosedCode).toBe('dlp_blocked');
    expect(validateCopilotResponse(r).ok).toBe(true);
  });
});

describe('Phase 137C — validateCopilotResponse enforces the safety contract', () => {
  it('a well-formed live proposal_only response passes', () => {
    expect(validateCopilotResponse(liveResponse()).ok).toBe(true);
  });

  it('a proposal with requireConfirmation=false fails', () => {
    const bad = liveResponse({
      proposals: [proposal({ requireConfirmation: false as unknown as true })],
    });
    const v = validateCopilotResponse(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/requireConfirmation/i);
  });

  it('an unknown actionType fails', () => {
    const bad = liveResponse({
      proposals: [
        proposal({ actionType: 'wire_funds' as unknown as CopilotProposal['actionType'] }),
      ],
    });
    const v = validateCopilotResponse(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/non-allowlisted/i);
  });

  it('a write-capable proposal without governedWritePath fails', () => {
    const bad = liveResponse({
      proposals: [proposal({ actionType: 'create_task', governedWritePath: undefined })],
    });
    const v = validateCopilotResponse(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/governedWritePath/i);
  });

  it('explain_only may omit governedWritePath', () => {
    const ok = liveResponse({
      proposals: [
        proposal({
          actionType: 'explain_only',
          governedWritePath: undefined,
          riskLevel: 'low',
        }),
      ],
    });
    expect(validateCopilotResponse(ok).ok).toBe(true);
  });

  it('an unknown mode fails', () => {
    const bad = liveResponse({ mode: 'turbo' as unknown as CopilotCustomApiResponse['mode'] });
    const v = validateCopilotResponse(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/Unknown mode/i);
  });

  it('a fail-closed mode carrying a fake live answer fails (honesty contract)', () => {
    const bad: CopilotCustomApiResponse = {
      mode: 'not_configured',
      isLive: true,
      answer: 'totally real AI answer',
      citations: [],
      proposals: [],
      warnings: [],
      audit: { correlationId: 'c-1' },
    };
    const v = validateCopilotResponse(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/must not be isLive|must not return an answer/i);
  });

  it('a fail-closed mode carrying proposals fails', () => {
    const bad = createNotConfiguredCopilotResponse('c-1', 'x');
    const withProposals: CopilotCustomApiResponse = {
      ...bad,
      proposals: [proposal()],
    };
    const v = validateCopilotResponse(withProposals);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/must not return proposals/i);
  });

  it('a response missing an audit correlationId fails', () => {
    const bad = liveResponse({ audit: { correlationId: '' } });
    const v = validateCopilotResponse(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/correlationId/i);
  });
});
