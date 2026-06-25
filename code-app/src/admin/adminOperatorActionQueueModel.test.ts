// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveAdminOperatorActionQueueModel,
  type OperatorActionGroupId,
} from './adminOperatorActionQueueModel';

describe('Phase 234 — Admin Operator Action Queue model', () => {
  it('groups remaining go-live blockers into the operator task categories', () => {
    const vm = deriveAdminOperatorActionQueueModel();

    expect(vm.title).toBe('Admin Operator Action Queue');
    expect(vm.groups.map((g) => g.id)).toEqual([
      'crm-los-activation',
      'new-deal-create',
      'crm-writeback',
      'document-checklist',
      'borrower-communication',
      'portfolio-boarding',
      'launch-readiness',
    ]);
  });

  it('surfaces open operator actions for the categories that remain gated by design', () => {
    const vm = deriveAdminOperatorActionQueueModel();
    const byId = new Map(vm.groups.map((g) => [g.id, g]));

    // After the 256B full launch, the live-write categories are enabled and clear.
    // New Deal create stays gated by its global constant, so it still requires action.
    const gatedGroups: OperatorActionGroupId[] = ['new-deal-create'];
    for (const id of gatedGroups) {
      expect(byId.get(id)?.state, id).toBe('action-required');
      expect(byId.get(id)?.actions.length, id).toBeGreaterThan(0);
    }

    // Launched categories are now clear (no open actions).
    const launchedGroups: OperatorActionGroupId[] = [
      'crm-writeback',
      'document-checklist',
      'borrower-communication',
      'portfolio-boarding',
    ];
    for (const id of launchedGroups) {
      expect(byId.get(id)?.state, id).toBe('clear');
      expect(byId.get(id)?.actions.length, id).toBe(0);
    }

    expect(vm.totalOpenActions).toBeGreaterThan(0);
    expect(vm.totalOpenActions).toBe(vm.groups.reduce((s, g) => s + g.actions.length, 0));
  });

  it('ties launch-readiness required actions into the queue', () => {
    const vm = deriveAdminOperatorActionQueueModel();
    const launch = vm.groups.find((g) => g.id === 'launch-readiness')!;
    expect(launch.actions.length).toBeGreaterThan(0);
    expect(launch.actions.every((a) => a.id.startsWith('launch:'))).toBe(true);
  });

  it('borrower communication is clear once live send is enabled', () => {
    const vm = deriveAdminOperatorActionQueueModel();
    const borrower = vm.groups.find((g) => g.id === 'borrower-communication')!;
    // Live send is enabled after the 256B launch, so no certify-live-send task remains.
    expect(borrower.actions.some((a) => /certify live send/i.test(a.title))).toBe(false);
    expect(borrower.state).toBe('clear');
  });

  it('certifies the queue executes no live write, gate flip, or action', () => {
    const vm = deriveAdminOperatorActionQueueModel();
    expect(vm.certifications.join(' ')).toMatch(/No live write, gate flip, or action/i);
    expect(vm.certifications.join(' ')).toMatch(/No route or permission is widened/i);
  });

  it('source remains pure/read-only with no SDK, fetch, GUID, or Dataverse mutation primitive', () => {
    const src = readFileSync(resolve(__dirname, 'adminOperatorActionQueueModel.ts'), 'utf8');

    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/graph\.microsoft\.com/i);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    // Vendor terms appear ONLY in the negation certification ("No external
    // Salesforce or nCino sync …"), the approved pattern — never as a dependency.
    expect(src).toMatch(/No external Salesforce or nCino/);
  });
});
