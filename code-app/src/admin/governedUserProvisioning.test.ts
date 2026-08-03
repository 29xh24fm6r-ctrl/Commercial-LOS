import { describe, expect, it } from 'vitest';
import { LOS_PRODUCTION, PROVISIONING_TEMPLATES, normalizeOldGloryUpn, validateProvisioningRequest, type ProvisionLosUserRequest } from './governedUserProvisioning';

function request(overrides: Partial<ProvisionLosUserRequest> = {}): ProvisionLosUserRequest {
  return { microsoftSystemUserId: '11111111-1111-1111-1111-111111111111', upn: 'tester@oldglorybank.com', fullName: 'Production Tester', roleCode: 'Banker', primaryWorkspaceCode: 'Banker Workspace', additionalWorkspaceCodes: [], bankerRequired: true, adminAccessRequired: false, active: true, adminConfirmation: false, environmentId: LOS_PRODUCTION.environmentId, ...overrides };
}

describe('governed user provisioning contract', () => {
  it('pins the exact Commercial LOS Production environment and app', () => {
    expect(LOS_PRODUCTION.environmentId).toBe('afec9c13-e5c5-eea6-b1f7-3f51abb7571d');
    expect(LOS_PRODUCTION.appId).toBe('7870515e-45cb-4b37-bbd1-55fc0b1ff769');
    expect(LOS_PRODUCTION.dataverseUrl).toBe('https://org8c12c949.crm.dynamics.com');
  });

  it('accepts an approved Banker workspace combination and normalizes UPN', () => {
    expect(normalizeOldGloryUpn(' Tester@OldGloryBank.com ')).toBe('tester@oldglorybank.com');
    expect(() => validateProvisioningRequest(request())).not.toThrow();
  });

  it('rejects invalid domains, environment mismatch, and unsupported role/workspace access', () => {
    expect(() => normalizeOldGloryUpn('tester@example.com')).toThrow(/oldglorybank/i);
    expect(() => validateProvisioningRequest(request({ environmentId: 'wrong' as typeof LOS_PRODUCTION.environmentId }))).toThrow(/ENVIRONMENT_MISMATCH/);
    expect(() => validateProvisioningRequest(request({ primaryWorkspaceCode: 'Admin Control Center' }))).toThrow(/ROLE_WORKSPACE_INVALID/);
    expect(() => validateProvisioningRequest(request({ additionalWorkspaceCodes: ['Admin Control Center'] }))).toThrow(/ADDITIONAL_WORKSPACE_INVALID/);
  });

  it('requires explicit confirmation for Admin and never exposes Super Admin', () => {
    expect(() => validateProvisioningRequest(request({ roleCode: 'Admin', primaryWorkspaceCode: 'Admin Control Center', bankerRequired: false, adminAccessRequired: true }))).toThrow(/ADMIN_CONFIRMATION_REQUIRED/);
    expect(() => validateProvisioningRequest(request({ roleCode: 'Admin', primaryWorkspaceCode: 'Admin Control Center', bankerRequired: false, adminAccessRequired: true, adminConfirmation: true }))).not.toThrow();
    expect(Object.values(PROVISIONING_TEMPLATES).some((x) => String(x.roleCode).includes('Super Admin'))).toBe(false);
  });

  it('templates add no silent workspaces', () => {
    for (const template of Object.values(PROVISIONING_TEMPLATES)) expect(template.additionalWorkspaceCodes).toEqual([]);
  });
});
