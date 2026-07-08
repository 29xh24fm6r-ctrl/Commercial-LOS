/**
 * Phase 5 — live loader for the admin Stage Governance Diagnostics card.
 *
 * The card previously rendered the no-arg (always-blocked) diagnostics, so it
 * could never reflect a seeded environment or show the actual rows. This loads
 * the live stage + status reference rows, runs the deterministic contracts
 * (resolveStageOrdering / resolveStatusReferences / describeStageTransitionGraph),
 * and derives the rich diagnostics — flipping CRITICAL → READY automatically once
 * the ordering resolves, the five statuses are active, and the graph validates.
 *
 * Fail-closed: any read failure (including the not-yet-provisioned cr664_sequence
 * column before the maker seeds it and regenerates the SDK, Dataverse 0x80060888)
 * resolves to the honest "not loaded / not seeded" blocked state, never a crash.
 *
 * Pure over injected readers (SDK-free static graph); a live factory pulls the
 * generated services via dynamic import. Lives in src/admin (which does its own
 * governed reads) — it imports only the pure workflow contracts + shared
 * governance derive + the generated services, never a role-workspace module.
 */

import {
  resolveStageOrdering,
  describeStageTransitionGraph,
  isCanonicalStageCode,
  type StageReferenceRow,
  type StageOrderingResult,
} from '../workflow/stageOrderingContract';
import {
  resolveStatusReferences,
  isCanonicalStatusCode,
  type StatusReferenceRow,
  type StatusReferenceResult,
} from '../workflow/statusReferenceContract';
import {
  deriveStageGovernanceDiagnostics,
  type StageGovernanceDiagnostics,
  type StageRowView,
  type StatusRowView,
} from '../shared/governance/stageProgressionAvailability';

/** Columns needed to resolve the canonical ordering. */
const STAGE_ORDERING_SELECT: readonly string[] = [
  'cr664_dealstagereferenceid',
  'cr664_code',
  'cr664_name',
  'cr664_activeflag',
  'cr664_sequence',
];

/** Columns needed to resolve the disposition statuses. */
const STATUS_SELECT: readonly string[] = [
  'cr664_dealstatusreferenceid',
  'cr664_code',
  'cr664_name',
  'cr664_activeflag',
];

