// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveManagerOperatingCommandCenterModel } from './managerOperatingCommandCenterModel';

describe('Phase 233 — Manager Operating Command Center model', () => {
  it('assembles the manager supervision layer across pipeline, workload, CRM, workflow, and live gates', () => {
    const vm = deriveManagerOperatingCommandCenterModel();

    expect(vm.title).toBe('Manager Operating Command Center');
    expect(vm.domains.map((d) => d.id)).toEqual([
      'pipeline-supervision',
      'banker-workload',
      'crm-coverage',
      'workflow-bottlenecks',
      'new-deal-intake',
      'document-readiness',
      'crm-writeback',
      'borrower-communication',
      'portfolio-boarding',
    ]);
  });

  it('keeps read-side supervision surfaces operational and reflects the Phase 256B launched live-write domains', () => {
    const vm = deriveManagerOperatingCommandCenterModel();
    const byId = new Map(vm.domains.map((d) => [d.id, d]));

    expect(byId.get('pipeline-supervision')?.state).toBe('operational');
    expect(byId.get('banker-workload')?.state).toBe('operational');
    expect(byId.get('crm-coverage')?.state).toBe('operational');
    expect(byId.get('workflow-bottlenecks')?.state).toBe('operational');

    // Phase 256B: checklist, CRM writeback, borrower send, and portfolio boarding are launched.
    expect(byId.get('document-readiness')?.state).toBe('operational');
    expect(byId.get('crm-writeback')?.state).toBe('operational');
    expect(byId.get('borrower-communication')?.state).toBe('operational');
    expect(byId.get('portfolio-boarding')?.state).toBe('operational');
    // New Deal create stays gated by its global constant.
    expect(byId.get('new-deal-intake')?.state).toBe('gated');
  });

  it('points managers to existing supervision surfaces instead of inventing a parallel engine', () => {
    const vm = deriveManagerOperatingCommandCenterModel();

    expect(vm.supervisionAnchors).toEqual([
      'manager-bloomberg-control-panel',
      'manager-workflow-launch-readiness',
      'crm-manager-working-surface',
      'team-work-queue',
      'banker-workload-summary',
      'deals-by-stage',
    ]);
  });

  it('certifies safe internal production-core signals stay distinct from live write gates', () => {
    const vm = deriveManagerOperatingCommandCenterModel();

    expect(vm.certifications.join(' ')).toMatch(/Duplicate detection safe internal core: true/);
    expect(vm.certifications.join(' ')).toMatch(/Task generation safe internal core: true/);
    expect(vm.certifications.join(' ')).toMatch(/No hidden create\/update\/delete action/i);
    expect(vm.certifications.join(' ')).toMatch(/No external platform sync or borrower send/i);
  });

  it('source remains pure/read-only with no SDK, fetch, GUID, or Dataverse mutation primitive', () => {
    const src = readFileSync(resolve(__dirname, 'managerOperatingCommandCenterModel.ts'), 'utf8');

    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/graph\.microsoft\.com/i);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    expect(src).not.toMatch(/salesforce|ncino/i);
  });
});
