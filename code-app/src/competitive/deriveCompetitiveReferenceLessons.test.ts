import { describe, it, expect } from 'vitest';
import { deriveCompetitiveReferenceLessons } from './deriveCompetitiveReferenceLessons';

/**
 * Phase 142A — reference lesson deriver pins.
 */

const VALID_RISK_CLASSES = [
  'read_only_strategy', 'metadata_only', 'runtime_read', 'runtime_write_disabled',
  'runtime_write_enabled_later', 'external_integration_disabled', 'external_integration_enabled_later',
  'credit_decision_support', 'credit_decision_final_forbidden',
];

describe('Phase 142A — reference lessons', () => {
  const result = deriveCompetitiveReferenceLessons();

  it('each reference platform produces at least one lesson', () => {
    for (const p of ['digifi_getsan4u_los', 'opencbs_los', 'frappe_lending', 'twenty_crm', 'corteza', 'salesforce', 'ncino']) {
      expect(result.lessonsByPlatform.some((l) => l.platform === p)).toBe(true);
    }
  });

  it('every backlog item has a valid risk class', () => {
    expect(result.prioritizedImplementationBacklog.length).toBeGreaterThan(0);
    for (const b of result.prioritizedImplementationBacklog) {
      expect(VALID_RISK_CLASSES).toContain(b.riskClass);
    }
  });

  it('final credit approval automation is forbidden', () => {
    expect(result.capabilitiesToAvoid.some((c) => c.riskClass === 'credit_decision_final_forbidden')).toBe(true);
    // No backlog item enables final approval.
    for (const b of result.prioritizedImplementationBacklog) {
      expect(b.riskClass).not.toBe('credit_decision_final_forbidden');
      expect(b.title.toLowerCase()).not.toMatch(/final approval|auto.?approve/);
    }
  });

  it('external integrations default disabled', () => {
    const integration = result.prioritizedImplementationBacklog.find((b) => b.key === 'integration_adapter_registry')!;
    expect(integration.riskClass).toBe('external_integration_disabled');
  });

  it('surfaces gaps to close and recommended phases', () => {
    expect(result.gapsToClose.length).toBeGreaterThan(0);
    expect(result.recommendedPhases[0]).toMatch(/142B/);
  });
});
