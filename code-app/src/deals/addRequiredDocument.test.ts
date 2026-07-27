import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { create: vi.fn(), get: vi.fn(), update: vi.fn() },
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
import { addRequiredDocument } from './addRequiredDocumentAction';
import type { ResolveActorChangedBy } from './newDealAuditActorResolver';

const docCreate = vi.mocked(Cr664_documentchecklistsService.create);
const docGet = vi.mocked(Cr664_documentchecklistsService.get);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

const CORE_USER_BIND = '/cr664_users(core-1)';
const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: CORE_USER_BIND }) as never;

const INPUT = {
  dealId: 'deal-1',
  documentName: 'Loan application',
  systemUserId: 'sys-1',
  actorEmail: 'banker@bank.com',
  intakeNote: 'Received from borrower by email.',
};

beforeEach(() => {
  docCreate.mockReset();
  docGet.mockReset();
  auditCreate.mockReset();
  timelineCreate.mockReset();
  auditCreate.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } } as never);
  timelineCreate.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 'tl-1' } } as never);
});

describe('addRequiredDocument — governed intake of a required document', () => {
  it('creates a deal-associated, classified, received checklist row and verifies it on readback', async () => {
    docCreate.mockResolvedValue({ success: true, data: { cr664_documentchecklistid: 'doc-9' } } as never);
    docGet.mockResolvedValue({
      success: true,
      data: { cr664_documentname: 'Loan application', cr664_receiveddate: '2026-07-10T00:00:00Z', _cr664_deal_value: 'deal-1' },
    } as never);

    const out = await addRequiredDocument(INPUT, okResolver);
    expect(out.kind).toBe('success');
    if (out.kind === 'success') expect(out.documentId).toBe('doc-9');

    // Real create: deal FK + classified name + received date (metadata intake, no bytes).
    const body = docCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(body['cr664_documentname']).toBe('Loan application');
    expect(body['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(body['cr664_receiveddate']).toBeTruthy();
    // Never a binary upload flag.
    expect(body['cr664_uploadstatus']).toBeUndefined();
    // Governed: audit + timeline written.
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
  });

  it('fails closed (readback-mismatch) when the row does not read back on the right deal', async () => {
    docCreate.mockResolvedValue({ success: true, data: { cr664_documentchecklistid: 'doc-9' } } as never);
    docGet.mockResolvedValue({
      success: true,
      data: { cr664_documentname: 'Loan application', cr664_receiveddate: '2026-07-10T00:00:00Z', _cr664_deal_value: 'SOME-OTHER-DEAL' },
    } as never);

    const out = await addRequiredDocument(INPUT, okResolver);
    expect(out.kind).toBe('readback-mismatch');
    // No fake success: the timeline "received" event is not emitted on a mismatch.
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('does not fake success when the create call fails, and never renders the raw error verbatim', async () => {
    docCreate.mockResolvedValue({ success: false, error: { message: 'Dataverse rejected the create' } } as never);
    const out = await addRequiredDocument(INPUT, okResolver);
    expect(out.kind).toBe('create-failed');
    expect(docGet).not.toHaveBeenCalled();
    // Final LOS Completion arc (Workstream P) — never render a raw transport error verbatim.
    if (out.kind === 'create-failed') {
      expect(out.docError).not.toContain('Dataverse rejected the create');
      expect(out.docError).toContain("We couldn't save that action");
    }
  });

  it('rejects an empty document name / note without any write', async () => {
    expect((await addRequiredDocument({ ...INPUT, documentName: '  ' }, okResolver)).kind).toBe('unknown');
    expect((await addRequiredDocument({ ...INPUT, intakeNote: '' }, okResolver)).kind).toBe('unknown');
    expect(docCreate).not.toHaveBeenCalled();
  });
});
