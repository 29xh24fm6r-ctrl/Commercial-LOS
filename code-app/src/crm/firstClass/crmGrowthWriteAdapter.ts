export interface CrmGrowthWriteCommand {
  readonly entity: 'opportunity' | 'referral' | 'task';
  readonly operation: 'create' | 'update' | 'convert';
  readonly actorSystemUserId?: string;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export type CrmGrowthWriteOutcome =
  | { readonly kind:'blocked'; readonly correlationId:string; readonly reason:string }
  | { readonly kind:'duplicate'; readonly correlationId:string; readonly existingRecordId:string }
  | { readonly kind:'accepted-unconfirmed'; readonly correlationId:string; readonly reconciliationRequired:true }
  | { readonly kind:'confirmed'; readonly correlationId:string; readonly recordId:string; readonly auditId:string; readonly timelineEventId:string };
export interface CrmGrowthWriteTransport {
  findByCorrelation(entity: CrmGrowthWriteCommand['entity'], correlationId:string): Promise<string|undefined>;
  execute(command:CrmGrowthWriteCommand): Promise<{ accepted:boolean; recordId?:string }>;
  readBack(entity:CrmGrowthWriteCommand['entity'], recordId:string): Promise<boolean>;
  audit(command:CrmGrowthWriteCommand, recordId:string): Promise<string>;
  timeline(command:CrmGrowthWriteCommand, recordId:string): Promise<string>;
}
const CORRELATION = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,99}$/;
export async function executeCrmGrowthWrite(
  command: CrmGrowthWriteCommand,
  deps: { schemaVerified:boolean; authorized:boolean; transport?:CrmGrowthWriteTransport },
): Promise<CrmGrowthWriteOutcome> {
  const blocked = (reason:string):CrmGrowthWriteOutcome => ({ kind:'blocked',correlationId:command.correlationId,reason });
  if (!deps.schemaVerified) return blocked('Commercial CRM growth schema is not verified.');
  if (!deps.authorized || !command.actorSystemUserId) return blocked('Actor is not authorized for this CRM write.');
  if (!CORRELATION.test(command.correlationId)) return blocked('A valid correlation ID is required.');
  if (!command.payload.name || typeof command.payload.name !== 'string') return blocked('A validated name is required.');
  if (!deps.transport) return blocked('No governed CRM growth transport is configured.');
  const duplicate = await deps.transport.findByCorrelation(command.entity,command.correlationId);
  if (duplicate) return { kind:'duplicate',correlationId:command.correlationId,existingRecordId:duplicate };
  const accepted = await deps.transport.execute(command);
  if (!accepted.accepted || !accepted.recordId) return { kind:'accepted-unconfirmed',correlationId:command.correlationId,reconciliationRequired:true };
  if (!(await deps.transport.readBack(command.entity,accepted.recordId))) return { kind:'accepted-unconfirmed',correlationId:command.correlationId,reconciliationRequired:true };
  const auditId = await deps.transport.audit(command,accepted.recordId);
  const timelineEventId = await deps.transport.timeline(command,accepted.recordId);
  return { kind:'confirmed',correlationId:command.correlationId,recordId:accepted.recordId,auditId,timelineEventId };
}
