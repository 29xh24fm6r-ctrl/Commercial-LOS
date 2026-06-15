/**
 * Phase 170D -- New Deal Stage/Status reference resolver (foundation).
 *
 * Live Dataverse metadata (discovered via the operator
 * `--inspect-new-deal-references` mode, Phase 170C) for the two
 * ApplicationRequired lookups on `cr664_loandeal`:
 *
 *   Stage  : cr664_loandeal.cr664_stagereference (cr664_StageReference)
 *            -> target table   cr664_dealstagereference
 *            -> entity set      cr664_dealstagereferences
 *            -> primary id      cr664_dealstagereferenceid
 *            -> primary name    cr664_name
 *            -> business fields cr664_activeflag, cr664_code, cr664_name
 *   Status : cr664_loandeal.cr664_statusreference (cr664_StatusReference)
 *            -> target table   cr664_dealstatusreference
 *            -> entity set      cr664_dealstatusreferences
 *            -> primary id      cr664_dealstatusreferenceid
 *            -> primary name    cr664_name
 *            -> business fields cr664_activeflag, cr664_code, cr664_name
 *
 * This module is the fail-closed resolver foundation. It performs NO IO
 * itself: it reads rows through an INJECTED `NewDealReferenceReader`.
 * That reader does not exist in app runtime yet because the two
 * reference tables are NOT registered as Power Apps data sources (the
 * `dataSourcesInfo.ts` / generated services / power.config.json database
 * references are toolchain-auto-generated and require the PAC generator +
 * a redeploy). Until then, app callers pass no reader and the resolver
 * returns `notConfigured`, so + New Deal stays disabled.
 *
 * The resolver NEVER hardcodes a GUID and NEVER fabricates a default. It
 * emits an `@odata.bind` path ONLY after verifying exactly one ACTIVE row
 * for each of Stage and Status.
 */

/** Stage reference table metadata (from live inspection). */
export const STAGE_REFERENCE = Object.freeze({
  logicalName: 'cr664_dealstagereference',
  entitySetName: 'cr664_dealstagereferences',
  primaryId: 'cr664_dealstagereferenceid',
  primaryName: 'cr664_name',
  bindAttribute: 'cr664_StageReference@odata.bind',
});

/** Status reference table metadata (from live inspection). */
export const STATUS_REFERENCE = Object.freeze({
  logicalName: 'cr664_dealstatusreference',
  entitySetName: 'cr664_dealstatusreferences',
  primaryId: 'cr664_dealstatusreferenceid',
  primaryName: 'cr664_name',
  bindAttribute: 'cr664_StatusReference@odata.bind',
});

/** A single reference row (Stage or Status). */
export interface ReferenceRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly activeFlag: boolean;
}

/**
 * Injected read-only access to the reference tables. A concrete reader
 * can be wired ONLY after the data sources are registered + the SDK is
 * regenerated (a separate operator/toolchain phase). The reader must
 * throw on a service/transport error so the resolver can fail closed to
 * `serviceError`.
 */
export interface NewDealReferenceReader {
  readStageReferences(): Promise<readonly ReferenceRow[]>;
  readStatusReferences(): Promise<readonly ReferenceRow[]>;
}

/**
 * Target selection by stable code (preferred) or name. NEVER a GUID. A
 * resolution is attempted only against an explicit target; the resolver
 * never picks a "default" on its own.
 */
export interface NewDealReferenceTarget {
  readonly stageCode?: string;
  readonly stageName?: string;
  readonly statusCode?: string;
  readonly statusName?: string;
}

export type NewDealReferenceResolution =
  | {
      readonly kind: 'ready';
      readonly stageId: string;
      readonly statusId: string;
      /** `/cr664_dealstagereferences(<id>)` -- from a verified active row. */
      readonly stageBind: string;
      /** `/cr664_dealstatusreferences(<id>)` -- from a verified active row. */
      readonly statusBind: string;
    }
  | { readonly kind: 'notConfigured'; readonly reason: string }
  | { readonly kind: 'missingStage' }
  | { readonly kind: 'missingStatus' }
  | { readonly kind: 'duplicateStage'; readonly count: number }
  | { readonly kind: 'duplicateStatus'; readonly count: number }
  | { readonly kind: 'inactiveStage' }
  | { readonly kind: 'inactiveStatus' }
  | { readonly kind: 'serviceError'; readonly message: string };

