import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SMOKE_CAPABILITIES,
  OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED,
  deriveCapabilitySmokeReadiness,
} from '../../access/operatorSmokeEvidenceRegistry';

/**
 * PHASE 211 — the operator smoke-evidence registry is a pure read model that never
 * fabricates a smoke pass, never infers a pass from green tests, and whose optional
 * governed write is disabled-by-default and fail-closed. Missing evidence blocks GO;
 * the registry alone can never mark a capability live.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const SRC = readFileSync(resolve(ROOT, 'src/access/operatorSmokeEvidenceRegistry.ts'), 'utf8');

describe('211 — registry is a pure, side-effect-free read model', () => {
  it('imports no generated SDK service and performs no network/Dataverse read', () => {
    expect(SRC).not.toMatch(/from ['"][^'"]*\/generated\//);
    expect(SRC).not.toMatch(/\.getAll\(|\.create\(|\.update\(|\.delete\(/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
  });
  it('reads no environment or secret directly', () => {
    expect(SRC).not.toMatch(/process\.env|import\.meta\.env/);
  });
});

describe('211 — covers the nine originally-certified capabilities plus Factory Arc Phase 4 additions', () => {
  it('exposes exactly fourteen smoke capabilities (the original nine, unchanged, plus five Phase 4 additions)', () => {
    // Phase 4 added 5 slots (task-generation, crm-manual-write, portfolio-boarding-manual,
    // borrower-sms, audit-event-writes) additively, so the Platform Operations workspace can
    // cover all 12 required capabilities without renaming (and thus silently breaking) any of
    // the original nine.
    expect([...SMOKE_CAPABILITIES].sort()).toEqual(
      [
        'admin-entitlement-grant',
        'admin-entitlement-revoke',
        'borrower-communication',
        'checklist-generation',
        'crm-writeback',
        'document-upload',
        'new-deal-create',
        'portfolio-boarding',
        'stage-progression',
        'task-generation',
        'crm-manual-write',
        'portfolio-boarding-manual',
        'borrower-sms',
        'audit-event-writes',
      ].sort(),
    );
  });
});

describe('211 — never fabricates a pass; missing evidence blocks GO', () => {
  it('an empty registry blocks GO for every capability with not-run', () => {
    const rows = deriveCapabilitySmokeReadiness({ source: 'out-of-band', records: [] });
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.smokeOutcome === 'not-run' && r.blocksGo)).toBe(true);
  });
});

describe('211 — governed write is disabled by default and fail-closed', () => {
  it('the write flag is false by default', () => {
    expect(OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED).toBe(false);
    expect(SRC).toMatch(/OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED\s*=\s*false/);
  });
  it('the write adapter checks flag, Super Admin, validation, and transport before persisting', () => {
    expect(SRC).toMatch(/kind:\s*'disabled'/);
    expect(SRC).toMatch(/kind:\s*'unauthorized'/);
    expect(SRC).toMatch(/kind:\s*'validation-error'/);
    expect(SRC).toMatch(/kind:\s*'no-transport'/);
    // A 'recorded' outcome only follows a real transport.persist call.
    expect(SRC).toMatch(/await input\.transport\.persist\(/);
  });
});
