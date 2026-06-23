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
 * PHASE 204K — direct Dataverse Web API testing proved that selecting the formatted
 * display/name fields (cr664_workspacename, cr664_losuserprofilename) FAILS the
 * cr664_workspaceentitlements query, while a read of exactly four fields succeeds
 * and returns the real admin row. This contract pins the four-field read and that
 * admin attribution survives without any workspace display name.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const QUERY = read('src/admin/adminWorkspaceEntitlementQuery.ts');
const DOC_REL = 'docs/PHASE_204K_WORKSPACE_ENTITLEMENT_FOUR_FIELD_READ.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

const FOUR = ['cr664_entitlementname', 'cr664_accesslevel', '_cr664_losuserprofile_value', 'statecode'];

/** Every workspace-entitlement select: [...] array in the probe source. */
function selectArrays(): string[] {
  return [...QUERY.matchAll(/Cr664_workspaceentitlementsesService\.getAll\(\{[\s\S]*?select:\s*\[([\s\S]*?)\]/g)].map(
    (m) => m[1]!,
  );
}

const UPN = 'mpaller@oldglorybank.com';
const cu = (over: Partial<AdminCurrentUser> = {}): AdminCurrentUser => ({ upn: UPN, fullName: 'Matthew Paller', losUserProfileIds: [], ...over });
const eRow = (over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate => ({
  entitlementName: 'Matthew Paller - Admin Full Access',
  accessLevel: 788190002,
  active: true,
  ...over,
});
const authorize = (e: AdminEntitlementCandidate[], user = cu()) =>
  deriveHasAdminWorkspaceEntitlementForUser({ currentUser: user, entitlements: e });

describe('204K — workspace-entitlement reads select exactly the four safe fields', () => {
  it('finds at least the probe + diagnostic select lists', () => {
    expect(selectArrays().length).toBeGreaterThanOrEqual(2);
  });
  it('no select list contains cr664_workspacename or cr664_losuserprofilename', () => {
    for (const arr of selectArrays()) {
      expect(arr).not.toMatch(/cr664_workspacename/);
      expect(arr).not.toMatch(/cr664_losuserprofilename/);
    }
  });
  it('every select list contains exactly the four safe fields', () => {
    for (const arr of selectArrays()) {
      const fields = [...arr.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
      expect(fields.slice().sort()).toEqual([...FOUR].sort());
    }
  });
  it('does not map workspaceName from the live row', () => {
    expect(QUERY).not.toMatch(/workspaceName:\s*r\.cr664_workspacename/);
  });
});

describe('204K — admin attribution without a workspace display name', () => {
  it('Matthew name row authorizes; ckingma / generic / owner do not', () => {
    expect(authorize([eRow({ workspaceName: undefined })])).toBe(true);
    expect(authorize([eRow({ entitlementName: 'ckingma - Admin Full Access', workspaceName: undefined })])).toBe(false);
    expect(authorize([eRow({ entitlementName: 'Executive Admin Access', workspaceName: undefined })])).toBe(false);
    expect(authorize([eRow({ entitlementName: 'Executive Admin Access', ownerName: 'Matthew Paller', workspaceName: undefined })])).toBe(false);
  });
  it('diagnostic shows workspaceName "(not selected)" and still succeeds', () => {
    const d = buildAdminEntitlementDiagnostic({
      currentUser: cu(),
      platformUserFound: true,
      platformUserUsable: true,
      entitlementQuerySuccess: true,
      profileIdsCount: 0,
      entitlements: [eRow({ workspaceName: undefined })],
    });
    expect(d.entitlementQuerySuccess).toBe(true);
    expect(d.rows[0]!.workspaceName).toBe('(not selected)');
    expect(d.finalResult).toBe('entitled');
  });
});

describe('204K — doc records the direct Dataverse evidence', () => {
  it('the doc exists and cites the failed selects + four-field success', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/cr664_workspacename/);
    expect(DOC).toMatch(/cr664_losuserprofilename/);
    expect(DOC).toMatch(/four-field|four field/i);
    expect(DOC).toMatch(/entitlement-name|entitlement name/i);
  });
  it('keeps GUIDs redacted', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
