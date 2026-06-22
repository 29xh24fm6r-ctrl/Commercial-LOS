// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { V1ActivationReadinessPanel } from './V1ActivationReadinessPanel';

/**
 * Phase 203 — V1 Activation Readiness panel tests.
 *
 * Read-only release-posture projection: CONDITIONAL_GO, active OGB-native
 * surfaces, pilot enabled, unsafe write categories gated. No action controls.
 */

describe('V1ActivationReadinessPanel', () => {
  it('renders the title', () => {
    render(<V1ActivationReadinessPanel />);
    expect(screen.getByText('V1 Activation Readiness')).toBeTruthy();
  });

  it('renders the CONDITIONAL_GO posture', () => {
    render(<V1ActivationReadinessPanel />);
    expect(screen.getByText('CONDITIONAL_GO')).toBeTruthy();
  });

  it('renders active OGB CRM + lending workflow posture', () => {
    const { container } = render(<V1ActivationReadinessPanel />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/OGB CRM/);
    expect(text).toMatch(/Internal lending workflow/);
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(2);
  });

  it('renders New Deal create pilot as ENABLED', () => {
    const { container } = render(<V1ActivationReadinessPanel />);
    expect(container.textContent).toMatch(/New Deal create pilot/);
    expect(screen.getAllByText('ENABLED').length).toBeGreaterThanOrEqual(1);
  });

  it('renders unsafe write categories as GATED', () => {
    const { container } = render(<V1ActivationReadinessPanel />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/CRM writeback/);
    expect(text).toMatch(/Borrower communications/);
    expect(text).toMatch(/Checklist generation/);
    expect(text).toMatch(/Broad workflow writes/);
    expect(screen.getAllByText('GATED').length).toBeGreaterThanOrEqual(4);
  });

  it('renders the release-safety posture (no external/fake/schema/widening)', () => {
    const { container } = render(<V1ActivationReadinessPanel />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/External connectors/);
    expect(text).toMatch(/NOT_REQUIRED/);
    expect(text).toMatch(/Fake \/ sample-data dependency/);
    expect(text).toMatch(/Schema \/ migration dependency/);
    expect(screen.getAllByText('NOT_PRESENT').length).toBeGreaterThanOrEqual(2);
  });

  it('renders no action buttons and no form controls', () => {
    const { container } = render(<V1ActivationReadinessPanel />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input, textarea, select, form, a[href]')).toHaveLength(0);
  });
});
