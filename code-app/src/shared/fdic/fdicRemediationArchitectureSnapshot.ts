/**
 * Phase 140A — FDIC Remediation Architecture Snapshot deriver.
 *
 * A PURE projection over the operating model, workspace responsibility map,
 * and evidence catalog. It is the single read-model a future read-only
 * control-tower UI (140B) will consume.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - PURE. No IO, no React state, no service calls. Deterministic given its
 *     inputs.
 *   - NEVER invents evidence. A control is reported `wired_with_evidence`
 *     ONLY if its own `currentStatus` already says so AND every required
 *     evidence type is reported `available` by the (optional) availability
 *     map. Otherwise the snapshot DOWNGRADES it honestly to `evidence_gap`
 *     or `mapped_not_wired` — it never upgrades a control.
 *   - NEVER emits a `compliant` / `remediated` / `FDIC approved` /
 *     `examiner ready` status. Only the four honest statuses appear.
 *   - Portfolio is the control tower, not the sole owner — the snapshot
 *     reports controls across ALL workspaces.
 */

import type {
  FDICControlStatus,
  FDICFindingTheme,
  FDICWorkspace,
  FDICRemediationControl,
  FDICEvidenceType,
} from './fdicRemediationOperatingModel';
import {
  FDIC_REMEDIATION_CONTROLS,
  FDIC_WORKSPACES,
  FDIC_FINDING_THEMES,
  isHonestFdicStatus,
} from './fdicRemediationOperatingModel';
import type { FDICEvidenceAvailability } from './fdicEvidenceArchitecture';

/** Optional per-evidence-type availability override. Absent = `not_wired`. */
export type FDICEvidenceAvailabilityMap = Partial<
  Record<FDICEvidenceType, FDICEvidenceAvailability>
>;

/**
 * Optional capability hints from the rest of the platform. Reserved for a
 * future phase that wires real capabilities; in 140A it is honored but no
 * caller supplies a truthy capability, so nothing upgrades.
 */
export interface FDICCapabilityMap {
  /** Control ids the platform genuinely supports with persisted evidence. */
  wiredControlIds?: readonly string[];
}

export interface FDICSnapshotInput {
  controls?: readonly FDICRemediationControl[];
  evidenceAvailability?: FDICEvidenceAvailabilityMap;
  capabilities?: FDICCapabilityMap;
}

export interface FDICWorkspaceRow {
  workspace: FDICWorkspace;
  ownedControlCount: number;
  mappedNotWiredCount: number;
  evidenceGapCount: number;
  partiallyWiredCount: number;
  wiredWithEvidenceCount: number;
}

export interface FDICEvidenceGapRow {
  controlId: string;
  theme: FDICFindingTheme;
  /** Evidence types the control needs that are not yet `available`. */
  missingEvidence: readonly FDICEvidenceType[];
  effectiveStatus: FDICControlStatus;
}

export interface FDICRemediationArchitectureSnapshot {
  totalControls: number;
  controlsByWorkspace: Record<FDICWorkspace, number>;
  controlsByTheme: Record<FDICFindingTheme, number>;
  mappedNotWiredCount: number;
  evidenceGapCount: number;
  partiallyWiredCount: number;
  wiredWithEvidenceCount: number;
  /** Control ids owned by the executive/board accountability layer. */
  boardAttentionControls: readonly string[];
  topEvidenceGaps: readonly FDICEvidenceGapRow[];
  workspaceRows: readonly FDICWorkspaceRow[];
  nextRecommendedBuildLane: string;
  limitations: readonly string[];
}

/**
 * The build-lane priority order. The first lane whose owning workspace still
 * has un-wired controls becomes `nextRecommendedBuildLane`.
 */
const BUILD_LANE_PRIORITY: readonly {
  lane: string;
  workspace: FDICWorkspace;
}[] = Object.freeze([
  {
    lane: '140C — Credit Admin document / core-data exception queues',
    workspace: 'credit_administration_workspace',
  },
  {
    lane: '140B — Portfolio FDIC Control Tower',
    workspace: 'portfolio_command_center',
  },
  {
    lane: '140D — Independent Loan Review workspace',
    workspace: 'independent_loan_review_workspace',
  },
  { lane: '140F — ACL / CECL Workbench', workspace: 'acl_cecl_workbench' },
  {
    lane: '140G — Appraisal / Evaluation Review Queue',
    workspace: 'appraisal_review_queue',
  },
  {
    lane: '140H — Board Remediation Packet',
    workspace: 'executive_board_oversight',
  },
  {
    lane: '140I — Governance Evidence Ledger',
    workspace: 'governance_evidence_ledger',
  },
]);

function emptyWorkspaceCounts(): Record<FDICWorkspace, number> {
  const out = {} as Record<FDICWorkspace, number>;
  for (const workspace of FDIC_WORKSPACES) out[workspace] = 0;
  return out;
}

function emptyThemeCounts(): Record<FDICFindingTheme, number> {
  const out = {} as Record<FDICFindingTheme, number>;
  for (const theme of FDIC_FINDING_THEMES) out[theme] = 0;
  return out;
}

/**
 * Resolve the HONEST effective status of a control. This function can only
 * ever hold a status flat or DOWNGRADE it — never upgrade — except the
 * explicit, opt-in `wiredControlIds` capability hint (unused in 140A).
 */
