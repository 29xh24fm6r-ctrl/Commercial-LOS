import type { BankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import type { BankerWorkQueueData } from '../banker/workQueueQueries';
import { CopilotAssistPanel } from './CopilotAssistPanel';
import { getCopilotConnector, isCopilotSurfaceLive } from './copilotConnector';
import { buildWorkspaceCopilotContext } from './workspaceCopilotContext';
import { EmailServiceRequestMonitor } from './EmailServiceRequestMonitor';

export function BankerCopilotSurface({
  data,
  kpis,
  userName,
  systemUserId,
}: {
  data: BankerWorkQueueData;
  kpis: BankerPersonalActivity;
  userName: string;
  systemUserId?: string;
}) {
  if (!isCopilotSurfaceLive()) return null;

  const workspace = buildWorkspaceCopilotContext({
    workspaceRole: 'banker',
    userName,
    teamName: undefined,
    deals: data.deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
    })),
    urgentItems: Array.from({ length: kpis.urgentItemCount }, (_, index) => ({
      label: `Urgent item ${index + 1}`,
    })),
    kpiSummaries: [
      `${kpis.openTaskCount} open task(s)`,
      `${kpis.overdueTaskCount} overdue task(s)`,
      `${kpis.outstandingDocumentCount} outstanding document(s)`,
      `${kpis.closingSoonCount} deal(s) closing soon`,
      `${kpis.staleActivityCount} deal(s) with stale activity`,
    ],
  });
  const topBlockers = [
    ...(kpis.overdueTaskCount ? [`${kpis.overdueTaskCount} overdue task(s)`] : []),
    ...(kpis.outstandingDocumentCount ? [`${kpis.outstandingDocumentCount} outstanding document(s)`] : []),
    ...(kpis.pastTargetCloseCount ? [`${kpis.pastTargetCloseCount} deal(s) past target close`] : []),
  ];
  const proposedActions = getCopilotConnector().assistWorkspace({
    workspace,
    topBlockers,
  }).proposed_actions;

  return (
    <section data-copilot-surface="banker-command-center">
      <CopilotAssistPanel
        surface="workspace"
        workspaceContext={workspace}
        proposedActions={proposedActions}
      />
      {systemUserId && <EmailServiceRequestMonitor assigneeSystemUserId={systemUserId} />}
    </section>
  );
}
