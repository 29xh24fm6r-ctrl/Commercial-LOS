import { useDealData } from '../deals/DealDataProvider';
import { WorkflowRoutingPanel } from './WorkflowRoutingPanel';
import { deriveConfigurableWorkflowRoute } from './deriveConfigurableWorkflowRoute';
import { buildWorkflowRoutingInputFromDeal } from './buildWorkflowRoutingInputFromDeal';

/**
 * Phase 142C (live wiring) — mounts the read-only configurable workflow-
 * routing engine against the live deal in scope. PURE presentation glue: it
 * reads the deal already loaded by DealDataProvider, maps it to a
 * WorkflowRoutingInput, derives the route, and hands the result to the
 * unmodified WorkflowRoutingPanel. No fetch, no writes.
 */
export function DealWorkflowRoutingPanel() {
  const { deal } = useDealData();
  const route = deriveConfigurableWorkflowRoute({ input: buildWorkflowRoutingInputFromDeal(deal) });
  return <WorkflowRoutingPanel route={route} />;
}
