// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveExecutiveRestartReadinessModel } from './executiveRestartReadinessModel';

describe('Phase 233 — Executive Restart Readiness model', () => {
  it('summarizes restart posture across banker, manager, admin, CRM, LOS workflow, portfolio, and live gates', () => {
    const vm = deriveExecutiveRestartReadinessModel();

    expect(vm.title).toBe('Executive Restart Readiness Command Center');
    expect(vm.domains.map((d) => d.id)).toEqual([
      'banker-operating',
      'manager-operating',
      'admin-activation',
      'internal-crm',
      'lending-workflow',
      'portfolio-boarding',
      'live-gate-categories',
    ]);
  });

  it('keeps banker and manager operating while live-write categories stay gated activation', () => {
    const vm = deriveExecutiveRestartReadinessModel();
    const byId = new Map(vm.domains.map((d) => [d.id, d]));

    expect(byId.get('banker-operating')?.state).toBe('operating');
    expect(byId.get('manager-operating')?.state).toBe('operating');
    expect(byId.get('live-gate-categories')?.state).toBe('gated-activation');
    // With default fail-closed gates, the overall restart posture is gated activation.
    expect(vm.overallState).toBe('gated-activation');
  });

  it('lists the live-write categories that remain gated under safe defaults', () => {
    const vm = deriveExecutiveRestartReadinessModel();
    // Live-write gates are reset to safe defaults; every live-write category stays gated.
    expect(vm.gatedActivationCategories).toEqual([
      'New Deal create',
      'CRM writeback / live persistence',
      'Document checklist generation',
      'Borrower communication send',
      'Portfolio boarding live persistence',
    ]);
  });

  it('uses leadership restart language and asserts no hidden writes / no route widening', () => {
    const vm = deriveExecutiveRestartReadinessModel();

    expect(vm.restartPosture).toMatch(/restart readiness/i);
    expect(vm.restartPosture).toMatch(/gated activation/i);
    expect(vm.restartPosture).toMatch(/no hidden writes/i);
    expect(vm.leadershipAssurances.join(' ')).toMatch(/operating readiness/i);
    expect(vm.leadershipAssurances.join(' ')).toMatch(/No route or permission is widened/i);
    expect(vm.leadershipAssurances.join(' ')).toMatch(/No hidden writes/i);
  });

  it('source remains pure/read-only with no SDK, fetch, GUID, or Dataverse mutation primitive', () => {
    const src = readFileSync(resolve(__dirname, 'executiveRestartReadinessModel.ts'), 'utf8');

    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/graph\.microsoft\.com/i);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
