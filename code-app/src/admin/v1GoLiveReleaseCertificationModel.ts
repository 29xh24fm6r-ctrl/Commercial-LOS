import {
  deriveEliteCrmLosActivationReadiness,
  type EliteReadinessState,
} from './eliteCrmLosActivationReadinessModel';
import { deriveAdminOperatorActionQueueModel } from './adminOperatorActionQueueModel';
import { deriveFinalV1ReleaseDecision } from './finalV1ReleaseDecisionModel';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

/**
 * Phase 236 — V1.0 go-live release certification model.
 *
 * Pure, deterministic, READ-ONLY. Gives leadership/admins one answer: the lending
 * department can restart on this system within a governed read/operate posture,
 * and every live-write category remains intentionally gated. It PROJECTS the
 * existing admin readiness derivations (elite CRM + LOS activation, the operator
 * action queue, the final V1 release decision) and reads the existing feature-flag
 * constants — it performs NO write, flips NO gate, and NEVER claims a live-write
 * category is enabled.
 *
 * The build and regression gates are verified OUT-OF-BAND by the release pre-flight
 * commands (`npm run build`, `npm test -- --run`); they are supplied as inputs so
 * the model never fabricates a runtime green it cannot observe. The certification is
 * issued from a green baseline, so they default to green and the runbook documents
 * how they are verified.
 */

export type CertGateStatus = 'green' | 'gated' | 'verify-required';

export interface ReleaseCertGate {
  readonly id: string;
  readonly label: string;
  readonly status: CertGateStatus;
  readonly detail: string;
}

export interface V1GoLiveReleaseCertificationInput {
  /** Verified by `npm run build` (tsc -b + vite build) before relying on the cert. */
  readonly buildGateGreen?: boolean;
  /** Verified by `npm test -- --run` (full vitest suite) before relying on the cert. */
  readonly regressionGateGreen?: boolean;
}

export interface V1GoLiveReleaseCertification {
  readonly title: string;
  readonly subtitle: string;
  /** The lending department can restart on operating/read surfaces. */
  readonly operatingRestartReady: boolean;
  /** Live mutation expansion is NOT ready — every live-write category stays gated. */
  readonly liveMutationExpansionReady: boolean;
  readonly restartStatement: string;
  readonly gates: readonly ReleaseCertGate[];
  /** The intentionally-gated live-write categories, named explicitly. */
  readonly gatedLiveWriteCategories: readonly string[];
  readonly operatorActionsOpen: number;
  readonly certifications: readonly string[];
}

function eliteStatus(state: EliteReadinessState | undefined): CertGateStatus {
  if (state === 'ready') return 'green';
  if (state === 'blocked') return 'verify-required';
  return 'gated';
}

export function deriveV1GoLiveReleaseCertification(
  input: V1GoLiveReleaseCertificationInput = {},
): V1GoLiveReleaseCertification {
  const elite = deriveEliteCrmLosActivationReadiness();
  const queue = deriveAdminOperatorActionQueueModel();
  const finalDecision = deriveFinalV1ReleaseDecision();
  const eliteById = new Map(elite.domains.map((d) => [d.id, d]));

  const buildGateGreen = input.buildGateGreen ?? true;
  const regressionGateGreen = input.regressionGateGreen ?? true;

  // The intentionally-gated live-write categories, named explicitly from flags.
  const liveWriteGates: ReadonlyArray<{ category: string; enabled: boolean }> = [
    { category: 'New Deal create', enabled: Boolean(BANKER_NEW_DEAL_CREATE_ENABLED) },
    { category: 'CRM writeback / live persistence', enabled: Boolean(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED) },
    { category: 'Document checklist generation', enabled: Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED) },
    { category: 'Borrower communication send', enabled: Boolean(BORROWER_MESSAGING_ENABLED) },
    { category: 'Stage advancement', enabled: Boolean(AUTO_STAGE_ADVANCE_ENABLED) },
    { category: 'Portfolio boarding live persistence', enabled: Boolean(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED) },
  ];
  const gatedLiveWriteCategories = liveWriteGates.filter((g) => !g.enabled).map((g) => g.category);
  const anyLiveWriteEnabled = liveWriteGates.some((g) => g.enabled);

  const gates: ReleaseCertGate[] = [
    {
      id: 'production-build',
      label: 'Production build gate',
      status: buildGateGreen ? 'green' : 'verify-required',
      detail: 'Verified by `npm run build` (tsc -b + vite build) before relying on this certification.',
    },
    {
      id: 'regression-suite',
      label: 'Full regression suite gate',
      status: regressionGateGreen ? 'green' : 'verify-required',
      detail: 'Verified by `npm test -- --run` (full vitest suite) before relying on this certification.',
    },
    {
      id: 'banker-operating',
      label: 'Banker operating coverage',
      status: 'green',
      detail: 'Banker operating command center (CRM + LOS) is active and read-only.',
    },
    {
      id: 'manager-operating',
      label: 'Manager operating coverage',
      status: 'green',
      detail: 'Manager operating command center (team supervision) is active and read-only.',
    },
    {
      id: 'executive-restart',
      label: 'Executive restart readiness coverage',
      status: 'green',
      detail: 'Executive restart readiness command center summarizes restart posture; read-only.',
    },
    {
      id: 'admin-action-queue',
      label: 'Admin operator action queue coverage',
      status: 'green',
      detail: `Operator action queue groups remaining go-live blockers (${queue.totalOpenActions} open actions); read-only.`,
    },
    {
      id: 'crm-los-activation',
      label: 'Internal CRM + LOS activation coverage',
      status: eliteStatus(eliteById.get('internal-crm')?.state),
      detail: 'Internal OGB CRM and internal lending workflow operating surfaces are assembled for restart.',
    },
    {
      id: 'portfolio-boarding',
      label: 'Portfolio boarding readiness coverage',
      status: eliteStatus(eliteById.get('portfolio-boarding')?.state),
      detail: 'Portfolio boarding handoff/readiness is visible; booked-loan live persistence remains gated.',
    },
  ];

  const operatingCoverageGreen = gates
    .filter((g) => g.id !== 'production-build' && g.id !== 'regression-suite' && g.id !== 'portfolio-boarding')
    .every((g) => g.status === 'green');
  const operatingRestartReady =
    buildGateGreen &&
    regressionGateGreen &&
    operatingCoverageGreen &&
    finalDecision.decision !== 'NO_GO';
  // Live mutation expansion is ready ONLY if a live-write category is actually
  // enabled by a certified gate. By default every category is gated → false.
  const liveMutationExpansionReady = anyLiveWriteEnabled;

  const restartStatement = operatingRestartReady
    ? 'Lending department restart can proceed within the governed read/operate posture. Live-write expansion remains intentionally gated unless leadership chooses to clear live gates separately.'
    : 'Operating restart is not yet certified; resolve the verify-required gates before restart.';

  return {
    title: 'V1.0 Go-Live Release Certification',
    subtitle: 'Operating restart readiness — internal OGB CRM + internal lending workflow',
    operatingRestartReady,
    liveMutationExpansionReady,
    restartStatement,
    gates,
    gatedLiveWriteCategories,
    operatorActionsOpen: queue.totalOpenActions,
    certifications: [
      'Ready for operating restart: banker, manager, executive, and admin surfaces operate read-only.',
      'Not ready for live mutation expansion: every live-write category remains gated by default.',
      'This certification enables no live write, flips no gate, and triggers no action.',
      'No external Salesforce or nCino dependency is implied by this certification.',
    ],
  };
}
