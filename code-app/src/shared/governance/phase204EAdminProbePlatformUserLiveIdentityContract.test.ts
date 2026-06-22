import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveHasAdminWorkspaceEntitlementForUser,
  matchesCurrentUserIdentity,
  type AdminCurrentUser,
  type AdminEntitlementCandidate,
} from '../../admin/adminWorkspaceEntitlementQuery';

/**
 * PHASE 204E â€” admin probe uses the live PlatformUser identity.
 *
 * Phase 204D fixed the access-level option-set; 204E fixes the deeper identity
 * mismatch with the Phase 115 bootstrap: the probe must resolve the current user
 * from the live cr664_platformuser (by cr664_email), NOT the legacy
 * cr664_user â†’ losuserprofile chain, and must not auto-fail when the legacy core
 * user link is blank. Identity is matched by safe signals only â€” never the owner.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const QUERY = read('src/admin/adminWorkspaceEntitlementQuery.ts');
const DOC_REL = 'docs/PHASE_204E_ADMIN_PROBE_PLATFORMUSER_LIVE_IDENTITY.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

const UPN = 'mpaller@oldglorybank.com';
const cu = (over: Partial<AdminCurrentUser> = {}): AdminCurrentUser => ({
  upn: UPN,
  platformUserId: 'pu-matt',
  fullName: 'Matthew Paller',
  losUserProfileIds: [],
  ...over,
});
const eRow = (over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate => ({
  entitlementName: 'Matthew Paller - Admin Full Access',
  accessLevel: 788190002,
  active: true,
  ...over,
});
const authorize = (e: AdminEntitlementCandidate[], user = cu()) =>
  deriveHasAdminWorkspaceEntitlementForUser({ currentUser: user, entitlements: e });

describe('204E â€” live PlatformUser identity in the probe source', () => {
  it('resolves the current user from cr664_platformuser by cr664_email', () => {
    expect(QUERY).toMatch(/Cr664_platformusersService\.getAll/);
    expect(QUERY).toMatch(/cr664_email eq/);
    expect(QUERY).toMatch(/cr664_fullname/);
  });
  it('does NOT auto-fail on a blank legacy core-user link', () => {
    // The old guard "if (!coreUserId) return { kind: 'not-entitled' }" must be gone.
    expect(QUERY).not.toMatch(/if \(!coreUserId\) return/);
  });
  it('uses the identity-aware deriver with a currentUser, not the legacy-only deriver', () => {
    expect(QUERY).toMatch(/deriveHasAdminWorkspaceEntitlementForUser\(\{\s*currentUser/);
    expect(QUERY).toMatch(/losUserProfileName/);
    expect(QUERY).not.toMatch(/cr664_losuserprofilename/);
  });
  it('stops claiming the legacy chain is authoritative', () => {
    expect(QUERY).toMatch(/Phase 115/);
    expect(QUERY).toMatch(/does NOT require|no longer/i);
  });
});

describe('204E â€” identity-aware authorization (pure)', () => {
  it('authorizes without legacy LOS profile ids via the live label / name signals', () => {
    // label identity + admin shape from Workspace (isolates the label signal)
    expect(authorize([eRow({ losUserProfileName: UPN, entitlementName: 'Generic Access', workspaceName: 'Admin Control Center' })])).toBe(true);
    // user-specific admin name carries both the admin shape and the identity
    expect(authorize([eRow({ entitlementName: 'Matthew Paller - Admin Full Access' })])).toBe(true);
  });
  it('rejects ckingma rows, generic admin names, owner-only, ReadOnly/inactive, and missing access', () => {
    expect(authorize([eRow({ entitlementName: 'ckingma - Admin Full Access', losUserProfileName: 'ckingma@oldglorybank.com' })])).toBe(false);
    expect(authorize([eRow({ entitlementName: 'Executive Admin Access' })])).toBe(false);
    expect(authorize([eRow({ entitlementName: 'Executive Admin Access', ownerName: 'Matthew Paller' })])).toBe(false);
    expect(authorize([eRow({ losUserProfileName: UPN, accessLevel: 788190001 })])).toBe(false);
    expect(authorize([eRow({ losUserProfileName: UPN, active: false })])).toBe(false);
    expect(authorize([eRow({ losUserProfileName: UPN, accessLevel: undefined })])).toBe(false);
  });
  it('owner is never an identity signal', () => {
    expect(
      matchesCurrentUserIdentity(cu(), eRow({ entitlementName: 'Generic', ownerName: 'Matthew Paller' })),
    ).toBe(false);
  });
});

describe('204E â€” doc records the identity-chain fix', () => {
  it('the doc exists and contrasts 204D (access level) with 204E (identity chain)', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/PlatformUser/);
    expect(DOC).toMatch(/Phase 115/);
    expect(DOC).toMatch(/204D/);
  });
  it('keeps GUIDs redacted', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