export const NEW_DEAL_REFERENCE_NOT_CONFIGURED_REASON =
  'Stage/Status reference data sources (cr664_dealstagereferences / cr664_dealstatusreferences) are not registered as Power Apps data sources yet. Register them and regenerate the SDK before a reader can be wired; until then New Deal create stays disabled.';

type PickResult =
  | { kind: 'ok'; id: string }
  | { kind: 'missing' }
  | { kind: 'inactive' }
  | { kind: 'duplicate'; count: number };

/**
 * Pick exactly one ACTIVE row matching the target code (preferred) or
 * name. Fails closed: no match -> missing; matches but none active ->
 * inactive; more than one active -> duplicate. No target -> missing
 * (the resolver never invents a default).
 */
function pickUniqueActive(
  rows: readonly ReferenceRow[],
  code: string | undefined,
  name: string | undefined,
): PickResult {
  const wantCode = (code ?? '').trim().toLowerCase();
  const wantName = (name ?? '').trim().toLowerCase();
  if (wantCode.length === 0 && wantName.length === 0) {
    return { kind: 'missing' };
  }
  const matched = rows.filter((r) => {
    if (wantCode.length > 0) return (r.code ?? '').trim().toLowerCase() === wantCode;
    return (r.name ?? '').trim().toLowerCase() === wantName;
  });
  if (matched.length === 0) return { kind: 'missing' };
  const active = matched.filter((r) => r.activeFlag === true);
  if (active.length === 0) return { kind: 'inactive' };
  if (active.length > 1) return { kind: 'duplicate', count: active.length };
  return { kind: 'ok', id: active[0]!.id };
}

function stageBind(id: string): string {
  return `/${STAGE_REFERENCE.entitySetName}(${id})`;
}
function statusBind(id: string): string {
  return `/${STATUS_REFERENCE.entitySetName}(${id})`;
}

/**
 * Resolve the Stage and Status reference binds for a New Deal create.
 * Fails closed on every uncertain state. Returns `ready` (with bind
 * paths built from verified unique active ids) ONLY when both Stage and
 * Status resolve to exactly one active row.
 *
 * NOTE: a `ready` result does NOT enable + New Deal. Wiring a governed,
 * audited create is a separate, later phase; this resolver is foundation
 * only.
 */
export async function resolveNewDealReferences(
  target: NewDealReferenceTarget,
  reader: NewDealReferenceReader | null | undefined,
): Promise<NewDealReferenceResolution> {
  if (!reader) {
    return { kind: 'notConfigured', reason: NEW_DEAL_REFERENCE_NOT_CONFIGURED_REASON };
  }

  let stageRows: readonly ReferenceRow[];
  try {
    stageRows = await reader.readStageReferences();
  } catch (err) {
    return { kind: 'serviceError', message: err instanceof Error ? err.message : String(err) };
  }
  const stage = pickUniqueActive(stageRows, target.stageCode, target.stageName);
  if (stage.kind === 'missing') return { kind: 'missingStage' };
  if (stage.kind === 'inactive') return { kind: 'inactiveStage' };
  if (stage.kind === 'duplicate') return { kind: 'duplicateStage', count: stage.count };

  let statusRows: readonly ReferenceRow[];
  try {
    statusRows = await reader.readStatusReferences();
  } catch (err) {
    return { kind: 'serviceError', message: err instanceof Error ? err.message : String(err) };
  }
  const status = pickUniqueActive(statusRows, target.statusCode, target.statusName);
  if (status.kind === 'missing') return { kind: 'missingStatus' };
  if (status.kind === 'inactive') return { kind: 'inactiveStatus' };
  if (status.kind === 'duplicate') return { kind: 'duplicateStatus', count: status.count };

  return {
    kind: 'ready',
    stageId: stage.id,
    statusId: status.id,
    stageBind: stageBind(stage.id),
    statusBind: statusBind(status.id),
  };
}
