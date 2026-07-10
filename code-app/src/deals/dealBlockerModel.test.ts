import { describe, it, expect } from 'vitest';
import { deriveDealBlockerModel, deriveDealBlockerModelForStage } from './dealBlockerModel';
import type { DealDetail } from './dealQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';
import type { DealTasksResult } from './dealTaskQueries';

/**
 * The ONE authoritative blocker model. Pins: hard blockers = the stage-exit engine's tracked
 * blocking requirements (mandatory missing fields + documents), each with a direct remediation
 * route; recommended items do not block; the model stays consistent with the advance guard.
 */

const noDocs: DealDocumentsResult = { outstanding: [], received: [], reviewed: [] };
const noTasks: DealTasksResult = { open: [], completed: [] } as unknown as DealTasksResult;

function deal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Test deal',
    stage: 'Intake',
    ...over,
  } as unknown as DealDetail;
}

function receivedDoc(name: string): DealDocument {
  return { id: `d-${name}`, name, status: 'received', dueDate: undefined, requestDate: undefined, receivedDate: '2026-07-01', reviewer: undefined, uploaded: false, modifiedOn: undefined };
}

describe('deriveDealBlockerModel — Intake exit', () => {
  it('counts the mandatory missing fields + documents as HARD blockers (not just overdue work)', () => {
    const model = deriveDealBlockerModel('INTAKE', { deal: deal(), tasks: noTasks, documents: noDocs, creditMemo: undefined });
    // 7 required Intake fields + 1 required document (Loan application), all missing.
    expect(model.hardBlockerCount).toBe(8);
    expect(model.canAdvance).toBe(false);
    expect(model.missingRequiredDocuments).toEqual(['Loan application']);
    expect(model.missingRequiredFields).toEqual(
      expect.arrayContaining(['Loan amount', 'Client name', 'Product type', 'Loan structure', 'Target close date', 'Industry', 'Customer type']),
    );
  });

  it('gives every hard blocker a DIRECT remediation route to the resolving action', () => {
    const model = deriveDealBlockerModel('INTAKE', { deal: deal(), tasks: noTasks, documents: noDocs, creditMemo: undefined });
    const byLabel = (label: string) => model.hardBlockers.find((b) => b.label === label);

    expect(byLabel('Loan amount')?.remediation).toEqual({ kind: 'edit-profile', field: 'Loan amount' });
    expect(byLabel('Client name')?.remediation).toEqual({ kind: 'link-client' });
    expect(byLabel('Loan application')?.remediation).toEqual({ kind: 'add-document', documentName: 'Loan application' });
    // Every hard blocker carries a remediation (no read-only dead-ends).
    for (const b of model.hardBlockers) expect(b.remediation.kind).not.toBe('none');
  });

  it('recommended tasks are surfaced separately and do NOT block advancement', () => {
    const model = deriveDealBlockerModel('INTAKE', { deal: deal(), tasks: noTasks, documents: noDocs, creditMemo: undefined });
    expect(model.recommended.length).toBeGreaterThan(0);
    for (const r of model.recommended) expect(r.severity).toBe('recommended');
  });

  it('clears to advance once every mandatory field + document is satisfied', () => {
    const complete = deal({
      amount: 2_500_000,
      clientName: 'Acme LLC',
      productType: 'Term Loan',
      loanStructure: 'Amortizing',
      targetCloseDate: '2026-09-08',
      industry: 'Retail',
      customerType: 'Business',
    });
    const model = deriveDealBlockerModel('INTAKE', {
      deal: complete,
      tasks: noTasks,
      documents: { ...noDocs, received: [receivedDoc('Loan application')] },
      creditMemo: undefined,
    });
    expect(model.hardBlockerCount).toBe(0);
    expect(model.canAdvance).toBe(true);
    expect(model.missingRequiredDocuments).toEqual([]);
  });

  it('a single missing field is the only hard blocker (aggregation stays exact)', () => {
    const almost = deal({
      clientName: 'Acme LLC',
      productType: 'Term Loan',
      loanStructure: 'Amortizing',
      targetCloseDate: '2026-09-08',
      industry: 'Retail',
      customerType: 'Business',
      // amount still missing
    });
    const model = deriveDealBlockerModel('INTAKE', {
      deal: almost,
      tasks: noTasks,
      documents: { ...noDocs, received: [receivedDoc('Loan application')] },
      creditMemo: undefined,
    });
    expect(model.hardBlockerCount).toBe(1);
    expect(model.hardBlockers[0].label).toBe('Loan amount');
  });
});

describe('deriveDealBlockerModelForStage', () => {
  it('returns undefined for an unrecognized/custom stage (no fabricated contract)', () => {
    expect(deriveDealBlockerModelForStage('Some Custom Stage', { deal: deal({ stage: 'Some Custom Stage' }), tasks: noTasks, documents: noDocs, creditMemo: undefined })).toBeUndefined();
  });

  it('recognizes the Intake stage by its stored name', () => {
    const model = deriveDealBlockerModelForStage('Intake', { deal: deal(), tasks: noTasks, documents: noDocs, creditMemo: undefined });
    expect(model?.stageCode).toBe('INTAKE');
  });
});
