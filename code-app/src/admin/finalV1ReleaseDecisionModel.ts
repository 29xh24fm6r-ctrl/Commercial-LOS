/**
 * Phase 201 — Final V1.0 release decision model.
 *
 * PURE, READ-ONLY, OFFLINE, DETERMINISTIC. `deriveFinalV1ReleaseDecision()`
 * computes the final V1.0 release decision (`GO` | `CONDITIONAL_GO` | `NO_GO`)
 * from the launch readiness domains + live gate constants + documented
 * signoff/evidence flags. It NEVER hardcodes GO: GO requires every required
 * domain ready, no forbidden condition, complete evidence, AND a present final
 * signoff. Missing any one keeps it CONDITIONAL_GO; a blocker or forbidden
 * condition forces NO_GO.
 */

import {
  deriveFullSystemLaunchReadiness,
  type LaunchReadinessDomain,
} from './fullSystemLaunchReadinessModel';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from './adminNewDealIntakeModel';

export type FinalReleaseDecision = 'GO' | 'CONDITIONAL_GO' | 'NO_GO';

export interface FinalV1ReleaseDecisionInput {
  /** A documented final operator signoff is present (not a live write). */
  readonly finalSignoffPresent?: boolean;
  /** The Phase 200 cutover evidence + operator capture is complete. */
  readonly allEvidenceComplete?: boolean;
  /** Override the readiness domains (tests use this to simulate blocked/ready). */
  readonly domainsOverride?: readonly LaunchReadinessDomain[];
  /** Explicit forbidden-condition trip (fake data, unsafe gate, etc.). */
  readonly forbiddenConditionDetected?: boolean;
}

export interface FinalV1ReleaseDecision {
  readonly decision: FinalReleaseDecision;
  readonly rationale: string;
  readonly blockingDomains: readonly string[];
  readonly conditionalDomains: readonly string[];
  /** What still must be true to reach GO from the current decision. */
  readonly requiredForGo: readonly string[];
}

/**
 * A forbidden gate state = a broad create global flipped or checklist
 * generation enabled. The certified PILOT switch being on is NOT forbidden; only
 * the global broad-rollout constants and the checklist-generation gate are.
 */
function detectForbiddenGateState(): boolean {
  // `Boolean(...)` reads the live runtime value (defensive if a gate is ever
  // flipped to a non-literal boolean) without a literal-`false` vs `true`
  // type-overlap error.
  return (
    Boolean(BANKER_NEW_DEAL_CREATE_ENABLED) ||
    Boolean(NEW_DEAL_CREATE_ADAPTER_ENABLED) ||
    Boolean(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED) ||
    Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED)
  );
}

export function deriveFinalV1ReleaseDecision(
  input: FinalV1ReleaseDecisionInput = {},
): FinalV1ReleaseDecision {
  const domains = input.domainsOverride ?? deriveFullSystemLaunchReadiness().domains;
  const blockingDomains = domains.filter((d) => d.status === 'blocked').map((d) => d.label);
  const conditionalDomains = domains.filter((d) => d.status === 'conditional').map((d) => d.label);

  const forbidden = input.forbiddenConditionDetected === true || detectForbiddenGateState();
  const signoff = input.finalSignoffPresent === true;
  const evidence = input.allEvidenceComplete === true;
  const allRequiredReady = conditionalDomains.length === 0;

  // 1. A blocked required domain or a forbidden condition forces NO_GO.
  if (blockingDomains.length > 0 || forbidden) {
    return {
      decision: 'NO_GO',
      rationale:
        blockingDomains.length > 0
          ? `Blocked launch domain(s): ${blockingDomains.join(', ')}.`
          : 'A forbidden condition (unsafe gate / fake data) was detected.',
      blockingDomains,
      conditionalDomains,
      requiredForGo: ['Resolve all blockers and forbidden conditions before re-evaluating.'],
    };
  }

  // 2. GO only when every required domain is ready AND evidence + signoff present.
  if (allRequiredReady && evidence && signoff) {
    return {
      decision: 'GO',
      rationale: 'All required domains are ready, evidence is complete, and final signoff is present.',
      blockingDomains: [],
      conditionalDomains: [],
      requiredForGo: [],
    };
  }

  // 3. Otherwise the foundation is launch-ready but conditions remain.
  const requiredForGo: string[] = [];
  if (!allRequiredReady) requiredForGo.push(`Resolve conditional domains: ${conditionalDomains.join(', ')}.`);
  if (!evidence) requiredForGo.push('Complete the Phase 200 cutover evidence + operator capture.');
  if (!signoff) requiredForGo.push('Obtain the final operator/release signoff.');
  return {
    decision: 'CONDITIONAL_GO',
    rationale: 'Foundation is launch-ready, but one or more evidence/signoff/domain conditions remain unresolved.',
    blockingDomains: [],
    conditionalDomains,
    requiredForGo,
  };
}
