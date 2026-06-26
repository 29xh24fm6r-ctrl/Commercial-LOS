// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary, type ErrorBoundaryDiagnostic } from './ErrorBoundary';

/**
 * Phase 260 — a render throw never blanks the canvas; the boundary shows a
 * branded, recoverable fallback.
 */

function Boom() {
  throw new Error('kaboom');
  return null;
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

  it('captures structured diagnostics (surface, navKey, message, stack, correlation id)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagnostics: ErrorBoundaryDiagnostic[] = [];
    const { container } = render(
      <ErrorBoundary surface="Loan Workflow" navKey="loan-workflow" onDiagnostic={(d) => diagnostics.push(d)}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0]!;
    expect(d.surface).toBe('Loan Workflow');
    expect(d.navKey).toBe('loan-workflow');
    expect(d.message).toBe('kaboom');
    expect(typeof d.correlationId).toBe('string');
    expect((d.correlationId as string).length).toBeGreaterThan(0);
    expect(d.stack).toBeTruthy();
    expect(d.componentStack).toBeTruthy();
    // The fallback shows the correlation id + message for operator reporting.
    expect(container.querySelector('[data-error-boundary-correlation]')?.textContent).toContain(d.correlationId as string);
    expect(container.querySelector('[data-error-boundary-message]')?.textContent).toContain('kaboom');
    spy.mockRestore();
  });
});
