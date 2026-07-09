import { describe, it, expect } from 'vitest';
import {
  LOS_WORKFLOW_TRANSITIONS,
  LOS_WORKFLOW_FACTS,
  isFullWorkflowLiveAndProven,
  type LiveWriteStatus,
  type GateDepth,
  type FactBacking,
} from './losWorkflowTruthMatrix';

/**
 * PR 0 — the truth matrix is descriptive data; these tests pin its internal consistency and its
 * HONEST current-state assertions so the matrix cannot silently drift greener than reality.
 */

const LIVE_WRITE: readonly LiveWriteStatus[] = ['live', 'preview-only'];
const GATE_DEPTH: readonly GateDepth[] = ['fact-backed', 'shallow', 'absent-facts'];
const FACT_BACKING: readonly FactBacking[] = ['tracked', 'tracked-non-blocking', 'shallow', 'absent-placeholder', 'unrouted-module'];

describe('LOS workflow truth matrix — transitions', () => {
  it('covers exactly the nine transitions with unique ids', () => {
    expect(LOS_WORKFLOW_TRANSITIONS).toHaveLength(9);
    const ids = LOS_WORKFLOW_TRANSITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(9);
    expect(ids).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9']);
  });

  it('every transition carries valid enums, sources, and recommended PRs within the arc (0..24)', () => {
    for (const t of LOS_WORKFLOW_TRANSITIONS) {
      expect(LIVE_WRITE).toContain(t.liveWrite);
      expect(GATE_DEPTH).toContain(t.gateDepth);
      expect(t.sourceFiles.length).toBeGreaterThan(0);
      expect(t.gaps.length).toBeGreaterThan(0);
      expect(t.recommendedPrs.length).toBeGreaterThan(0);
      for (const pr of t.recommendedPrs) {
        expect(pr).toBeGreaterThanOrEqual(0);
        expect(pr).toBeLessThanOrEqual(24);
      }
    }
  });

  it('the six forward stage advances are LIVE; the three non-forward paths are PREVIEW-ONLY', () => {
    const advances = LOS_WORKFLOW_TRANSITIONS.filter((t) => t.kind === 'advance');
    const nonForward = LOS_WORKFLOW_TRANSITIONS.filter((t) => t.kind !== 'advance');
    expect(advances).toHaveLength(6);
    expect(advances.every((t) => t.liveWrite === 'live')).toBe(true);
    expect(nonForward.map((t) => t.kind).sort()).toEqual(['decline', 'return', 'withdraw']);
    expect(nonForward.every((t) => t.liveWrite === 'preview-only')).toBe(true);
  });

  it('HONEST state: no transition is machine-proven yet, so full-workflow-live-and-proven is false', () => {
    expect(LOS_WORKFLOW_TRANSITIONS.every((t) => t.smokeProven === false)).toBe(true);
    expect(isFullWorkflowLiveAndProven()).toBe(false);
  });
});

describe('LOS workflow truth matrix — facts', () => {
  it('every fact has a valid backing and a source', () => {
    for (const f of LOS_WORKFLOW_FACTS) {
      expect(FACT_BACKING).toContain(f.backing);
      expect(f.source.length).toBeGreaterThan(0);
      expect(f.recommendedPrs.length).toBeGreaterThan(0);
    }
  });

  it('pins the key honest findings (risk rating absent + not live-gated; docs shallow; tasks non-blocking)', () => {
    const byFact = (needle: string) => LOS_WORKFLOW_FACTS.find((f) => f.fact.includes(needle))!;
    expect(byFact('risk rating').backing).toBe('absent-placeholder');
    expect(byFact('risk rating').inLiveGate).toBe(false);
    expect(byFact('required documents').backing).toBe('shallow');
    expect(byFact('required documents').inLiveGate).toBe(true);
    expect(byFact('required tasks').backing).toBe('tracked-non-blocking');
    expect(byFact('boarded-loan handoff').backing).toBe('shallow');
  });
});
