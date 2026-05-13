import { describe, it, expect } from 'vitest';
import { stageProgressionAvailability } from './stageProgressionAvailability';

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
