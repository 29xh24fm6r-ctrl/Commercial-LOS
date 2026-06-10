import { describe, it, expect } from 'vitest';
import { deriveCrmSyncPreviewCockpitViewModel } from './crmSyncPreviewCockpitViewModel';

describe('Phase 146D — crmSyncPreviewCockpitViewModel', () => {
  it('all safety booleans are correct', () => {
    const vm = deriveCrmSyncPreviewCockpitViewModel({ salesforceEntities: [], ncinoEntities: [] });
    expect(vm.previewOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.crmRecordCreated).toBe(false);
    expect(vm.crmRecordUpdated).toBe(false);
    expect(vm.crmRecordLinked).toBe(false);
    expect(vm.externalSystemChanged).toBe(false);
  });

  it('counts operations correctly', () => {
    const vm = deriveCrmSyncPreviewCockpitViewModel({
      salesforceEntities: [
        { entityKind: 'account', label: 'Acme', operation: 'would_create' },
        { entityKind: 'opportunity', label: 'Deal 1', operation: 'blocked', blockerReason: 'Missing data' },
      ],
      ncinoEntities: [
        { entityKind: 'relationship', label: 'Acme', operation: 'would_link' },
      ],
    });
    expect(vm.wouldCreateCount).toBe(1);
    expect(vm.blockedCount).toBe(1);
    expect(vm.wouldLinkCount).toBe(1);
    expect(vm.entities.length).toBe(3);
  });

  it('uses "would" language, not past tense', () => {
    expect(deriveCrmSyncPreviewCockpitViewModel({ salesforceEntities: [], ncinoEntities: [] }).safetyCopy).toContain('preview only');
  });
});
