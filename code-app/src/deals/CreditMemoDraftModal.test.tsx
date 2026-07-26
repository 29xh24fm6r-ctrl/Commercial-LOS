// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { SaveCreditMemoDraftOutcome } from './creditMemoActions';
import { CreditMemoDraftModal } from './CreditMemoDraftModal';
import { serializeGlobalCashFlowFormState, type GlobalCashFlowFormState } from './globalCashFlow';
import {
  serializeRiskRatingFormState,
  serializeUnderwritingRecommendationFormState,
  type RiskRatingFormState,
  type UnderwritingRecommendationFormState,
} from '../workflow/underwritingDeepFacts';

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
    // N-07 remediation — the five new deep-fact sections (Global Cash Flow, Repayment
    // Analysis, Risk Rating, Underwriting Recommendation, Requested Credit Action) need
    // their own persisted inputs captured, or they report missing fields just like any
    // other section. This fixture captures all of them via the real serialize functions.
    const gcfState: GlobalCashFlowFormState = {
      netIncome: '500000',
      interestExpense: '50000',
      incomeTaxes: '75000',
      depreciation: '40000',
      amortization: '10000',
      nonRecurringAddbacks: '0',
      nonRecurringIncome: '0',
      unfinancedCapEx: '20000',
      proposedNewDebtService: '150000',
      otherBusinessDebtService: '0',
      guarantors: [
        {
          guarantorName: 'Jane Doe',
          grossPersonalIncome: '200000',
          nonCashAddbacks: '0',
          personalLivingExpenses: '80000',
          otherPersonalDebtService: '0',
        },
      ],
    };
    const riskRatingState: RiskRatingFormState = {
      ratingValue: '4',
      ratingScale: '1-8',
      rationale: 'Strong cash flow coverage and seasoned management team.',
      status: 'assigned',
      dealId: 'deal-77',
      assignedBy: 'M. Paller',
      assignedAtIso: '2026-05-10T00:00:00Z',
    };
    const recommendationState: UnderwritingRecommendationFormState = {
      decision: 'approve_with_conditions',
      rationale: 'Supportable subject to updated collateral valuation.',
      status: 'recorded',
      dealId: 'deal-77',
      underwriterActor: 'M. Paller',
      recordedAtIso: '2026-05-10T00:00:00Z',
    };
    const fullyPopulatedDeal: DealDetail = {
      ...baseDeal,
      financialSpreadInputsJson: serializeGlobalCashFlowFormState(gcfState),
      riskRatingInputsJson: serializeRiskRatingFormState(riskRatingState),
      underwritingRecommendationInputsJson: serializeUnderwritingRecommendationFormState(recommendationState),
    };
    render(
      <CreditMemoDraftModal
        deal={fullyPopulatedDeal}
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

  it('D-02 fix: memo-failed renders whatever message the outcome carries, never a hardcoded generic "dropped connection" copy', async () => {
    // Modal-level rendering-fidelity test: this constructs the outcome directly (bypassing the
    // real saveCreditMemoDraft), so it pins the MODAL's contract — render `outcome.memoError`
    // verbatim — not whether that string is itself sanitized. SEV-1 remediation moved raw-error
    // sanitization to creditMemoActions.ts (see mapCreditMemoSaveErrorForBanker in
    // creditMemoActions.ts): in production, `memoError` here is now always the ALREADY-safe,
    // non-technical message — this test's literal string is just an arbitrary fixture proving the
    // modal doesn't discard/replace it with a second hardcoded string.
    const onSave = vi.fn().mockResolvedValue({
      kind: 'memo-failed',
      memoError: 'cr664_memoname exceeds maximum length of 100 characters',
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

    await screen.findByText(/Could not save draft/i);
    expect(
      screen.getByText('cr664_memoname exceeds maximum length of 100 characters'),
    ).toBeInTheDocument();
    // The old hardcoded, error-discarding copy must never appear again.
    expect(screen.queryByText(/connection dropped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/briefly locked/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/technical detail has been recorded for diagnostics/i),
    ).not.toBeInTheDocument();
  });

  it('D-02 fix: a different memo-failed message renders that exact different text (proves it is not a second hardcoded string)', async () => {
    const onSave = vi.fn().mockResolvedValue({
      kind: 'memo-failed',
      memoError: 'Required attribute cr664_workspaceid is missing',
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

    expect(
      await screen.findByText('Required attribute cr664_workspaceid is missing'),
    ).toBeInTheDocument();
  });

  it('renders the CRITICAL governance-partial outcome with banker-safe messaging — NEVER the raw technical errors', async () => {
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
    // Banker-safe: an honest "do not retry, already saved" message + a section-count summary +
    // a support reference — but the raw OData/Dataverse/technical error strings are NEVER shown.
    expect(screen.getByText(/Do not retry — the draft is already saved/i)).toBeInTheDocument();
    expect(screen.getByText(/1 section draft could not be saved/i)).toBeInTheDocument();
    expect(screen.getByText(/memo-1/)).toBeInTheDocument(); // support reference
    expect(screen.queryByText(/section boom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/audit boom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/timeline boom/i)).not.toBeInTheDocument();
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
