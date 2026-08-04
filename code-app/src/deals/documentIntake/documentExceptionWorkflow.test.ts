import { describe, expect, it } from 'vitest';
import { decideDocumentException, isEffectiveApprovedException, type DocumentExceptionRecord } from './documentExceptionWorkflow';
const record: DocumentExceptionRecord = { id: 'e1', dealId: 'd1', requirementKey: 'r1', reason: 'Not available', requestedBy: 'banker', requestedOn: '2026-01-01', status: 'PENDING', correlationId: 'c1' };
describe('document exception workflow', () => {
  it('requires authority, decision notes, and governed independence', () => {
    expect(() => decideDocumentException(record, { authorized: false, actorId: 'approver', allowSelfApproval: false, decision: 'APPROVED', decisionNote: 'ok', now: '2026-01-02' })).toThrow(/authority/i);
    expect(() => decideDocumentException(record, { authorized: true, actorId: 'banker', allowSelfApproval: false, decision: 'APPROVED', decisionNote: 'ok', now: '2026-01-02' })).toThrow(/Independent/i);
  });
  it('recognizes only effective approved exceptions', () => {
    const approved = decideDocumentException(record, { authorized: true, actorId: 'approver', allowSelfApproval: false, decision: 'APPROVED', decisionNote: 'Approved under policy', now: '2026-01-02' });
    expect(isEffectiveApprovedException(approved, '2026-01-03')).toBe(true);
    expect(isEffectiveApprovedException({ ...approved, expiresOn: '2026-01-02' }, '2026-01-03')).toBe(false);
  });
});
