import { describe, it, expect } from 'vitest';
import { loadStageGovernanceDiagnosticsWith, type StageGovernanceReaders } from './stageGovernanceDiagnosticsLoader';
import { CANONICAL_STAGES, type StageReferenceRow } from '../workflow/stageOrderingContract';
import { CANONICAL_STATUS_CODES, type StatusReferenceRow } from '../workflow/statusReferenceContract';

/**
 * Live-loader → rich diagnostics. Pins the CRITICAL→READY behaviour: a complete,
 * conflict-free stage ordering + the five active statuses + a valid transition
 * graph flips the card to available; any defect (missing/duplicate/inactive
 * sequence, missing status) or a failed read blocks it, fail-closed.
 */

const READY_STAGES: StageReferenceRow[] = CANONICAL_STAGES.map((s) => ({
  cr664_code: s.code,
  cr664_name: s.name,
  cr664_sequence: s.sequence,
  cr664_activeflag: true,
}));

const READY_STATUSES: StatusReferenceRow[] = CANONICAL_STATUS_CODES.map((c) => ({
  cr664_code: c,
  cr664_name: c,
  cr664_activeflag: true,
}));

function readers(over: Partial<{ stages: StageReferenceRow[]; statuses: StatusReferenceRow[]; stageThrows: boolean; statusThrows: boolean }> = {}): StageGovernanceReaders {
  return {
    readStageRows: async () => {
      if (over.stageThrows) throw new Error('cr664_sequence column not provisioned (0x80060888)');
      return over.stages ?? READY_STAGES;
    },
    readStatusRows: async () => {
      if (over.statusThrows) throw new Error('status data source not registered');
      return over.statuses ?? READY_STATUSES;
    },
  };
}

function check(d: Awaited<ReturnType<typeof loadStageGovernanceDiagnosticsWith>>, id: string) {
  return d.checks.find((c) => c.id === id)!;
}

describe('loadStageGovernanceDiagnosticsWith — CRITICAL → READY', () => {
  it('flips to READY (available) when stages, statuses, and the graph all pass', async () => {
    const d = await loadStageGovernanceDiagnosticsWith(readers());
    expect(d.available).toBe(true);
    expect(d.overallSeverity).toBe('clear');
    // All five checks clear.
    for (const id of ['stage-reference-data-source', 'stage-ordering-contract', 'stage-ordering-resolved', 'status-references-seeded', 'transition-graph-valid']) {
      expect(check(d, id).severity).toBe('clear');
    }
    // Exact rows + resolved transition path are surfaced.
    expect(d.stageRows).toHaveLength(7);
    expect(d.stageRows[0]).toMatchObject({ code: 'INTAKE', sequence: 10, active: true, canonical: true });
    expect(d.statusRows).toHaveLength(5);
    expect(d.transitionPath).toEqual(['INTAKE', 'UNDERWRITING', 'CREDIT_APPROVAL', 'COMMITMENT', 'DOCUMENTATION', 'CLOSING_FUNDING', 'BOARDED']);
  });

  it('blocks when a stage has no cr664_sequence', async () => {
    const stages = READY_STAGES.map((s) => (s.cr664_code === 'COMMITMENT' ? { ...s, cr664_sequence: null } : s));
    const d = await loadStageGovernanceDiagnosticsWith(readers({ stages }));
    expect(d.available).toBe(false);
    expect(d.overallSeverity).toBe('blocked');
    expect(check(d, 'stage-ordering-resolved').detail).toMatch(/COMMITMENT has no cr664_sequence/);
  });

  it('blocks on a duplicate sequence', async () => {
    const stages = READY_STAGES.map((s) => (s.cr664_code === 'UNDERWRITING' ? { ...s, cr664_sequence: 10 } : s));
    const d = await loadStageGovernanceDiagnosticsWith(readers({ stages }));
    expect(d.available).toBe(false);
    expect(check(d, 'stage-ordering-resolved').detail).toMatch(/sequence 10 is shared/);
  });

  it('blocks when a canonical stage is inactive (treated as missing)', async () => {
    const stages = READY_STAGES.map((s) => (s.cr664_code === 'BOARDED' ? { ...s, cr664_activeflag: false } : s));
    const d = await loadStageGovernanceDiagnosticsWith(readers({ stages }));
    expect(d.available).toBe(false);
    expect(check(d, 'stage-ordering-resolved').detail).toMatch(/missing stage BOARDED/);
    // The inactive row is still surfaced honestly in the table.
    expect(d.stageRows.find((r) => r.code === 'BOARDED')?.active).toBe(false);
  });

  it('blocks when a status reference is missing (even if stages are ready)', async () => {
    const statuses = READY_STATUSES.filter((s) => s.cr664_code !== 'WITHDRAWN');
    const d = await loadStageGovernanceDiagnosticsWith(readers({ statuses }));
    expect(d.available).toBe(false);
    expect(check(d, 'stage-ordering-resolved').severity).toBe('clear'); // stages fine
    expect(check(d, 'status-references-seeded').severity).toBe('blocked');
    expect(check(d, 'status-references-seeded').detail).toMatch(/missing status WITHDRAWN/);
  });

  it('is fail-closed when the stage read throws (unprovisioned column)', async () => {
    const d = await loadStageGovernanceDiagnosticsWith(readers({ stageThrows: true }));
    expect(d.available).toBe(false);
    expect(check(d, 'stage-ordering-resolved').severity).toBe('blocked');
    expect(check(d, 'stage-ordering-resolved').detail).toMatch(/0x80060888|not/i);
  });

  it('is fail-closed when both reads throw (rows not loaded)', async () => {
    const d = await loadStageGovernanceDiagnosticsWith(readers({ stageThrows: true, statusThrows: true }));
    expect(d.available).toBe(false);
    expect(d.overallSeverity).toBe('blocked');
    expect(d.stageRows).toHaveLength(0);
    expect(d.statusRows).toHaveLength(0);
  });
});
