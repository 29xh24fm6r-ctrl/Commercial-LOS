export type DocumentExceptionStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'REVOKED' | 'EXPIRED';
export interface DocumentExceptionRecord { readonly id: string; readonly dealId: string; readonly requirementKey: string; readonly reason: string; readonly requestedBy: string; readonly requestedOn: string; readonly status: DocumentExceptionStatus; readonly decidedBy?: string; readonly decisionDate?: string; readonly decisionNote?: string; readonly expiresOn?: string; readonly supportingDocumentId?: string; readonly correlationId: string; }

export function decideDocumentException(record: DocumentExceptionRecord, input: { readonly authorized: boolean; readonly actorId: string; readonly allowSelfApproval: boolean; readonly decision: 'APPROVED' | 'DENIED'; readonly decisionNote: string; readonly now: string }): DocumentExceptionRecord {
  if (record.status !== 'PENDING') throw new Error('Only a pending exception may be decided.');
  if (!input.authorized) throw new Error('Document exception approval authority is required.');
  if (!input.allowSelfApproval && record.requestedBy === input.actorId) throw new Error('Independent exception approval is required.');
  if (!input.decisionNote.trim()) throw new Error('A decision note is required.');
  return { ...record, status: input.decision, decidedBy: input.actorId, decisionDate: input.now, decisionNote: input.decisionNote.trim() };
}

export function isEffectiveApprovedException(record: DocumentExceptionRecord, now: string): boolean {
  return record.status === 'APPROVED' && (!record.expiresOn || record.expiresOn >= now);
}
