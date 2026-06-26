// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Phase 260 — a render throw never blanks the canvas; the boundary shows a
 * branded, recoverable fallback.
 */

function Boom(): JSX.Element {
  throw new Error('kaboom');
}

describe('Phase 260 — ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary surface="Loan Workflow">
        <div data-testid="ok">content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });

  it('catches a render throw and shows a friendly fallback (not a blank screen)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary surface="Loan Workflow">
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.querySelector('[data-error-boundary="Loan Workflow"]')).not.toBeNull();
    expect(screen.getByText(/Loan Workflow hit a problem/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
