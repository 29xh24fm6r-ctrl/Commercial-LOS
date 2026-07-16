import { describe, it, expect } from 'vitest';
import {
  stageProgressionAvailability,
  stageProgressionDiagnostics,
  deriveStageProgressionAvailability,
  deriveStageProgressionDiagnostics,
  deriveStageAdvancementAvailability,
} from './stageProgressionAvailability';
import { resolveStageOrdering, CANONICAL_STAGE_CODES, type StageReferenceRow } from '../../workflow/stageOrderingContract';

function readyOrdering() {
  const seq: Record<string, number> = {
    INTAKE: 10, UNDERWRITING: 20, CREDIT_APPROVAL: 30, COMMITMENT: 40,
    DOCUMENTATION: 50, CLOSING_FUNDING: 60, BOARDED: 70,
  };
  const rows: StageReferenceRow[] = CANONICAL_STAGE_CODES.map((code) => ({
    cr664_code: code, cr664_name: code, cr664_sequence: seq[code], cr664_activeflag: true,
  }));
  return resolveStageOrdering(rows);
}

describe('stageProgressionAvailability (no-arg: rows not loaded → honestly unavailable)', () => {
  it('returns available: false until the environment is seeded (fail-closed tripwire)', () => {
    const result = stageProgressionAvailability();
    expect(result.available).toBe(false);
    expect(result.banner).toBeTruthy();
    expect(result.detail).toBeTruthy();
  });

  it('banner/detail stay banker-facing and conservative', () => {
    const { banner, detail } = stageProgressionAvailability();
    const combined = `${banner} ${detail}`;
    expect(/\bnot yet available\b/i.test(combined)).toBe(true);
    expect(/\bcannot\b/i.test(combined)).toBe(false);
    expect(/\bfail(ed|ing)?\b/i.test(combined)).toBe(false);
    expect(/\binvalid\b/i.test(combined)).toBe(false);
    expect(/\bineligible\b/i.test(combined)).toBe(false);
  });

  it('detail names the actual remaining gap (stage-reference rows + sequence ordering)', () => {
    const { detail } = stageProgressionAvailability();
    expect(detail).toMatch(/stage-reference|stagereference/i);
    expect(detail).toMatch(/ordering|sequence/i);
  });
});

describe('deriveStageProgressionAvailability (data-driven)', () => {
  it('flips to available when a complete, conflict-free ordering resolves', () => {
    const a = deriveStageProgressionAvailability(readyOrdering());
    expect(a.available).toBe(true);
    expect(a.banner).toMatch(/available/i);
  });

  it('stays unavailable (with reasons) for an incomplete ordering', () => {
    const a = deriveStageProgressionAvailability({ status: 'unavailable', reasons: ['missing stage BOARDED'] });
    expect(a.available).toBe(false);
    expect(a.detail).toMatch(/missing stage BOARDED/);
  });
});

