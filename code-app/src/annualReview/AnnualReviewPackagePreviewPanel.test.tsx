// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnualReviewPackagePreviewPanel } from './AnnualReviewPackagePreviewPanel';
import { pipeline } from './packageTestFixtures';

function renderPanel(opts = {}) {
  const p = pipeline(opts);
  return render(<AnnualReviewPackagePreviewPanel memo={p.memo} board={p.board} fdic={p.fdic} readiness={p.pkgReadiness} />);
}

describe('Phase 141P — package preview panel', () => {
  it('renders the memo, board, and FDIC package previews', () => {
    renderPanel();
    expect(screen.getByText('Executive summary')).toBeInTheDocument();
    expect(screen.getByText('Board summary')).toBeInTheDocument();
    expect(screen.getByText('Examiner summary')).toBeInTheDocument();
  });

  it('renders blockers and caveats', () => {
    renderPanel({ facts: [] });
    expect(screen.getAllByText(/blocked|missing/i).length).toBeGreaterThanOrEqual(1);
  });

  it('has no approve / submit / file / send / export-final / waive controls', () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('approve credit');
    expect(text).not.toMatch(/submit package|file package|export final|waive covenant|override covenant/);
  });

  it('has no upload / email / SMS / mailto control', () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll('a[href^="mailto:"]').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('generate upload link');
    expect(text).not.toContain('send email');
  });

  it('renders no fabricated dollar values', () => {
    const { container } = renderPanel();
    expect(container.innerHTML).not.toMatch(/\$\s*\d/);
  });
});
