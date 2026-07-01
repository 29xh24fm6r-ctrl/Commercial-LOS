import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveBankerOperatingCommandCenterModel } from '../../banker/bankerOperatingCommandCenterModel';

describe('Phase 232 — banker operating surface activation contract', () => {
  it('certifies the banker operating command center is a CRM + LOS unification layer', () => {
    const vm = deriveBankerOperatingCommandCenterModel();

    expect(vm.title).toBe('Banker Operating Command Center');
    expect(vm.posture).toMatch(/CRM/);
    expect(vm.posture).toMatch(/active deal workflow/i);
    expect(vm.posture).toMatch(/governed/i);
  });

  it('does not invent a parallel workflow; it points to the existing deal cockpit anchors', () => {
    const vm = deriveBankerOperatingCommandCenterModel();

    expect(vm.dealCockpitAnchors).toContain('stage-map');
    expect(vm.dealCockpitAnchors).toContain('workstreams');
    expect(vm.dealCockpitAnchors).toContain('crm-relationship');
  });

  it('is mounted on the banker dashboard (Phase 258: CRM is now its own CRM Hub workspace)', () => {
    const shell = readFileSync(resolve(__dirname, '../../banker/BankerShell.tsx'), 'utf8');

    expect(shell).toMatch(/import \{ BankerOperatingCommandCenter \}/);
    // Mounted on the dashboard. It now receives real KPI/deal data as props (the action-cockpit
    // redesign) rather than the propless read-only status board, so match the opening tag.
    expect(shell).toMatch(/<BankerOperatingCommandCenter\b/);
    // Phase 258 — the legacy CRM readiness panel is replaced by the live CRM
    // Hub workspace on its own tab; the dashboard no longer mounts it.
    expect(shell).not.toMatch(/<BankerCrmIntelligencePanel \/>/);
    expect(shell).toMatch(/import \{ CrmHubWorkspace \}/);
  });

  it('does not add write primitives, fetches, external sync, or borrower-send controls', () => {
    const files = [
      '../../banker/BankerOperatingCommandCenter.tsx',
      '../../banker/bankerOperatingCommandCenterModel.ts',
    ];

    for (const file of files) {
      const src = readFileSync(resolve(__dirname, file), 'utf8');
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/graph\.microsoft\.com/i);
      expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
      expect(src).not.toMatch(/\bsendMail\b|\bsendBorrower/i);
    }
  });
});