function effectiveStatus(
  control: FDICRemediationControl,
  availability: FDICEvidenceAvailabilityMap,
  capabilities: FDICCapabilityMap,
): { status: FDICControlStatus; missingEvidence: FDICEvidenceType[] } {
  const missingEvidence = control.evidenceRequired.filter(
    (evidenceType) => availability[evidenceType] !== 'available',
  );
  const allEvidenceAvailable = missingEvidence.length === 0;

  const explicitlyWired = capabilities.wiredControlIds?.includes(control.id);

  // The ONLY path to wired_with_evidence: the control already claims it AND
  // every required evidence type is genuinely available — or an explicit,
  // audited capability hint says so. Never fabricated.
  if (
    (control.currentStatus === 'wired_with_evidence' && allEvidenceAvailable) ||
    (explicitlyWired && allEvidenceAvailable)
  ) {
    return { status: 'wired_with_evidence', missingEvidence: [] };
  }

  // A control that claims partial wiring keeps it only if SOME evidence is
  // available; otherwise it falls to a gap honestly.
  if (control.currentStatus === 'partially_wired' && !allEvidenceAvailable) {
    const someAvailable = control.evidenceRequired.some(
      (evidenceType) => availability[evidenceType] === 'available',
    );
    return {
      status: someAvailable ? 'partially_wired' : 'evidence_gap',
      missingEvidence,
    };
  }

  // Default honest floor: a control that requires evidence it does not have
  // is an evidence_gap; one not yet mapped to any wiring stays mapped_not_wired.
  const status: FDICControlStatus =
    control.currentStatus === 'evidence_gap'
      ? 'evidence_gap'
      : 'mapped_not_wired';
  return { status, missingEvidence };
}

export function deriveFdicRemediationArchitectureSnapshot(
  input: FDICSnapshotInput = {},
): FDICRemediationArchitectureSnapshot {
  const controls = input.controls ?? FDIC_REMEDIATION_CONTROLS;
  const availability = input.evidenceAvailability ?? {};
  const capabilities = input.capabilities ?? {};

  const controlsByWorkspace = emptyWorkspaceCounts();
  const controlsByTheme = emptyThemeCounts();

  const workspaceRows: Record<FDICWorkspace, FDICWorkspaceRow> = {} as Record<
    FDICWorkspace,
    FDICWorkspaceRow
  >;
  for (const workspace of FDIC_WORKSPACES) {
    workspaceRows[workspace] = {
      workspace,
      ownedControlCount: 0,
      mappedNotWiredCount: 0,
      evidenceGapCount: 0,
      partiallyWiredCount: 0,
      wiredWithEvidenceCount: 0,
    };
  }

  let mappedNotWiredCount = 0;
  let evidenceGapCount = 0;
  let partiallyWiredCount = 0;
  let wiredWithEvidenceCount = 0;

  const boardAttentionControls: string[] = [];
  const topEvidenceGaps: FDICEvidenceGapRow[] = [];

  for (const control of controls) {
    controlsByWorkspace[control.primaryWorkspace] += 1;
    controlsByTheme[control.theme] += 1;

    const row = workspaceRows[control.primaryWorkspace];
    row.ownedControlCount += 1;

    const { status, missingEvidence } = effectiveStatus(
      control,
      availability,
      capabilities,
    );

    // Belt-and-suspenders: never let a non-honest status escape.
    if (!isHonestFdicStatus(status)) {
      throw new Error(
        `FDIC snapshot produced a non-honest status "${status}" for ${control.id}`,
      );
    }

    switch (status) {
      case 'mapped_not_wired':
        mappedNotWiredCount += 1;
        row.mappedNotWiredCount += 1;
        break;
      case 'evidence_gap':
        evidenceGapCount += 1;
        row.evidenceGapCount += 1;
        break;
      case 'partially_wired':
        partiallyWiredCount += 1;
        row.partiallyWiredCount += 1;
        break;
      case 'wired_with_evidence':
        wiredWithEvidenceCount += 1;
        row.wiredWithEvidenceCount += 1;
        break;
    }

    if (control.primaryWorkspace === 'executive_board_oversight') {
      boardAttentionControls.push(control.id);
    }

    if (status !== 'wired_with_evidence' && missingEvidence.length > 0) {
      topEvidenceGaps.push({
        controlId: control.id,
        theme: control.theme,
        missingEvidence,
        effectiveStatus: status,
      });
    }
  }

  // Order gaps by how much evidence is missing (most-missing first), stably.
  topEvidenceGaps.sort(
    (a, b) => b.missingEvidence.length - a.missingEvidence.length,
  );

  const nextRecommendedBuildLane = pickNextBuildLane(workspaceRows);

  const limitations: string[] = [
    'Static architecture model — no live capability probe. Status reflects deliberate edits, not runtime detection.',
    'No control is wired_with_evidence in Phase 140A; the platform captures no governed remediation evidence yet.',
    'This snapshot makes no regulatory claim — it does not assert compliance, remediation, FDIC approval, or examiner readiness.',
    'Portfolio is the control tower, not the sole remediation owner; ownership is distributed across all eight workspaces.',
  ];

  return {
    totalControls: controls.length,
    controlsByWorkspace,
    controlsByTheme,
    mappedNotWiredCount,
    evidenceGapCount,
    partiallyWiredCount,
    wiredWithEvidenceCount,
    boardAttentionControls,
    topEvidenceGaps,
    workspaceRows: FDIC_WORKSPACES.map((workspace) => workspaceRows[workspace]),
    nextRecommendedBuildLane,
    limitations,
  };
}

function pickNextBuildLane(
  workspaceRows: Record<FDICWorkspace, FDICWorkspaceRow>,
): string {
  for (const { lane, workspace } of BUILD_LANE_PRIORITY) {
    const row = workspaceRows[workspace];
    const unwired =
      row.mappedNotWiredCount + row.evidenceGapCount + row.partiallyWiredCount;
    if (unwired > 0) return lane;
  }
  // Every prioritized lane is fully wired — honest "nothing left here" state.
  return 'All prioritized build lanes report their owned controls wired_with_evidence; revisit the roadmap for the next phase.';
}
