// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const loadMock = vi.fn();
vi.mock('./stageGovernanceDiagnosticsLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stageGovernanceDiagnosticsLoader')>();
  return { ...actual, loadStageGovernanceDiagnostics: () => loadMock() };
});

import { StageGovernanceDiagnostics } from './StageGovernanceDiagnostics';
import { loadStageGovernanceDiagnosticsWith, type StageGovernanceReaders } from './stageGovernanceDiagnosticsLoader';
import { CANONICAL_STAGES, type StageReferenceRow } from '../workflow/stageOrderingContract';
import { CANONICAL_STATUS_CODES, type StatusReferenceRow } from '../workflow/statusReferenceContract';

const READY_STAGES: StageReferenceRow[] = CANONICAL_STAGES.map((s) => ({
  cr664_code: s.code, cr664_name: s.name, cr664_sequence: s.sequence, cr664_activeflag: true,
}));
const READY_STATUSES: StatusReferenceRow[] = CANONICAL_STATUS_CODES.map((c) => ({
  cr664_code: c, cr664_name: c, cr664_activeflag: true,
}));

const readyReaders: StageGovernanceReaders = {
  readStageRows: async () => READY_STAGES,
  readStatusRows: async () => READY_STATUSES,
};
const failReaders: StageGovernanceReaders = {
  readStageRows: async () => { throw new Error('cr664_sequence not provisioned'); },
  readStatusRows: async () => { throw new Error('status data source not registered'); },
};

async function ready() { return loadStageGovernanceDiagnosticsWith(readyReaders); }
async function blocked() { return loadStageGovernanceDiagnosticsWith(failReaders); }

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StageGovernanceDiagnostics — Phase 5 live card', () => {
  it('renders the five governance check rows once loaded', async () => {
    loadMock.mockResolvedValue(await blocked());
    render(<StageGovernanceDiagnostics />);
    // Wait for load, then assert each check label renders (>=1; some phrases also
    // appear inside a detail sentence, so match all).
    await screen.findByText(/Critical — not yet available/i);
    for (const label of ['Stage reference data source', 'Stage ordering contract', 'Stage ordering resolved', 'Status references seeded', 'Transition graph valid']) {
      expect((await screen.findAllByText(new RegExp(label, 'i'))).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('shows CRITICAL when the environment is not seeded / rows do not load', async () => {
    loadMock.mockResolvedValue(await blocked());
    render(<StageGovernanceDiagnostics />);
    expect(await screen.findByText(/Critical — not yet available/i)).toBeInTheDocument();
    expect(screen.getByText(/Deal Stage Progression/i)).toBeInTheDocument();
    // Remediation names the seed + SDK regeneration.
    expect(screen.getAllByText(/seed-stage-references/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Regenerate the typed SDK/i)).toBeInTheDocument();
  });

  it('flips to READY and shows the exact rows + sequence + transition path when seeded', async () => {
    loadMock.mockResolvedValue(await ready());
    render(<StageGovernanceDiagnostics />);
    // Overall badge flips to available.
    expect(await screen.findByText(/Ready — available/i)).toBeInTheDocument();
    // Exact stage rows with sequence are surfaced.
    const intake = document.querySelector('[data-stage-row="INTAKE"]');
    expect(intake?.textContent).toMatch(/INTAKE/);
    expect(intake?.textContent).toMatch(/seq 10/);
    // Disposition status chips are shown.
    expect(document.querySelector('[data-status-row="OPEN"]')).not.toBeNull();
    // The resolved transition path is shown (data-driven, not hardcoded).
    expect(document.querySelector('[data-stage-governance-path]')?.textContent).toMatch(/INTAKE → UNDERWRITING/);
  });

  it('renders NO action / fix button anywhere (read-only)', async () => {
    loadMock.mockResolvedValue(await ready());
    render(<StageGovernanceDiagnostics />);
    await screen.findByText(/Ready — available/i);
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('does NOT hardcode a legacy stage order in its text', async () => {
    loadMock.mockResolvedValue(await ready());
    const { container } = render(<StageGovernanceDiagnostics />);
    await screen.findByText(/Ready — available/i);
    const text = container.textContent ?? '';
    // No invented legacy pipeline vocabulary; the shown path is resolved from data.
    expect(/origination.*underwriting.*committee/i.test(text)).toBe(false);
    expect(/closing.*funded/i.test(text)).toBe(false);
  });
});
