import { describe, it, expect } from 'vitest';
import { deriveNcinoLaneViewModel } from './ncinoLaneViewModel';

describe('Phase 147C — ncinoLaneViewModel', () => {
  it('all safety booleans pinned', () => {
    const vm = deriveNcinoLaneViewModel({ relationshipReady: false, loanWorkflowReady: false, documentChecklistReady: false, milestoneReferenceReady: false, borrowerConflicts: 0, loanWorkflowPreviewItems: 0 });
    expect(vm.readOnly).toBe(true);
    expect(vm.previewOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.ncinoWritePerformed).toBe(false);
  });

  it('shows readiness rows', () => {
    const vm = deriveNcinoLaneViewModel({ relationshipReady: true, loanWorkflowReady: false, documentChecklistReady: true, milestoneReferenceReady: false, borrowerConflicts: 1, loanWorkflowPreviewItems: 4 });
    expect(vm.readinessRows.length).toBe(4);
    expect(vm.readinessRows[0].status).toBe('ready');
    expect(vm.readinessRows[1].status).toBe('not_ready');
    expect(vm.borrowerConflictCount).toBe(1);
    expect(vm.loanWorkflowPreviewCount).toBe(4);
  });

  it('safety copy uses preview language with no booking/approval', () => {
    const vm = deriveNcinoLaneViewModel({ relationshipReady: false, loanWorkflowReady: false, documentChecklistReady: false, milestoneReferenceReady: false, borrowerConflicts: 0, loanWorkflowPreviewItems: 0 });
    expect(vm.safetyCopy).toContain('preview');
    expect(vm.safetyCopy).toContain('disabled');
    expect(vm.safetyCopy).not.toMatch(/synced|booked|approved/i);
  });
});
