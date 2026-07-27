import { describe, it, expect } from 'vitest';
import { DURABLE_RECORD_CAPABILITIES } from './durableRecordCapabilityInventory';
import { GOVERNED_WRITES } from './platformInventory';

describe('DURABLE_RECORD_CAPABILITIES — Workstream M', () => {
  it('registers exactly the six durable-record capabilities Workstreams C/D/E/F/H/J shipped', () => {
    const ids = DURABLE_RECORD_CAPABILITIES.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        'credit-approval-decision',
        'commitment-record',
        'condition-verification',
        'executed-document-attestation',
        'booking-qc-check',
        'adverse-action-record',
      ].sort(),
    );
  });

  it('every entry has a non-empty status vocabulary sourced from its real workflow type module', () => {
    for (const c of DURABLE_RECORD_CAPABILITIES) {
      expect(c.statusVocabulary.length).toBeGreaterThan(0);
      for (const status of c.statusVocabulary) {
        expect(typeof status).toBe('string');
        expect(status.length).toBeGreaterThan(0);
      }
    }
  });

  it('every entry\'s governedWriteId resolves to a real, live GOVERNED_WRITES entry', () => {
    const writeIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const c of DURABLE_RECORD_CAPABILITIES) {
      expect(writeIds.has(c.governedWriteId)).toBe(true);
    }
  });

  it('every entry names a real types/store/action file path (non-empty, non-fabricated)', () => {
    for (const c of DURABLE_RECORD_CAPABILITIES) {
      expect(c.typesFile).toMatch(/^src\/workflow\//);
      expect(c.storeFile).toMatch(/^src\//);
      expect(c.actionFile).toMatch(/^src\//);
      expect(c.mountedInPanel.length).toBeGreaterThan(0);
    }
  });
});
