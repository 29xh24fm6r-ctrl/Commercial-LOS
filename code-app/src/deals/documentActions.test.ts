import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { update: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { markDocumentReceived, requestDocument } from './documentActions';

const docUpdate = vi.mocked(Cr664_documentchecklistsService.update);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

function baseInput(overrides: Partial<Parameters<typeof requestDocument>[0]> = {}) {
  return {
    documentId: 'doc-1',
    documentName: 'Personal Financial Statement',
    dealId: 'deal-77',
    priorRequestDate: undefined,
    systemUserId: 'sys-user-1',
    requestNote: 'kindly upload most recent PFS',
    ...overrides,
  };
}

function successUpdate() {
  return Promise.resolve({ success: true, data: undefined } as unknown as ReturnType<
    typeof Cr664_documentchecklistsService.update
  > extends Promise<infer R>
    ? R
    : never);
}
function failedUpdate(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_documentchecklistsService.update> extends Promise<
    infer R
  >
    ? R
    : never);
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
  docUpdate.mockReset();
  auditCreate.mockReset();
  timelineCreate.mockReset();
});

describe('requestDocument', () => {
  it('returns success when document update + audit + timeline all succeed', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    const outcome = await requestDocument(baseInput());

    expect(outcome.kind).toBe('success');
    expect(docUpdate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
  });

  it('writes cr664_requestdate (ISO string) on the document', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await requestDocument(baseInput({ requestNote: '  trimmed note  ' }));

    expect(docUpdate).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({ cr664_requestdate: expect.any(String) }),
    );
    const payload = docUpdate.mock.calls[0]![1] as Record<string, unknown>;
    // ISO date — should be parsable.
    expect(Number.isNaN(new Date(payload.cr664_requestdate as string).getTime())).toBe(
      false,
    );
  });

  it('emits an audit event with the Lifecycle + StatusChange contract on the document', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await requestDocument(baseInput());

    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventcategory).toBe(788190002); // Lifecycle
    expect(payload.cr664_eventtype).toBe(788190001); // StatusChange
    expect(payload.cr664_entitytype).toBe(788190000); // LoanDeal
    expect(payload.cr664_outcomestatus).toBe(788190000); // Succeeded
    expect(payload.cr664_entityid).toBe('doc-1');
    expect(payload.cr664_relatedentitytype).toBe('cr664_documentchecklist');
    expect(payload.cr664_relatedentityid).toBe('doc-1');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload['cr664_ActorUser@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_fieldname).toBe('cr664_requestdate');
    expect(payload.cr664_beforestate).toBe('Not yet requested');
    expect(payload.cr664_afterstate).toBe('Requested');
    expect(payload.cr664_sourcescreensourceprocess).toBe(
      'DealWorkspace/DealDocuments/request',
    );
    expect(payload.cr664_notes).toBe('kindly upload most recent PFS');
    expect(typeof payload.cr664_correlationid).toBe('string');
  });

  it('records the prior request date in the audit beforestate when re-requesting', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-2'));
    timelineCreate.mockReturnValue(successTimeline('t-2'));

    await requestDocument(baseInput({ priorRequestDate: '2026-04-01T00:00:00Z' }));

    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_beforestate).toBe(
      'Previously requested (2026-04-01T00:00:00Z)',
    );
    expect(payload.cr664_oldvalue).toBe('2026-04-01T00:00:00Z');
  });

  it('emits a DealTimelineEvent with cr664_eventtype=DocumentRequested (788190009)', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await requestDocument(baseInput());

    const payload = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190009);
    expect(payload.cr664_title).toBe('Personal Financial Statement');
    expect(payload.cr664_summary).toBe('kindly upload most recent PFS');
    expect(payload.cr664_issystemgenerated).toBe(false);
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload['cr664_EventBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_relatedentitytype).toBe('cr664_documentchecklist');
    expect(payload.cr664_relatedentityid).toBe('doc-1');
    expect(payload.cr664_visibilityscope).toBe(788190000); // BankerAndManager
  });

  it('returns doc-failed and fires a best-effort Failed audit when the document update fails', async () => {
    docUpdate.mockReturnValue(failedUpdate('row locked'));
    auditCreate.mockReturnValue(successAudit('a-fail-trace'));
    timelineCreate.mockReturnValue(successTimeline('t-not-called'));

    const outcome = await requestDocument(baseInput());

    expect(outcome.kind).toBe('doc-failed');
    if (outcome.kind === 'doc-failed') {
      expect(outcome.docError).toBe('row locked');
    }
    expect(docUpdate).toHaveBeenCalledTimes(1);
    // Best-effort Failed audit.
    expect(auditCreate).toHaveBeenCalled();
    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190001); // Failed
    expect(payload.cr664_failurereason).toBe('row locked');
    // Timeline is NOT attempted on doc-failed.
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('returns governance-partial when audit fails but doc + timeline succeed', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(failedAudit('audit write blocked'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    const outcome = await requestDocument(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBe('audit write blocked');
      expect(outcome.timelineError).toBeUndefined();
    }
  });

  it('returns governance-partial when timeline fails but doc + audit succeed', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(failedTimeline('timeline 500'));

    const outcome = await requestDocument(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBeUndefined();
      expect(outcome.timelineError).toBe('timeline 500');
    }
  });

  it('returns governance-partial reporting BOTH errors when audit and timeline both fail', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(failedAudit('audit boom'));
    timelineCreate.mockReturnValue(failedTimeline('timeline boom'));

    const outcome = await requestDocument(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBe('audit boom');
      expect(outcome.timelineError).toBe('timeline boom');
    }
  });

  it('rejects an empty request note without touching any service', async () => {
    const outcome = await requestDocument(baseInput({ requestNote: '   ' }));
    expect(outcome.kind).toBe('unknown');
    expect(docUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('generates a distinct correlation id per attempt; same id ties audit and timeline within one attempt', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));
    await requestDocument(baseInput());

    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-2'));
    timelineCreate.mockReturnValue(successTimeline('t-2'));
    await requestDocument(baseInput());

    const audit1 = (auditCreate.mock.calls[0]![0] as Record<string, unknown>).cr664_correlationid;
    const audit2 = (auditCreate.mock.calls[1]![0] as Record<string, unknown>).cr664_correlationid;
    const timeline1 = (timelineCreate.mock.calls[0]![0] as Record<string, unknown>).cr664_eventsubtype;
    const timeline2 = (timelineCreate.mock.calls[1]![0] as Record<string, unknown>).cr664_eventsubtype;

    expect(audit1).not.toEqual(audit2);
    expect(timeline1).toBe(`correlation:${audit1 as string}`);
    expect(timeline2).toBe(`correlation:${audit2 as string}`);
  });
});

