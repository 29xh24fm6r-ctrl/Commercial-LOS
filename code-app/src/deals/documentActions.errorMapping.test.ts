import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Final LOS Completion arc (Workstream P) — documentActions.ts had zero unit coverage before this
 * file and leaked raw Dataverse/network error text (e.g. "Row lock timeout.",
 * "ETIMEDOUT: socket hang up") verbatim into the docError/auditError/timelineError fields that
 * RequestDocumentModal / ReceiveDocumentModal / ReviewDocumentModal render directly to a banker.
 * These tests pin that every raw failure message is now replaced by the shared business-safe
 * message, for all three governed writes (request / receive / review), on both the primary-write
 * failure path and the governance-partial (audit/timeline) path.
 */

const { updateMock, auditCreateMock, timelineCreateMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  timelineCreateMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { update: updateMock },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: auditCreateMock },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: timelineCreateMock },
}));

import { requestDocument, markDocumentReceived, markDocumentReviewed } from './documentActions';
import type { ResolveActorChangedBy } from './newDealAuditActorResolver';

const RAW_TRANSPORT_ERROR = 'Row lock timeout on cr664_documentchecklist (SQL 1205).';

const resolvedActor: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(11111111-1111-1111-1111-111111111111)',
});

beforeEach(() => {
  updateMock.mockReset();
  auditCreateMock.mockReset();
  timelineCreateMock.mockReset();
});

describe('requestDocument — raw error mapping', () => {
  const input = {
    documentId: 'doc-1',
    documentName: 'Business Tax Returns',
    dealId: 'deal-1',
    priorRequestDate: undefined,
    systemUserId: 'sys-1',
    actorEmail: 'banker@bank.test',
    requestNote: 'Please provide 2024 returns.',
  };

  it('maps a raw update failure to the safe message on doc-failed', async () => {
    updateMock.mockResolvedValueOnce({ success: false, error: { message: RAW_TRANSPORT_ERROR } });
    auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } });
    const outcome = await requestDocument(input, resolvedActor);
    expect(outcome.kind).toBe('doc-failed');
    if (outcome.kind === 'doc-failed') {
      expect(outcome.docError).not.toContain(RAW_TRANSPORT_ERROR);
      expect(outcome.docError).toContain("We couldn't save that action");
    }
  });

  it('maps a thrown network error to the safe message on doc-failed', async () => {
    updateMock.mockRejectedValueOnce(new Error('ETIMEDOUT: socket hang up'));
    auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } });
    const outcome = await requestDocument(input, resolvedActor);
    expect(outcome.kind).toBe('doc-failed');
    if (outcome.kind === 'doc-failed') {
      expect(outcome.docError).not.toContain('ETIMEDOUT');
      expect(outcome.docError).toContain("We couldn't save that action");
    }
  });

  it('maps raw audit/timeline failures to safe messages on governance-partial', async () => {
    updateMock.mockResolvedValueOnce({ success: true, data: {} });
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: RAW_TRANSPORT_ERROR } });
    timelineCreateMock.mockResolvedValueOnce({ success: false, error: { message: 'OData: 0x80040217 entity not found' } });
    const outcome = await requestDocument(input, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain(RAW_TRANSPORT_ERROR);
      expect(outcome.timelineError).not.toContain('0x80040217');
      expect(outcome.auditError).toContain("We couldn't save that action");
      expect(outcome.timelineError).toContain("We couldn't save that action");
    }
  });
});

describe('markDocumentReceived — raw error mapping', () => {
  const input = {
    documentId: 'doc-1',
    documentName: 'Business Tax Returns',
    dealId: 'deal-1',
    systemUserId: 'sys-1',
    actorEmail: 'banker@bank.test',
    receiveNote: 'Received via email.',
  };

  it('maps a raw update failure to the safe message on receive-failed', async () => {
    updateMock.mockResolvedValueOnce({ success: false, error: { message: RAW_TRANSPORT_ERROR } });
    auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } });
    const outcome = await markDocumentReceived(input, resolvedActor);
    expect(outcome.kind).toBe('receive-failed');
    if (outcome.kind === 'receive-failed') {
      expect(outcome.docError).not.toContain(RAW_TRANSPORT_ERROR);
      expect(outcome.docError).toContain("We couldn't save that action");
    }
  });

  it('maps raw audit/timeline failures to safe messages on governance-partial', async () => {
    updateMock.mockResolvedValueOnce({ success: true, data: {} });
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: RAW_TRANSPORT_ERROR } });
    timelineCreateMock.mockResolvedValueOnce({ success: true, data: { cr664_dealtimelineeventid: 't-1' } });
    const outcome = await markDocumentReceived(input, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain(RAW_TRANSPORT_ERROR);
      expect(outcome.auditError).toContain("We couldn't save that action");
    }
  });
});

describe('markDocumentReviewed — raw error mapping', () => {
  const input = {
    documentId: 'doc-1',
    documentName: 'Business Tax Returns',
    dealId: 'deal-1',
    systemUserId: 'sys-1',
    reviewerName: 'Jamie Banker',
    actorEmail: 'banker@bank.test',
    reviewNote: 'Reviewed, looks complete.',
  };

  it('maps a raw update failure to the safe message on review-failed', async () => {
    updateMock.mockResolvedValueOnce({ success: false, error: { message: RAW_TRANSPORT_ERROR } });
    auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } });
    const outcome = await markDocumentReviewed(input, resolvedActor);
    expect(outcome.kind).toBe('review-failed');
    if (outcome.kind === 'review-failed') {
      expect(outcome.docError).not.toContain(RAW_TRANSPORT_ERROR);
      expect(outcome.docError).toContain("We couldn't save that action");
    }
  });

  it('maps raw audit/timeline failures to safe messages on governance-partial', async () => {
    updateMock.mockResolvedValueOnce({ success: true, data: {} });
    auditCreateMock.mockResolvedValueOnce({ success: true, data: { cr664_auditeventid: 'a-1' } });
    timelineCreateMock.mockResolvedValueOnce({ success: false, error: { message: RAW_TRANSPORT_ERROR } });
    const outcome = await markDocumentReviewed(input, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.timelineError).not.toContain(RAW_TRANSPORT_ERROR);
      expect(outcome.timelineError).toContain("We couldn't save that action");
    }
  });
});
