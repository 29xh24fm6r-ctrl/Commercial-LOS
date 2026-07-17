/**
 * Phase 197 — Full System Launch Readiness model.
 *
 * Factory Arc Phase 5 renamed this file from `fullSystemLaunchReadinessModel.ts`
 * (identifier `deriveFullSystemLaunchReadiness` -> `deriveReleaseGovernanceSnapshot`,
 * interface `FullSystemLaunchReadiness` -> `ReleaseGovernanceSnapshot`). This module
 * was already admin-only — mounted only by FullSystemLaunchReadinessConsole.tsx
 * inside AdminWorkspace.tsx, never imported by src/banker, src/manager, src/deals,
 * src/portfolioBoarding, or src/portfolio (see releaseGovernanceRuntimeImportGuard.test.ts,
 * which now also scans src/portfolio). The rename reframes it explicitly as a
 * release-governance snapshot for Admin Platform Operations, not a live "launch
 * console" concept a banker or manager could ever reach.
 *
 * PURE, READ-ONLY, OFFLINE. `deriveReleaseGovernanceSnapshot()` produces one
 * honest view of whether the entire OGB LOS is ready for V1 launch. It is
 * derived ONLY from existing governance constants + static phase posture — it
 * makes no SDK call, no Dataverse read/write, no fetch, and flips no gate. It
 * never enables anything; it only reports the current, fail-closed posture.
 */

import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from './adminNewDealIntakeModel';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../deals/documentChecklistPilotConfig';
import { evaluateBankerCreateRollout } from '../deals/bankerNewDealCreateRollout';

export type LaunchRecommendation = 'GO' | 'CONDITIONAL_GO' | 'NO_GO';
export type LaunchDomainStatus = 'ready' | 'conditional' | 'blocked';

export interface LaunchReadinessDomain {
  readonly id: string;
  readonly label: string;
  readonly status: LaunchDomainStatus;
  readonly details: readonly string[];
  readonly requiredActions: readonly string[];
  readonly safetyNotes: readonly string[];
}

export interface ReleaseGovernanceSnapshot {
  readonly recommendation: LaunchRecommendation;
  readonly label: string;
  readonly summary: string;
  readonly domains: readonly LaunchReadinessDomain[];
}

/** Human-facing label for a recommendation enum. */
export function launchRecommendationLabel(rec: LaunchRecommendation): string {
  switch (rec) {
    case 'GO':
      return 'GO';
    case 'NO_GO':
      return 'NO GO';
    case 'CONDITIONAL_GO':
    default:
      return 'CONDITIONAL GO';
  }
}

/**
 * Derive the full-system launch readiness. The create + checklist gates are
 * read live (all false by default) so this view is tied to the real posture,
 * never to fabricated state.
 */
