import { DealFundingAuthorizationPanel } from './DealFundingAuthorizationPanel';
import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import { evaluateConditionVerificationReadiness } from '../workflow/conditionVerificationTypes';

/**
 * Factory Arc Phase 12 — the DealDataProvider-aware wrapper `BankerDealWorkspace.tsx` mounts.
 * Kept in its OWN file (not inlined into `DealFundingAuthorizationPanel.tsx`) so that file's static
 * import graph stays exactly as it was before this phase: importing `useDealData` there would pull
 * the real `DealDataProvider.tsx` (and, through it, the generated-service SDK graph) into every test
 * that imports `DealFundingAuthorizationPanel.tsx` — including this component's own 9-test suite,
 * which deliberately renders it standalone, unmounted from any provider. This wrapper is the only
 * consumer of `DealDataProvider`'s `refresh`; the base component stays fully self-contained and
 * prop-driven (`onFundingConfirmed`).
 *
 * Final LOS Completion arc (Workstream G) — also reads `conditionVerifications` from context and
 * derives `conditionsPrecedentMet` via `evaluateConditionVerificationReadiness` (Workstream E), so
 * the base panel's funding-readiness gate agrees with the real Condition Verification record
 * instead of the permanently-false placeholder it used before that record existed.
 */
export function DealFundingAuthorizationPanelConnected({
  deal,
  authorized,
  actorEmail,
}: {
  deal: DealDetail;
  authorized: boolean;
  actorEmail: string | undefined;
}) {
  const { refresh, conditionVerifications } = useDealData();
  const conditionVerificationsData =
    conditionVerifications?.kind === 'ready' ? conditionVerifications.data : undefined;
  const conditionsPrecedentMet = evaluateConditionVerificationReadiness(
    conditionVerificationsData,
    deal.id,
  ).conditionsPrecedent.met;
  return (
    <DealFundingAuthorizationPanel
      deal={deal}
      authorized={authorized}
      actorEmail={actorEmail}
      onFundingConfirmed={() => refresh('after-funding-confirmed')}
      conditionsPrecedentMet={conditionsPrecedentMet}
    />
  );
}
