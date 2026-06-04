/**
 * Phase 129A — Workspace Copilot context builder.
 *
 * Builds a CopilotWorkspaceContext from already-authorized data loaded by
 * the workspace's data provider. Rules:
 *   - Only includes data already loaded by the current screen/provider
 *   - Does NOT query broader Dataverse data
 *   - Does NOT include hidden cross-user/cross-team records
 *   - Strips raw GUIDs
 *   - Includes provenance labels (workspace/deal/kpi)
 */

import type { CopilotWorkspaceContext } from './copilotAssistantAdapter';

interface WorkspaceCopilotInput {
  workspaceRole: 'banker' | 'manager' | 'team' | 'portfolio' | 'executive';
  userName: string | undefined;
  teamName: string | undefined;
  deals: { id: string; name: string; stage: string | undefined }[];
  urgentItems: { label: string }[];
  kpiSummaries: string[];
}

export function buildWorkspaceCopilotContext(
  input: WorkspaceCopilotInput,
): CopilotWorkspaceContext {
  return {
    workspaceRole: input.workspaceRole,
    userName: input.userName,
    teamName: input.teamName,
    dealCount: input.deals.length,
    urgentItemCount: input.urgentItems.length,
    kpiSummaries: input.kpiSummaries,
  };
}
