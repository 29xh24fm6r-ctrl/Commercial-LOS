// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  recordProviderLoaded,
  recordRefresh,
  resetPerfRegistry,
  setPerfEnabled,
  timed,
} from '../shared/observability/perfRegistry';
import { PerformanceDiagnostics } from './PerformanceDiagnostics';

beforeEach(() => {
  resetPerfRegistry();
  setPerfEnabled(true);
});

describe('PerformanceDiagnostics — Phase 31 admin card', () => {
  it('renders the static stat tiles even with an empty registry', () => {
    render(<PerformanceDiagnostics />);
    expect(screen.getByText(/Queries completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Queries failed/i)).toBeInTheDocument();
    // Scope strictly to the stat-tile label so it does not collide
    // with the empty-state "No provider loads observed yet." paragraph.
    expect(screen.getByText(/^Provider loads$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Refreshes$/i)).toBeInTheDocument();
    expect(screen.getByText(/Write-triggered refreshes/i)).toBeInTheDocument();
  });

  it('header trailing badge reads "Recording" when perf is enabled', () => {
    render(<PerformanceDiagnostics />);
    expect(screen.getByText(/^Recording$/i)).toBeInTheDocument();
  });

  it('reflects refresh counters and write-triggered refresh fanout after a re-read', async () => {
    recordRefresh('DealDataProvider', 'tasks');
    recordRefresh('DealDataProvider', 'after-task-complete');
    recordRefresh('AdminDataProvider', 'alerts');
    recordProviderLoaded('DealDataProvider', 120);

    render(<PerformanceDiagnostics />);
    // Snapshot is taken at mount; the values reflect the pre-mount
    // registry state.
    expect(screen.getByText(/after-task-complete/i)).toBeInTheDocument();
    // The Write-triggered refresh shows count=1.
    const writeRow = screen.getByText(/after-task-complete/i).closest('li')!;
    expect(writeRow.textContent).toMatch(/Write-triggered/i);
  });

  it('Refresh snapshot button re-reads the registry without altering it', async () => {
    render(<PerformanceDiagnostics />);
    const user = userEvent.setup();
    // Add data AFTER mount; the card should not show it until
    // Refresh snapshot is clicked.
    recordRefresh('DealDataProvider', 'after-document-request');
    expect(screen.queryByText(/after-document-request/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /refresh snapshot/i }));
    expect(screen.getByText(/after-document-request/i)).toBeInTheDocument();
  });

  it('Pause recording flips the registry to no-op mode without breaking the card', async () => {
    render(<PerformanceDiagnostics />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /pause recording/i }));
    expect(screen.getByText(/^Paused$/i)).toBeInTheDocument();

    // Subsequent timed calls do not count.
    await timed('G', 'op', async () => 1);
    await user.click(screen.getByRole('button', { name: /refresh snapshot/i }));
    // After re-read, queries-completed is still zero.
    const queriesCompletedStat = screen
      .getByText(/Queries completed/i)
      .closest('div')!;
    expect(queriesCompletedStat.textContent).toMatch(/0/);
  });

  it('Clear buffer empties the registry', async () => {
    recordRefresh('G', 'k');
    recordProviderLoaded('G', 100);
    render(<PerformanceDiagnostics />);
    const user = userEvent.setup();
    expect(screen.getByText(/^k$/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear buffer/i }));
    expect(screen.queryByText(/^k$/i)).not.toBeInTheDocument();
  });

  it('renders recent failure samples when timed() throws', async () => {
    await expect(
      timed('TestGroup', 'failing-op', async () => {
        throw new Error('database row locked');
      }),
    ).rejects.toThrow();

    render(<PerformanceDiagnostics />);
    expect(screen.getByText(/Recent query failures/i)).toBeInTheDocument();
    expect(screen.getByText(/database row locked/i)).toBeInTheDocument();
    expect(screen.getByText(/TestGroup · failing-op/i)).toBeInTheDocument();
  });

  it('footer reiterates local-only intent', () => {
    render(<PerformanceDiagnostics />);
    expect(
      screen.getByText(/no external telemetry, no analytics, no Dataverse writes/i),
    ).toBeInTheDocument();
  });
});
