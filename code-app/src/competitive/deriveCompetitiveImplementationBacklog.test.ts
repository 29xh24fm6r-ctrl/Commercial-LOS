import { describe, it, expect } from 'vitest';
import { deriveCompetitiveImplementationBacklog } from './deriveCompetitiveImplementationBacklog';

/**
 * Phase 142A — implementation backlog pins.
 */

describe('Phase 142A — implementation backlog', () => {
  const backlog = deriveCompetitiveImplementationBacklog();

  it('has prioritized phases in order', () => {
    expect(backlog.items.length).toBeGreaterThan(0);
    const priorities = backlog.items.map((i) => i.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
    expect(backlog.recommendedPhases.length).toBeGreaterThanOrEqual(7);
  });

  it('every backlog item has a risk class', () => {
    for (const i of backlog.items) expect(typeof i.riskClass).toBe('string');
  });

  it('contains no unsafe final-decision phase', () => {
    for (const i of backlog.items) {
      expect(i.riskClass).not.toBe('credit_decision_final_forbidden');
      expect(i.title.toLowerCase()).not.toMatch(/final approval|auto.?approve|auto.?decline/);
    }
    expect(backlog.forbidden.some((f) => f.riskClass === 'credit_decision_final_forbidden')).toBe(true);
  });

  it('contains no automatic outreach phase', () => {
    for (const i of backlog.items) {
      expect(i.title.toLowerCase()).not.toMatch(/auto.*(email|sms|outreach|send)/);
    }
  });
});
