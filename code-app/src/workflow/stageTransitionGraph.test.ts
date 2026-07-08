import { describe, it, expect } from 'vitest';
import {
  resolveStageOrdering,
  describeStageTransitionGraph,
  isAdjacentAdvance,
  CANONICAL_STAGES,
  CANONICAL_STAGE_CODES,
  type StageReferenceRow,
} from './stageOrderingContract';

/**
 * Transition graph derived from a resolved ordering. Pins: a ready ordering forms
 * a single valid linear chain covering every stage exactly once and ending at the
 * terminal; only adjacent single-step advances are legal (skips are rejected).
 */

const READY_ROWS: StageReferenceRow[] = CANONICAL_STAGES.map((s) => ({
  cr664_code: s.code,
  cr664_name: s.name,
  cr664_sequence: s.sequence,
  cr664_activeflag: true,
}));

function readyOrdering() {
  const r = resolveStageOrdering(READY_ROWS);
  if (r.status !== 'ready') throw new Error('fixture ordering should be ready');
  return r;
}

describe('describeStageTransitionGraph', () => {
  it('validates a ready ordering as a single linear chain over all stages', () => {
    const graph = describeStageTransitionGraph(readyOrdering());
    expect(graph.valid).toBe(true);
    expect(graph.issues).toEqual([]);
    // The path visits all seven canonical codes in ascending sequence order.
    expect(graph.path).toEqual([...CANONICAL_STAGE_CODES]);
    // Edges are strictly adjacent (N-1 edges for N stages).
    expect(graph.edges).toHaveLength(CANONICAL_STAGE_CODES.length - 1);
    for (const e of graph.edges) {
      const fromIdx = CANONICAL_STAGE_CODES.indexOf(e.from);
      const toIdx = CANONICAL_STAGE_CODES.indexOf(e.to);
      expect(toIdx - fromIdx).toBe(1); // no skips
    }
  });

  it('ends at the single terminal stage', () => {
    const ordering = readyOrdering();
    const graph = describeStageTransitionGraph(ordering);
    const last = graph.path[graph.path.length - 1];
    expect(ordering.isTerminal(last!)).toBe(true);
    expect(last).toBe('BOARDED');
  });
});

describe('isAdjacentAdvance — only single-step advances are legal', () => {
  it('accepts the immediate next stage', () => {
    const ordering = readyOrdering();
    expect(isAdjacentAdvance(ordering, 'INTAKE', 'UNDERWRITING')).toBe(true);
  });

  it('rejects a jump that skips a stage (illegal advance)', () => {
    const ordering = readyOrdering();
    expect(isAdjacentAdvance(ordering, 'INTAKE', 'CREDIT_APPROVAL')).toBe(false);
    expect(isAdjacentAdvance(ordering, 'INTAKE', 'BOARDED')).toBe(false);
  });

  it('rejects a backward move as an advance', () => {
    const ordering = readyOrdering();
    expect(isAdjacentAdvance(ordering, 'UNDERWRITING', 'INTAKE')).toBe(false);
  });
});
