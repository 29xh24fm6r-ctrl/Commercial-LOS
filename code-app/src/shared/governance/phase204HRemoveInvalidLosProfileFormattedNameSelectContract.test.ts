import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveHasAdminWorkspaceEntitlementForUser,
  buildAdminEntitlementDiagnostic,
  type AdminCurrentUser,
  type AdminEntitlementCandidate,
} from '../../admin/adminWorkspaceEntitlementQuery';

/**
 * PHASE 204H — cr664_losuserprofilename is exposed by the generated model but is
 * NOT selectable on the live cr664_workspaceentitlements table; selecting it failed
 * the entire entitlement query. This contract pins that the live query no longer
 * selects/maps that property, while identity attribution still works via the
 * entitlement-name prefix and the optional legacy profile-id signal.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const QUERY = read('src/admin/adminWorkspaceEntitlementQuery.ts');
const DOC_REL = 'docs/PHASE_204H_REMOVE_INVALID_LOS_PROFILE_FORMATTED_NAME_SELECT.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

const UPN = 'mpaller@oldglorybank.com';
const cu = (over: Partial<AdminCurrentUser> = {}): AdminCurrentUser => ({
  upn: UPN,
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

describe('204H — live query no longer selects/maps cr664_losuserprofilename', () => {
  it('no select list in the file includes the non-selectable formatted property', () => {
    // The string may still appear in comments/the candidate doc, but never inside a
    // select: [...] array nor as a mapped live row field.
    for (const m of QUERY.matchAll(/select:\s*\[([\s\S]*?)\]/g)) {
      expect(m[1]).not.toMatch(/cr664_losuserprofilename/);
    }
    expect(QUERY).not.toMatch(/losUserProfileName:\s*r\.cr664_losuserprofilename/);
  });
  it('the live query still selects the valid fields + the active/admin-full filter', () => {
    expect(QUERY).toMatch(/'_cr664_losuserprofile_value'/);
    expect(QUERY).toMatch(/'cr664_entitlementname'/);
    expect(QUERY).toMatch(/'cr664_accesslevel'/);
    expect(QUERY).toMatch(/statecode eq 0 and \(cr664_accesslevel eq 788190002 or cr664_accesslevel eq 788190000\)/);
  });
});

describe('204H — identity attribution without the profile label', () => {
  it('authorizes Matthew via name prefix and rejects ckingma / generic / owner', () => {
    expect(authorize([eRow({ entitlementName: 'Matthew Paller - Admin Full Access' })])).toBe(true);
    expect(authorize([eRow({ entitlementName: 'ckingma - Admin Full Access' })])).toBe(false);
    expect(authorize([eRow({ entitlementName: 'Executive Admin Access' })])).toBe(false);
    expect(authorize([eRow({ entitlementName: 'Executive Admin Access', ownerName: 'Matthew Paller' })])).toBe(false);
  });
  it('the diagnostic reports query success (not failure) when rows omit the label', () => {
    const d = buildAdminEntitlementDiagnostic({
      currentUser: cu(),
      platformUserFound: true,
      platformUserUsable: true,
      entitlementQuerySuccess: true,
      profileIdsCount: 0,
      entitlements: [eRow({ entitlementName: 'Matthew Paller - Admin Full Access' })],
    });
    expect(d.entitlementQuerySuccess).toBe(true);
    expect(d.finalResult).toBe('entitled');
    expect(d.rows[0]!.losUserProfileName).toBe('(blank)');
  });
});

describe('204H — doc records the non-selectable formatted property', () => {
  it('the doc exists and explains the model-vs-live $select mismatch', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/cr664_losuserprofilename/);
    expect(DOC).toMatch(/\$select|select/);
    expect(DOC).toMatch(/generated model|formatted/i);
  });
  it('keeps GUIDs redacted', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
