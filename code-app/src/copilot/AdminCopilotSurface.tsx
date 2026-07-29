import { CopilotAssistPanel } from './CopilotAssistPanel';
import { getCopilotConnector, isCopilotSurfaceLive } from './copilotConnector';
import { buildWorkspaceCopilotContext } from './workspaceCopilotContext';

export function AdminCopilotSurface({ userName }: { userName: string }) {
  if (!isCopilotSurfaceLive()) return null;

  const workspace = buildWorkspaceCopilotContext({
    workspaceRole: 'admin',
    userName,
    teamName: undefined,
    deals: [],
    urgentItems: [],
    kpiSummaries: [
      'Operational diagnostics and configuration only',
      'No customer-level records are added by the Copilot surface',
      'Administrative writes remain outside Copilot and require governed confirmation',
    ],
  });
  const proposedActions = getCopilotConnector().assistWorkspace({
    workspace,
    topBlockers: [],
  }).proposed_actions;

  return (
    <section data-copilot-surface="admin-operations">
      <CopilotAssistPanel
        surface="workspace"
        workspaceContext={workspace}
        proposedActions={proposedActions}
      />
    </section>
  );
}
