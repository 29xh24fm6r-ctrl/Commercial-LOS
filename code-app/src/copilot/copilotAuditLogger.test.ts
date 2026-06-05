import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  COPILOT_AUDIT_TABLE_LOGICAL_NAME,
  COPILOT_AUDIT_PAYLOAD_VERSION,
  buildCopilotAuditCompletionEvent,
  buildCopilotAuditFailClosedEvent,
  buildCopilotAuditStartEvent,
  createDisabledCopilotAuditLogger,
  validateCopilotAuditEvent,
  type CopilotAuditEventPayload,
} from './copilotAuditLogger';
import type {
  CopilotCustomApiRequest,
  CopilotCustomApiResponse,
} from './copilotCustomApiContract';

/**
 * Phase 137K — Copilot audit logger (inert interface + skeleton).
 */

function request(over: Partial<CopilotCustomApiRequest> = {}): CopilotCustomApiRequest {
  return {
    workspace: 'banker',
    surface: 'deal',
    mode: 'proposal_only',
    user: { upn: 'banker@oldglorybank.com', profileId: 'p1', workspaceName: 'Banker Workspace' },
    context: {
      dealId: 'd1',
      dealName: 'Acme Term Loan',
      // Raw context the audit payload must NEVER copy:
      documents: [{ id: 'doc1', type: 'tax-return', status: 'outstanding' }],
      metrics: { openTasks: 2 },
      flags: ['missing-docs'],
    },
    prompt: { kind: 'summarize', text: 'SECRET RAW PROMPT TEXT that must not be copied' },
    policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
    correlationId: 'corr-137k',
    ...over,
  };
}

function response(over: Partial<CopilotCustomApiResponse> = {}): CopilotCustomApiResponse {
  return {
    mode: 'proposal_only',
    isLive: true,
    answer: 'Grounded summary.',
    citations: ['deal'],
    proposals: [
      {
        id: 'p1',
        actionType: 'create_task',
        title: 'Create follow-up task',
        summary: 'Follow up.',
        payload: {},
        requireConfirmation: true,
        governedWritePath: 'task.create',
        riskLevel: 'low',
        auditReason: 'follow-up',
      },
    ],
    warnings: [],
    audit: { correlationId: 'corr-137k' },
    ...over,
  };
}

const START_OPTS = {
  eventTimestamp: '2026-06-05T00:00:00Z',
  redactedPromptSummary: 'Summarize the deal (redacted).',
  promptHash: 'abc123',
  contextSummary: '1 deal, 1 outstanding doc.',
  contextHash: 'def456',
  policyVersion: 'v1',
};

describe('Phase 137K — constants', () => {
  it('the audit table is cr664_copilotauditevent', () => {
    expect(COPILOT_AUDIT_TABLE_LOGICAL_NAME).toBe('cr664_copilotauditevent');
  });
});

describe('Phase 137K — disabled logger fails closed', () => {
  it('returns audit_unavailable, ok:false, and fabricates no event id', async () => {
    const logger = createDisabledCopilotAuditLogger('no transport / table');
    const res = await logger.writeEvent(buildCopilotAuditStartEvent(request(), START_OPTS));
    expect(res.ok).toBe(false);
    expect(res.failClosedCode).toBe('audit_unavailable');
    expect(res.reason).toMatch(/no transport/);
    expect(res.eventId).toBeUndefined();
  });

  it('never returns ok:true for any event', async () => {
    const logger = createDisabledCopilotAuditLogger('disabled');
    for (const ev of [
      buildCopilotAuditStartEvent(request(), START_OPTS),
      buildCopilotAuditCompletionEvent(request(), response(), START_OPTS),
      buildCopilotAuditFailClosedEvent(request(), 'policy_blocked', 'blocked', START_OPTS),
    ]) {
      const res = await logger.writeEvent(ev);
      expect(res.ok).toBe(false);
      expect(res.eventId).toBeUndefined();
    }
  });
});

describe('Phase 137K — builders', () => {
  it('audit_start maps request fields WITHOUT dumping raw prompt text / context', () => {
    const ev = buildCopilotAuditStartEvent(request(), START_OPTS);
    expect(ev.eventType).toBe('audit_start');
    expect(ev.correlationId).toBe('corr-137k');
    expect(ev.userUpn).toBe('banker@oldglorybank.com');
    expect(ev.workspace).toBe('banker');
    expect(ev.surface).toBe('deal');
    expect(ev.mode).toBe('proposal_only');
    expect(ev.promptKind).toBe('summarize');
    expect(ev.dealId).toBe('d1');
    expect(ev.payloadVersion).toBe(COPILOT_AUDIT_PAYLOAD_VERSION);
    // Only the redacted summary / hash — never the raw prompt text or context.
    expect(ev.redactedPromptSummary).toBe('Summarize the deal (redacted).');
    const serialized = JSON.stringify(ev);
    expect(serialized).not.toMatch(/SECRET RAW PROMPT TEXT/);
    expect(serialized).not.toMatch(/tax-return/);
    expect(serialized).not.toMatch(/missing-docs/);
    expect(serialized).not.toMatch(/openTasks/);
  });

  it('audit_completion records responseMode / isLive / proposalCount', () => {
    const ev = buildCopilotAuditCompletionEvent(request(), response(), START_OPTS);
    expect(ev.eventType).toBe('audit_completion');
    expect(ev.responseMode).toBe('proposal_only');
    expect(ev.isLive).toBe(true);
    expect(ev.proposalCount).toBe(1);
    // Proposal summary carries ids/types/path only — never the action payload.
    expect(ev.proposalsJson).toMatch(/"actionType":"create_task"/);
    expect(ev.proposalsJson).toMatch(/"governedWritePath":"task.create"/);
  });

  it('audit_fail_closed records failClosedCode + reason', () => {
    const ev = buildCopilotAuditFailClosedEvent(request(), 'audit_unavailable', 'cannot write audit', START_OPTS);
    expect(ev.eventType).toBe('audit_fail_closed');
    expect(ev.failClosedCode).toBe('audit_unavailable');
    expect(ev.errorSummary).toBe('cannot write audit');
  });
});

