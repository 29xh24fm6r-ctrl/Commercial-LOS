import { describe, it, expect } from 'vitest';
import { validateExternalWritebackSchema } from './externalWritebackSchemaValidator';

describe('Phase 154 — externalWritebackSchemaValidator', () => {
  it('allowed field passes', () => {
    const r = validateExternalWritebackSchema({
      platformDomain: 'external_crm', entityKind: 'relationship', requestedOperation: 'update',
      requestedFields: ['external_reference_label'], documentedFieldMap: ['external_reference_label'],
      allowlist: ['external_reference_label'], policyGateReady: true,
    });
    expect(r.status).toBe('dry_run_valid');
    expect(r.allowedFields).toContain('external_reference_label');
    expect(r.liveWritePerformed).toBe(false);
  });

  it('blocked field fails', () => {
    const r = validateExternalWritebackSchema({
      platformDomain: 'external_crm', entityKind: 'relationship', requestedOperation: 'update',
      requestedFields: ['stage'], documentedFieldMap: ['stage'], allowlist: ['stage'], policyGateReady: true,
    });
    expect(r.blockedFields).toContain('stage');
  });

  it('policy not ready rejects', () => {
    const r = validateExternalWritebackSchema({
      platformDomain: 'external_crm', entityKind: 'relationship', requestedOperation: 'update',
      requestedFields: ['external_reference_label'], documentedFieldMap: ['external_reference_label'],
      allowlist: ['external_reference_label'], policyGateReady: false,
    });
    expect(r.status).toBe('rejected');
  });

  it('missing field map blocks', () => {
    const r = validateExternalWritebackSchema({
      platformDomain: 'external_crm', entityKind: 'relationship', requestedOperation: 'update',
      requestedFields: ['custom_note'], documentedFieldMap: [], allowlist: ['custom_note'], policyGateReady: true,
    });
    expect(r.blockedFields).toContain('custom_note');
  });
});
