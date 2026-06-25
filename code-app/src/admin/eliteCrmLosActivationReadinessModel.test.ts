import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveEliteCrmLosActivationReadiness } from './eliteCrmLosActivationReadinessModel';

describe('Phase 231 — Elite CRM + LOS full activation readiness model', () => {
  it('assembles CRM, lending workflow, create, checklist, writeback, and boarding domains', () => {
    const vm = deriveEliteCrmLosActivationReadiness();
    expect(vm.title).toMatch(/Elite CRM \+ LOS Full Activation Readiness/i);
    expect(vm.domains.map((d) => d.id)).toEqual([
      'internal-crm',
      'loan-workflow',
      'crm-writeback',
      'new-deal-create',
      'document-checklist',
      'portfolio-boarding',
    ]);
  });

  it('marks internal CRM, lending workflow, and launched live-write domains ready while remaining categories stay gated', () => {
    const vm = deriveEliteCrmLosActivationReadiness();
    const byId = new Map(vm.domains.map((d) => [d.id, d]));
    expect(byId.get('internal-crm')?.state).toBe('ready');
    expect(byId.get('loan-workflow')?.state).toBe('ready');
    // Phase 256B: CRM live persistence, document checklist, and portfolio boarding are launched.
    expect(byId.get('crm-writeback')?.state).toBe('ready');
    expect(byId.get('document-checklist')?.state).toBe('ready');
    expect(byId.get('portfolio-boarding')?.state).toBe('ready');
    // New Deal create stays gated by its global constant.
    expect(byId.get('new-deal-create')?.state).toBe('gated');
    expect(vm.goLiveState).toBe('gated');
  });

  it('keeps safe internal production-core flags distinct from live mutation gates', () => {
    const vm = deriveEliteCrmLosActivationReadiness();
    const create = vm.domains.find((d) => d.id === 'new-deal-create');
    expect(create?.evidence.join(' ')).toMatch(/Task generation safe internal core: true/);
    expect(create?.evidence.join(' ')).toMatch(/Duplicate detection safe internal core: true/);
    expect(create?.summary).toMatch(/gated by default/i);
  });

  it('certifies no external vendor dependency or hidden live writes', () => {
    const vm = deriveEliteCrmLosActivationReadiness();
    expect(vm.certifications.join(' ')).toMatch(/No external Salesforce or nCino dependency is implied/i);
    expect(vm.certifications.join(' ')).toMatch(/No hidden live writes/i);
    expect(vm.posture).toMatch(/explicit certified gates/i);
  });

  it('source remains pure/read-only with no SDK, fetch, Dataverse write, or GUID', () => {
    const src = readFileSync(resolve(__dirname, 'eliteCrmLosActivationReadinessModel.ts'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/graph\.microsoft\.com/i);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});