export interface StageGovernanceReaders {
  /** Reads stage-reference rows. Throws on a non-success read. */
  readonly readStageRows: () => Promise<readonly StageReferenceRow[]>;
  /** Reads status-reference rows. Throws on a non-success read. */
  readonly readStatusRows: () => Promise<readonly StatusReferenceRow[]>;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function toStageView(r: StageReferenceRow): StageRowView | null {
  const code = (r.cr664_code ?? '').trim();
  if (code.length === 0) return null;
  return {
    code,
    name: (r.cr664_name ?? '').trim(),
    sequence: typeof r.cr664_sequence === 'number' ? r.cr664_sequence : null,
    active: r.cr664_activeflag !== false,
    canonical: isCanonicalStageCode(code),
  };
}

function toStatusView(r: StatusReferenceRow): StatusRowView | null {
  const code = (r.cr664_code ?? '').trim();
  if (code.length === 0) return null;
  return {
    code,
    name: (r.cr664_name ?? '').trim(),
    active: r.cr664_activeflag !== false,
    canonical: isCanonicalStatusCode(code),
  };
}

/**
 * Derive the rich diagnostics from injected readers. Pure. Each read is guarded
 * independently: a failed stage read blocks ordering; a failed status read blocks
 * the status check; both failing surfaces the honest "not loaded" state.
 */
export async function loadStageGovernanceDiagnosticsWith(
  readers: StageGovernanceReaders,
): Promise<StageGovernanceDiagnostics> {
  let stageRows: readonly StageReferenceRow[] | null = null;
  let stageReadError: string | undefined;
  try {
    stageRows = await readers.readStageRows();
  } catch (e) {
    stageReadError = errMsg(e);
  }

  let statusRows: readonly StatusReferenceRow[] | null = null;
  let statusReadError: string | undefined;
  try {
    statusRows = await readers.readStatusRows();
  } catch (e) {
    statusReadError = errMsg(e);
  }

  const loadFailedReason =
    stageRows === null && statusRows === null ? (stageReadError ?? statusReadError) : undefined;

  // Active non-canonical / legacy-test rows (e.g. PHASE121_*). They are EXCLUDED
  // from resolution so a complete canonical set is not blocked by leftover legacy
  // rows; they are reported to the derive as an at-risk hygiene warning instead.
  const activeNonCanonical = (
    r: { cr664_code?: string | null; cr664_activeflag?: boolean | null },
    isCanonical: (code: string) => boolean,
  ): string | null => {
    const code = (r.cr664_code ?? '').trim();
    const active = r.cr664_activeflag !== false;
    return active && code.length > 0 && !isCanonical(code) ? code : null;
  };

  const legacyActiveStageCodes = (stageRows ?? [])
    .map((r) => activeNonCanonical(r, isCanonicalStageCode))
    .filter((c): c is string => c !== null);
  const legacyActiveStatusCodes = (statusRows ?? [])
    .map((r) => activeNonCanonical(r, isCanonicalStatusCode))
    .filter((c): c is string => c !== null);

  // Resolve ordering/status IGNORING active non-canonical rows (inactive rows are
  // already ignored by the resolvers). This is the tolerance: legacy pollution
  // does not turn a complete canonical set into a CRITICAL block.
  const stageResolutionRows = (stageRows ?? []).filter(
    (r) => activeNonCanonical(r, isCanonicalStageCode) === null,
  );
  const statusResolutionRows = (statusRows ?? []).filter(
    (r) => activeNonCanonical(r, isCanonicalStatusCode) === null,
  );

  const stageOrdering: StageOrderingResult =
    stageRows === null
      ? { status: 'unavailable', reasons: [stageReadError ?? 'stage-reference rows are not available in this context'] }
      : resolveStageOrdering(stageResolutionRows);

  const statusResult: StatusReferenceResult =
    statusRows === null
      ? { status: 'unavailable', reasons: [statusReadError ?? 'status-reference rows are not available in this context'] }
      : resolveStatusReferences(statusResolutionRows);

  const transitionGraph = stageOrdering.status === 'ready' ? describeStageTransitionGraph(stageOrdering) : null;

  // Display shows ALL rows (including the legacy ones, marked non-canonical).
  const stageViews = (stageRows ?? []).map(toStageView).filter((v): v is StageRowView => v !== null);
  const statusViews = (statusRows ?? []).map(toStatusView).filter((v): v is StatusRowView => v !== null);

  return deriveStageGovernanceDiagnostics({
    stageOrdering,
    statusResult,
    stageRows: stageViews,
    statusRows: statusViews,
    transitionGraph,
    loadFailedReason,
    legacyActiveStageCodes,
    legacyActiveStatusCodes,
  });
}

// ---------------------------------------------------------------------------
// Live readers (dynamic imports keep the SDK out of the static graph).
// ---------------------------------------------------------------------------

export function buildLiveStageGovernanceReaders(): StageGovernanceReaders {
  return {
    readStageRows: async () => {
      const { Cr664_dealstagereferencesService } = await import(
        '../generated/services/Cr664_dealstagereferencesService'
      );
      const res = await Cr664_dealstagereferencesService.getAll({ select: [...STAGE_ORDERING_SELECT] });
      if (!res.success) throw new Error(res.error?.message ?? 'Failed to read stage references.');
      // cr664_sequence is read structurally (optional) — it arrives at runtime once
      // the column is provisioned; the cast is safe (StageReferenceRow is an
      // all-optional subset).
      return (res.data ?? []) as unknown as readonly StageReferenceRow[];
    },
    readStatusRows: async () => {
      const { Cr664_dealstatusreferencesService } = await import(
        '../generated/services/Cr664_dealstatusreferencesService'
      );
      const res = await Cr664_dealstatusreferencesService.getAll({ select: [...STATUS_SELECT] });
      if (!res.success) throw new Error(res.error?.message ?? 'Failed to read status references.');
      return (res.data ?? []) as unknown as readonly StatusReferenceRow[];
    },
  };
}

export function loadStageGovernanceDiagnostics(): Promise<StageGovernanceDiagnostics> {
  return loadStageGovernanceDiagnosticsWith(buildLiveStageGovernanceReaders());
}
