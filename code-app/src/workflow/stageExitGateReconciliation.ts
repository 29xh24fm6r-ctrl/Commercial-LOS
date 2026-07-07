/**
 * WFLOW-G — reconcile the rigorous per-stage exit gate with the live transition gate.
 *
 * Two gates govern a stage move and they DIVERGE:
 *   - the LIVE path (`evaluateStageTransitionPolicy`, used by advanceWorkflowStage)
 *     only checks "the requested stage is an approved next stage" + "readiness is not
 *     'blocked'". It NEVER consults the rigorous per-stage exit criteria.
 *   - the RIGOROUS gate (`evaluateExitGate`) requires the real facts — risk rating,
 *     approval authority, conditions cleared, funds disbursed, boarding completed —
 *     several of which are not yet tracked (or not yet implemented, e.g. risk rating).
 *
 * Left unreconciled, the live path is OVER-PERMISSIVE: it can allow an advance the
 * rigorous gate would block, and it is blind to facts that are not tracked at all.
 *
 * This module makes the divergence EXPLICIT and turns it into a certification signal:
 * a stage is only `certifiable` as team-ready when the live path would allow the move
 * AND the rigorous gate is satisfied AND every rigorous requirement is genuinely
 * TRACKED. Untracked facts (risk rating, approval authority, funding, boarding, …) are
 * surfaced as blockers — they BLOCK certification rather than silently passing.
 */

import { evaluateExitGate, type StageGateFacts, type StageGateRequirement } from './stageGateContract';
import type { CanonicalStageCode } from './stageOrderingContract';

export type LiveReadinessStatus = 'blocked' | 'at-risk' | 'clear';

export type ReconciledVerdict =
  /** Live allows AND rigorous gate satisfied AND all facts tracked — safe to certify. */
  | 'aligned-allow'
  /** Both gates block — honestly not ready; no divergence. */
  | 'aligned-block'
  /** Live would allow but the rigorous gate blocks — the dangerous over-permissive case. */
  | 'divergent-live-overpermissive';

export interface StageExitGateReconciliation {
  readonly stage: CanonicalStageCode;
  readonly liveReadinessStatus: LiveReadinessStatus;
  /** The shallow live policy verdict (readiness is not 'blocked'). */
  readonly liveWouldAllow: boolean;
  /** The rigorous exit gate verdict (every requirement met). */
  readonly rigorousSatisfied: boolean;
  /** Rigorous requirements not met (tracked-but-outstanding AND untracked). */
  readonly outstanding: readonly StageGateRequirement[];
  /** Requirement ids whose backing fact is NOT tracked (schema/implementation gap). */
  readonly untracked: readonly string[];
  readonly verdict: ReconciledVerdict;
  /** Explicit certification blockers (untracked facts + rigorous-unsatisfied + live-block). */
  readonly certificationBlockers: readonly string[];
  /** True ONLY when live allows, rigorous is satisfied, and nothing is untracked. */
  readonly certifiable: boolean;
}

/**
 * Reconcile one stage. Pure and fail-closed: any untracked fact or unsatisfied
 * rigorous requirement blocks certification, regardless of what the live path allows.
 */
export function reconcileStageExitGate(
  stage: CanonicalStageCode,
  facts: StageGateFacts,
  liveReadinessStatus: LiveReadinessStatus,
): StageExitGateReconciliation {
  const gate = evaluateExitGate(stage, facts);
  const outstanding = gate.requirements.filter((r) => !r.met);
  const untracked = gate.requirements.filter((r) => !r.tracked).map((r) => r.id);

  const liveWouldAllow = liveReadinessStatus !== 'blocked';
  const rigorousSatisfied = gate.satisfied;

  const certificationBlockers: string[] = [];
  if (!liveWouldAllow) {
    certificationBlockers.push(`live readiness is ${liveReadinessStatus} for ${stage}`);
  }
  if (!rigorousSatisfied) {
    for (const r of outstanding) {
      certificationBlockers.push(
        `${stage} exit requirement "${r.label}" not met${r.tracked ? '' : ' (fact not tracked)'}`,
      );
    }
  }

  let verdict: ReconciledVerdict;
  if (liveWouldAllow && rigorousSatisfied) {
    verdict = 'aligned-allow';
  } else if (!liveWouldAllow && !rigorousSatisfied) {
    verdict = 'aligned-block';
  } else if (liveWouldAllow && !rigorousSatisfied) {
    verdict = 'divergent-live-overpermissive';
  } else {
    // Live blocks but rigorous satisfied — live is stricter; still not certifiable-allow,
    // but not the dangerous case. Treat as aligned-block (nothing advances).
    verdict = 'aligned-block';
  }

  const certifiable = liveWouldAllow && rigorousSatisfied && untracked.length === 0;

  return {
    stage,
    liveReadinessStatus,
    liveWouldAllow,
    rigorousSatisfied,
    outstanding,
    untracked,
    verdict,
    certificationBlockers: [...new Set(certificationBlockers)],
    certifiable,
  };
}

export interface StageExitGateCertification {
  /** True only when EVERY provided stage is certifiable (live-aligned, tracked, satisfied). */
  readonly certified: boolean;
  readonly perStage: readonly StageExitGateReconciliation[];
  /** Union of every stage's certification blockers. */
  readonly blockers: readonly string[];
  /** Stages the live path would over-permissively advance past a blocking rigorous gate. */
  readonly divergentStages: readonly CanonicalStageCode[];
  /** All untracked requirement ids across the provided stages. */
  readonly untrackedRequirementIds: readonly string[];
}

/**
 * Aggregate certification across a set of stages+facts. Any untracked fact or any
 * over-permissive divergence anywhere blocks the whole certification (fail-closed).
 */
export function certifyStageExitGatesReconciled(
  entries: readonly { stage: CanonicalStageCode; facts: StageGateFacts; liveReadinessStatus: LiveReadinessStatus }[],
): StageExitGateCertification {
  const perStage = entries.map((e) => reconcileStageExitGate(e.stage, e.facts, e.liveReadinessStatus));
  const blockers = [...new Set(perStage.flatMap((s) => s.certificationBlockers))];
  const divergentStages = perStage.filter((s) => s.verdict === 'divergent-live-overpermissive').map((s) => s.stage);
  const untrackedRequirementIds = [...new Set(perStage.flatMap((s) => s.untracked))];
  const certified = perStage.length > 0 && perStage.every((s) => s.certifiable);
  return { certified, perStage, blockers, divergentStages, untrackedRequirementIds };
}