describe('Phase 137K — validation', () => {
  it('a well-formed audit_start passes', () => {
    expect(validateCopilotAuditEvent(buildCopilotAuditStartEvent(request(), START_OPTS)).ok).toBe(true);
  });

  it('a well-formed audit_completion passes', () => {
    expect(
      validateCopilotAuditEvent(buildCopilotAuditCompletionEvent(request(), response(), START_OPTS)).ok,
    ).toBe(true);
  });

  it('fails when correlationId is missing', () => {
    const ev = buildCopilotAuditStartEvent(request(), START_OPTS);
    const v = validateCopilotAuditEvent({ ...ev, correlationId: '' });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/correlationId/);
  });

  it('fails on an unknown eventType', () => {
    const ev = buildCopilotAuditStartEvent(request(), START_OPTS);
    const v = validateCopilotAuditEvent({
      ...ev,
      eventType: 'audit_started' as unknown as CopilotAuditEventPayload['eventType'],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/Unknown eventType/);
  });

  it('fails on a raw borrower-document marker in a summary field', () => {
    const ev = buildCopilotAuditStartEvent(request(), {
      ...START_OPTS,
      contextSummary: 'raw borrower document attached: <full content>',
    });
    const v = validateCopilotAuditEvent(ev);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/raw borrower-document/i);
  });

  it('fails on a base64 data-URI (raw doc) marker', () => {
    const ev = buildCopilotAuditStartEvent(request(), {
      ...START_OPTS,
      contextSummary: 'data:application/pdf;base64,JVBERi0xLjQK',
    });
    expect(validateCopilotAuditEvent(ev).ok).toBe(false);
  });

  it('fails on a secret / token / API-key marker in a summary field', () => {
    for (const leak of ['token sk-ABCDEF1234567890', 'Bearer abc.def.ghi', 'set the apikey here']) {
      const ev = buildCopilotAuditStartEvent(request(), { ...START_OPTS, redactedPromptSummary: leak });
      const v = validateCopilotAuditEvent(ev);
      expect(v.ok, leak).toBe(false);
      expect(v.errors.join(' '), leak).toMatch(/secret \/ token \/ API-key/i);
    }
  });

  it('proposal_confirmed requires proposal linkage', () => {
    const base = buildCopilotAuditStartEvent(request(), START_OPTS);
    const bad: CopilotAuditEventPayload = { ...base, eventType: 'proposal_confirmed' };
    expect(validateCopilotAuditEvent(bad).ok).toBe(false);
    const good: CopilotAuditEventPayload = {
      ...base,
      eventType: 'proposal_confirmed',
      confirmedProposalId: 'p1',
      confirmationStatus: 'confirmed',
    };
    expect(validateCopilotAuditEvent(good).ok).toBe(true);
  });

  it('governed_write_completed requires governed-write linkage', () => {
    const base = buildCopilotAuditStartEvent(request(), START_OPTS);
    const bad: CopilotAuditEventPayload = { ...base, eventType: 'governed_write_completed', confirmedProposalId: 'p1' };
    const v = validateCopilotAuditEvent(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/governedWritePath|governedWriteId/);
    const good: CopilotAuditEventPayload = {
      ...base,
      eventType: 'governed_write_completed',
      confirmedProposalId: 'p1',
      governedWritePath: 'task.create',
      governedWriteId: 'gw-1',
    };
    expect(validateCopilotAuditEvent(good).ok).toBe(true);
  });

  it('audit_completion requires responseMode / isLive / proposalCount', () => {
    const base = buildCopilotAuditStartEvent(request(), START_OPTS);
    const bad: CopilotAuditEventPayload = { ...base, eventType: 'audit_completion' };
    expect(validateCopilotAuditEvent(bad).ok).toBe(false);
  });
});

describe('Phase 137K — copilotAuditLogger.ts is pure (no IO / no drift)', () => {
  const code = readFileSync(resolve(__dirname, 'copilotAuditLogger.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('contains no fetch / network / Azure-OpenAI / generated-write / write-call / secret-env reference', () => {
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(/XMLHttpRequest/);
    expect(code).not.toMatch(/api\.openai\.com/i);
    expect(code).not.toMatch(/openai\.azure\.com/i);
    expect(code).not.toMatch(/import\.meta\.env/);
    expect(code).not.toMatch(/AZURE_OPENAI_API_KEY|AZURE_OPENAI_ENDPOINT/);
    expect(code).not.toMatch(/from ['"][^'"]*\/generated\//);
    expect(code).not.toMatch(/\.(create|update|patch|delete)\s*\(/);
  });
});
