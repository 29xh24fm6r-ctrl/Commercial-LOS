import { useMemo } from 'react';
import { useDealData } from '../deals/DealDataProvider';
import { useOptionalDealIntelligence } from '../shared/dealIntelligenceContext';
import { buildDealCopilotContext } from './dealCopilotContext';
import { CopilotAssistPanel } from './CopilotAssistPanel';
import { getCopilotConnector } from './copilotConnector';
import type { CopilotDealAssistContext } from './copilotAssistContext';

/**
 * Phase 130A — Deal cockpit Copilot connector.
 *
 * Thin placement adapter that wires the already-built Phase 129A
 * `CopilotAssistPanel` into the Banker Deal Workspace right rail. It
 * reads ONLY the data already loaded by `DealDataProvider` (deal,
 * tasks, documents) plus the shared deal-intelligence view-model
 * (blocker labels), runs the already-built `buildDealCopilotContext`
 * projection, and hands the result to the panel.
 *
 * Discipline:
 *   - No new Dataverse query. No loader. Consumes existing context.
 *   - No write affordance — the panel is the read-only, not-configured
 *     Copilot assistant. It cannot approve, mutate, email, complete
 *     tasks, or request documents.
 *   - No raw GUID leakage — `buildDealCopilotContext` emits only
 *     labels + counts; record ids are dropped by the builder.
 *   - Renders nothing surprising while data is loading: tasks /
 *     documents that haven't resolved contribute zero counts, exactly
 *     as the not-configured local summary should reflect.
 */
export function DealCopilotAssist() {
  const { deal, tasks, documents } = useDealData();
  const vm = useOptionalDealIntelligence();

  const context = useMemo(() => {
    const taskList =
      tasks.kind === 'ready'
        ? [
            ...tasks.data.open.map((t) => ({
              id: t.id,
              title: t.title,
              isComplete: false,
            })),
            ...tasks.data.completed.map((t) => ({
              id: t.id,
              title: t.title,
              isComplete: true,
            })),
          ]
        : [];
    const documentList =
      documents.kind === 'ready'
        ? [
            ...documents.data.outstanding.map((d) => ({
              id: d.id,
              name: d.name,
              status: 'Outstanding',
            })),
            ...documents.data.received.map((d) => ({
              id: d.id,
              name: d.name,
              status: 'Received',
            })),
            ...documents.data.reviewed.map((d) => ({
              id: d.id,
              name: d.name,
              status: 'Reviewed',
            })),
          ]
        : [];
    const blockers = vm
      ? vm.blockerSignals.map((s) => ({ label: s.label }))
      : [];
    return buildDealCopilotContext({
      deal,
      tasks: taskList,
      documents: documentList,
      blockers,
    });
  }, [deal, tasks, documents, vm]);

  // SPEC-COPILOT-LIVE-CONNECTOR — build the richer, read-only assist
  // context from the SAME already-loaded VM (no new query). `bie` stays
  // undefined: there is no authorized committee-evidence loader in this
  // repo yet, so the deal context carries no BIE block in production. The
  // governed connector returns confirmation-required proposals only when
  // a live mode is configured; in the default not_configured posture it
  // returns none, so the panel renders no proposals.
  const proposedActions = useMemo(() => {
    const riskFlags = vm
      ? vm.blockerSignals
          .filter((s) => s.severity === 'blocked' || s.severity === 'at-risk')
          .map((s) => s.label)
      : [];
    const assistContext: CopilotDealAssistContext = {
      deal: context,
      riskFlags,
      readinessBlockers: context.blockerSummaries,
      nextBestAction: vm?.nextBestAction?.label,
      bie: undefined,
    };
    return getCopilotConnector().assistDeal(assistContext).proposed_actions;
  }, [context, vm]);

  // Phase 130B — the deal cockpit opens the assistant expanded so the
  // banker immediately sees the read-only quick actions + the honest
  // not-configured state. The command-center surfaces stay collapsed
  // (compact) by default.
  return (
    <CopilotAssistPanel
      surface="deal"
      dealContext={context}
      proposedActions={proposedActions}
      defaultExpanded
    />
  );
}
