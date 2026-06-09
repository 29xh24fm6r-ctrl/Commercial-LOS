/**
 * Phase 142B — Workspace capability group deriver.
 *
 * PURE, READ-ONLY. Groups platform objects/views/routes/profiles into capability
 * groups with honest shipped-vs-planned states. Metadata only — no data fetch,
 * no route registration, no fake shipped state; planned stays planned and
 * disabled stays disabled.
 */

import { PLATFORM_OBJECT_REGISTRY } from './platformObjectRegistry';
import { PLATFORM_VIEW_REGISTRY } from './platformViewRegistry';
import { WORKFLOW_ROUTE_REGISTRY } from '../workflow/workflowRouteRegistry';
import { PRODUCT_PROCESS_REGISTRY } from './productProcessRegistry';
import { deriveCompetitiveImplementationBacklog } from '../competitive/deriveCompetitiveImplementationBacklog';
import type { PlatformWorkspaceCapabilityGroup } from './platformSurfaceTypes';

interface GroupSpec {
  groupKey: string;
  displayName: string;
  domains?: readonly string[];
  ownerWorkspaces?: readonly string[];
  routeKeys?: readonly string[];
  profileKeys?: readonly string[];
  shipped: readonly string[];
  planned: readonly string[];
}

const GROUP_SPECS: readonly GroupSpec[] = [
  { groupKey: 'banker_workspace', displayName: 'Banker Workspace', ownerWorkspaces: ['banker'], shipped: ['Deal workspace', 'Document collection', 'Annual review'], planned: ['Configurable workflow routing'] },
  { groupKey: 'manager_workspace', displayName: 'Manager Workspace', ownerWorkspaces: ['manager'], shipped: ['Exception queue', 'Portfolio monitoring'], planned: ['Credit committee route'] },
  { groupKey: 'portfolio_workspace', displayName: 'Portfolio Workspace', domains: ['portfolio_boarding', 'monitoring'], shipped: ['Portfolio boarded-loan SOR'], planned: ['Servicing/lifecycle model'] },
  { groupKey: 'team_workspace', displayName: 'Team Workspace', ownerWorkspaces: ['team'], shipped: ['Team queues'], planned: ['Team capability views'] },
  { groupKey: 'executive_workspace', displayName: 'Executive Workspace', ownerWorkspaces: ['executive'], shipped: ['Executive command center'], planned: ['Executive product strategy surface'] },
  { groupKey: 'crm_relationship_master', displayName: 'CRM / Relationship Master', domains: ['crm'], shipped: ['CRM Relationship Master', 'Contact readiness', 'Recipient resolver'], planned: ['CRM operator UI'] },
  { groupKey: 'annual_review', displayName: 'Annual Review', domains: ['annual_review'], profileKeys: ['annual_review_standard', 'annual_review_covenant_exception'], shipped: ['Annual review workflow', 'Financial spreading', 'Covenant testing', 'Memo package'], planned: ['Operator review queue'] },
  { groupKey: 'portfolio_boarding', displayName: 'Portfolio Boarding', domains: ['portfolio_boarding'], profileKeys: ['portfolio_boarded_loan'], shipped: ['Portfolio boarded-loan system of record'], planned: ['Servicing lifecycle'] },
  { groupKey: 'fdic_examiner_packages', displayName: 'FDIC / Examiner Packages', domains: ['annual_review'], profileKeys: ['fdic_exam_prep'], shipped: ['FDIC/examiner package automation', 'Board package automation'], planned: ['Examiner package export (disabled)'] },
  { groupKey: 'platform_admin_strategy', displayName: 'Platform / Admin Strategy', shipped: ['Governed object/view metadata', 'Competitive matrix'], planned: ['Admin configuration review queue'] },
];

function objectsForGroup(spec: GroupSpec): string[] {
  return PLATFORM_OBJECT_REGISTRY.filter(
    (o) => (spec.domains?.includes(o.domain) ?? false) || (spec.ownerWorkspaces?.includes(o.ownerWorkspace) ?? false),
  ).map((o) => o.objectKey);
}

function viewsForGroup(objectKeys: readonly string[], spec: GroupSpec): string[] {
  return PLATFORM_VIEW_REGISTRY.filter(
    (v) => objectKeys.includes(v.objectKey) || (spec.ownerWorkspaces?.includes(v.workspace) ?? false),
  ).map((v) => v.viewKey);
}

export function deriveWorkspaceCapabilityGroups(): readonly PlatformWorkspaceCapabilityGroup[] {
  const backlog = deriveCompetitiveImplementationBacklog();
  const profileKeysAll = new Set(PRODUCT_PROCESS_REGISTRY.map((p) => p.profileKey));
  const routeKeysAll = new Set(WORKFLOW_ROUTE_REGISTRY.map((r) => r.routeKey));

  return GROUP_SPECS.map((spec) => {
    const objects = objectsForGroup(spec);
    const views = viewsForGroup(objects, spec);
    const productProfiles = (spec.profileKeys ?? []).filter((k) => profileKeysAll.has(k));
    const workflowRoutes = (spec.routeKeys ?? []).filter((k) => routeKeysAll.has(k));
    return {
      groupKey: spec.groupKey,
      displayName: spec.displayName,
      objects,
      views,
      workflowRoutes,
      productProfiles,
      shippedCapabilities: spec.shipped,
      plannedCapabilities: spec.planned,
      blockers: [],
      nextRecommendedPhases: backlog.recommendedPhases.slice(0, 3),
    };
  });
}
