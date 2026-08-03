import type { CrmWorkspaceData } from '../workspace/crmWorkspaceData';
import type { CopilotWorkspaceContext } from '../../copilot/copilotAssistantAdapter';
import { deriveCrmHome } from './crmWorkspaceSelectors';

export interface CrmCopilotSource {
  readonly type: 'CRM record' | 'Derived observation';
  readonly label: string;
  readonly source: string;
  readonly freshness: string;
}

export interface CrmCopilotContext {
  readonly workspace: CopilotWorkspaceContext;
  readonly sources: readonly CrmCopilotSource[];
  readonly boundary: 'read-only-proposal';
}

export function buildCrmCopilotContext(
  data: CrmWorkspaceData,
  role: CopilotWorkspaceContext['workspaceRole'],
  userName: string,
  focus?: { readonly kind: 'Company' | 'Person'; readonly id: string; readonly title: string },
): CrmCopilotContext {
  const home = deriveCrmHome(data);
  const latest = data.timelineEvents.status === 'ready' ? data.timelineEvents.records.find((r) => r.occurredAt) : undefined;
  const sources: CrmCopilotSource[] = [
    { type:'CRM record', label:`${home.companyCount ?? 'Unavailable'} companies`, source:'cr664_crmorganizations (authorized bounded read)', freshness:'Current workspace load' },
    { type:'CRM record', label:`${home.relationshipCount ?? 'Unavailable'} active relationships`, source:'cr664_crmrelationships (authorized bounded read)', freshness:'Current workspace load' },
    { type:'CRM record', label:`${home.recentActivityCount ?? 'Unavailable'} recent activities`, source:'cr664_crmtimelineevents (authorized bounded read)', freshness:latest?.occurredAt ?? 'No dated event returned' },
    { type:'Derived observation', label:`${home.attention.length} contact/activity coverage gaps`, source:'Deterministic 45-day activity and linked-person rules', freshness:'Derived from current workspace load' },
  ];
  if (focus) sources.unshift(
    { type: 'CRM record', label: `Focused ${focus.kind}: ${focus.title}`, source: `authorized CRM ${focus.kind.toLowerCase()} record`, freshness: 'Current record load' },
  );
  return {
    workspace: {
      workspaceRole: role,
      userName,
      teamName: undefined,
      dealCount: 0,
      urgentItemCount: home.attention.length,
      kpiSummaries: sources.map((s) => `${s.label} — ${s.source}`),
    },
    sources,
    boundary:'read-only-proposal',
  };
}
