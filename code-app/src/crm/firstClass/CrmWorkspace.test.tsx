import { describe, expect, it } from 'vitest';
import { CRM_SECTIONS } from './crmWorkspaceModel';
import { WORKSPACE_ROUTES, resolveWorkspaceRoute } from '../../bootstrap/workspaceRoutes';

describe('CRM-1 first-class workspace contract', () => {
  it('owns an independent deep-linkable route and complete navigation model', () => {
    expect(WORKSPACE_ROUTES.crm).toBe('/workspaces/crm');
    expect(resolveWorkspaceRoute('CRM Workspace')).toBe(WORKSPACE_ROUTES.crm);
    expect(CRM_SECTIONS).toEqual([
      'home','companies','people','relationships','opportunities','activities',
      'referrals','calendar','tasks','insights','reports',
    ]);
  });

  it('does not replace or alias the banker workspace route', () => {
    expect(WORKSPACE_ROUTES.crm).not.toBe(WORKSPACE_ROUTES.banker);
  });
});
