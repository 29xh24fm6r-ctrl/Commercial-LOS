import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { sendDocumentRequestEmail } from './sendDocumentRequestEmail';
import type {
  OutlookEmailInput,
  OutlookEmailPort,
  OutlookSendResult,
} from './emailDelivery/outlookEmailPort';

const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

function baseInput(overrides: Partial<Parameters<typeof sendDocumentRequestEmail>[0]> = {}) {
  return {
    documentId: 'doc-1',
    documentName: 'Personal Financial Statement',
    dealId: 'deal-77',
    systemUserId: 'sys-user-1',
    recipient: 'borrower@example.com',
    subject: 'Document request: PFS',
    body: 'Please upload your most recent PFS by Friday.',
    ...overrides,
  };
}

function successAudit(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_auditeventid: id },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create> extends Promise<infer R>
    ? R
    : never);
}
function failedAudit(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create> extends Promise<infer R>
    ? R
    : never);
}
function successTimeline(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_dealtimelineeventid: id },
  } as unknown as ReturnType<
    typeof Cr664_dealtimelineeventsService.create
  > extends Promise<infer R>
    ? R
    : never);
}
function failedTimeline(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<
    typeof Cr664_dealtimelineeventsService.create
  > extends Promise<infer R>
    ? R
    : never);
}

function adapterReturning(
  result: OutlookSendResult,
  mode: 'DRY_RUN' | 'LIVE' = 'DRY_RUN',
): OutlookEmailPort {
  return {
    mode,
    async send(_input: OutlookEmailInput) {
      return result;
    },
  };
}

function adapterThrowing(err: unknown): OutlookEmailPort {
  return {
    mode: 'LIVE',
    async send(_input: OutlookEmailInput): Promise<OutlookSendResult> {
      throw err;
    },
  };
}

beforeEach(() => {
  auditCreate.mockReset();
  timelineCreate.mockReset();
});

