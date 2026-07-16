// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PLATFORM_OPERATIONS_CAPABILITY_SPECS } from './platformOperationsCapabilitySpecs';
import { SMOKE_CAPABILITIES } from '../access/operatorSmokeEvidenceRegistry';

const REQUIRED_KEYS = [
  'new-deal-create',
  'stage-progression',
  'task-generation',
  'checklist-generation',
  'borrower-communication',
  'borrower-sms',
  'crm-manual-write',
  'crm-writeback',
  'portfolio-boarding-manual',
  'portfolio-boarding',
  'document-upload',
  'audit-event-writes',
] as const;

describe('Factory Arc Phase 4 — platform operations capability specs', () => {
  it('covers exactly the 12 required capabilities, no more, no fewer', () => {
    const keys = PLATFORM_OPERATIONS_CAPABILITY_SPECS.map((s) => s.key).sort();
    expect(keys).toEqual([...REQUIRED_KEYS].sort());
    expect(PLATFORM_OPERATIONS_CAPABILITY_SPECS).toHaveLength(12);
  });

  it('every spec key is a registered smoke-evidence capability', () => {
    for (const spec of PLATFORM_OPERATIONS_CAPABILITY_SPECS) {
      expect(SMOKE_CAPABILITIES as readonly string[]).toContain(spec.key);
    }
  });

  it('every spec has a non-empty rollback instruction and text fields', () => {
    for (const spec of PLATFORM_OPERATIONS_CAPABILITY_SPECS) {
      expect(spec.rollback.length, `${spec.key}.rollback`).toBeGreaterThan(0);
      expect(spec.routeState?.length ?? 0, `${spec.key}.routeState`).toBeGreaterThan(0);
      expect(spec.diState?.length ?? 0, `${spec.key}.diState`).toBeGreaterThan(0);
      expect(spec.actorAuthorizationRequirement?.length ?? 0, `${spec.key}.actorAuthorizationRequirement`).toBeGreaterThan(0);
      expect(spec.auditSinkState?.length ?? 0, `${spec.key}.auditSinkState`).toBeGreaterThan(0);
    }
  });

  it('never states a synthesized "enabled by"/"enabled on" — those are supplied only by live deps', () => {
    for (const spec of PLATFORM_OPERATIONS_CAPABILITY_SPECS) {
      expect('enabledBy' in spec).toBe(false);
      expect('enabledOn' in spec).toBe(false);
      expect('latestSmoke' in spec).toBe(false);
      expect('latestSuccessfulWrite' in spec).toBe(false);
      expect('latestFailedWrite' in spec).toBe(false);
    }
  });

  it('the pilot-certified New Deal creation capability is asserted true from the real flag, not a literal', () => {
    const spec = PLATFORM_OPERATIONS_CAPABILITY_SPECS.find((s) => s.key === 'new-deal-create')!;
    const pilotFlag = spec.flags.find((f) => f.name === 'BANKER_CREATE_PILOT_ENABLED');
    expect(pilotFlag?.value).toBe(true);
    expect(pilotFlag?.required).toBe(true);
  });

  it('capabilities with no boolean kill-switch (crm-manual-write, audit-event-writes) declare zero flags honestly', () => {
    for (const key of ['crm-manual-write', 'audit-event-writes'] as const) {
      const spec = PLATFORM_OPERATIONS_CAPABILITY_SPECS.find((s) => s.key === key)!;
      expect(spec.flags).toEqual([]);
    }
  });
});
