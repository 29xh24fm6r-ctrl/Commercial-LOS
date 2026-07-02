// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveBankerOperatingCommandCenterModel } from './bankerOperatingCommandCenterModel';

describe('Phase 232 — Banker Operating Command Center model', () => {
  it('assembles the banker operating layer across CRM, workflow, intake, documents, communications, writeback, and boarding', () => {
    const vm = deriveBankerOperatingCommandCenterModel();

    expect(vm.title).toBe('Banker Operating Command Center');
    expect(vm.domains.map((d) => d.id)).toEqual([
      'crm',
      'loan-workflow',
      'daily-actions',
      'new-deal',
      'document-readiness',
      'borrower-communications',
      'crm-writeback',
      'portfolio-handoff',
    ]);
  });

  it('keeps the read-side operating surfaces active while live-write domains stay gated (safe defaults)', () => {
    const vm = deriveBankerOperatingCommandCenterModel();
    const byId = new Map(vm.domains.map((d) => [d.id, d]));

    expect(byId.get('crm')?.state).toBe('operational');
    expect(byId.get('loan-workflow')?.state).toBe('operational');
    expect(byId.get('daily-actions')?.state).toBe('operational');

    // Live-write gates are reset to safe defaults: checklist, borrower send, CRM writeback,
    // and portfolio boarding are all gated.
    expect(byId.get('document-readiness')?.state).toBe('gated');
    expect(byId.get('borrower-communications')?.state).toBe('gated');
    expect(byId.get('crm-writeback')?.state).toBe('gated');
    expect(byId.get('portfolio-handoff')?.state).toBe('gated');

    // F5 relabel: the crm-writeback pill names the AUTOMATED writeback domain (its
    // `state` stays coupled to the flag for cross-panel coherence), and no longer
    // shows a bare "Read-only"; the summary makes clear manual CRM writes are live.
    const crmWb = byId.get('crm-writeback')!;
    expect(crmWb.label).toBe('CRM automated writeback');
    expect(crmWb.value).not.toContain('Read-only');
    expect(crmWb.summary.toLowerCase()).toContain('manual');
    // New Deal create stays gated by its global constant.
    expect(byId.get('new-deal')?.state).toBe('gated');
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

  it('certifies safe internal production-core signals remain distinct from live write gates', () => {
    const vm = deriveBankerOperatingCommandCenterModel();

    expect(vm.certifications.join(' ')).toMatch(/Duplicate detection safe internal core: true/);
    expect(vm.certifications.join(' ')).toMatch(/Task generation safe internal core: true/);
    expect(vm.certifications.join(' ')).toMatch(/No hidden create\/update\/delete action/i);
  });

  it('source remains pure/read-only with no SDK, fetch, or Dataverse mutation primitive', () => {
    const src = readFileSync(resolve(__dirname, 'bankerOperatingCommandCenterModel.ts'), 'utf8');

    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/graph\.microsoft\.com/i);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});