describe('Phase 61 — sendDocumentRequestEmail', () => {
  describe('happy path — adapter accepts and both governance writes succeed', () => {
    it('returns kind: "success" with the mode and masked recipient', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning(
          { kind: 'accepted', providerMessageId: 'msg-99' },
          'DRY_RUN',
        ),
      });
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.mode).toBe('DRY_RUN');
        expect(result.providerMessageId).toBe('msg-99');
        expect(result.maskedRecipient).toBe('b***@e***.com');
      }
    });

    it('emits exactly one audit and one timeline row', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }),
      });
      expect(auditCreate).toHaveBeenCalledTimes(1);
      expect(timelineCreate).toHaveBeenCalledTimes(1);
    });

    it('audit row carries the FULL recipient (privileged ledger)', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await sendDocumentRequestEmail(
        baseInput({ recipient: 'borrower@example.com' }),
        { adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }) },
      );
      const auditPayload = auditCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(String(auditPayload.cr664_notes)).toContain('borrower@example.com');
    });

    it('timeline row carries the MASKED recipient only', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await sendDocumentRequestEmail(
        baseInput({ recipient: 'borrower@example.com' }),
        { adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }) },
      );
      const tlPayload = timelineCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      const summary = String(tlPayload.cr664_summary);
      expect(summary).toContain('b***@e***.com');
      expect(summary).not.toContain('borrower@example.com');
    });

    it('LIVE mode summary uses "Outlook accepted" wording', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning(
          { kind: 'accepted', providerMessageId: 'msg-1' },
          'LIVE',
        ),
      });
      const tlPayload = timelineCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(String(tlPayload.cr664_summary)).toMatch(/Outlook accepted/i);
    });

    it('DRY_RUN mode summary states "nothing left the client"', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning(
          { kind: 'accepted', providerMessageId: undefined },
          'DRY_RUN',
        ),
      });
      const tlPayload = timelineCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(String(tlPayload.cr664_summary)).toMatch(/nothing left the client/i);
    });
  });

  describe('send-failed paths', () => {
    it('returns kind: "send-failed" with transient=false for permanent failures', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning(
          { kind: 'permanent-failure', reason: 'mailbox over quota' },
          'LIVE',
        ),
      });
      expect(result.kind).toBe('send-failed');
      if (result.kind === 'send-failed') {
        expect(result.transient).toBe(false);
        expect(result.sendError).toMatch(/mailbox over quota/);
        expect(result.mode).toBe('LIVE');
      }
    });

    it('returns kind: "send-failed" with transient=true for transient failures', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning(
          { kind: 'transient-failure', reason: '429 throttled' },
          'LIVE',
        ),
      });
      expect(result.kind).toBe('send-failed');
      if (result.kind === 'send-failed') expect(result.transient).toBe(true);
    });

    it('returns kind: "send-failed" for invalid-recipient adapter response', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning(
          { kind: 'invalid-recipient', reason: 'address rejected by provider' },
          'LIVE',
        ),
      });
      expect(result.kind).toBe('send-failed');
    });

    it('emits a Failed audit row (best-effort) and NO timeline row when send fails', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning({ kind: 'permanent-failure', reason: 'x' }, 'LIVE'),
      });
      expect(auditCreate).toHaveBeenCalledTimes(1);
      expect(timelineCreate).not.toHaveBeenCalled();
      const auditPayload = auditCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(auditPayload.cr664_outcomestatus).toBe(788190001); // AUDIT_OUTCOME_FAILED
    });
  });

  describe('governance-partial paths', () => {
    it('returns kind: "governance-partial" when audit succeeds but timeline fails', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(failedTimeline('timeline 500'));
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: 'm' }),
      });
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.auditError).toBeUndefined();
        expect(result.timelineError).toBe('timeline 500');
        expect(result.maskedRecipient).toBe('b***@e***.com');
      }
    });

    it('returns kind: "governance-partial" when audit fails and timeline succeeds', async () => {
      auditCreate.mockReturnValueOnce(failedAudit('audit 500'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: 'm' }),
      });
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.auditError).toBe('audit 500');
        expect(result.timelineError).toBeUndefined();
      }
    });

    it('returns kind: "governance-partial" when both fail', async () => {
      auditCreate.mockReturnValueOnce(failedAudit('a'));
      timelineCreate.mockReturnValueOnce(failedTimeline('t'));
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: 'm' }),
      });
      expect(result.kind).toBe('governance-partial');
    });
  });

  describe('unknown / unexpected paths', () => {
    it('returns kind: "unknown" when the adapter throws', async () => {
      const result = await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterThrowing(new Error('boom')),
      });
      expect(result.kind).toBe('unknown');
      if (result.kind === 'unknown') expect(result.message).toBe('boom');
    });

    it('returns kind: "unknown" for an empty recipient (caught BEFORE adapter)', async () => {
      const result = await sendDocumentRequestEmail(baseInput({ recipient: '' }), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }),
      });
      expect(result.kind).toBe('unknown');
    });

    it('returns kind: "unknown" for an empty subject', async () => {
      const result = await sendDocumentRequestEmail(baseInput({ subject: '   ' }), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }),
      });
      expect(result.kind).toBe('unknown');
    });

    it('returns kind: "unknown" for an empty body', async () => {
      const result = await sendDocumentRequestEmail(baseInput({ body: '' }), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }),
      });
      expect(result.kind).toBe('unknown');
    });

    it('does NOT consume an audit or timeline call slot for pre-adapter rejection', async () => {
      await sendDocumentRequestEmail(baseInput({ recipient: 'nope' }), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }),
      });
      expect(auditCreate).not.toHaveBeenCalled();
      expect(timelineCreate).not.toHaveBeenCalled();
    });
  });

  describe('correlation id discipline', () => {
    it('stamps the same correlation id on audit and timeline', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await sendDocumentRequestEmail(baseInput(), {
        adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }),
      });
      const auditPayload = auditCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      const tlPayload = timelineCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      const auditCid = String(auditPayload.cr664_correlationid);
      const tlSubtype = String(tlPayload.cr664_eventsubtype);
      expect(auditCid.length).toBeGreaterThan(0);
      expect(tlSubtype).toContain(`correlation:${auditCid}`);
    });
  });
});
