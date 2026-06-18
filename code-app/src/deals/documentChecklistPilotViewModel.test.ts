import { describe, it, expect } from 'vitest';
import { buildDocumentChecklistPilotViewModel } from './documentChecklistPilotViewModel';

/**
 * Phase 188D — the pilot panel view-model is a pure, read-only preview. It never
 * triggers an action: canGenerate is ALWAYS false this phase.
 */

describe('buildDocumentChecklistPilotViewModel', () => {
  it('marks existing names already-present and missing names would-create (preview only)', () => {
    const vm = buildDocumentChecklistPilotViewModel({
      existingChecklistRows: [{ name: 'Debt Schedule' }],
      approvedChecklistNames: ['2024 Business Tax Return', 'Debt Schedule'],
      pilotEnabled: true,
    });
    expect(vm.alreadyPresentNames).toEqual(['Debt Schedule']);
    expect(vm.wouldCreateNames).toEqual(['2024 Business Tax Return']);
    expect(vm.status).toBe('preview_ready');
  });

  it('matches existing names trim + case-insensitively', () => {
    const vm = buildDocumentChecklistPilotViewModel({
      existingChecklistRows: ['  debt schedule '],
      approvedChecklistNames: ['Debt Schedule', 'Tax Return'],
      pilotEnabled: true,
    });
    expect(vm.alreadyPresentNames).toEqual(['Debt Schedule']);
    expect(vm.wouldCreateNames).toEqual(['Tax Return']);
  });

  it('de-dups approved names case-insensitively and ignores blanks', () => {
    const vm = buildDocumentChecklistPilotViewModel({
      existingChecklistRows: [],
      approvedChecklistNames: ['Doc A', 'doc a', '   ', ' Doc B '],
      pilotEnabled: true,
    });
    expect(vm.approvedNames).toEqual(['Doc A', 'Doc B']);
    expect(vm.wouldCreateNames).toEqual(['Doc A', 'Doc B']);
  });

  it('accepts string[] or {name}[] for existing rows', () => {
    const a = buildDocumentChecklistPilotViewModel({
      existingChecklistRows: ['Debt Schedule'],
      approvedChecklistNames: ['Debt Schedule'],
      pilotEnabled: true,
    });
    const b = buildDocumentChecklistPilotViewModel({
      existingChecklistRows: [{ name: 'Debt Schedule' }],
      approvedChecklistNames: ['Debt Schedule'],
      pilotEnabled: true,
    });
    expect(a.alreadyPresentNames).toEqual(['Debt Schedule']);
    expect(b.alreadyPresentNames).toEqual(['Debt Schedule']);
  });

  it('pilot disabled -> status pilot_disabled with a disabled reason', () => {
    const vm = buildDocumentChecklistPilotViewModel({
      approvedChecklistNames: ['Debt Schedule'],
      pilotEnabled: false,
    });
    expect(vm.status).toBe('pilot_disabled');
    expect(vm.disabledReason).toMatch(/disabled/i);
  });

  it('pilot enabled but no approved names -> blocked', () => {
    const vm = buildDocumentChecklistPilotViewModel({ approvedChecklistNames: [], pilotEnabled: true });
    expect(vm.status).toBe('blocked');
  });

  it('always surfaces the two safety messages', () => {
    const vm = buildDocumentChecklistPilotViewModel({ approvedChecklistNames: ['X'] });
    expect(vm.safetyMessages.some((m) => /no borrower request will be sent/i.test(m))).toBe(true);
    expect(vm.safetyMessages.some((m) => /no checklist rows will be created/i.test(m))).toBe(true);
  });

  it('canGenerate is false even when pilotEnabled is true (188D is not the live phase)', () => {
    const enabled = buildDocumentChecklistPilotViewModel({ approvedChecklistNames: ['X'], pilotEnabled: true });
    const disabled = buildDocumentChecklistPilotViewModel({ approvedChecklistNames: ['X'], pilotEnabled: false });
    expect(enabled.canGenerate).toBe(false);
    expect(disabled.canGenerate).toBe(false);
  });
});
