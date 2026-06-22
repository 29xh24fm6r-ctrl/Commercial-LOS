import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveHasAdminWorkspaceEntitlement,
  strictAdminEntitlementName,
  type AdminEntitlementCandidate,
} from '../../admin/adminWorkspaceEntitlementQuery';

/**
 * PHASE 204C — admin entitlement live row shape contract.
 *
 * The live Workspace lookup is optional/blank; the entitlement NAME carries admin
 * meaning. Authorization passes on workspace-resolves-admin OR strict-admin-name,
 * but ALWAYS subject to active + LOS-profile-match + Admin/Full gates. Never from
 * name, access level, or owner alone.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const DOC_REL = 'docs/PHASE_204C_ADMIN_ENTITLEMENT_LIVE_ROW_SHAPE_RESOLVER.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

const MATT = ['profile-matt'];
const live = (over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate => ({
  entitlementName: 'Matthew Paller - Admin Full Access',
  accessLevelName: 'Admin',
  workspaceName: undefined,
  losUserProfileId: 'profile-matt',
  active: true,
  ...over,
});
const authorize = (e: AdminEntitlementCandidate[], p = MATT) =>
  deriveHasAdminWorkspaceEntitlement({ userLosProfileIds: p, entitlements: e });

describe('204C — strict admin name resolver', () => {
  it('admin-access names resolve true; non-admin/unsafe names resolve false', () => {
    for (const n of ['Admin Full Access', 'Executive Admin Access', 'Admin Control Center Access', 'Matthew Paller - Admin Full Access']) {
      expect(strictAdminEntitlementName(n), n).toBe(true);
    }
    for (const n of ['Banker Full Access', 'Team Member Full Access', 'Manager ReadOnly Access', 'Administrator Reporting Access', undefined]) {
      expect(strictAdminEntitlementName(n), String(n)).toBe(false);
    }
  });
});

describe('204C — authorization over the blank-Workspace live row shape', () => {
  it('authorizes on admin name with blank Workspace at Admin or Full', () => {
    expect(authorize([live({ accessLevelName: 'Admin' })])).toBe(true);
    expect(authorize([live({ accessLevelName: 'Full' })])).toBe(true);
  });
  it('still authorizes when Workspace = Admin Control Center even with a generic name', () => {
    expect(authorize([live({ workspaceName: 'Admin Control Center', entitlementName: 'Generic Access' })])).toBe(true);
  });
  it('does not authorize from name alone — gates still apply', () => {
    expect(authorize([live({ accessLevelName: 'ReadOnly' })])).toBe(false); // access gate
    expect(authorize([live({ active: false })])).toBe(false); // active gate
    expect(authorize([live({ losUserProfileId: 'someone-else' })], MATT)).toBe(false); // profile gate (owner/other)
    expect(authorize([live()], [])).toBe(false); // no profile → fail closed
  });
  it('a non-admin name with blank Workspace never authorizes', () => {
    expect(authorize([live({ entitlementName: 'Banker Full Access' })])).toBe(false);
    expect(authorize([live({ entitlementName: 'Team Member Full Access' })])).toBe(false);
  });
});

describe('204C — query uses the entitlement name (not just Workspace)', () => {
  it('the probe selects the entitlement name field and uses the strict name resolver', () => {
    const src = read('src/admin/adminWorkspaceEntitlementQuery.ts');
    expect(src).toMatch(/cr664_entitlementname/);
    expect(src).toMatch(/strictAdminEntitlementName\(e\.entitlementName\)/);
    // Workspace is no longer a hard requirement (OR with the name resolver).
    expect(src).toMatch(/resolveWorkspaceRoute\(e\.workspaceName\) === WORKSPACE_ROUTES\.admin \|\|/);
  });
});

describe('204C — doc records the live row shape', () => {
  it('the doc exists and explains the live shape + strict model', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/Workspace.*optional|optional.*Workspace/i);
    expect(DOC).toMatch(/Matthew Paller - Admin Full Access/);
    expect(DOC).toMatch(/blank.*acceptable|Workspace.*blank/i);
    expect(DOC).toMatch(/Status.*Active|Active/);
    expect(DOC).toMatch(/IsDefault.*No|No.*IsDefault/);
    expect(DOC).toMatch(/never.*Owner|not.*Owner|Owner.*never/i);
  });
  it('keeps GUIDs redacted', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
