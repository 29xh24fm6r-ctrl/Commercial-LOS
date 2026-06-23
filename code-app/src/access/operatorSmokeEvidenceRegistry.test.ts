import { describe, it, expect } from 'vitest';
import {
  SMOKE_CAPABILITIES,
  SMOKE_OUTCOMES,
  OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED,
  latestEvidenceByCapability,
  deriveCapabilitySmokeReadiness,
  toCapabilitySmokeResult,
  recordSmokeEvidence,
  type OperatorSmokeEvidence,
  type SmokeEvidenceRegistryInput,
} from './operatorSmokeEvidenceRegistry';

function ev(over: Partial<OperatorSmokeEvidence> = {}): OperatorSmokeEvidence {
  return {
    capability: 'new-deal-create',
    outcome: 'passed',
    actorUpn: 'mpaller@oldglorybank.com',
    actorPlatformUserId: 'pu-1',
    timestamp: '2026-06-23T10:00:00.000Z',
    correlationId: 'corr-1',
    environmentName: 'OGB-DEV',
    evidenceNote: 'Created one controlled deal; readback OK.',
    rollbackVerified: true,
    ...over,
  };
}
const registry = (records: OperatorSmokeEvidence[], source: SmokeEvidenceRegistryInput['source'] = 'out-of-band'): SmokeEvidenceRegistryInput => ({
  source,
  records,
});

describe('Phase 211 — registry shape', () => {
  it('exposes the nine capabilities and four outcomes', () => {
    expect(SMOKE_CAPABILITIES).toHaveLength(9);
    expect(SMOKE_OUTCOMES).toEqual(['passed', 'failed', 'partial', 'not-run']);
  });
});

describe('Phase 211 — latestEvidenceByCapability', () => {
  it('returns null for every capability when no records exist', () => {
    const latest = latestEvidenceByCapability(registry([]));
    for (const cap of SMOKE_CAPABILITIES) expect(latest[cap]).toBeNull();
  });
  it('picks the record with the greatest timestamp per capability', () => {
    const older = ev({ timestamp: '2026-06-20T00:00:00.000Z', correlationId: 'old' });
    const newer = ev({ timestamp: '2026-06-22T00:00:00.000Z', correlationId: 'new' });
    const latest = latestEvidenceByCapability(registry([older, newer]));
    expect(latest['new-deal-create']?.correlationId).toBe('new');
  });
  it('ignores malformed records (unknown capability / outcome)', () => {
    const bad = { ...ev(), capability: 'totally-bogus' } as unknown as OperatorSmokeEvidence;
    const latest = latestEvidenceByCapability(registry([bad]));
    expect(latest['new-deal-create']).toBeNull();
  });
});

describe('Phase 211 — deriveCapabilitySmokeReadiness', () => {
  it('reports not-run / blocks-GO for every capability with no evidence', () => {
    const rows = deriveCapabilitySmokeReadiness(registry([]));
    expect(rows).toHaveLength(9);
    for (const r of rows) {
      expect(r.smokeOutcome).toBe('not-run');
      expect(r.smokePassed).toBe(false);
      expect(r.blocksGo).toBe(true);
      expect(r.blockReason).toMatch(/No smoke evidence recorded/);
    }
  });
  it('a passed smoke with verified rollback does NOT block GO', () => {
    const rows = deriveCapabilitySmokeReadiness(registry([ev({ outcome: 'passed', rollbackVerified: true })]));
    const row = rows.find((r) => r.capability === 'new-deal-create')!;
    expect(row.smokePassed).toBe(true);
    expect(row.rollbackVerified).toBe(true);
    expect(row.blocksGo).toBe(false);
    expect(row.blockReason).toBeNull();
  });
  it('a passed smoke with UNVERIFIED rollback still blocks GO', () => {
    const rows = deriveCapabilitySmokeReadiness(registry([ev({ outcome: 'passed', rollbackVerified: false })]));
    const row = rows.find((r) => r.capability === 'new-deal-create')!;
    expect(row.blocksGo).toBe(true);
    expect(row.blockReason).toMatch(/rollback is not verified/i);
  });
  it('failed / partial smokes block GO and are never coerced to passed', () => {
    for (const outcome of ['failed', 'partial', 'not-run'] as const) {
      const rows = deriveCapabilitySmokeReadiness(registry([ev({ outcome })]));
      const row = rows.find((r) => r.capability === 'new-deal-create')!;
      expect(row.smokePassed).toBe(false);
      expect(row.blocksGo).toBe(true);
    }
  });
  it('carries the evidence source through for honest labeling', () => {
    const rows = deriveCapabilitySmokeReadiness(registry([], 'out-of-band'));
    expect(rows[0]!.source).toBe('out-of-band');
  });
});

describe('Phase 211 — toCapabilitySmokeResult', () => {
  it('maps evidence into the console result shape', () => {
    expect(toCapabilitySmokeResult(ev())).toEqual({
      outcome: 'passed',
      actor: 'mpaller@oldglorybank.com',
      correlationId: 'corr-1',
      at: '2026-06-23T10:00:00.000Z',
    });
  });
  it('null evidence maps to null (console renders "none")', () => {
    expect(toCapabilitySmokeResult(null)).toBeNull();
  });
});

describe('Phase 211 — governed write adapter is fail-closed and default-off', () => {
  it('the write flag is disabled by default', () => {
    expect(OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED).toBe(false);
  });
  it('returns disabled when the flag is off (default)', async () => {
    const out = await recordSmokeEvidence({ evidence: ev(), actorIsSuperAdmin: true });
    expect(out.kind).toBe('disabled');
  });
  it('returns unauthorized for a non-Super-Admin even when enabled', async () => {
    const out = await recordSmokeEvidence({ evidence: ev(), actorIsSuperAdmin: false, writeEnabled: true });
    expect(out.kind).toBe('unauthorized');
  });
  it('validates required fields before any persist', async () => {
    const out = await recordSmokeEvidence({
      evidence: ev({ correlationId: '' }),
      actorIsSuperAdmin: true,
      writeEnabled: true,
      transport: { persist: async () => undefined },
    });
    expect(out.kind).toBe('validation-error');
    if (out.kind === 'validation-error') expect(out.reason).toMatch(/correlationId/);
  });
  it('returns no-transport when enabled + authorized + valid but no sink exists', async () => {
    const out = await recordSmokeEvidence({ evidence: ev(), actorIsSuperAdmin: true, writeEnabled: true });
    expect(out.kind).toBe('no-transport');
  });
  it('records via an injected transport and never fabricates success', async () => {
    let persisted: OperatorSmokeEvidence | null = null;
    const out = await recordSmokeEvidence({
      evidence: ev(),
      actorIsSuperAdmin: true,
      writeEnabled: true,
      transport: { persist: async (e) => { persisted = e; } },
    });
    expect(out.kind).toBe('recorded');
    expect(persisted).not.toBeNull();
  });
  it('surfaces a transport failure as failed, not recorded', async () => {
    const out = await recordSmokeEvidence({
      evidence: ev(),
      actorIsSuperAdmin: true,
      writeEnabled: true,
      transport: { persist: async () => { throw new Error('sink down'); } },
    });
    expect(out.kind).toBe('failed');
    if (out.kind === 'failed') expect(out.reason).toMatch(/sink down/);
  });
});
