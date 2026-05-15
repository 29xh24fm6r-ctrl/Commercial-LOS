// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { DealDocument } from '../../deals/dealDocumentQueries';
import type { MarkDocumentReceivedOutcome } from '../../deals/documentActions';
import type { MarkDocumentReviewedOutcome } from '../../deals/documentActions';
import type { CreateDocumentReviewTaskOutcome } from '../../deals/dealTaskActions';

import { ReceiveDocumentModal } from '../../deals/ReceiveDocumentModal';
import { ReviewDocumentModal } from '../../deals/ReviewDocumentModal';
import { CreateDocumentReviewTaskModal } from '../../deals/CreateDocumentReviewTaskModal';
import { Badge } from '../Badge';

/**
 * Phase 74 — Accessibility audit + targeted fixes.
 *
 * Pins the rendered-DOM consequences of the Phase 74 fixes:
 *   - outcome blocks announce via role="status" (success) or
 *     role="alert" (error / partial / unknown);
 *   - required textareas / inputs declare aria-required="true";
 *   - helper lines are linked via aria-describedby so screen readers
 *     read the field's full context;
 *   - badge components forward aria-label so short visible text
 *     ("New", "Pending review") has an explicit accessible name.
 *
 * No new product capability is exercised here. The tests rely only
 * on the existing component contracts — no workflow change, no new
 * write surface, no new governance entry.
 */

const baseDoc: DealDocument = {
  id: 'doc-1',
  name: 'Personal Financial Statement',
  dueDate: '2026-05-30T00:00:00Z',
  requestDate: '2026-04-01T00:00:00Z',
  receivedDate: undefined,
  reviewer: undefined,
  uploaded: false,
  modifiedOn: undefined,
  status: 'outstanding',
};

const receivedDoc: DealDocument = {
  ...baseDoc,
  receivedDate: '2026-04-20T00:00:00Z',
  status: 'received',
};

describe('Phase 74 — accessibility audit', () => {
  describe('ReceiveDocumentModal', () => {
    it('declares the receipt-note textarea as required and links its helper', () => {
      render(
        <ReceiveDocumentModal
          doc={baseDoc}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const textarea = screen.getByLabelText(/receipt note/i);
      expect(textarea).toHaveAttribute('aria-required', 'true');
      const describedBy = textarea.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const helper = document.getElementById(describedBy!);
      expect(helper).not.toBeNull();
      expect(helper!.textContent).toMatch(/metadata-only/i);
    });

    it('announces a successful outcome via role="status"', async () => {
      const onConfirm = vi
        .fn()
        .mockResolvedValue({ kind: 'success' } satisfies MarkDocumentReceivedOutcome);
      render(
        <ReceiveDocumentModal
          doc={baseDoc}
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/receipt note/i), 'emailed by borrower');
      await user.click(screen.getByRole('button', { name: /^mark received$/i }));
      const statusEl = await screen.findByRole('status', { name: '' });
      expect(statusEl.textContent).toMatch(/Recorded/i);
      // Should NOT be an alert — success is polite.
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('announces a failure outcome via role="alert"', async () => {
      const onConfirm = vi.fn().mockResolvedValue({
        kind: 'receive-failed',
        docError: 'Dataverse unreachable',
      } satisfies MarkDocumentReceivedOutcome);
      render(
        <ReceiveDocumentModal
          doc={baseDoc}
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/receipt note/i), 'borrower bailed');
      await user.click(screen.getByRole('button', { name: /^mark received$/i }));
      const alertEl = await screen.findByRole('alert');
      expect(alertEl.textContent).toMatch(/Could not record receipt/i);
    });
  });

  describe('ReviewDocumentModal', () => {
    it('declares the review-note textarea as required and links its helper', () => {
      render(
        <ReviewDocumentModal
          doc={receivedDoc}
          reviewerName="M. Paller"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const textarea = screen.getByLabelText(/review note/i);
      expect(textarea).toHaveAttribute('aria-required', 'true');
      const describedBy = textarea.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const helper = document.getElementById(describedBy!);
      expect(helper).not.toBeNull();
      // The helper conveys the conservative "review is not approval"
      // discipline; the screen reader hears it as the textarea's
      // description.
      expect(helper!.textContent).toMatch(/does not approve/i);
    });

    it('announces a successful review outcome via role="status"', async () => {
      const onConfirm = vi
        .fn()
        .mockResolvedValue({ kind: 'success' } satisfies MarkDocumentReviewedOutcome);
      render(
        <ReviewDocumentModal
          doc={receivedDoc}
          reviewerName="M. Paller"
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/review note/i), 'matches PFS');
      await user.click(screen.getByRole('button', { name: /^mark reviewed$/i }));
      const statusEl = await screen.findByRole('status', { name: '' });
      expect(statusEl.textContent).toMatch(/Recorded/i);
    });
  });

  describe('CreateDocumentReviewTaskModal', () => {
    it('declares the follow-up-note textarea as required and links its helper', () => {
      render(
        <CreateDocumentReviewTaskModal
          doc={receivedDoc}
          openTasks={[]}
          bankerName="M. Paller"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const textarea = screen.getByLabelText(/follow-up note/i);
      expect(textarea).toHaveAttribute('aria-required', 'true');
      const describedBy = textarea.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const helper = document.getElementById(describedBy!);
      expect(helper).not.toBeNull();
      expect(helper!.textContent).toMatch(/self-assigned/i);
    });

    it('announces a successful create-task outcome via role="status"', async () => {
      const onConfirm = vi.fn().mockResolvedValue({
        kind: 'success',
        taskId: 'task-1',
      } satisfies CreateDocumentReviewTaskOutcome);
      render(
        <CreateDocumentReviewTaskModal
          doc={receivedDoc}
          openTasks={[]}
          bankerName="M. Paller"
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText(/follow-up note/i),
        'second pair of eyes needed',
      );
      await user.click(
        screen.getByRole('button', { name: /^create review task$/i }),
      );
      const statusEl = await screen.findByRole('status', { name: '' });
      expect(statusEl.textContent).toMatch(/Review task created/i);
    });
  });

  describe('Badge — aria-label forwarding', () => {
    it('forwards aria-label to the rendered span when provided', () => {
      render(
        <Badge variant="info" aria-label="New since your last visit">
          New
        </Badge>,
      );
      const el = screen.getByLabelText('New since your last visit');
      expect(el.textContent).toBe('New');
    });

    it('omits aria-label entirely when not provided (no empty string)', () => {
      const { container } = render(<Badge variant="neutral">Outstanding</Badge>);
      const span = container.querySelector('span');
      expect(span).not.toBeNull();
      expect(span!.hasAttribute('aria-label')).toBe(false);
    });
  });
});
