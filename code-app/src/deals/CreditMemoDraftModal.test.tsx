// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { SaveCreditMemoDraftOutcome } from './creditMemoActions';
import { CreditMemoDraftModal } from './CreditMemoDraftModal';

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-06-30T00:00:00Z',
  productType: 'Revolving Line of Credit',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal guarantors, joint and several',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory, and one piece of titled equipment.',
  createdOn: undefined,
  stageEntryDate: undefined,
  isClosed: false,
};

const noDocs: DealDocumentsResult = { outstanding: [], received: [], reviewed: [] };
const noTasks: DealTasksResult = { open: [], completed: [] };

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('CreditMemoDraftModal — guardrails and structure', () => {
  it('renders the local-only banner with explicit "not saved, not final" framing and no-AI note', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    // The phrase legitimately appears twice: once in the modal banner
    // and once in the generated memo body. Both are deliberate. We
    // just need at least one — scope to role=status to assert the
    // banner specifically.
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(
      /Draft preview — not saved, not final, banker review required/i,
    );
    expect(banner.textContent).toMatch(/No AI was used/i);
  });

  it('exposes NO Save / Finalize / Export / Submit / Send button when onSave is NOT provided', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const forbidden = /save|finalize|export|submit|send/i;
    const offending = screen
      .getAllByRole('button')
      .filter((b) => forbidden.test(b.textContent ?? ''));
    expect(offending).toEqual([]);
  });

  it('exposes Save Draft when onSave IS provided, but NEVER Finalize / Export / Submit / Send', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    // Save Draft must exist…
    expect(
      screen.getByRole('button', { name: /save credit memo draft/i }),
    ).toBeInTheDocument();
    // …but NEVER finalize/export/submit/send buttons.
    const forbidden = /finalize|export|submit|send/i;
    const offending = screen
      .getAllByRole('button')
      .filter((b) => forbidden.test(b.textContent ?? ''));
    expect(offending).toEqual([]);
  });

  it('renders one checkbox per section in the suggested list', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const labels = [
      'Executive Summary',
      'Borrower / Relationship Overview',
      'Loan Request',
      'Collateral',
      'Guarantor Support',
      'Pricing / Structure',
      'Due Diligence / Documents',
      'Open Tasks / Conditions',
      'Risks / Blockers',
      'Recommended Next Steps',
    ];
    for (const l of labels) {
      const checkbox = screen.getByLabelText(l);
      expect(checkbox).toBeInstanceOf(HTMLInputElement);
      expect((checkbox as HTMLInputElement).type).toBe('checkbox');
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    }
  });
});

describe('CreditMemoDraftModal — section toggling rewrites the body', () => {
  it('unchecking Collateral removes the Collateral section heading from the body', async () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const body = screen.getByLabelText(/^memo body$/i) as HTMLTextAreaElement;
    expect(body.value).toContain('## Collateral');

    await user.click(screen.getByLabelText('Collateral'));
    expect(body.value).not.toContain('## Collateral');
    // Other sections still present.
    expect(body.value).toContain('## Executive Summary');
  });
});

describe('CreditMemoDraftModal — missing information panel', () => {
  it('surfaces no missing fields for a fully populated deal', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/None detected for selected sections/i)).toBeInTheDocument();
  });

  it('lists missing fields when the deal is sparse', () => {
    const sparseDeal: DealDetail = {
      ...baseDeal,
      collateralSummary: undefined,
      guarantorStructure: undefined,
      amount: undefined,
      productType: undefined,
    };
    render(
      <CreditMemoDraftModal
        deal={sparseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    // At least one of the missing fields should be visible in the panel.
    expect(screen.getByText(/Collateral — Collateral summary/)).toBeInTheDocument();
    expect(
      screen.getByText(/Guarantor Support — Guarantor structure/),
    ).toBeInTheDocument();
  });
});

describe('CreditMemoDraftModal — Copy behavior is local-only', () => {
  it('clicking Copy writes the body to the clipboard and shows the "Nothing has been saved" notice', async () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    // Override clipboard AFTER userEvent.setup() so it doesn't get
    // wrapped by userEvent's internal stub.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await user.click(screen.getByRole('button', { name: /copy draft to clipboard/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]![0] as string;
    expect(payload).toContain('# Credit Memo — DRAFT PREVIEW');
    expect(payload).toContain('Acme Tooling 2026 Working Capital');

    expect(
      await screen.findByText(/Nothing has been saved to Dataverse/i),
    ).toBeInTheDocument();
  });

  it('Copy is disabled when the body has been wiped to empty by the banker', async () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const body = screen.getByLabelText(/^memo body$/i) as HTMLTextAreaElement;
    await user.clear(body);
    expect(screen.getByRole('button', { name: /copy draft to clipboard/i })).toBeDisabled();
  });
});

