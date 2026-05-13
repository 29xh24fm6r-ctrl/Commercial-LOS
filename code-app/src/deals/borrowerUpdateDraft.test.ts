import { describe, it, expect } from 'vitest';
import type { DealDetail } from './dealQueries';
import type { DealDocument } from './dealDocumentQueries';
import type { DealTask } from './dealTaskQueries';
import {
  TEMPLATE_OPTIONS,
  buildBorrowerUpdateDraft,
  findProhibitedTerms,
  type DraftContext,
} from './borrowerUpdateDraft';

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-06-30T00:00:00Z',
  productType: undefined,
  loanStructure: undefined,
  customerType: undefined,
  industry: undefined,
  guarantorStructure: undefined,
  pricingType: undefined,
  spreadIndex: undefined,
  spreadMargin: undefined,
  collateralSummary: undefined,
  createdOn: undefined,
  stageEntryDate: undefined,
  isClosed: false,
};

const pfs: DealDocument = {
  id: 'doc-1',
  name: 'Personal Financial Statement',
  dueDate: '2026-05-30T00:00:00Z',
  requestDate: undefined,
  receivedDate: undefined,
  reviewer: undefined,
  uploaded: false,
  modifiedOn: undefined,
  status: 'outstanding',
};
const taxReturn: DealDocument = {
  ...pfs,
  id: 'doc-2',
  name: '2024 Business Tax Return',
};

function ctx(overrides: Partial<DraftContext> = {}): DraftContext {
  return {
    deal: baseDeal,
    outstandingDocuments: [pfs, taxReturn],
    openTasks: [],
    bankerName: 'M. Paller',
    ...overrides,
  };
}

describe('TEMPLATE_OPTIONS', () => {
  it('exposes the four required templates in the brief', () => {
    const keys = TEMPLATE_OPTIONS.map((o) => o.key);
    expect(keys).toEqual([
      'general-status',
      'missing-documents',
      'underwriting-update',
      'closing-progress',
    ]);
  });
});

describe('buildBorrowerUpdateDraft — generated content', () => {
  it('general-status: subject and body include deal name and stage', () => {
    const d = buildBorrowerUpdateDraft('general-status', ctx());
    expect(d.subject).toContain('Acme Tooling 2026 Working Capital');
    expect(d.body).toContain('Acme Tooling 2026 Working Capital');
    expect(d.body).toContain('Underwriting');
  });

  it('greets the borrower by client name when present', () => {
    const d = buildBorrowerUpdateDraft('general-status', ctx());
    expect(d.body.startsWith('Hi Acme Tooling,')).toBe(true);
  });

  it('falls back to a neutral greeting if no client name is known', () => {
    const dealNoClient: DealDetail = { ...baseDeal, clientName: undefined };
    const d = buildBorrowerUpdateDraft('general-status', ctx({ deal: dealNoClient }));
    expect(d.body.startsWith('Hi there,')).toBe(true);
  });

  it('missing-documents: body lists every outstanding document name', () => {
    const d = buildBorrowerUpdateDraft('missing-documents', ctx());
    expect(d.body).toContain('Personal Financial Statement');
    expect(d.body).toContain('2024 Business Tax Return');
    // The "still need" framing must be present so it reads as a reminder.
    expect(d.body.toLowerCase()).toContain('outstanding');
  });

  it('missing-documents: when nothing is outstanding the body says so without listing items', () => {
    const d = buildBorrowerUpdateDraft(
      'missing-documents',
      ctx({ outstandingDocuments: [] }),
    );
    expect(d.body).toContain('records show nothing outstanding');
    expect(d.body).not.toContain('  - ');
  });

  it('underwriting-update: explicitly avoids any decision language', () => {
    const d = buildBorrowerUpdateDraft('underwriting-update', ctx());
    expect(d.body).toContain('Underwriting is reviewing');
    expect(d.body).toContain('have not made any final decisions yet');
    expect(/\bapproved\b/i.test(d.body)).toBe(false);
    expect(/\bcleared\s+to\s+close\b/i.test(d.body)).toBe(false);
  });

  it('closing-progress: never emits clear-to-close language even when on a closing stage', () => {
    const closingDeal: DealDetail = { ...baseDeal, stage: 'Closing' };
    const d = buildBorrowerUpdateDraft('closing-progress', ctx({ deal: closingDeal }));
    expect(/\bcleared\s+to\s+close\b/i.test(d.body)).toBe(false);
    expect(/\bclear\s+to\s+close\b/i.test(d.body)).toBe(false);
    expect(d.body).toContain('Closing');
  });

  it('appends the banker signoff when bankerName is provided', () => {
    const d = buildBorrowerUpdateDraft('general-status', ctx({ bankerName: 'M. Paller' }));
    expect(d.body.trimEnd().endsWith('M. Paller')).toBe(true);
  });

  it('falls back to a neutral signoff if no bankerName', () => {
    const d = buildBorrowerUpdateDraft('general-status', ctx({ bankerName: undefined }));
    expect(d.body.trimEnd().endsWith('Thank you,')).toBe(true);
  });

  it('next-steps block surfaces open tasks (capped) when present', () => {
    const tasks: DealTask[] = [
      { id: 't1', title: 'Review collateral schedule', completed: false, dueDate: undefined, assigneeName: undefined, modifiedOn: undefined },
      { id: 't2', title: 'Confirm guarantor list', completed: false, dueDate: undefined, assigneeName: undefined, modifiedOn: undefined },
    ];
    const d = buildBorrowerUpdateDraft('general-status', ctx({ openTasks: tasks }));
    expect(d.body).toContain('Review collateral schedule');
    expect(d.body).toContain('Confirm guarantor list');
  });
});

describe('findProhibitedTerms — borrower-safe content guard', () => {
  it('flags commitment language when stage/status does NOT support it', () => {
    const text = 'Good news — your loan is approved and guaranteed to close.';
    const hits = findProhibitedTerms(text, baseDeal);
    const terms = hits.map((h) => h.term);
    expect(terms).toContain('approved');
    expect(terms.some((t) => t === 'guaranteed' || t === 'guarantee')).toBe(true);
  });

  it('flags "cleared to close" on a deal that is not in a closing stage', () => {
    const text = 'You are cleared to close next week.';
    const hits = findProhibitedTerms(text, baseDeal);
    expect(hits.some((h) => h.term === 'cleared to close')).toBe(true);
  });

  it('allows "approved" when the deal status explicitly contains Approved', () => {
    const approvedDeal: DealDetail = { ...baseDeal, status: 'Approved' };
    const hits = findProhibitedTerms('Your loan has been approved.', approvedDeal);
    expect(hits.find((h) => h.term === 'approved')).toBeUndefined();
  });

  it('allows "cleared to close" when stage indicates closing', () => {
    const closingDeal: DealDetail = { ...baseDeal, stage: 'Closed' };
    const hits = findProhibitedTerms(
      'Congrats — you are cleared to close.',
      closingDeal,
    );
    expect(hits.find((h) => h.term === 'cleared to close')).toBeUndefined();
  });

  it('returns no hits on a borrower-safe message', () => {
    const text = 'Hi Acme Tooling, just a quick status update on your file.';
    expect(findProhibitedTerms(text, baseDeal)).toEqual([]);
  });

  it('every generated template passes the guard on a neutral deal stage/status', () => {
    for (const opt of TEMPLATE_OPTIONS) {
      const d = buildBorrowerUpdateDraft(opt.key, ctx());
      const hits = findProhibitedTerms(`${d.subject}\n${d.body}`, baseDeal);
      expect(hits).toEqual([]);
    }
  });
});
