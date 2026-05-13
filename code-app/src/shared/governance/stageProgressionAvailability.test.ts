import { describe, it, expect } from 'vitest';
import {
  stageProgressionAvailability,
  stageProgressionDiagnostics,
} from './stageProgressionAvailability';

describe('stageProgressionAvailability', () => {
  it('returns available: false in Phase 28 (schema-blocked implementation)', () => {
    // Phase 28 was intentionally not shipped as a write because the
    // Dataverse schema does not yet expose a deterministic next-stage
    // ordering. This test pins that decision: when a future phase
    // adds the stage-reference service, this test will flip to true
    // and act as a tripwire on the gate change.
    const result = stageProgressionAvailability();
    expect(result.available).toBe(false);
    expect(result.banner).toBeTruthy();
    expect(result.detail).toBeTruthy();
  });

  it('banner is banker-facing and conservative — never claims the deal is broken or that the banker did something wrong', () => {
    const { banner, detail } = stageProgressionAvailability();
    // Conservative copy discipline carried forward from Phases 23/26/27.
    const combined = `${banner} ${detail}`;
    expect(/\bnot yet available\b/i.test(combined)).toBe(true);
    expect(/\bcannot\b/i.test(combined)).toBe(false);
    expect(/\bfail(ed|ing)?\b/i.test(combined)).toBe(false);
    expect(/\binvalid\b/i.test(combined)).toBe(false);
    expect(/\bineligible\b/i.test(combined)).toBe(false);
  });

  it('detail names the actual schema gap — not a vague "coming soon"', () => {
    const { detail } = stageProgressionAvailability();
    // The detail must mention the specific missing pieces so an
    // engineer reading it can act on it directly.
    expect(detail).toMatch(/stage-reference|stagereference/i);
    expect(detail).toMatch(/ordering|sequence/i);
  });
});

describe('stageProgressionDiagnostics', () => {
  it('mirrors stageProgressionAvailability().available (currently false)', () => {
    expect(stageProgressionDiagnostics().available).toBe(
      stageProgressionAvailability().available,
    );
  });

  it('exposes the three required check rows: data source, ordering, write availability', () => {
    const { checks } = stageProgressionDiagnostics();
    const ids = checks.map((c) => c.id);
    expect(ids).toContain('stage-reference-data-source');
    expect(ids).toContain('stage-ordering-contract');
    expect(ids).toContain('stage-progression-write-availability');
  });

  it('marks data-source and ordering checks as missing+blocked, write-availability as missing+at-risk', () => {
    const { checks } = stageProgressionDiagnostics();
    const ds = checks.find((c) => c.id === 'stage-reference-data-source')!;
    const ord = checks.find((c) => c.id === 'stage-ordering-contract')!;
    const wa = checks.find((c) => c.id === 'stage-progression-write-availability')!;

    expect(ds.state).toBe('missing');
    expect(ds.severity).toBe('blocked');
    expect(ord.state).toBe('missing');
    expect(ord.severity).toBe('blocked');
    expect(wa.state).toBe('missing');
    // The write-availability row is the consequence of the other two —
    // we keep its own severity at at-risk so the admin sees the cause
    // (data-source / ordering = blocked) ranked higher than the effect.
    expect(wa.severity).toBe('at-risk');
  });

  it('rolls overallSeverity up to "blocked" because at least one check is blocked', () => {
    expect(stageProgressionDiagnostics().overallSeverity).toBe('blocked');
  });

  it('exposes Deal Stage Progression as an affected feature so the impact is visible without cross-referencing', () => {
    const { affectedFeatures } = stageProgressionDiagnostics();
    expect(affectedFeatures.length).toBeGreaterThan(0);
    expect(affectedFeatures.join(' ')).toMatch(/Deal Stage Progression/i);
  });

  it('remediation is a non-empty ordered list naming pac code add-data-source, SDK regeneration, and the gate flip', () => {
    const { remediation } = stageProgressionDiagnostics();
    expect(remediation.length).toBeGreaterThanOrEqual(4);
    const combined = remediation.join('\n');
    expect(combined).toMatch(/add-data-source/i);
    expect(combined).toMatch(/regenerate|generated SDK|src\/generated/i);
    expect(combined).toMatch(/stageProgressionAvailability/i);
    // Must mention re-running the test suite / build — the gate cannot
    // flip silently.
    expect(combined).toMatch(/test|build/i);
  });

  it('uses conservative copy across every check.detail and every remediation step', () => {
    const d = stageProgressionDiagnostics();
    const all = [
      ...d.checks.map((c) => `${c.label} ${c.detail}`),
      ...d.remediation,
    ].join(' ');
    expect(/\bcannot\b/i.test(all)).toBe(false);
    expect(/\bfail(ed|ing)?\b/i.test(all)).toBe(false);
    expect(/\binvalid\b/i.test(all)).toBe(false);
    expect(/\bineligible\b/i.test(all)).toBe(false);
    // Stage order MUST NOT be hardcoded anywhere in the diagnostic
    // payload — the brief forbids inventing one.
    expect(/origination.*underwriting.*committee/i.test(all)).toBe(false);
    expect(/closing.*funded/i.test(all)).toBe(false);
  });
});
