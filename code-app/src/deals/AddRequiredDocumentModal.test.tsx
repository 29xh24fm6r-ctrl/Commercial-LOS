// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddRequiredDocumentModal } from './AddRequiredDocumentModal';

describe('AddRequiredDocumentModal operating experience', () => {
  it('focuses the receipt note, closes with Escape, and returns focus to its launcher', async () => {
    const launcher = document.createElement('button');
    launcher.textContent = 'Add document';
    document.body.appendChild(launcher);
    launcher.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <AddRequiredDocumentModal
        candidateNames={['Loan application']}
        presetName="Loan application"
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(screen.getByPlaceholderText(/How and when the document was received/i)).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(launcher).toHaveFocus();
    launcher.remove();
  });

  it('uses operator language and does not expose schema implementation details', () => {
    render(
      <AddRequiredDocumentModal
        candidateNames={['Loan application']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/does not attach or store the document file/i);
    expect(text).not.toMatch(/schema|column|cr664_/i);
  });
});