function deferredOutcome(): {
  promise: Promise<SaveCreditMemoDraftOutcome>;
  resolve: (o: SaveCreditMemoDraftOutcome) => void;
} {
  let resolve!: (o: SaveCreditMemoDraftOutcome) => void;
  const promise = new Promise<SaveCreditMemoDraftOutcome>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('CreditMemoDraftModal — Phase 25 Save Draft flow', () => {
  it('clicking Save Draft opens the confirmation step (not an immediate save)', async () => {
    const onSave = vi.fn();
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));

    // Confirmation copy is present, and onSave was NOT called yet.
    expect(screen.getByText(/Confirm save/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft only, not final/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the confirm-step Save Draft button is disabled until a non-empty save note is entered', async () => {
    const onSave = vi.fn().mockResolvedValue({ kind: 'success', memoId: 'm', sectionIds: [] });
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));

    // Inside the confirmation step now — look for the Save Draft
    // submit button (NOT the original "Save Draft…" trigger which is
    // no longer rendered).
    const submit = screen.getByRole('button', { name: /save credit memo draft/i });
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByLabelText(/save note/i),
      'Routine save for review',
    );
    expect(submit).not.toBeDisabled();
  });

  it('blocks the confirm-step save when the body contains unsupported commitment language', async () => {
    const onSave = vi.fn();
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();
    // Inject commitment language that an Underwriting/Active deal
    // does not support.
    const body = screen.getByLabelText(/^memo body$/i) as HTMLTextAreaElement;
    await user.click(body);
    await user.type(body, '\nDeal is approved and cleared to close.');

    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));
    await user.type(screen.getByLabelText(/save note/i), 'Saving anyway');

    const guard = screen.getByRole('alert');
    expect(
      within(guard).getByText(/Borrower-safe language check flagged issues/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save credit memo draft/i })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('successful save renders the success outcome and replaces the footer with Close', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({
        kind: 'success',
        memoId: 'memo-1',
        sectionIds: ['s-1', 's-2'],
      } satisfies SaveCreditMemoDraftOutcome);
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));
    await user.type(screen.getByLabelText(/save note/i), 'For review');
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));

    expect(await screen.findByText(/Draft saved/)).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
    // After outcome, only the Close button should remain.
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]!.textContent).toMatch(/close/i);
  });

  it('renders the CRITICAL governance-partial outcome with per-section + audit + timeline errors', async () => {
    const onSave = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      memoId: 'memo-1',
      sectionErrors: [{ sectionKey: 'collateral', error: 'section boom' }],
      auditError: 'audit boom',
      timelineError: 'timeline boom',
    } satisfies SaveCreditMemoDraftOutcome);
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));
    await user.type(screen.getByLabelText(/save note/i), 'For review');
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));

    await screen.findByText(/Critical: governance write failed/i);
    expect(
      screen.getByText(/Do not retry — the draft may already be saved\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/section boom/i)).toBeInTheDocument();
    expect(screen.getByText(/audit boom/i)).toBeInTheDocument();
    expect(screen.getByText(/timeline boom/i)).toBeInTheDocument();
  });

  it('prevents double-submit: the in-flight Save Draft button is disabled', async () => {
    const deferred = deferredOutcome();
    const onSave = vi.fn().mockReturnValue(deferred.promise);
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));
    await user.type(screen.getByLabelText(/save note/i), 'For review');
    await user.click(screen.getByRole('button', { name: /save credit memo draft/i }));

    // In-flight: the confirm-step Save Draft button is disabled.
    const submit = screen.getByRole('button', { name: /save credit memo draft/i });
    expect(submit).toBeDisabled();
    await user.click(submit); // no-op
    expect(onSave).toHaveBeenCalledTimes(1);

    deferred.resolve({ kind: 'success', memoId: 'memo-1', sectionIds: [] });
    await screen.findByText(/Draft saved/);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
