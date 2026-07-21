import { useEffect, useState } from 'react';
import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { StageWorkflowControl } from '../workflow/StageWorkflowControl';
import { loadStageOrdering } from './stageProgressionAvailabilityLoader';
import { recognizeCanonicalStage, canonicalStageByCode, type StageOrderingResult } from '../workflow/stageOrderingContract';
import { recognizeCanonicalStatus, canonicalStatusName } from '../workflow/statusReferenceContract';
import {
  executeCanonicalStageTransition,
  type CanonicalTransitionOutcome,
  type CanonicalTransitionRequest,
} from '../workflow/canonicalStageTransition';
import { buildLiveCanonicalTransitionDeps } from './buildLiveCanonicalTransitionDeps';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUTO_STAGE_ADVANCE_ENABLED } from './dealOriginationFeatureFlags';

/**
 * Governance initiative (2026-07-21) — mounts the RETURN/DECLINE/WITHDRAW workflows as first-class
 * lifecycle actions in the live banker deal workspace, completing the ARC Phase 1 gap
 * `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` and
 * `docs/E2E_CERTIFICATION_REPORT_2026-07-21.md` (D2) both named: these actions were built and
 * tested (`canonicalStageTransition.ts`, `buildLiveCanonicalTransitionDeps.ts`) but had no live UI
 * mount. `showAdvance={false}` — forward Advance stays on `DealStageProgressionCard.tsx`'s
 * shallow-engine control, which the live write path actually uses; mounting a second, deep-gate
 * Advance button here would show two controls that can legitimately disagree (see
 * `StageWorkflowControl.tsx`'s `showAdvance` doc comment).
 *
 * Fail-closed like every other governed surface in this app: an unresolved stage/status, an
 * unresolved actor, or an unseeded ordering table renders the honest unavailable/disabled state
 * `StageWorkflowControl` already provides — never a guess.
 */
export function DealGovernedTransitionPanel() {
  const { deal, refresh, applyVerifiedDealPatch } = useDealData();
  const banker = useOptionalBanker();
  const [ordering, setOrdering] = useState<StageOrderingResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStageOrdering().then((result) => {
      if (!cancelled) setOrdering(result);
    });
    return () => {
      cancelled = true;
    };
    // Reload if the operator seeds/reseeds the reference table mid-session and the deal changes.
  }, [deal.id]);

  if (!ordering) return null; // Loading — the card above already shows the deal's stage.

  const currentStage = recognizeCanonicalStage(deal.stage)?.code;
  const currentStatus = recognizeCanonicalStatus(deal.status);

  if (!currentStatus) {
    // Fail-closed, honestly: an unrecognized status string means we genuinely do not know whether
    // this deal is terminal. Never default to OPEN (see recognizeCanonicalStatus's own doc).
    return (
      <section aria-label="Stage workflow" data-stage-control data-stage-status-unrecognized>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-text-muted)' }}>
          This deal's status ("{deal.status ?? 'unknown'}") does not match a recognized governed
          disposition — Return/Decline/Withdraw are unavailable until an operator reconciles the
          status reference data.
        </p>
      </section>
    );
  }

  async function handleTransition(request: CanonicalTransitionRequest): Promise<CanonicalTransitionOutcome> {
    if (!ordering || ordering.status !== 'ready') {
      return { kind: 'dependency_not_ready', detail: 'Stage ordering is not available.' };
    }
    if (!banker?.systemUserId) {
      return { kind: 'unauthorized', detail: banker?.writeDisabledReason ?? 'Your identity could not be resolved for this action.' };
    }
    const deps = buildLiveCanonicalTransitionDeps({ actorSystemUserId: banker.systemUserId, actorEmail: banker.email });
    const outcome = await executeCanonicalStageTransition({
      request,
      ordering,
      authorized: Boolean(banker.systemUserId),
      enabled: AUTO_STAGE_ADVANCE_ENABLED,
      dealId: deal.id,
      correlationId: newCorrelationId('gov'),
      entryDateIso: new Date().toISOString(),
      transport: deps.transport,
      auditSink: deps.auditSink,
      timelineSink: deps.timelineSink,
    });
    if (outcome.kind === 'transitioned') {
      // Merge the readback-verified state into the shared context FIRST — every cockpit surface
      // reads the deal off DealDataProvider, which `refresh()` never reloads on its own. Mirrors
      // DealStageProgressionCard's post-advance patch pattern exactly (ADVANCE/RETURN move the
      // stage; DECLINE/WITHDRAW change only the status).
      applyVerifiedDealPatch?.(
        outcome.to
          ? { stage: canonicalStageByCode(outcome.to)?.name ?? outcome.to, status: canonicalStatusName(outcome.status) }
          : { status: canonicalStatusName(outcome.status) },
      );
      refresh('activity');
    }
    return outcome;
  }

  return (
    <StageWorkflowControl
      ordering={ordering}
      currentStage={currentStage}
      currentStatus={currentStatus}
      gateFacts={{}}
      authorized={Boolean(banker?.systemUserId)}
      liveEnabled
      showAdvance={false}
      onTransition={handleTransition}
    />
  );
}