describe('stageProgressionDiagnostics (no-arg)', () => {
  it('mirrors availability (false until seeded)', () => {
    expect(stageProgressionDiagnostics().available).toBe(stageProgressionAvailability().available);
  });

  it('exposes the data-source, ordering-contract, and ordering-resolved checks', () => {
    const ids = stageProgressionDiagnostics().checks.map((c) => c.id);
    expect(ids).toContain('stage-reference-data-source');
    expect(ids).toContain('stage-ordering-contract');
    expect(ids).toContain('stage-ordering-resolved');
  });

  it('reports the data source and ordering contract as present+clear (they now exist), ordering-resolved as missing+blocked until seeded', () => {
    const { checks } = stageProgressionDiagnostics();
    const ds = checks.find((c) => c.id === 'stage-reference-data-source')!;
    const ord = checks.find((c) => c.id === 'stage-ordering-contract')!;
    const res = checks.find((c) => c.id === 'stage-ordering-resolved')!;
    expect(ds.state).toBe('present');
    expect(ds.severity).toBe('clear');
    expect(ord.state).toBe('present');
    expect(ord.severity).toBe('clear');
    expect(res.state).toBe('missing');
    expect(res.severity).toBe('blocked');
  });

  it('rolls overallSeverity up to "blocked" while the ordering is unresolved', () => {
    expect(stageProgressionDiagnostics().overallSeverity).toBe('blocked');
  });

  it('names Deal Stage Progression as an affected feature', () => {
    expect(stageProgressionDiagnostics().affectedFeatures.join(' ')).toMatch(/Deal Stage Progression/i);
  });

  it('remediation names the seed, the SDK regeneration, the verify/build step, and the automatic flip', () => {
    const combined = stageProgressionDiagnostics().remediation.join('\n');
    expect(stageProgressionDiagnostics().remediation.length).toBeGreaterThanOrEqual(4);
    expect(combined).toMatch(/seed-stage-references/i);
    expect(combined).toMatch(/regenerate|generated model|SDK/i);
    expect(combined).toMatch(/verify|build|test/i);
    expect(combined).toMatch(/available/i);
  });

  it('uses conservative copy and hardcodes no stage order across checks + remediation', () => {
    const d = stageProgressionDiagnostics();
    const all = [...d.checks.map((c) => `${c.label} ${c.detail}`), ...d.remediation].join(' ');
    expect(/\bcannot\b/i.test(all)).toBe(false);
    expect(/\bfail(ed|ing)?\b/i.test(all)).toBe(false);
    expect(/\binvalid\b/i.test(all)).toBe(false);
    expect(/\bineligible\b/i.test(all)).toBe(false);
    expect(/origination.*underwriting.*committee/i.test(all)).toBe(false);
    expect(/closing.*funded/i.test(all)).toBe(false);
  });
});

describe('deriveStageProgressionDiagnostics (data-driven ready case)', () => {
  it('reports available + all checks clear when the ordering resolves', () => {
    const d = deriveStageProgressionDiagnostics(readyOrdering());
    expect(d.available).toBe(true);
    expect(d.overallSeverity).toBe('clear');
    expect(d.checks.find((c) => c.id === 'stage-ordering-resolved')!.state).toBe('present');
  });
});

const NOW = '2026-07-16T12:00:00.000Z';
const readySchema = deriveStageProgressionAvailability(readyOrdering());
const notSeededSchema = stageProgressionAvailability();

describe('Factory Arc Phase 6 — deriveStageAdvancementAvailability', () => {
  it('all three facts satisfied -> available, no blocking reasons', () => {
    const a = deriveStageAdvancementAvailability(true, true, readySchema, NOW);
    expect(a).toEqual({ id: 'stage-advancement', available: true, blockingReasons: [], checkedAt: NOW });
  });

  it('no resolved actor -> unavailable with an audit-identity reason', () => {
    const a = deriveStageAdvancementAvailability(false, true, readySchema, NOW);
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toContainEqual(
      expect.objectContaining({ kind: 'audit-identity' }),
    );
  });

  it('the deployment flag off -> unavailable with a permission reason', () => {
    const a = deriveStageAdvancementAvailability(true, false, readySchema, NOW);
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toContainEqual(
      expect.objectContaining({ kind: 'permission' }),
    );
  });

  it('the schema/ordering not seeded -> unavailable with a connection reason using the schema banner', () => {
    const a = deriveStageAdvancementAvailability(true, true, notSeededSchema, NOW);
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toEqual([{ kind: 'connection', detail: notSeededSchema.banner }]);
  });

  it('multiple blockers all appear (never silently drops one for another)', () => {
    const a = deriveStageAdvancementAvailability(false, false, notSeededSchema, NOW);
    expect(a.blockingReasons).toHaveLength(3);
    expect(a.blockingReasons.map((r) => r.kind).sort()).toEqual(['audit-identity', 'connection', 'permission']);
  });

  it('carries checkedAt verbatim', () => {
    const a = deriveStageAdvancementAvailability(true, true, readySchema, '2020-01-01T00:00:00.000Z');
    expect(a.checkedAt).toBe('2020-01-01T00:00:00.000Z');
  });
});
