import { Cr664_dataqualityflagsService } from '../generated/services/Cr664_dataqualityflagsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED } from '../shared/governance/auditEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ActorChangedByResolution,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';
import type { DataQualityFlagCandidate } from './dataQuality/dataQualityFlagCandidates';

/**
 * Final LOS Completion arc — Workstream O: the first governed write that
 * CREATES a cr664_dataqualityflags row (only resolve existed before this;
 * see src/admin/dataQualityActions.ts). Mirrors resolveDataQualityFlag's
 * own established audit-pairing convention exactly (same file/domain, same
 * four-branch shape renamed for the create step) rather than the arc's
 * newer submitXAction.ts convention -- consistency within this domain
 * matters more than cross-domain uniformity (see platformInventory.ts's
 * legacyDisciplineExempt flag on this entry).
 *
 * Honest discriminated outcome:
 *   success        both flag creation and audit event succeeded.
 *   audit-failed   flag created, but audit event creation failed -- partial
 *                  state, must surface as critical.
 *   create-failed  flag creation failed; audit never attempted.
 *   unknown        unexpected exception path.
 *
 * Flag-type policy convention (see dataQualityFlagCandidates.ts's header):
 * every duplicate-* category maps to the existing InvalidValue value;
 * inconsistent-boarding-linkage maps to the existing BrokenReference value.
 * No new Dataverse choice-column value is required.
 */

export type CreateFlagOutcome =
  | { kind: 'success'; flagId: string; auditEventId: string | undefined }
  | { kind: 'audit-failed'; flagId: string; auditError: string }
  | { kind: 'create-failed'; createError: string }
  | { kind: 'unknown'; message: string };

const RESOLUTION_STATUS_OPEN = 788190000;
const EVENT_CATEGORY_EXCEPTION = 788190007;
const EVENT_TYPE_EXCEPTION_CREATED = 788190005;
const ENTITY_TYPE_CONFIGURATION = 788190005;

const FLAG_TYPE_BY_CATEGORY: Record<DataQualityFlagCandidate['category'], string> = {
  'duplicate-organization': 'InvalidValue',
  'duplicate-deal': 'InvalidValue',
  'suspicious-active-deal': 'InvalidValue',
  'zero-amount-deal': 'InvalidValue',
  'duplicate-entitlement': 'InvalidValue',
  'inconsistent-boarding-linkage': 'BrokenReference',
};

export interface CreateFlagInput {
  readonly candidate: DataQualityFlagCandidate;
  readonly actorEmail: string;
}

async function emitAuditEvent(opts: {
  input: CreateFlagInput;
  flagId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
  const nowIso = new Date().toISOString();
  const payload = {
    cr664_auditeventname: 'DataQualityFlag Created',
    cr664_eventcategory: EVENT_CATEGORY_EXCEPTION,
    cr664_eventtype: EVENT_TYPE_EXCEPTION_CREATED,
    cr664_entitytype: ENTITY_TYPE_CONFIGURATION,
    cr664_entityid: opts.flagId,
    cr664_relatedentitytype: 'cr664_dataqualityflag',
    cr664_relatedentityid: opts.flagId,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_resolutionstatus',
    cr664_oldvalue: undefined,
    cr664_newvalue: 'Open',
    cr664_beforestate: undefined,
    cr664_afterstate: 'Open',
    cr664_notes: opts.input.candidate.flagDescription,
    cr664_sourcescreensourceprocess: 'AdminWorkspace/DataQualityDetectionSweep',
    cr664_correlationid: opts.correlationId,
  };

  try {
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'AuditEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_auditeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createDataQualityFlag(
  input: CreateFlagInput,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<CreateFlagOutcome> {
  const nowIso = new Date().toISOString();
  const flagType = FLAG_TYPE_BY_CATEGORY[input.candidate.category];
  const correlationId = newCorrelationId('dq');
  const actor = await resolveActorChangedBy(input.actorEmail);

  let flagId: string;
  try {
    const createResult = await Cr664_dataqualityflagsService.create({
      cr664_flagname: input.candidate.flagName,
      cr664_flagdescription: input.candidate.flagDescription,
      cr664_flagtype: flagType,
      cr664_sourcetable: input.candidate.sourceTable,
      cr664_sourcerecordid: input.candidate.sourceRecordId,
      cr664_flaggeddate: nowIso,
      cr664_resolutionstatus: RESOLUTION_STATUS_OPEN,
    } as unknown as Parameters<typeof Cr664_dataqualityflagsService.create>[0]);
    if (!createResult.success || !createResult.data?.cr664_dataqualityflagid) {
      return {
        kind: 'create-failed',
        createError: createResult.error?.message ?? 'Flag creation returned no id',
      };
    }
    flagId = createResult.data.cr664_dataqualityflagid;
  } catch (err: unknown) {
    return { kind: 'create-failed', createError: err instanceof Error ? err.message : String(err) };
  }

  const audit = await emitAuditEvent({
    input,
    flagId,
    actor,
    correlationId,
    outcome: AUDIT_OUTCOME_SUCCEEDED,
    failureReason: undefined,
  });
  if (audit.error) {
    return { kind: 'audit-failed', flagId, auditError: audit.error };
  }
  return { kind: 'success', flagId, auditEventId: audit.id };
}
