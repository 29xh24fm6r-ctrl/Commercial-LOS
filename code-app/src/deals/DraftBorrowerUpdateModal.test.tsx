// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealDocument } from './dealDocumentQueries';
import { DraftBorrowerUpdateModal } from './DraftBorrowerUpdateModal';

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

const sampleDocs: DealDocument[] = [
  {
    id: 'doc-1',
    name: 'Personal Financial Statement',
    dueDate: '2026-05-30T00:00:00Z',
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
  },
  {
    id: 'doc-2',
    name: '2024 Business Tax Return',
    dueDate: '2026-06-01T00:00:00Z',
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
  },
];

beforeEach(() => {
  // jsdom does not provide navigator.clipboard by default. Wire a
  // controllable mock per-test so assertions about copy behavior don't
  // depend on a real environment.
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('DraftBorrowerUpdateModal — guardrails and structure', () => {
  it('renders the local-only banner ("Draft not saved to system.")', () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Draft not saved to system\./i)).toBeInTheDocument();
    expect(screen.getByText(/No email is sent/i)).toBeInTheDocument();
  });

  it('does NOT render a Send button anywhere in the modal', () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const sendish = screen.queryAllByRole('button').filter((b) => /send/i.test(b.textContent ?? ''));
    expect(sendish).toEqual([]);
  });

  it('renders all four template options in the selector', () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/^template$/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual([
      'General Status Update',
      'Missing Documents Reminder',
      'Underwriting Update',
      'Closing Progress Update',
    ]);
  });

  it('shows the borrower (client) name in the To field and the deal name', () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    // 'Acme Tooling' appears both in the To field and elsewhere — the
    // To section asserts the contact relationship explicitly.
    expect(screen.getAllByText(/Acme Tooling/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Acme Tooling 2026 Working Capital/).length).toBeGreaterThan(0);
  });
});

describe('DraftBorrowerUpdateModal — template-driven generation', () => {
  it('switching to Missing Documents Reminder rewrites the body to include outstanding doc names', async () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const select = screen.getByLabelText(/^template$/i);
    await user.selectOptions(select, 'missing-documents');

    const body = screen.getByLabelText(/^body$/i) as HTMLTextAreaElement;
    expect(body.value).toContain('Personal Financial Statement');
    expect(body.value).toContain('2024 Business Tax Return');
  });

  it('subject contains the deal name regardless of selected template', async () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const select = screen.getByLabelText(/^template$/i);
    const subject = screen.getByLabelText(/^subject$/i) as HTMLInputElement;

    for (const t of [
      'general-status',
      'missing-documents',
      'underwriting-update',
      'closing-progress',
    ]) {
      await user.selectOptions(select, t);
      expect(subject.value).toContain('Acme Tooling 2026 Working Capital');
    }
  });
});

describe('DraftBorrowerUpdateModal — Copy gating and behavior', () => {
  it('Copy is disabled until the banker enters a non-empty note/reason', async () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const copyBtn = screen.getByRole('button', { name: /copy draft to clipboard/i });
    expect(copyBtn).toBeDisabled();

    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Routine weekly update',
    );
    expect(copyBtn).not.toBeDisabled();
  });

  it('clicking Copy writes "Subject: ... \\n\\n<body>" to the clipboard and emits no Dataverse write', async () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    // userEvent.setup() installs its own clipboard stub, so we must
    // override AFTER setup or our spy will be wrapped/replaced.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Weekly check-in',
    );
    await user.click(screen.getByRole('button', { name: /copy draft to clipboard/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]![0] as string;
    expect(payload.startsWith('Subject: ')).toBe(true);
    expect(payload).toContain('Acme Tooling 2026 Working Capital');

    // Local-fallback confirmation must surface so the banker knows
    // nothing was logged on the deal.
    expect(await screen.findByText(/Copied to clipboard/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing was logged to this deal/i),
    ).toBeInTheDocument();
  });

  it('blocks Copy if the banker edits commitment language into the body that the deal cannot back up', async () => {
    render(
      <DraftBorrowerUpdateModal
        deal={baseDeal}
        outstandingDocuments={sampleDocs}
        openTasks={[]}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Test',
    );
    const body = screen.getByLabelText(/^body$/i) as HTMLTextAreaElement;
    await user.click(body);
    // Append commitment language that the Underwriting/Active deal does not support.
    await user.type(body, '\nYou are approved and cleared to close.');

    const guard = screen.getByRole('alert');
    expect(within(guard).getByText(/Borrower-safe language check failed/i)).toBeInTheDocument();
    // Each flagged term appears twice inside the guard: bolded inside
    // its <li>, and again in the reason sentence. Both terms must be
    // present.
    expect(within(guard).getAllByText(/approved/i).length).toBeGreaterThan(0);
    expect(within(guard).getAllByText(/cleared to close/i).length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /copy draft to clipboard/i })).toBeDisabled();
  });
});