// ---------------------------------------------------------------------------
// Phase 51 — markDocumentReceived
// ---------------------------------------------------------------------------

function baseReceiveInput(
  overrides: Partial<Parameters<typeof markDocumentReceived>[0]> = {},
) {
  return {
    documentId: 'doc-1',
    documentName: 'Personal Financial Statement',
    dealId: 'deal-77',
    systemUserId: 'sys-user-1',
    receiveNote: 'received via email from borrower',
    ...overrides,
  };
}

describe('markDocumentReceived', () => {
  it('returns success when document update + audit + timeline all succeed', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    const outcome = await markDocumentReceived(baseReceiveInput());

    expect(outcome.kind).toBe('success');
    expect(docUpdate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
  });

  it('writes cr664_receiveddate (ISO string) on the document — NOT cr664_uploadstatus', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await markDocumentReceived(baseReceiveInput());

    expect(docUpdate).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({ cr664_receiveddate: expect.any(String) }),
    );
    const payload = docUpdate.mock.calls[0]![1] as Record<string, unknown>;
    // Honest scope: phase 51 does NOT set cr664_uploadstatus — that
    // flag is reserved for a future phase that wires real in-app
    // binary upload.
    expect(payload.cr664_uploadstatus).toBeUndefined();
    expect(
      Number.isNaN(new Date(payload.cr664_receiveddate as string).getTime()),
    ).toBe(false);
  });

  it('emits an audit event with Outstanding → Received state and the receiveddate fieldname', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await markDocumentReceived(baseReceiveInput());

    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_auditeventname).toBe('DocumentChecklist Received');
    expect(payload.cr664_eventcategory).toBe(788190002); // Lifecycle
    expect(payload.cr664_eventtype).toBe(788190001); // StatusChange
    expect(payload.cr664_entitytype).toBe(788190000); // LoanDeal
    expect(payload.cr664_outcomestatus).toBe(788190000); // Succeeded
    expect(payload.cr664_entityid).toBe('doc-1');
    expect(payload.cr664_relatedentitytype).toBe('cr664_documentchecklist');
    expect(payload.cr664_relatedentityid).toBe('doc-1');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload['cr664_ActorUser@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_fieldname).toBe('cr664_receiveddate');
    expect(payload.cr664_beforestate).toBe('Outstanding');
    expect(payload.cr664_afterstate).toBe('Received');
    expect(payload.cr664_sourcescreensourceprocess).toBe(
      'DealWorkspace/DealDocuments/receive',
    );
    expect(payload.cr664_notes).toBe('received via email from borrower');
    expect(typeof payload.cr664_correlationid).toBe('string');
  });

  it('emits a DealTimelineEvent with cr664_eventtype=DocumentUploaded (788190010)', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await markDocumentReceived(baseReceiveInput());

    const payload = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190010);
    expect(payload.cr664_title).toBe('Personal Financial Statement');
    expect(payload.cr664_summary).toBe('received via email from borrower');
    expect(payload.cr664_issystemgenerated).toBe(false);
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload['cr664_EventBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_relatedentitytype).toBe('cr664_documentchecklist');
    expect(payload.cr664_relatedentityid).toBe('doc-1');
    expect(payload.cr664_visibilityscope).toBe(788190000); // BankerAndManager
  });

  it('returns receive-failed and fires a best-effort Failed audit when the document update fails', async () => {
    docUpdate.mockReturnValue(failedUpdate('row locked'));
    auditCreate.mockReturnValue(successAudit('a-fail-trace'));
    timelineCreate.mockReturnValue(successTimeline('t-not-called'));

    const outcome = await markDocumentReceived(baseReceiveInput());

    expect(outcome.kind).toBe('receive-failed');
    if (outcome.kind === 'receive-failed') {
      expect(outcome.docError).toBe('row locked');
    }
    expect(docUpdate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalled();
    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190001); // Failed
    expect(payload.cr664_failurereason).toBe('row locked');
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('returns governance-partial when audit fails but doc + timeline succeed', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(failedAudit('audit write blocked'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    const outcome = await markDocumentReceived(baseReceiveInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBe('audit write blocked');
      expect(outcome.timelineError).toBeUndefined();
    }
  });

  it('returns governance-partial when timeline fails but doc + audit succeed', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(failedTimeline('timeline 500'));

    const outcome = await markDocumentReceived(baseReceiveInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBeUndefined();
      expect(outcome.timelineError).toBe('timeline 500');
    }
  });

  it('rejects an empty receipt note without touching any service', async () => {
    const outcome = await markDocumentReceived(
      baseReceiveInput({ receiveNote: '   ' }),
    );
    expect(outcome.kind).toBe('unknown');
    expect(docUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('generates a distinct correlation id per attempt; same id ties audit and timeline within one attempt', async () => {
    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));
    await markDocumentReceived(baseReceiveInput());

    docUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-2'));
    timelineCreate.mockReturnValue(successTimeline('t-2'));
    await markDocumentReceived(baseReceiveInput());

    const audit1 = (auditCreate.mock.calls[0]![0] as Record<string, unknown>).cr664_correlationid;
    const audit2 = (auditCreate.mock.calls[1]![0] as Record<string, unknown>).cr664_correlationid;
    const timeline1 = (timelineCreate.mock.calls[0]![0] as Record<string, unknown>).cr664_eventsubtype;
    const timeline2 = (timelineCreate.mock.calls[1]![0] as Record<string, unknown>).cr664_eventsubtype;

    expect(audit1).not.toEqual(audit2);
    expect(timeline1).toBe(`correlation:${audit1 as string}`);
    expect(timeline2).toBe(`correlation:${audit2 as string}`);
  });
});
