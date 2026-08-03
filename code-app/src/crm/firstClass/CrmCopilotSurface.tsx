import { CopilotAssistPanel } from '../../copilot/CopilotAssistPanel';
import type { CrmWorkspaceData } from '../workspace/crmWorkspaceData';
import { buildCrmCopilotContext } from './crmCopilotContext';
import type { CopilotWorkspaceContext } from '../../copilot/copilotAssistantAdapter';
import { getCopilotConnector, isCopilotSurfaceLive } from '../../copilot/copilotConnector';

export function CrmCopilotSurface({ data, role, userName, focus }: { data: CrmWorkspaceData; role: CopilotWorkspaceContext['workspaceRole']; userName: string;
  focus?: { readonly kind: 'Company' | 'Person'; readonly id: string; readonly title: string };
}) {
  if (!isCopilotSurfaceLive()) return null;
  const context = buildCrmCopilotContext(data, role, userName, focus);
  const proposedActions = getCopilotConnector().assistWorkspace({
    workspace: context.workspace,
    topBlockers: [],
  }).proposed_actions;
  return <section className="crmws__copilot">
    <CopilotAssistPanel surface="workspace" workspaceContext={context.workspace} proposedActions={proposedActions} defaultExpanded={Boolean(focus)} />
    <div className="crmws__sourceLedger">
      <h3>Sources and freshness</h3>
      {context.sources.map((source) => <div key={`${source.type}-${source.source}`}><strong>{source.type}: {source.label}</strong><span>{source.source}</span><time>{source.freshness}</time></div>)}
      <p>Copilot can summarize, prepare, suggest, and draft. It cannot modify CRM records, send communications, schedule meetings, convert opportunities, create deals, or complete activities. Any action requires a separate human-confirmed governed workflow.</p>
    </div>
  </section>;
}
