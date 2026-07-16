// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveBankerOperatingCommandCenterModel } from './bankerOperatingCommandCenterModel';

describe('Phase 232 / Factory Arc Phase 2-3 — Banker Operating Command Center model', () => {
  it('carries the command center identity', () => {
    const vm = deriveBankerOperatingCommandCenterModel();

    expect(vm.title).toBe('Banker Operating Command Center');
    expect(vm.posture).toMatch(/CRM/);
    expect(vm.posture).toMatch(/active deal workflow/i);
  });

  it('points bankers to the existing deal cockpit anchors instead of inventing a parallel workflow', () => {
    const vm = deriveBankerOperatingCommandCenterModel();

    expect(vm.dealCockpitAnchors).toEqual([
      'stage-map',
      'workstreams',
      'crm-relationship',
      'credit-memo',
      'tasks',
      'documents',
    ]);
  });

  it('no longer models a per-capability gate/certification domain — retired in favor of live Portfolio & Workflow Health metrics', () => {
    const vm = deriveBankerOperatingCommandCenterModel();
    expect('domains' in vm).toBe(false);
    expect('certifications' in vm).toBe(false);
  });

  it('source remains pure/read-only with no SDK, fetch, Dataverse mutation primitive, or feature-flag import', () => {
    const src = readFileSync(resolve(__dirname, 'bankerOperatingCommandCenterModel.ts'), 'utf8');

    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/graph\.microsoft\.com/i);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    expect(src).not.toMatch(/dealOriginationFeatureFlags|crmFeatureFlags|portfolioLoanBoardingFeatureFlags/);
  });
});
