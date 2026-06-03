/**
 * Phase 129A — Deal Copilot context builder.
 *
 * Builds a CopilotDealContext from the already-authorized data loaded by
 * DealDataProvider. Rules:
 *   - Only includes data already loaded by the current screen/provider
 *   - Does NOT query broader Dataverse data
 *   - Does NOT include hidden cross-user/cross-team records
 *   - Strips raw GUIDs unless required for route links
 *   - Includes provenance labels (deal/task/document/blocker)
 */

import type { CopilotDealContext } from './copilotAssistantAdapter';
import type { DealDetail } from '../deals/dealQueries';

interface DealCopilotInput {
  deal: DealDetail;
  tasks: { id: string; title: string; isComplete: boolean }[];
  documents: { id: string; name: string; status: string }[];
  blockers: { label: string }[];
}

export function buildDealCopilotContext(input: DealCopilotInput): CopilotDealContext {
  const openTasks = input.tasks.filter((t) => !t.isComplete);
  const outstandingDocs = input.documents.filter(
    (d) => d.status === 'Outstanding' || d.status === 'Requested',
  );

  return {
    dealName: input.deal.name,
    clientName: input.deal.clientName,
    stage: input.deal.stage,
    status: input.deal.status,
    amount: input.deal.amount,
    taskCount: input.tasks.length,
    openTaskCount: openTasks.length,
    documentCount: input.documents.length,
    outstandingDocumentCount: outstandingDocs.length,
    blockerCount: input.blockers.length,
    blockerSummaries: input.blockers.map((b) => b.label),
  };
}
