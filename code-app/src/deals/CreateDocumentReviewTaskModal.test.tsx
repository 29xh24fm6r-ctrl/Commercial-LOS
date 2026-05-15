// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDocument } from './dealDocumentQueries';
import type { DealTask } from './dealTaskQueries';
import type { CreateDocumentReviewTaskOutcome } from './dealTaskActions';
import { CreateDocumentReviewTaskModal } from './CreateDocumentReviewTaskModal';

const sampleDoc: DealDocument = {
  id: 'doc-1',
  name: 'Personal Financial Statement',
  dueDate: '2026-05-30T00:00:00Z',
  requestDate: '2026-04-15T00:00:00Z',
  receivedDate: '2026-05-01T00:00:00Z',
  reviewer: undefined,
  uploaded: false,
  modifiedOn: undefined,
  status: 'received',
};

const successOutcome: CreateDocumentReviewTaskOutcome = {
  kind: 'success',
  taskId: 'task-new-1',
};

describe('CreateDocumentReviewTaskModal — Phase 70', () => {
  it('renders title, document name, proposed task title, and required-note label', () => {
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: /create review task/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Personal Financial Statement'),
    ).toBeInTheDocument();
    // Proposed task title surfaces verbatim so the banker knows
    // what's about to be created.
    expect(
      screen.getByText(
        /Follow up on document review: Personal Financial Statement/i,
      ),
    ).toBeInTheDocument();
    // Required note label.
    expect(
      screen.getByLabelText(/follow-up note/i),
    ).toBeInTheDocument();
  });

  it('disables Create button until a non-empty note is entered', async () => {
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /^create review task$/i });
    expect(button).toBeDisabled();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/follow-up note/i),
      'Defer until Friday',
    );
    expect(button).not.toBeDisabled();
  });

  it('calls onConfirm with the trimmed follow-up note', async () => {
    const onConfirm = vi.fn().mockResolvedValue(successOutcome);
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/follow-up note/i),
      '  Defer until Friday — checking against memo.  ',
    );
    await user.click(
      screen.getByRole('button', { name: /^create review task$/i }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(
      'Defer until Friday — checking against memo.',
    );
  });

  it('renders the duplicate-task hint when an open task title contains the document name', () => {
    const openTasks: DealTask[] = [
      {
        id: 't-existing',
        title: 'Personal Financial Statement — review with manager',
        completed: false,
        dueDate: undefined,
        assigneeName: 'M. Paller',
        modifiedOn: undefined,
      },
    ];
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={openTasks}
        bankerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/An open task may already cover this document/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Personal Financial Statement — review with manager/i,
      ),
    ).toBeInTheDocument();
  });

  it('does NOT render the duplicate hint when no open task contains the document name', () => {
    const openTasks: DealTask[] = [
      {
        id: 't-other',
        title: 'Send borrower update email',
        completed: false,
        dueDate: undefined,
        assigneeName: 'M. Paller',
        modifiedOn: undefined,
      },
    ];
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={openTasks}
        bankerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/An open task may already cover this document/i),
    ).toBeNull();
  });

  it('renders the success outcome panel after a successful create', async () => {
    const onConfirm = vi.fn().mockResolvedValue(successOutcome);
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/follow-up note/i), 'Defer');
    await user.click(
      screen.getByRole('button', { name: /^create review task$/i }),
    );
    expect(
      await screen.findByText(/review task created/i),
    ).toBeInTheDocument();
  });

  it('renders the task-create-failed outcome panel honestly', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'task-create-failed',
      taskError: 'schema rejected payload',
    } satisfies CreateDocumentReviewTaskOutcome);
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/follow-up note/i), 'Defer');
    await user.click(
      screen.getByRole('button', { name: /^create review task$/i }),
    );
    expect(
      await screen.findByText(/could not create review task/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/schema rejected payload/i)).toBeInTheDocument();
  });

  it('renders the governance-partial critical panel + auditError + timelineError', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      taskId: 'task-x',
      auditError: undefined,
      timelineError: 'tl 500',
    } satisfies CreateDocumentReviewTaskOutcome);
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/follow-up note/i), 'Defer');
    await user.click(
      screen.getByRole('button', { name: /^create review task$/i }),
    );
    expect(
      await screen.findByText(/governance write failed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/tl 500/i)).toBeInTheDocument();
    expect(screen.getByText(/Do not retry/i)).toBeInTheDocument();
  });

  it('does NOT render the new-borrower-portal / upload / sent / escalation forbidden phrases anywhere', () => {
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const text = document.body.textContent ?? '';
    // Phase 70 brief: do not use these terms.
    expect(text).not.toMatch(/\bemail (sent|delivered)\b/i);
    expect(text).not.toMatch(/\bportal\b/i);
    expect(text).not.toMatch(/\bsecure message\b/i);
    expect(text).not.toMatch(/\bcompliance breach\b/i);
    expect(text).not.toMatch(/\bfailed review\b/i);
    expect(text).not.toMatch(/\bdocument accepted\b/i);
    expect(text).not.toMatch(/\bdocument validated\b/i);
    expect(text).not.toMatch(/\bapproval pending\b/i);
    expect(text).not.toMatch(/\bupload(ed)?\b/i);
    // The brief forbids "escalation" framing that IMPLIES automatic
    // routing. The modal is allowed to use the phrase "automatic
    // routing" in an explicit NEGATION ("No automatic routing or
    // escalation occurs") — which is what we ship. We assert the
    // negation is present rather than ban the literal phrase.
    expect(text).toMatch(/No automatic routing/i);
  });

  it('Esc closes the modal', async () => {
    const onClose = vi.fn();
    render(
      <CreateDocumentReviewTaskModal
        doc={sampleDoc}
        openTasks={[]}
        bankerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
