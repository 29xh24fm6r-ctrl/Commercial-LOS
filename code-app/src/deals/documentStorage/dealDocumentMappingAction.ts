import type { DealSharePointFileReference } from './dealDocumentStorageTypes';

export interface DealDocumentMappingPort {
  loadActiveFile(documentId: string): Promise<DealSharePointFileReference | undefined>;
  loadRequirementOwners(requirementIds: readonly string[]): Promise<ReadonlyArray<{ readonly requirementId: string; readonly dealId: string }>>;
  persistMappings(input: { readonly dealId: string; readonly documentId: string; readonly requirementIds: readonly string[]; readonly actorId: string; readonly correlationId: string }): Promise<'created' | 'existing'>;
  emitAudit(input: { readonly dealId: string; readonly documentId: string; readonly requirementIds: readonly string[]; readonly actorId: string; readonly correlationId: string; readonly result: 'created' | 'existing' }): Promise<void>;
}

export async function mapDealDocumentToRequirements(input: {
  readonly authorized: boolean;
  readonly dealId: string;
  readonly documentId: string;
  readonly requirementIds: readonly string[];
  readonly actorId: string | undefined;
  readonly correlationId: string;
}, port: DealDocumentMappingPort): Promise<
  | { readonly kind: 'mapped'; readonly result: 'created' | 'existing'; readonly requirementIds: readonly string[] }
  | { readonly kind: 'blocked'; readonly reason: string }
> {
  if (!input.authorized || !input.actorId) return { kind: 'blocked', reason: 'Authenticated deal access is required.' };
  const requirementIds = [...new Set(input.requirementIds.filter(Boolean))].sort();
  if (!requirementIds.length) return { kind: 'blocked', reason: 'At least one explicit requirement mapping is required.' };
  const file = await port.loadActiveFile(input.documentId);
  if (!file || file.dealId !== input.dealId || file.storageProvider !== 'SHAREPOINT' || file.uploadStatus !== 'SHAREPOINT_STORED' || !file.activeVersion) {
    return { kind: 'blocked', reason: 'A verified active SharePoint file for this deal is required.' };
  }
  const owners = await port.loadRequirementOwners(requirementIds);
  if (owners.length !== requirementIds.length || owners.some((row) => row.dealId !== input.dealId) || new Set(owners.map((row) => row.requirementId)).size !== requirementIds.length) {
    return { kind: 'blocked', reason: 'Every mapped requirement must belong to this deal.' };
  }
  const result = await port.persistMappings({ dealId: input.dealId, documentId: input.documentId, requirementIds, actorId: input.actorId, correlationId: input.correlationId });
  await port.emitAudit({ dealId: input.dealId, documentId: input.documentId, requirementIds, actorId: input.actorId, correlationId: input.correlationId, result });
  return { kind: 'mapped', result, requirementIds };
}
