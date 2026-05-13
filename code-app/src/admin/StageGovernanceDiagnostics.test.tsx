// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageGovernanceDiagnostics } from './StageGovernanceDiagnostics';

describe('StageGovernanceDiagnostics — Phase 29 admin diagnostic card', () => {
  it('renders the three required check rows with the right labels', () => {
    render(<StageGovernanceDiagnostics />);
    expect(screen.getByText(/Stage reference data source/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage ordering contract/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Stage progression write availability/i),
    ).toBeInTheDocument();
  });

  it('shows the header trailing badge that reports Critical / not yet available', () => {
    render(<StageGovernanceDiagnostics />);
    // Overall severity is blocked, so the badge reads:
    expect(screen.getByText(/Critical — not yet available/i)).toBeInTheDocument();
  });

  it('lists Deal Stage Progression as the affected feature', () => {
    render(<StageGovernanceDiagnostics />);
    expect(screen.getByText(/Affected feature/i)).toBeInTheDocument();
    expect(screen.getByText(/Deal Stage Progression/i)).toBeInTheDocument();
  });

  it('renders an ordered remediation list naming SDK regeneration and the gate flip', () => {
    render(<StageGovernanceDiagnostics />);
    expect(screen.getByText(/Required remediation/i)).toBeInTheDocument();
    // The numbered steps live inside an <ol>. Sample a few of the
    // critical phrases to confirm the list is rendered, not skipped.
    expect(screen.getByText(/add-data-source/i)).toBeInTheDocument();
    expect(screen.getByText(/stageProgressionAvailability/i)).toBeInTheDocument();
  });

  it('does NOT render any action / fix button anywhere', () => {
    render(<StageGovernanceDiagnostics />);
    // Brief: "Do not show a fake 'fix' button." Any button at all on
    // this card would be a regression — the card is read-only diagnostics.
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('does NOT hardcode a stage order anywhere in its rendered text', () => {
    const { container } = render(<StageGovernanceDiagnostics />);
    const text = container.textContent ?? '';
    // The brief is explicit: never invent stage transition config or
    // hardcode the canonical stage order in any surface.
    expect(/origination.*underwriting.*committee/i.test(text)).toBe(false);
    expect(/closing.*funded/i.test(text)).toBe(false);
    // Stage-related keywords like "Stage reference" / "Stage ordering"
    // ARE allowed; they are field/contract names, not an order list.
  });
});
