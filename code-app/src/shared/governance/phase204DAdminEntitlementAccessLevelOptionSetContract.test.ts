import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveHasAdminWorkspaceEntitlement,
  resolveAccessLevelKind,
  ACCESS_LEVEL_OPTION_SET,
  ADMIN_ACCESS_LEVEL_KINDS,
  type AdminEntitlementCandidate,
} from '../../admin/adminWorkspaceEntitlementQuery';

/**
 * PHASE 204D — admin entitlement access-level option-set contract.
 *
 * The live failure was the probe reading the optional formatted name field
 * (cr664_accesslevelname) instead of the authoritative option-set field
 * (cr664_accesslevel). This contract pins: the option-set mapping matches the
 * generated model, the live query selects the numeric field (not the formatted
 * name), and the deriver authorizes from the numeric value while still applying
 * every other gate. Never authorize from access level alone.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const QUERY = read('src/admin/adminWorkspaceEntitlementQuery.ts');
const MODEL = read('src/generated/models/Cr664_workspaceentitlementsesModel.ts');
const DOC_REL = 'docs/PHASE_204D_ADMIN_ENTITLEMENT_ACCESSLEVEL_OPTIONSET_FIX.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

const MATT = ['profile-matt'];
const row = (over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate => ({
  entitlementName: 'Matthew Paller - Admin Full Access',
  accessLevel: 788190002,
  workspaceName: undefined,
  losUserProfileId: 'profile-matt',
  active: true,
  ...over,
});
const authorize = (e: AdminEntitlementCandidate[], p = MATT) =>
  deriveHasAdminWorkspaceEntitlement({ userLosProfileIds: p, entitlements: e });

describe('204D — option-set mapping matches the generated model', () => {
  it('ACCESS_LEVEL_OPTION_SET mirrors cr664_accesslevel in the generated model', () => {
    expect(ACCESS_LEVEL_OPTION_SET[788190000]).toBe('Full');
    expect(ACCESS_LEVEL_OPTION_SET[788190001]).toBe('ReadOnly');
    expect(ACCESS_LEVEL_OPTION_SET[788190002]).toBe('Admin');
    // The generated model is the source of truth for these values.
    expect(MODEL).toMatch(/788190000:\s*'Full'/);
    expect(MODEL).toMatch(/788190001:\s*'ReadOnly'/);
    expect(MODEL).toMatch(/788190002:\s*'Admin'/);
  });
  it('only Full and Admin kinds authorize', () => {
    expect([...ADMIN_ACCESS_LEVEL_KINDS].sort()).toEqual(['Admin', 'Full']);
    expect(resolveAccessLevelKind(788190001)).toBe('ReadOnly');
  });
});

describe('204D — live query selects the authoritative numeric field', () => {
  it('selects cr664_accesslevel and maps it onto the candidate', () => {
    expect(QUERY).toMatch(/select:[\s\S]*'cr664_accesslevel'/);
    expect(QUERY).toMatch(/accessLevel:\s*r\.cr664_accesslevel/);
  });
  it('does not rely on the optional formatted name field in the live select', () => {
    // cr664_accesslevelname must not appear as a selected/mapped live field.
    expect(QUERY).not.toMatch(/'cr664_accesslevelname'/);
    expect(QUERY).not.toMatch(/r\.cr664_accesslevelname/);
  });
  it('the deriver gates on the resolved access-level kind', () => {
    expect(QUERY).toMatch(/ADMIN_ACCESS_LEVEL_KINDS\.has\(resolveAccessLevelKind\(e\.accessLevel, e\.accessLevelName\)\)/);
  });
});

describe('204D — authorization over the numeric access level', () => {
  it('numeric Admin authorizes; numeric ReadOnly does not; access level alone never authorizes', () => {
    expect(authorize([row({ accessLevel: 788190002 })])).toBe(true);
    expect(authorize([row({ accessLevel: 788190000 })])).toBe(true);
    expect(authorize([row({ accessLevel: 788190001 })])).toBe(false);
    expect(authorize([row({ accessLevel: undefined })])).toBe(false);
    // access level alone: numeric Admin but a non-admin name + blank Workspace
    expect(authorize([row({ accessLevel: 788190002, entitlementName: 'Banker Full Access' })])).toBe(false);
    // owner / profile gate still applies
    expect(authorize([row({ accessLevel: 788190002, losUserProfileId: 'someone-else' })], MATT)).toBe(false);
  });
});

describe('204D — doc records the option-set root cause', () => {
  it('the doc explains the formatted-name vs option-set failure', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/cr664_accesslevel/);
    expect(DOC).toMatch(/cr664_accesslevelname/);
    expect(DOC).toMatch(/788190002/);
    expect(DOC).toMatch(/option-set/i);
  });
  it('keeps GUIDs redacted', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
