import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import { CRM_SECTIONS } from './crmWorkspaceModel';
import { crmSectionPath, crmSidebarDestination } from './crmShellNavigation';

describe('CRM shared Lending OS shell regression', () => {
  it('keeps CRM-owned navigation inside the independent CRM workspace', () => {
    expect(crmSidebarDestination('crm-hub', WORKSPACE_ROUTES.banker)).toEqual({
      route: `${WORKSPACE_ROUTES.crm}/home`,
    });
    expect(crmSidebarDestination('activity', WORKSPACE_ROUTES.banker).route).toBe(
      `${WORKSPACE_ROUTES.crm}/activities`,
    );
  });

  it('returns lending destinations to the authenticated primary workspace with tab state', () => {
    expect(crmSidebarDestination('loan-workflow', WORKSPACE_ROUTES.banker)).toEqual({
      route: WORKSPACE_ROUTES.banker,
      state: { initialTab: 'loan-workflow' },
    });
  });

  it('builds absolute top-nav paths so links never nest under the current CRM section', () => {
    expect(CRM_SECTIONS.map(crmSectionPath)).toEqual([
      '/workspaces/crm/home',
      '/workspaces/crm/companies',
      '/workspaces/crm/people',
      '/workspaces/crm/relationships',
      '/workspaces/crm/opportunities',
      '/workspaces/crm/activities',
      '/workspaces/crm/referrals',
      '/workspaces/crm/calendar',
      '/workspaces/crm/tasks',
      '/workspaces/crm/insights',
      '/workspaces/crm/reports',
    ]);
  });

  it('mounts CRM inside the shared static sidebar and marks CRM active', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/crm/firstClass/CrmWorkspace.tsx'), 'utf8');
    expect(source).toMatch(/<LendingOSLayout/);
    expect(source).toMatch(/activeNav="crm-hub"/);
    expect(source).toMatch(/workspaceLinks=\{links\}/);
  });
});
