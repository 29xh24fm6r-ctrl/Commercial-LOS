import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(resolve('dataverse-plugins/CommercialLendingLOS.Plugins/LosUserProvisioningCustomApiRegistration.json'), 'utf8')) as { pluginType: string; apis: { uniqueName: string; requestParameters: { uniqueName: string }[] }[] };
const plugin = readFileSync(resolve('dataverse-plugins/CommercialLendingLOS.Plugins/LosUserProvisioningCustomApiPlugin.cs'), 'utf8');
const registration = readFileSync(resolve('scripts/dataverse/register-los-user-provisioning-custom-apis.ps1'), 'utf8');

describe('LOS user provisioning deployment artifacts', () => {
  it('registers one server host for identity verification and transactional provisioning', () => {
    expect(manifest.pluginType).toBe('CommercialLendingLOS.Plugins.LosUserProvisioningCustomApiPlugin');
    expect(manifest.apis.map((x) => x.uniqueName)).toEqual(['cr664_VerifyLosUserIdentity', 'cr664_ProvisionLosUser']);
    expect(manifest.apis[0].requestParameters.map((x) => x.uniqueName)).toEqual(['Upn', 'EnvironmentId']);
    expect(manifest.apis[1].requestParameters.map((x) => x.uniqueName)).toEqual(['RequestJson']);
  });

  it('pins Production, authenticates the initiating actor, uses ExecuteTransaction, and denies Super Admin', () => {
    expect(plugin).toContain('afec9c13-e5c5-eea6-b1f7-3f51abb7571d');
    expect(plugin).toMatch(/CreateOrganizationService\(context\.InitiatingUserId\)/);
    expect(plugin).toMatch(/ExecuteTransactionRequest/);
    expect(plugin).toMatch(/SUPER_ADMIN_PROHIBITED/);
    expect(plugin).not.toMatch(/CreateOrganizationService\(null\)/);
  });

  it('hash-gates registration and validates the exact Production URL', () => {
    expect(registration).toMatch(/ExpectedAssemblySha256/);
    expect(registration).toMatch(/ExpectedManifestSha256/);
    expect(registration).toContain('https://org8c12c949.crm.dynamics.com');
    expect(registration).toMatch(/Custom API readback failed/);
    expect(registration).toMatch(/\$ErrorActionPreference='Stop'/);
    expect(registration).toMatch(/Invoke-RestMethod -Method Get -Uri/);
    expect(registration).toMatch(/Invoke-RestMethod -Method Post -Uri/);
    expect(registration).toMatch(/Invoke-RestMethod -Method Patch -Uri/);
    expect(registration).not.toMatch(/Invoke-RestMethod (Get|Post|Patch) /);
  });
});
