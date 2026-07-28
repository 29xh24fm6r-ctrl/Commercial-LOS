import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveDealBlockerModel, deriveDealBlockerModelForStage } from './dealBlockerModel';
import type { DealDetail } from './dealQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';
import type { DealTasksResult } from './dealTaskQueries';
import { evaluateBoardingHandoff } from '../workflow/boardingHandoffReadiness';

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

describe('deep lifecycle blocker remediation', () => {
  it.each([
    ['UNDERWRITING', 'Risk rating assigned', '[data-deal-card="risk-rating"]', 'Open Risk Rating'],
    ['CREDIT_APPROVAL', 'Approval decision recorded', '[data-deal-card="credit-approval-decision"]', 'Open Approval Decision'],
    ['COMMITMENT', 'Commitment / term sheet issued', '[data-deal-card="commitment"]', 'Open Commitment'],
    ['DOCUMENTATION', 'Conditions precedent cleared', '[data-deal-card="condition-verification"]', 'Open Condition Verification'],
    ['CLOSING_FUNDING', 'Loan documents executed', '[data-deal-card="executed-document-attestation"]', 'Open Executed Documents'],
    ['CLOSING_FUNDING', 'Funds disbursed', '[data-deal-card="funding-authorization"]', 'Open Funding Authorization'],
    ['CLOSING_FUNDING', 'Booking quality control complete', '[data-deal-card="booking-qc"]', 'Open Booking QC'],
    ['BOARDED', 'Boarded loan / servicing handoff record created', '[data-deal-card="portfolio-boarding-status"]', 'Open Portfolio Boarding'],
  ] as const)('routes %s / %s to its exact resolving surface', (stage, label, selector, actionLabel) => {
    const model = deriveDealBlockerModel(stage, {
      deal: deal({ stage }),
      tasks: noTasks,
      documents: noDocs,
      creditMemo: undefined,
    });
    expect(model.hardBlockers.find((b) => b.label === label)?.remediation).toEqual({
      kind: 'open-deal-section',
      selector,
      label: actionLabel,
    });
  });

  it('routes servicing-owner assignment to the governed Admin surface', () => {
    const model = deriveDealBlockerModel('BOARDED', {
      deal: deal({ stage: 'Boarded' }),
      tasks: noTasks,
      documents: noDocs,
      creditMemo: undefined,
      boardingHandoff: evaluateBoardingHandoff('Boarded', {
        portfolioBoardedLoanId: 'loan-1',
        active: true,
      }),
    });
    expect(model.hardBlockers.find((b) => b.label === 'Servicing owner assigned')?.remediation).toEqual({
      kind: 'open-route',
      href: '/admin#assign-servicing-owner',
      label: 'Open Admin assignment',
    });
  });

  it('every in-cockpit deep remediation selector is mounted by BankerDealWorkspace', () => {
    const workspace = readFileSync(resolve(__dirname, 'BankerDealWorkspace.tsx'), 'utf8');
    for (const stage of ['UNDERWRITING', 'CREDIT_APPROVAL', 'COMMITMENT', 'DOCUMENTATION', 'CLOSING_FUNDING', 'BOARDED'] as const) {
      const model = deriveDealBlockerModel(stage, {
        deal: deal({ stage }),
        tasks: noTasks,
        documents: noDocs,
        creditMemo: undefined,
      });
      for (const blocker of model.hardBlockers) {
        if (blocker.remediation.kind !== 'open-deal-section') continue;
        const card = blocker.remediation.selector.match(/data-deal-card="([^"]+)"/)?.[1];
        expect(card, blocker.id).toBeDefined();
        expect(workspace, `${blocker.id} targets an unmounted deal card`).toContain(`data-deal-card="${card}"`);
      }
    }
  });
});
