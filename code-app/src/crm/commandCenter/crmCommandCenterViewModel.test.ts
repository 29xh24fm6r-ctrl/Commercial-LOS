import { describe, it, expect } from 'vitest';
import { deriveCrmCommandCenterViewModel } from './crmCommandCenterViewModel';

describe('Phase 146A — crmCommandCenterViewModel', () => {
  const vm = deriveCrmCommandCenterViewModel();

  it('has read-only title and subtitle', () => {
    expect(vm.title).toBe('CRM Command Center');
    expect(vm.subtitle).toContain('sync status');
  });

  it('all safety booleans are correct', () => {
    expect(vm.readOnly).toBe(true);
    expect(vm.previewOnly).toBe(true);
    expect(vm.dryRunOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.salesforceWritePerformed).toBe(false);
    expect(vm.ncinoWritePerformed).toBe(false);
    expect(vm.externalSystemChanged).toBe(false);
    expect(vm.allowedForLiveWriteNow).toBe(false);
  });

  it('has domain counts derived from source-of-truth map', () => {
    expect(vm.totalSourceOfTruthDomains).toBeGreaterThan(0);
    expect(vm.disabledDomains + vm.activatedDomains).toBeLessThanOrEqual(vm.totalSourceOfTruthDomains);
  });

  it('has Salesforce and nCino lanes', () => {
    expect(vm.salesforceLane.provider).toBe('salesforce');
    expect(vm.ncinoLane.provider).toBe('ncino');
    expect(vm.salesforceLane.writebackStatus).toContain('Manual only');
    expect(vm.ncinoLane.writebackStatus).toContain('Manual only');
  });

  // Factory Arc Phase 8 — lane status strings render raw in CrmCommandCenter.tsx
  // ("Connector: ${connectorStatus}" and a bare writebackStatus SummaryRow value),
  // so they must be plain, human-readable words, not internal enum-style tokens
  // like "not_configured" / "disabled".
  it('lane status strings are plain human-readable text, not internal enum tokens', () => {
    for (const lane of [vm.salesforceLane, vm.ncinoLane]) {
      expect(lane.connectorStatus).not.toMatch(/_/);
      expect(lane.writebackStatus).not.toMatch(/^(disabled|enabled|not_configured)$/);
    }
  });

  it('safety copy explains where CRM edits actually happen, without dry-run/gated framing', () => {
    expect(vm.safetyCopy).toContain('CRM Hub');
    expect(vm.safetyCopy).not.toMatch(/dry-run/i);
    expect(vm.safetyCopy).not.toMatch(/\bgated\b/i);
    expect(vm.safetyCopy).not.toMatch(/\bpilot\b/i);
  });

  it('writeback posture is factual, not alarmist ("paused"/"disabled" framing)', () => {
    expect(vm.writebackPosture).not.toMatch(/paused/i);
    expect(vm.writebackPosture).toContain('CRM Hub');
  });
});
