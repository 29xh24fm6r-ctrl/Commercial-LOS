import type { LendingOSNavKey } from '../../banker/LendingOSLayout';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';

export interface CrmSidebarDestination {
  readonly route: string;
  readonly state?: { readonly initialTab: LendingOSNavKey };
}

/**
 * CRM keeps the shared Lending OS chrome while routing CRM-owned destinations
 * locally and returning lending destinations to the authenticated user's
 * primary workspace. No deal selection is introduced.
 */
export function crmSidebarDestination(
  navKey: LendingOSNavKey,
  primaryWorkspaceRoute: string,
): CrmSidebarDestination {
  if (navKey === 'crm-hub') return { route: `${WORKSPACE_ROUTES.crm}/home` };
  if (navKey === 'activity') return { route: `${WORKSPACE_ROUTES.crm}/activities` };
  if (navKey === 'relationships') return { route: `${WORKSPACE_ROUTES.crm}/relationships` };
  return { route: primaryWorkspaceRoute, state: { initialTab: navKey } };
}