export function deriveReleaseGovernanceSnapshot(): ReleaseGovernanceSnapshot {
  // The default (no-override) rollout decision — disabled until an operator
  // enables the certified pilot switch with all preconditions met.
  const defaultRollout = evaluateBankerCreateRollout();
  const createGatesAllFalse =
    (BANKER_NEW_DEAL_CREATE_ENABLED as boolean) === false &&
    (NEW_DEAL_CREATE_ADAPTER_ENABLED as boolean) === false &&
    (NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED as boolean) === false;
  const checklistGatesAllFalse =
    DOCUMENT_CHECKLIST_PILOT_UI_ENABLED === false &&
    DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED === false &&
    (DOCUMENT_CHECKLIST_GENERATION_ENABLED as boolean) === false;

  const domains: LaunchReadinessDomain[] = [
    {
      id: 'banker-workspace',
      label: 'Banker Workspace',
      status: 'ready',
      details: [
        'The banker workspace is built, governed, and permission controlled.',
        'It loads behind a fail-closed identity + entitlement gate, with no fallback dashboard and no fake/sample data.',
      ],
      requiredActions: [],
      safetyNotes: [
        'Permission-before-render is required; unauthorized users fail closed.',
      ],
    },
    {
      id: 'new-deal-create',
      label: 'New Deal Create',
      status: 'conditional',
      details: [
        'A controlled live New Deal create path exists and is certified (Phase 194/195).',
        `The three global create gates remain false (BANKER_NEW_DEAL_CREATE_ENABLED=${BANKER_NEW_DEAL_CREATE_ENABLED}, NEW_DEAL_CREATE_ADAPTER_ENABLED=${NEW_DEAL_CREATE_ADAPTER_ENABLED}, NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED=${NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED}).`,
        `evaluateBankerCreateRollout() returns "${defaultRollout}" by default; operator enablement and signoff are required for live create.`,
        'No actorless create is allowed — a resolved actor systemuser + banker authorization are required.',
      ],
      requiredActions: [
        'Operator enables the certified pilot switch for the approved pilot context and signs off.',
      ],
      safetyNotes: [
        'Live create is fail-closed: any one false gate, missing actor, unapproved references, or unready resolver disables it.',
      ],
    },
    {
      id: 'crm-salesforce-ncino',
      label: 'OGB CRM / Relationship Command Center',
      status: 'conditional',
      details: [
        'The OGB-native CRM relationship foundation (Relationship Command Center) is built, mounted, and certified.',
        'Read-only relationship and internal live-readiness surfaces are available.',
        'CRM writeback remains gated / fail-closed unless separately enabled.',
      ],
      requiredActions: [
        'Enable CRM writeback only via a separate, approved enablement phase.',
      ],
      safetyNotes: [
        'No CRM writeback occurs from these surfaces; they are read-only / readiness-only.',
      ],
    },
    {
      id: 'workflow-factory',
      label: 'Workflow Factory',
      status: 'conditional',
      details: [
        'The workflow factory surfaces are mounted.',
        'Workflow generation / stage / task / write actions remain fail-closed unless approved dependencies and gates are enabled.',
        'There is no borrower send path in the workflow surfaces.',
      ],
      requiredActions: [
        'Enable workflow writes only via approved dependency/gate enablement.',
      ],
      safetyNotes: [
        'Workflow writes remain fail-closed; no borrower communication is sent.',
      ],
    },
    {
      id: 'credit-committee-compliance',
      label: 'Credit / Committee / Compliance',
      status: 'conditional',
      details: [
        'Phase 192 credit / committee / compliance readiness exists and is certified.',
        'No fake approval and no fabricated source facts: credit memo and committee readiness never imply approval, and missing facts are shown honestly.',
      ],
      requiredActions: [
        'Wire committee readiness into a governed committee workspace as a separate follow-up.',
      ],
      safetyNotes: [
        'Committee readiness is decision-support only; there is no "approved" status and no uncertified write.',
      ],
    },
    {
      id: 'data-quality-no-fake-data',
      label: 'Data Quality / No Fake Data',
      status: 'conditional',
      details: [
        'No sample / fake / demo data is allowed for production readiness.',
        'Missing data must be shown honestly (explicit empty / missing / unavailable states), never fabricated.',
      ],
      requiredActions: [
        'Confirm production data sources are seeded and verified before relying on populated views.',
      ],
      safetyNotes: [
        'Production surfaces render live data or honest empty/error states only.',
      ],
    },
    {
      id: 'permissions-entitlements',
      label: 'Permissions / Entitlements',
      status: 'ready',
      details: [
        'Permission-before-render remains required across every workspace and deal surface.',
        'Unauthorized users fail closed — they are bounced to their resolved route or shown an honest error, never leaked an unauthorized surface.',
      ],
      requiredActions: [],
      safetyNotes: [
        'No entitlement or route widening is introduced by this readiness layer.',
      ],
    },
    {
      id: 'operator-admin-readiness',
      label: 'Operator / Admin Readiness',
      status: 'conditional',
      details: [
        'The Phase 195 controlled pilot cutover runbook and the Phase 196 evidence-certification runbook exist.',
        'An operator preflight checklist and signoff are required before live use.',
        'A rollback path exists (one-line pilot-switch rollback, immediate and non-destructive).',
      ],
      requiredActions: [
        'Operator completes the Phase 195/196 checklists, captures evidence outside repo, and signs off.',
      ],
      safetyNotes: [
        'Rollback is retained ready; existing created deals remain accessible after rollback.',
      ],
    },
    {
      id: 'build-release',
      label: 'Build / Release',
      status: 'ready',
      details: [
        'The Phase 190A build preflight remains wired into the build, so a fresh clone builds deterministically from a no-.power state.',
        'The release-candidate snapshot includes the current launch docs and governance tests.',
      ],
      requiredActions: [],
      safetyNotes: [
        'No build step performs a live write or flips a gate.',
      ],
    },
    {
      id: 'final-launch-decision',
      label: 'Final V1.0 Launch Decision',
      status: 'conditional',
      details: [
        'Current status is CONDITIONAL_GO: the foundation is built, mounted, and tested, but real production use still requires operator enablement and signoff.',
      ],
      requiredActions: [
        'Operator enables the certified controlled New Deal create pilot switch for the approved context.',
        'Operator executes the Phase 195 cutover and captures the Phase 196 evidence package outside repo.',
        'Release operator signs off with no stop condition triggered to move from CONDITIONAL_GO to GO.',
      ],
      safetyNotes: [
        'CRM writeback, workflow writes, borrower communications, and checklist generation remain gated / fail-closed unless separately enabled.',
      ],
    },
  ];

  const anyBlocked = domains.some((d) => d.status === 'blocked');
  const anyConditional = domains.some((d) => d.status === 'conditional');
  const recommendation: LaunchRecommendation = anyBlocked
    ? 'NO_GO'
    : anyConditional
      ? 'CONDITIONAL_GO'
      : 'GO';

  // Defensive: this readiness layer must never assert a posture that is not
  // actually fail-closed. If a gate were ever flipped, the summary still tells
  // the truth from the live constants.
  const gatesSummary =
    createGatesAllFalse && checklistGatesAllFalse
      ? 'All create and checklist gates remain false.'
      : 'One or more gates are no longer at their safe default — review before launch.';

  return {
    recommendation,
    label: launchRecommendationLabel(recommendation),
    summary:
      'The OGB LOS V1 foundation is built, mounted, governed, and tested. ' +
      'Real production use still requires operator enablement and signoff for controlled New Deal create; ' +
      'CRM writeback, workflow writes, borrower communications, and checklist generation remain gated / fail-closed unless separately enabled. ' +
      gatesSummary,
    domains,
  };
}
