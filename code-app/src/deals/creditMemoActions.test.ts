import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_creditmemodraftsectionsService } from '../generated/services/Cr664_creditmemodraftsectionsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { saveCreditMemoDraft } from './creditMemoActions';

const memoCreate = vi.mocked(Cr664_creditmemo1sService.create);
const sectionCreate = vi.mocked(Cr664_creditmemodraftsectionsService.create);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

function memoOk(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_creditmemo1id: id },
  } as unknown as ReturnType<typeof Cr664_creditmemo1sService.create> extends Promise<
    infer R
  >
    ? R
    : never);
}
function memoFail(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_creditmemo1sService.create> extends Promise<
    infer R
  >
    ? R
    : never);
}
function sectionOk(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_creditmemodraftsectionid: id },
  } as unknown as ReturnType<
    typeof Cr664_creditmemodraftsectionsService.create
  > extends Promise<infer R>
    ? R
    : never);
}
function sectionFail(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<
    typeof Cr664_creditmemodraftsectionsService.create
  > extends Promise<infer R>
    ? R
    : never);
}
function auditOk(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_auditeventid: id },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create> extends Promise<
    infer R
  >
    ? R
    : never);
}
function auditFail(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create> extends Promise<
    infer R
  >
    ? R
    : never);
}
function timelineOk(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_dealtimelineeventid: id },
  } as unknown as ReturnType<
    typeof Cr664_dealtimelineeventsService.create
  > extends Promise<infer R>
    ? R
    : never);
}
function timelineFail(message: string) {
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

function baseInput(
  overrides: Partial<Parameters<typeof saveCreditMemoDraft>[0]> = {},
) {
  return {
    dealId: 'deal-77',
    dealName: 'Acme Tooling 2026 Working Capital',
    workspaceId: 'workspace-banker',
    systemUserId: 'sys-user-1',
    memoName: 'Acme Tooling — Draft v1',
    memoType: 'Banker draft',
    memoBody: 'Memo body content',
    saveNote: 'Saving for review',
    sections: [
      {
        sectionKey: 'executive-summary',
        sectionLabel: 'Executive Summary',
        draftText: 'Exec summary draft text',
      },
      {
        sectionKey: 'loan-request',
        sectionLabel: 'Loan Request',
        draftText: 'Loan request draft text',
      },
    ],
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  memoCreate.mockReset();
  sectionCreate.mockReset();
  auditCreate.mockReset();
  timelineCreate.mockReset();
});

describe('saveCreditMemoDraft', () => {
  it('returns success when memo + sections + audit + timeline all succeed', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValueOnce(sectionOk('s-1')).mockReturnValueOnce(sectionOk('s-2'));
    auditCreate.mockReturnValue(auditOk('a-1'));
    timelineCreate.mockReturnValue(timelineOk('t-1'));

    const outcome = await saveCreditMemoDraft(baseInput());

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.memoId).toBe('memo-1');
      expect(outcome.sectionIds).toEqual(['s-1', 's-2']);
    }
    expect(memoCreate).toHaveBeenCalledTimes(1);
    expect(sectionCreate).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
  });

  it('creates the memo with status=Draft (788190000) and stamps the authorized deal and workspace', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValue(sectionOk('s-1'));
    auditCreate.mockReturnValue(auditOk('a-1'));
    timelineCreate.mockReturnValue(timelineOk('t-1'));

    await saveCreditMemoDraft(baseInput({ sections: [] }));

    const payload = memoCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_status).toBe(788190000);
    expect(payload.cr664_workspaceid).toBe('workspace-banker');
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload.cr664_borrowersafe).toBe(false);
    expect(payload.cr664_memotext).toBe('Memo body content');
    expect(payload.cr664_version).toBe(1);
    expect(typeof payload.cr664_generatedat).toBe('string');
  });

  it('creates one cr664_creditmemodraftsection per included section, all in Pending review', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValueOnce(sectionOk('s-1')).mockReturnValueOnce(sectionOk('s-2'));
    auditCreate.mockReturnValue(auditOk('a-1'));
    timelineCreate.mockReturnValue(timelineOk('t-1'));

    await saveCreditMemoDraft(baseInput());

    expect(sectionCreate).toHaveBeenCalledTimes(2);
    for (const call of sectionCreate.mock.calls) {
      const p = call[0] as Record<string, unknown>;
      expect(p.cr664_reviewstatus).toBe(788190000); // Pending
      expect(p['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
      expect(typeof p.cr664_sectionkey).toBe('string');
      expect(typeof p.cr664_drafttext).toBe('string');
    }
  });

  it('returns memo-failed and fires a best-effort Failed audit when the memo create fails — no sections, no timeline', async () => {
    memoCreate.mockReturnValue(memoFail('memo row locked'));
    auditCreate.mockReturnValue(auditOk('a-fail'));

    const outcome = await saveCreditMemoDraft(baseInput());

    expect(outcome.kind).toBe('memo-failed');
    if (outcome.kind === 'memo-failed') {
      expect(outcome.memoError).toBe('memo row locked');
    }
    expect(memoCreate).toHaveBeenCalledTimes(1);
    // Sections must NOT be attempted once memo create has failed.
    expect(sectionCreate).not.toHaveBeenCalled();
    // Timeline must NOT be attempted on memo-failed.
    expect(timelineCreate).not.toHaveBeenCalled();
    // Best-effort Failed audit.
    expect(auditCreate).toHaveBeenCalled();
    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190001); // Failed
    expect(payload.cr664_failurereason).toBe('memo row locked');
  });

  it('returns governance-partial reporting the offending section when one section fails but memo + audit + timeline succeed', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate
      .mockReturnValueOnce(sectionOk('s-1'))
      .mockReturnValueOnce(sectionFail('section boom'));
    auditCreate.mockReturnValue(auditOk('a-1'));
    timelineCreate.mockReturnValue(timelineOk('t-1'));

    const outcome = await saveCreditMemoDraft(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.memoId).toBe('memo-1');
      expect(outcome.sectionErrors).toEqual([
        { sectionKey: 'loan-request', error: 'section boom' },
      ]);
      expect(outcome.auditError).toBeUndefined();
      expect(outcome.timelineError).toBeUndefined();
    }
  });

  it('returns governance-partial when audit fails but memo + sections + timeline succeed', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValueOnce(sectionOk('s-1')).mockReturnValueOnce(sectionOk('s-2'));
    auditCreate.mockReturnValue(auditFail('audit blocked'));
    timelineCreate.mockReturnValue(timelineOk('t-1'));

    const outcome = await saveCreditMemoDraft(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBe('audit blocked');
      expect(outcome.timelineError).toBeUndefined();
      expect(outcome.sectionErrors).toEqual([]);
    }
  });

  it('returns governance-partial when timeline fails but memo + sections + audit succeed', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValueOnce(sectionOk('s-1')).mockReturnValueOnce(sectionOk('s-2'));
    auditCreate.mockReturnValue(auditOk('a-1'));
    timelineCreate.mockReturnValue(timelineFail('timeline 500'));

    const outcome = await saveCreditMemoDraft(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBeUndefined();
      expect(outcome.timelineError).toBe('timeline 500');
      expect(outcome.sectionErrors).toEqual([]);
    }
  });

  it('returns governance-partial reporting ALL three when sections, audit, and timeline all fail', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValue(sectionFail('every section boom'));
    auditCreate.mockReturnValue(auditFail('audit boom'));
    timelineCreate.mockReturnValue(timelineFail('timeline boom'));

    const outcome = await saveCreditMemoDraft(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.sectionErrors.length).toBe(2);
      expect(outcome.auditError).toBe('audit boom');
      expect(outcome.timelineError).toBe('timeline boom');
    }
  });

  it('rejects an empty save note without touching any service', async () => {
    const outcome = await saveCreditMemoDraft(baseInput({ saveNote: '   ' }));
    expect(outcome.kind).toBe('unknown');
    expect(memoCreate).not.toHaveBeenCalled();
    expect(sectionCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty memo body without touching any service', async () => {
    const outcome = await saveCreditMemoDraft(baseInput({ memoBody: '   ' }));
    expect(outcome.kind).toBe('unknown');
    expect(memoCreate).not.toHaveBeenCalled();
  });

  it('writes the memo body verbatim to cr664_memotext and the note to the audit + timeline', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValue(sectionOk('s-1'));
    auditCreate.mockReturnValue(auditOk('a-1'));
    timelineCreate.mockReturnValue(timelineOk('t-1'));

    await saveCreditMemoDraft(
      baseInput({
        memoBody: 'A very specific body  ',
        saveNote: '  Save note text  ',
        sections: [],
      }),
    );

    const memoP = memoCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(memoP.cr664_memotext).toBe('A very specific body  ');

    const auditP = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(auditP.cr664_notes).toBe('Save note text');
    expect(auditP.cr664_beforestate).toBe('Not yet drafted');
    expect(auditP.cr664_afterstate).toBe('Draft');
    expect(auditP.cr664_sourcescreensourceprocess).toBe(
      'DealWorkspace/CreditMemo/saveDraft',
    );
    expect(auditP.cr664_relatedentitytype).toBe('cr664_creditmemo1');
    expect(auditP.cr664_relatedentityid).toBe('memo-1');

    const timelineP = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
    // No CreditMemoDrafted enum exists; we use NoteLogged (788190002).
    expect(timelineP.cr664_eventtype).toBe(788190002);
    expect(timelineP.cr664_summary).toBe('Save note text');
    expect(timelineP.cr664_relatedentityid).toBe('memo-1');
  });

  it('produces a unique correlation id per attempt and ties audit + timeline within one attempt', async () => {
    memoCreate
      .mockReturnValueOnce(memoOk('memo-A'))
      .mockReturnValueOnce(memoOk('memo-B'));
    sectionCreate.mockReturnValue(sectionOk('s'));
    auditCreate.mockReturnValueOnce(auditOk('a-A')).mockReturnValueOnce(auditOk('a-B'));
    timelineCreate.mockReturnValueOnce(timelineOk('t-A')).mockReturnValueOnce(timelineOk('t-B'));

    await saveCreditMemoDraft(baseInput({ sections: [] }));
    await saveCreditMemoDraft(baseInput({ sections: [] }));

    const c1 = (auditCreate.mock.calls[0]![0] as Record<string, unknown>).cr664_correlationid;
    const c2 = (auditCreate.mock.calls[1]![0] as Record<string, unknown>).cr664_correlationid;
    expect(c1).not.toEqual(c2);

    const subtype1 = (
      timelineCreate.mock.calls[0]![0] as Record<string, unknown>
    ).cr664_eventsubtype as string;
    const subtype2 = (
      timelineCreate.mock.calls[1]![0] as Record<string, unknown>
    ).cr664_eventsubtype as string;
    expect(subtype1.startsWith('creditmemo:draft-saved|correlation:')).toBe(true);
    expect(subtype1).toContain(`correlation:${c1 as string}`);
    expect(subtype2).toContain(`correlation:${c2 as string}`);
  });

  it('does NOT touch any existing memo record — only create is ever called', async () => {
    memoCreate.mockReturnValue(memoOk('memo-1'));
    sectionCreate.mockReturnValue(sectionOk('s'));
    auditCreate.mockReturnValue(auditOk('a-1'));
    timelineCreate.mockReturnValue(timelineOk('t-1'));

    await saveCreditMemoDraft(baseInput({ sections: [] }));

    // The service module is fully mocked, so the only memo-side call
    // can be `create`. Confirm via the mock module that no other
    // method on the memo service was invoked.
    expect(memoCreate).toHaveBeenCalledTimes(1);
    const memoServiceAny = Cr664_creditmemo1sService as unknown as Record<
      string,
      unknown
    >;
    expect(
      Object.keys(memoServiceAny).filter(
        (k) => k !== 'create' && typeof memoServiceAny[k] === 'function',
      ),
    ).toEqual([]);
  });
});
