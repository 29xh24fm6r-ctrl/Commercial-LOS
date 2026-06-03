import { describe, it, expect } from 'vitest';
import { buildDealCopilotContext } from './dealCopilotContext';

describe('Phase 129A — dealCopilotContext', () => {
  const baseDeal = {
    id: 'deal-1',
    name: 'Acme WC',
    clientName: 'Acme Inc.',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4500000,
    targetCloseDate: undefined,
    productType: undefined,
    loanStructure: undefined,
    isClosed: false,
  };

  it('maps deal fields to context', () => {
    const ctx = buildDealCopilotContext({
      deal: baseDeal as any,
      tasks: [
        { id: 't1', title: 'Review', isComplete: false },
        { id: 't2', title: 'Upload', isComplete: true },
      ],
      documents: [
        { id: 'd1', name: 'Appraisal', status: 'Outstanding' },
        { id: 'd2', name: 'Insurance', status: 'Received' },
      ],
      blockers: [{ label: 'Missing appraisal' }],
    });

    expect(ctx.dealName).toBe('Acme WC');
    expect(ctx.clientName).toBe('Acme Inc.');
    expect(ctx.stage).toBe('Underwriting');
    expect(ctx.status).toBe('Active');
    expect(ctx.amount).toBe(4500000);
    expect(ctx.taskCount).toBe(2);
    expect(ctx.openTaskCount).toBe(1);
    expect(ctx.documentCount).toBe(2);
    expect(ctx.outstandingDocumentCount).toBe(1);
    expect(ctx.blockerCount).toBe(1);
    expect(ctx.blockerSummaries).toEqual(['Missing appraisal']);
  });

  it('counts Requested documents as outstanding', () => {
    const ctx = buildDealCopilotContext({
      deal: baseDeal as any,
      tasks: [],
      documents: [
        { id: 'd1', name: 'Tax returns', status: 'Requested' },
        { id: 'd2', name: 'Insurance', status: 'Reviewed' },
      ],
      blockers: [],
    });

    expect(ctx.outstandingDocumentCount).toBe(1);
  });

  it('context contains no raw GUIDs from deal', () => {
    const ctx = buildDealCopilotContext({
      deal: baseDeal as any,
      tasks: [],
      documents: [],
      blockers: [],
    });

    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('deal-1');
  });

  it('handles undefined deal fields gracefully', () => {
    const ctx = buildDealCopilotContext({
      deal: { ...baseDeal, clientName: undefined, amount: undefined } as any,
      tasks: [],
      documents: [],
      blockers: [],
    });

    expect(ctx.clientName).toBeUndefined();
    expect(ctx.amount).toBeUndefined();
  });
});
