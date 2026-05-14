import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { prepareDocumentRequestHandoff } from './prepareDocumentRequestHandoff';
import type {
  PrepareDocumentRequestHandoffInput,
  HandoffMethod,
} from './prepareDocumentRequestHandoff';

const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

function baseInput(
  overrides: Partial<PrepareDocumentRequestHandoffInput> = {},
): PrepareDocumentRequestHandoffInput {
  return {
    documentId: 'doc-1',
    documentName: 'Personal Financial Statement',
    dealId: 'deal-77',
    systemUserId: 'sys-user-1',
    recipient: 'borrower@example.com',
    subject: 'Document request: PFS',
    body: 'Please share your most recent PFS by Friday.',
    method: 'mailto' as HandoffMethod,
    mode: 'HANDOFF',
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

beforeEach(() => {
  auditCreate.mockReset();
  timelineCreate.mockReset();
});

describe('Phase 63 — prepareDocumentRequestHandoff', () => {
  describe('happy path — audit and timeline both succeed', () => {
    it('returns kind: "success" with mode, method, and masked recipient', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      const result = await prepareDocumentRequestHandoff(baseInput());
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.mode).toBe('HANDOFF');
        expect(result.method).toBe('mailto');
        expect(result.maskedRecipient).toBe('b***@e***.com');
      }
    });

    it('emits exactly one audit and one timeline row', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await prepareDocumentRequestHandoff(baseInput());
      expect(auditCreate).toHaveBeenCalledTimes(1);
      expect(timelineCreate).toHaveBeenCalledTimes(1);
    });

    it('audit row carries the full recipient (privileged ledger)', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await prepareDocumentRequestHandoff(baseInput());
      const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.cr664_notes).toContain('borrower@example.com');
      expect(payload.cr664_auditeventname).toBe(
        'DocumentRequest Outlook Handoff',
      );
      expect(payload.cr664_fieldname).toBe('outlook_handoff_prepared');
      expect(payload.cr664_afterstate).toBe(
        'Outlook handoff prepared (mailto)',
      );
    });

    it('audit row records the clipboard method when method is "clipboard"', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await prepareDocumentRequestHandoff(baseInput({ method: 'clipboard' }));
      const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.cr664_afterstate).toBe(
        'Outlook handoff prepared (clipboard)',
      );
    });

    it('timeline row uses the masked recipient and never claims "sent"', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await prepareDocumentRequestHandoff(baseInput());
      const payload = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
      const summary = payload.cr664_summary as string;
      expect(summary).toContain('b***@e***.com');
      expect(summary).not.toContain('borrower@example.com');
      expect(summary).not.toMatch(/\bsent\b/i);
      expect(summary).not.toMatch(/\bdelivered\b/i);
      // Conservative verb is required.
      expect(summary).toContain('handoff prepared');
    });

    it('audit + timeline share ONE correlation id (Phase 46 invariant)', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await prepareDocumentRequestHandoff(baseInput());
      const auditPayload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
      const timelinePayload = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
      const auditCid = auditPayload.cr664_correlationid as string;
      expect(typeof auditCid).toBe('string');
      expect(auditCid.length).toBeGreaterThan(0);
      expect(timelinePayload.cr664_eventsubtype).toContain(
        `correlation:${auditCid}`,
      );
      expect(timelinePayload.cr664_eventsubtype).toContain(
        'documentrequest:outlook-handoff-prepared',
      );
    });
  });

  describe('pre-flight handoff-failed branch', () => {
    it('rejects a malformed recipient before any governance emission', async () => {
      const result = await prepareDocumentRequestHandoff(
        baseInput({ recipient: 'not-an-email' }),
      );
      expect(result.kind).toBe('handoff-failed');
      if (result.kind === 'handoff-failed') {
        expect(result.reason).toMatch(/email address/i);
        expect(result.method).toBe('mailto');
      }
      expect(auditCreate).not.toHaveBeenCalled();
      expect(timelineCreate).not.toHaveBeenCalled();
    });

    it('rejects an empty subject', async () => {
      const result = await prepareDocumentRequestHandoff(
        baseInput({ subject: '   ' }),
      );
      expect(result.kind).toBe('handoff-failed');
      expect(auditCreate).not.toHaveBeenCalled();
      expect(timelineCreate).not.toHaveBeenCalled();
    });

    it('rejects an empty body', async () => {
      const result = await prepareDocumentRequestHandoff(
        baseInput({ body: '' }),
      );
      expect(result.kind).toBe('handoff-failed');
      expect(auditCreate).not.toHaveBeenCalled();
      expect(timelineCreate).not.toHaveBeenCalled();
    });
  });

  describe('governance-partial branch', () => {
    it('reports governance-partial when audit fails but timeline succeeds', async () => {
      auditCreate.mockReturnValueOnce(failedAudit('audit boom'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      const result = await prepareDocumentRequestHandoff(baseInput());
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.auditError).toBe('audit boom');
        expect(result.timelineError).toBeUndefined();
        expect(result.maskedRecipient).toBe('b***@e***.com');
        expect(result.method).toBe('mailto');
      }
    });

    it('reports governance-partial when timeline fails but audit succeeds', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(failedTimeline('timeline boom'));
      const result = await prepareDocumentRequestHandoff(baseInput());
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.auditError).toBeUndefined();
        expect(result.timelineError).toBe('timeline boom');
      }
    });

    it('reports governance-partial when BOTH audit and timeline fail', async () => {
      auditCreate.mockReturnValueOnce(failedAudit('audit boom'));
      timelineCreate.mockReturnValueOnce(failedTimeline('timeline boom'));
      const result = await prepareDocumentRequestHandoff(baseInput());
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.auditError).toBe('audit boom');
        expect(result.timelineError).toBe('timeline boom');
      }
    });
  });

  describe('payload integrity — no connector / no Graph / no email send', () => {
    it('does NOT import or call any Office365 / Email service', async () => {
      // Structural assertion: the action source must not reference
      // any Office365 / Outlook / Graph service module. Because the
      // source has already been imported above (`prepareDocumentRequestHandoff`),
      // we read the file from disk and grep it.
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const src = readFileSync(
        resolve(__dirname, 'prepareDocumentRequestHandoff.ts'),
        'utf8',
      );
      expect(src).not.toMatch(/Office365/i);
      expect(src).not.toMatch(/\bGraph(?:Email|Service)\b/);
      expect(src).not.toMatch(/sendMail/i);
      // It also must NOT import the outlookEmailAdapters (those are the
      // DRY_RUN/LIVE port; the handoff bypasses them).
      expect(src).not.toMatch(/outlookEmailAdapters/);
    });

    it('audit row stamps cr664_LoanDeal@odata.bind (deal-domain write)', async () => {
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await prepareDocumentRequestHandoff(baseInput());
      const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload['cr664_LoanDeal@odata.bind']).toBe(
        '/cr664_loandeals(deal-77)',
      );
    });
  });
});
