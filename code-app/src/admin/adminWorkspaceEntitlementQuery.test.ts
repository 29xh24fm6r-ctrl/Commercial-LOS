import { describe, it, expect } from 'vitest';
import {
  deriveHasAdminWorkspaceEntitlement,
  deriveHasAdminWorkspaceEntitlementForUser,
  matchesCurrentUserIdentity,
  classifyCurrentUserIdentityMatch,
  resolvePlatformUserUsableForAdminProbe,
  buildAdminEntitlementDiagnostic,
  strictAdminEntitlementName,
  resolveAccessLevelKind,
  ADMIN_ACCESS_LEVEL_NAMES,
  ADMIN_ACCESS_LEVEL_KINDS,
  ACCESS_LEVEL_OPTION_SET,
  ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED,
  type AdminCurrentUser,
  type AdminEntitlementCandidate,
  type AdminProbePlatformUser,
  type AdminEntitlementDiagnosticInput,
} from './adminWorkspaceEntitlementQuery';
import { resolveWorkspaceRoute, WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 204 / 204B — admin-entitlement derivation contract.
 *
 * Authorization requires ALL FOUR gates: active entitlement, current LOS profile
 * match, access level Admin/Full, and a workspace name that resolves (via the
 * canonical resolver) to the admin route. Never authorize from entitlement name,
 * access level, or owner alone.
 */

const MATT = 'profile-matt';
const CKINGMA = 'profile-ckingma';

/** A valid admin entitlement for Matthew (override individual fields per test). */
function ent(over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate {
  return {
    accessLevelName: 'Admin',
    workspaceName: 'Admin Control Center',
    losUserProfileId: MATT,
    active: true,
    ...over,
  };
}

const authorize = (entitlements: AdminEntitlementCandidate[], profiles: string[] = [MATT]) =>
  deriveHasAdminWorkspaceEntitlement({ userLosProfileIds: profiles, entitlements });

describe('204B — canonical workspace-route resolver alignment', () => {
  it('1. "Admin Control Center" resolves to the admin route', () => {
    expect(resolveWorkspaceRoute('Admin Control Center')).toBe(WORKSPACE_ROUTES.admin);
  });
  it('2. "Admin Workspace" resolves to the admin route (backward compatibility)', () => {
    expect(resolveWorkspaceRoute('Admin Workspace')).toBe(WORKSPACE_ROUTES.admin);
  });
  it('preserves the other live reference mappings', () => {
    expect(resolveWorkspaceRoute('Banker Workspace')).toBe(WORKSPACE_ROUTES.banker);
    expect(resolveWorkspaceRoute('Team Workspace')).toBe(WORKSPACE_ROUTES.team);
    expect(resolveWorkspaceRoute('Manager Command Center')).toBe(WORKSPACE_ROUTES.manager);
    expect(resolveWorkspaceRoute('Executive Dashboard')).toBe(WORKSPACE_ROUTES.executive);
    // Portfolio Management is rendered as a surface under the manager route.
    expect(resolveWorkspaceRoute('Portfolio Management')).toBe(WORKSPACE_ROUTES.manager);
  });
});

describe('204B — admin authorization gates', () => {
  it('3. Matthew + Admin Control Center + Admin access authorizes', () => {
    expect(authorize([ent({ accessLevelName: 'Admin' })])).toBe(true);
  });
  it('4. Matthew + Admin Control Center + Full access authorizes', () => {
    expect(authorize([ent({ accessLevelName: 'Full' })])).toBe(true);
  });
  it('5. Matthew + Banker Workspace + Full does NOT authorize admin', () => {
    expect(authorize([ent({ workspaceName: 'Banker Workspace', accessLevelName: 'Full' })])).toBe(false);
  });
  it('6. Matthew + Team Workspace + Full does NOT authorize admin', () => {
    expect(authorize([ent({ workspaceName: 'Team Workspace', accessLevelName: 'Full' })])).toBe(false);
  });
  it('7. ckingma admin entitlement does NOT authorize Matthew (profile scoping)', () => {
    expect(authorize([ent({ losUserProfileId: CKINGMA })], [MATT])).toBe(false);
  });
  it('8. a non-admin name AND non-admin workspace does NOT authorize (even at Admin level)', () => {
    expect(
      authorize([ent({ workspaceName: 'Banker Workspace', accessLevelName: 'Admin', entitlementName: 'Banker Full Access' })]),
    ).toBe(false);
  });
  it('9. owner = Matthew does NOT authorize without a LOS profile match', () => {
    // A fully-admin entitlement whose LOS profile is someone else, even if owned
    // by Matthew, is not the current user's profile → not authorized.
    expect(authorize([ent({ losUserProfileId: 'profile-someone-else' })], [MATT])).toBe(false);
  });
  it('10. fail-closed: inactive entitlement, ReadOnly access, or no profile', () => {
    expect(authorize([ent({ active: false })])).toBe(false);
    expect(authorize([ent({ accessLevelName: 'ReadOnly' })])).toBe(false);
    expect(authorize([ent()], [])).toBe(false); // no user profile → fail closed
    expect(authorize([])).toBe(false);
  });

  it('finds the admin grant among mixed entitlements', () => {
    expect(
      authorize([
        ent({ workspaceName: 'Banker Workspace', accessLevelName: 'Full' }),
        ent({ workspaceName: 'Manager Command Center', accessLevelName: 'ReadOnly' }),
        ent({ workspaceName: 'Admin Control Center', accessLevelName: 'Admin' }),
      ]),
    ).toBe(true);
  });

  it('only Full and Admin authorize (ReadOnly does not)', () => {
    expect([...ADMIN_ACCESS_LEVEL_NAMES].sort()).toEqual(['Admin', 'Full']);
  });
});

// ---------------------------------------------------------------------------
// Phase 204C — live row shape: Workspace optional/blank, name carries meaning
// ---------------------------------------------------------------------------

/** The live operator row shape for Matthew (blank Workspace by default). */
function liveRow(over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate {
  return {
    entitlementName: 'Matthew Paller - Admin Full Access',
    accessLevelName: 'Admin',
    workspaceName: undefined, // Workspace lookup is optional / blank in live data
    losUserProfileId: MATT,
    active: true,
    ...over,
  };
}

describe('204C — strictAdminEntitlementName resolver', () => {
  it('resolves admin-access names to true', () => {
    for (const name of [
      'Matthew Paller - Admin Full Access',
      'Admin Full Access',
      'Admin Access',
      'Executive Admin Access',
      'Admin Control Center Access',
    ]) {
      expect(strictAdminEntitlementName(name), name).toBe(true);
    }
  });
  it('resolves non-admin names to false', () => {
    for (const name of ['Banker Full Access', 'Team Member Full Access', 'Manager ReadOnly Access', '', undefined]) {
      expect(strictAdminEntitlementName(name), String(name)).toBe(false);
    }
  });
  it('does not match unsafe substrings (administrator / badminton)', () => {
    expect(strictAdminEntitlementName('Administrator Reporting Access')).toBe(false);
    expect(strictAdminEntitlementName('Badminton Club Access')).toBe(false);
  });
});

describe('204C — authorization over the live (blank-Workspace) row shape', () => {
  it('Matthew + Active + Admin + admin name + blank Workspace => authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Admin' })])).toBe(true);
  });
  it('Matthew + Active + Full + admin name + blank Workspace => authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Full' })])).toBe(true);
  });
  it('Matthew + Active + Full + "Banker Full Access" + blank Workspace => not authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Full', entitlementName: 'Banker Full Access' })])).toBe(false);
  });
  it('Matthew + Active + Full + "Team Member Full Access" + blank Workspace => not authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Full', entitlementName: 'Team Member Full Access' })])).toBe(false);
  });
  it('Matthew + Active + ReadOnly + admin name => not authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'ReadOnly' })])).toBe(false);
  });
  it('inactive admin entitlement => not authorized', () => {
    expect(authorize([liveRow({ active: false })])).toBe(false);
  });
  it('ckingma profile + admin entitlement does not authorize Matthew', () => {
    expect(authorize([liveRow({ losUserProfileId: CKINGMA })], [MATT])).toBe(false);
  });
  it('Owner Matthew without LOS profile match does not authorize', () => {
    expect(authorize([liveRow({ losUserProfileId: 'profile-other' })], [MATT])).toBe(false);
  });
  it('Workspace = Admin Control Center (populated) still authorizes', () => {
    expect(authorize([liveRow({ workspaceName: 'Admin Control Center', entitlementName: 'Generic Access' })])).toBe(true);
  });
  it('no current LOS profile ids => fail-closed', () => {
    expect(authorize([liveRow()], [])).toBe(false);
  });
  it('entitlement name alone (no profile match) does not authorize', () => {
    expect(authorize([liveRow({ losUserProfileId: 'someone-else' })], [MATT])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 204D — access-level option-set mapping (cr664_accesslevel)
// ---------------------------------------------------------------------------

/** A live operator row whose access level is the AUTHORITATIVE numeric option-set. */
function numericRow(over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate {
  return {
    entitlementName: 'Matthew Paller - Admin Full Access',
    accessLevel: 788190002, // Admin
    accessLevelName: undefined, // formatted name NOT relied upon live
    workspaceName: undefined, // blank Workspace
    losUserProfileId: MATT,
    active: true,
    ...over,
  };
}

describe('204D — resolveAccessLevelKind maps the cr664_accesslevel option-set', () => {
  it('the option-set constants match the generated Dataverse model', () => {
    expect(ACCESS_LEVEL_OPTION_SET[788190000]).toBe('Full');
    expect(ACCESS_LEVEL_OPTION_SET[788190001]).toBe('ReadOnly');
    expect(ACCESS_LEVEL_OPTION_SET[788190002]).toBe('Admin');
  });
  it('resolves numeric option-set values', () => {
    expect(resolveAccessLevelKind(788190000)).toBe('Full');
    expect(resolveAccessLevelKind(788190001)).toBe('ReadOnly');
    expect(resolveAccessLevelKind(788190002)).toBe('Admin');
  });
  it('resolves numeric-as-string option-set values', () => {
    expect(resolveAccessLevelKind('788190002')).toBe('Admin');
    expect(resolveAccessLevelKind('788190000')).toBe('Full');
  });
  it('falls back to the string name when no numeric value is present', () => {
    expect(resolveAccessLevelKind(undefined, 'Admin')).toBe('Admin');
    expect(resolveAccessLevelKind(undefined, 'Full')).toBe('Full');
    expect(resolveAccessLevelKind(undefined, 'ReadOnly')).toBe('ReadOnly');
  });
  it('resolves unknown / missing values to Unknown (fail closed)', () => {
    expect(resolveAccessLevelKind(undefined, undefined)).toBe('Unknown');
    expect(resolveAccessLevelKind(999999)).toBe('Unknown');
    expect(resolveAccessLevelKind('', '')).toBe('Unknown');
    expect(resolveAccessLevelKind(undefined, 'Administrator')).toBe('Unknown');
  });
  it('only Full and Admin kinds authorize', () => {
    expect([...ADMIN_ACCESS_LEVEL_KINDS].sort()).toEqual(['Admin', 'Full']);
  });
});

describe('204D — authorization over the numeric access-level row shape', () => {
  it('numeric 788190002 (Admin) + admin name + blank Workspace => authorized', () => {
    expect(authorize([numericRow({ accessLevel: 788190002 })])).toBe(true);
  });
  it('numeric 788190000 (Full) + admin name + blank Workspace => authorized', () => {
    expect(authorize([numericRow({ accessLevel: 788190000 })])).toBe(true);
  });
  it('numeric 788190001 (ReadOnly) + admin name => not authorized', () => {
    expect(authorize([numericRow({ accessLevel: 788190001 })])).toBe(false);
  });
  it('undefined access level + admin name => not authorized (fail closed)', () => {
    expect(authorize([numericRow({ accessLevel: undefined })])).toBe(false);
  });
  it('numeric Admin but non-admin name AND blank Workspace => not authorized', () => {
    expect(authorize([numericRow({ accessLevel: 788190002, entitlementName: 'Banker Full Access' })])).toBe(false);
  });
  it('string fallback "Admin" still authorizes in the pure deriver', () => {
    expect(authorize([numericRow({ accessLevel: undefined, accessLevelName: 'Admin' })])).toBe(true);
  });
  it('string fallback "Full" still authorizes in the pure deriver', () => {
    expect(authorize([numericRow({ accessLevel: undefined, accessLevelName: 'Full' })])).toBe(true);
  });
  it('string fallback "ReadOnly" does not authorize', () => {
    expect(authorize([numericRow({ accessLevel: undefined, accessLevelName: 'ReadOnly' })])).toBe(false);
  });
  it('ckingma numeric-Admin row does not authorize Matthew', () => {
    expect(authorize([numericRow({ accessLevel: 788190002, losUserProfileId: CKINGMA })], [MATT])).toBe(false);
  });
  it('owner Matthew without LOS profile match does not authorize (numeric Admin)', () => {
    expect(authorize([numericRow({ accessLevel: 788190002, losUserProfileId: 'profile-other' })], [MATT])).toBe(false);
  });
  it('inactive numeric-Admin row does not authorize', () => {
    expect(authorize([numericRow({ accessLevel: 788190002, active: false })])).toBe(false);
  });
  it('numeric Admin with Workspace = Admin Control Center (generic name) authorizes', () => {
    expect(
      authorize([numericRow({ accessLevel: 788190002, workspaceName: 'Admin Control Center', entitlementName: 'Generic Access' })]),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 204E — live PlatformUser identity (no legacy core-user chain required)
// ---------------------------------------------------------------------------

const UPN = 'mpaller@oldglorybank.com';

/** The live current user: an active PlatformUser, NO legacy LOS profile ids. */
function currentUser(over: Partial<AdminCurrentUser> = {}): AdminCurrentUser {
  return {
    upn: UPN,
    platformUserId: 'pu-matt',
    fullName: 'Matthew Paller',
    losUserProfileIds: [],
    ...over,
  };
}

/** An admin-shaped entitlement row (numeric Admin, blank Workspace). */
function eRow(over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate {
  return {
    entitlementName: 'Matthew Paller - Admin Full Access',
    accessLevel: 788190002,
    workspaceName: undefined,
    losUserProfileId: undefined,
    losUserProfileName: undefined,
    active: true,
    ...over,
  };
}

const authorizeUser = (
  entitlements: AdminEntitlementCandidate[],
  cu: AdminCurrentUser = currentUser(),
) => deriveHasAdminWorkspaceEntitlementForUser({ currentUser: cu, entitlements });

describe('204E — identity-aware authorization over live PlatformUser identity', () => {
  it('active platform user with NO core-user / LOS profile ids no longer auto-fails', () => {
    // currentUser has losUserProfileIds: [] — identity is matched by the row label;
    // admin shape comes from the Workspace so the label signal is isolated.
    expect(
      authorizeUser([eRow({ losUserProfileName: UPN, entitlementName: 'Generic Access', workspaceName: 'Admin Control Center' })]),
    ).toBe(true);
  });
  it('row with losUserProfileName == UPN, numeric Admin, admin name, blank workspace authorizes', () => {
    expect(authorizeUser([eRow({ losUserProfileName: UPN })])).toBe(true);
  });
  it('row with entitlementName "Matthew Paller - Admin Full Access" authorizes when fullName matches', () => {
    expect(authorizeUser([eRow({ entitlementName: 'Matthew Paller - Admin Full Access', losUserProfileName: undefined })])).toBe(true);
  });
  it('user-specific name keyed on the UPN + " - Admin" also authorizes', () => {
    expect(authorizeUser([eRow({ entitlementName: `${UPN} - Admin Full Access`, losUserProfileName: undefined })])).toBe(true);
  });
  it('ckingma admin row does not authorize Matthew', () => {
    expect(
      authorizeUser([
        eRow({ entitlementName: 'ckingma - Admin Full Access', losUserProfileName: 'ckingma@oldglorybank.com' }),
      ]),
    ).toBe(false);
  });
  it('generic "Executive Admin Access" without a current-user match does not authorize', () => {
    expect(authorizeUser([eRow({ entitlementName: 'Executive Admin Access', losUserProfileName: undefined })])).toBe(false);
  });
  it('owner = Matthew, by itself, does not authorize (owner is never an identity signal)', () => {
    expect(
      authorizeUser([eRow({ entitlementName: 'Executive Admin Access', ownerName: 'Matthew Paller', losUserProfileName: undefined })]),
    ).toBe(false);
  });
  it('ReadOnly / inactive rows do not authorize even with an identity match', () => {
    expect(authorizeUser([eRow({ losUserProfileName: UPN, accessLevel: 788190001 })])).toBe(false);
    expect(authorizeUser([eRow({ losUserProfileName: UPN, active: false })])).toBe(false);
  });
  it('numeric cr664_accesslevel option-set remains required (undefined access => not authorized)', () => {
    expect(authorizeUser([eRow({ losUserProfileName: UPN, accessLevel: undefined, accessLevelName: undefined })])).toBe(false);
  });
  it('Workspace = Admin Control Center authorizes when an identity match passes', () => {
    expect(
      authorizeUser([eRow({ workspaceName: 'Admin Control Center', entitlementName: 'Generic Access', losUserProfileName: UPN })]),
    ).toBe(true);
  });
  it('Workspace = Admin Control Center WITHOUT identity does not authorize', () => {
    expect(
      authorizeUser([eRow({ workspaceName: 'Admin Control Center', entitlementName: 'Generic Access', losUserProfileName: undefined })]),
    ).toBe(false);
  });
  it('legacy profile-id match still works when LOS profile ids are present', () => {
    expect(
      authorizeUser(
        [eRow({ losUserProfileId: 'profile-matt', entitlementName: 'Generic Access', workspaceName: 'Admin Control Center' })],
        currentUser({ losUserProfileIds: ['profile-matt'] }),
      ),
    ).toBe(true);
  });
  it('empty UPN fails closed', () => {
    expect(authorizeUser([eRow({ losUserProfileName: UPN })], currentUser({ upn: '' }))).toBe(false);
  });
});

describe('204E — matchesCurrentUserIdentity safe-signal contract', () => {
  it('matches on profile-id, profile-label==UPN, or user-specific name; not owner / generic', () => {
    const cu = currentUser();
    expect(matchesCurrentUserIdentity(cu, eRow({ losUserProfileName: UPN }))).toBe(true);
    expect(matchesCurrentUserIdentity(cu, eRow({ entitlementName: 'Matthew Paller - Admin Full Access' }))).toBe(true);
    expect(
      matchesCurrentUserIdentity(currentUser({ losUserProfileIds: ['p1'] }), eRow({ losUserProfileId: 'p1' })),
    ).toBe(true);
    // not owner, not a generic admin name, not a different user's label
    expect(matchesCurrentUserIdentity(cu, eRow({ entitlementName: 'Executive Admin Access', losUserProfileName: undefined, ownerName: 'Matthew Paller' }))).toBe(false);
    expect(matchesCurrentUserIdentity(cu, eRow({ losUserProfileName: 'ckingma@oldglorybank.com', entitlementName: 'Generic' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 204F — PlatformUser active-gate alignment with bootstrapFlow.ts
// ---------------------------------------------------------------------------

const IDENTITY_ACTIVE = 788190000;
const IDENTITY_PENDING = 788190001;
const IDENTITY_DISABLED = 788190002;
const IDENTITY_SUSPENDED = 788190003;

/** A bootable PlatformUser (active state + identity), activestatus overridable. */
function platformUser(over: Partial<AdminProbePlatformUser> = {}): AdminProbePlatformUser {
  return {
    statecode: 0,
    cr664_identitystatus: IDENTITY_ACTIVE,
    cr664_activestatus: true,
    ...over,
  };
}

describe('204F — resolvePlatformUserUsableForAdminProbe (bootstrap-aligned)', () => {
  it('no user row => false', () => {
    expect(resolvePlatformUserUsableForAdminProbe(undefined)).toBe(false);
    expect(resolvePlatformUserUsableForAdminProbe(null)).toBe(false);
  });
  it('explicit Inactive statecode => false', () => {
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ statecode: 1 }))).toBe(false);
  });
  it('Disabled / Suspended identity status => false', () => {
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_identitystatus: IDENTITY_DISABLED }))).toBe(false);
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_identitystatus: IDENTITY_SUSPENDED }))).toBe(false);
  });
  it('statecode 0 + identity Active + activestatus UNDEFINED => true (not blocked)', () => {
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_activestatus: undefined }))).toBe(true);
  });
  it('statecode 0 + identity Active + activestatus FALSE => true (bootstrap does not gate on it)', () => {
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_activestatus: false }))).toBe(true);
  });
  it('activestatus true => true', () => {
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_activestatus: true }))).toBe(true);
  });
  it('missing statecode / identitystatus is non-fatal (not explicitly deactivated)', () => {
    expect(resolvePlatformUserUsableForAdminProbe({ cr664_activestatus: undefined })).toBe(true);
    // identity Pending is not Disabled/Suspended => usable
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_identitystatus: IDENTITY_PENDING }))).toBe(true);
  });
  it('explicit deactivation wins even when activestatus is true', () => {
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_activestatus: true, statecode: 1 }))).toBe(false);
    expect(
      resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_activestatus: true, cr664_identitystatus: IDENTITY_DISABLED })),
    ).toBe(false);
  });
});

describe('204F — usable PlatformUser then unchanged entitlement gates', () => {
  it('app-boot-compatible user (activestatus false) is usable AND a Matthew row authorizes', () => {
    const user = platformUser({ cr664_activestatus: false });
    expect(resolvePlatformUserUsableForAdminProbe(user)).toBe(true);
    expect(authorizeUser([eRow({ losUserProfileName: UPN })])).toBe(true);
  });
  it('usable user + ckingma admin row does not authorize Matthew', () => {
    expect(resolvePlatformUserUsableForAdminProbe(platformUser({ cr664_activestatus: undefined }))).toBe(true);
    expect(
      authorizeUser([eRow({ entitlementName: 'ckingma - Admin Full Access', losUserProfileName: 'ckingma@oldglorybank.com' })]),
    ).toBe(false);
  });
  it('usable user + owner-only row does not authorize', () => {
    expect(
      authorizeUser([eRow({ entitlementName: 'Executive Admin Access', ownerName: 'Matthew Paller', losUserProfileName: undefined })]),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 204G — read-only diagnostic builder
// ---------------------------------------------------------------------------

function diagInput(over: Partial<AdminEntitlementDiagnosticInput> = {}): AdminEntitlementDiagnosticInput {
  return {
    currentUser: currentUser(),
    platformUserFound: true,
    platformUserUsable: true,
    entitlementQuerySuccess: true,
    profileIdsCount: 0,
    entitlements: [],
    ...over,
  };
}

describe('204G — buildAdminEntitlementDiagnostic gate reporting', () => {
  it('the diagnostic flag is on for this temporary phase', () => {
    expect(ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED).toBe(true);
  });

  it('reports zero rows as not-entitled', () => {
    const d = buildAdminEntitlementDiagnostic(diagInput({ entitlements: [] }));
    expect(d.entitlementRowsReturned).toBe(0);
    expect(d.rows).toEqual([]);
    expect(d.finalResult).toBe('not-entitled');
  });

  it('reports query failure as failed with a summary', () => {
    const d = buildAdminEntitlementDiagnostic(diagInput({ entitlementQuerySuccess: false, failureSummary: 'boom' }));
    expect(d.finalResult).toBe('failed');
    expect(d.failureSummary).toBe('boom');
  });

  it('reports an unusable PlatformUser as not-entitled regardless of rows', () => {
    const d = buildAdminEntitlementDiagnostic(diagInput({ platformUserUsable: false, entitlements: [eRow({ losUserProfileName: UPN })] }));
    expect(d.finalResult).toBe('not-entitled');
  });

  it('reports each gate for an eligible Matthew row (label identity)', () => {
    const d = buildAdminEntitlementDiagnostic(diagInput({ entitlements: [eRow({ losUserProfileName: UPN })] }));
    const r = d.rows[0]!;
    expect(r.accessLevelRaw).toBe('788190002');
    expect(r.accessLevelKind).toBe('Admin');
    expect(r.active).toBe(true);
    expect(r.hasAdminName).toBe(true);
    expect(r.hasAdminWorkspace).toBe(false);
    expect(r.identityMatched).toBe(true);
    expect(r.identityMatchReason).toBe('profile-label-upn');
    expect(r.finalEligible).toBe(true);
    expect(d.finalResult).toBe('entitled');
  });

  it('reports the identity match reason for each safe signal', () => {
    const byProfileId = buildAdminEntitlementDiagnostic(
      diagInput({
        currentUser: currentUser({ losUserProfileIds: ['p1'] }),
        entitlements: [eRow({ losUserProfileId: 'p1', losUserProfileName: undefined, entitlementName: 'Generic Access', workspaceName: 'Admin Control Center' })],
      }),
    );
    expect(byProfileId.rows[0]!.identityMatchReason).toBe('profile-id');

    const byFullName = buildAdminEntitlementDiagnostic(diagInput({ entitlements: [eRow({ entitlementName: 'Matthew Paller - Admin Full Access', losUserProfileName: undefined })] }));
    expect(byFullName.rows[0]!.identityMatchReason).toBe('full-name-admin-prefix');

    const byUpn = buildAdminEntitlementDiagnostic(diagInput({ entitlements: [eRow({ entitlementName: `${UPN} - Admin Access`, losUserProfileName: undefined })] }));
    expect(byUpn.rows[0]!.identityMatchReason).toBe('upn-admin-prefix');

    const none = buildAdminEntitlementDiagnostic(diagInput({ entitlements: [eRow({ entitlementName: 'Executive Admin Access', losUserProfileName: undefined })] }));
    expect(none.rows[0]!.identityMatchReason).toBe('none');
    expect(none.rows[0]!.finalEligible).toBe(false);
  });

  it('reports a ReadOnly row as ineligible with the resolved kind', () => {
    const d = buildAdminEntitlementDiagnostic(diagInput({ entitlements: [eRow({ losUserProfileName: UPN, accessLevel: 788190001 })] }));
    expect(d.rows[0]!.accessLevelKind).toBe('ReadOnly');
    expect(d.rows[0]!.finalEligible).toBe(false);
  });

  it('sanitizes other identities and never surfaces GUID profile ids', () => {
    const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const d = buildAdminEntitlementDiagnostic(
      diagInput({
        entitlements: [
          eRow({ entitlementName: 'ckingma - Admin Full Access', losUserProfileName: 'ckingma@oldglorybank.com', losUserProfileId: guid }),
        ],
      }),
    );
    const r = d.rows[0]!;
    // Another user's email and entitlement name are redacted.
    expect(r.losUserProfileName).not.toMatch(/ckingma/);
    expect(r.entitlementName).not.toMatch(/ckingma/);
    // D19 — pins the exact redaction placeholder text (guards against mojibake regressing:
    // this string was previously double-mis-encoded as 'Â«redacted-other-identityÂ»').
    expect(r.losUserProfileName).toBe('«redacted-other-identity»');
    expect(r.entitlementName).toBe('«redacted-other-identity»');
    // The raw GUID profile id is never present anywhere in the diagnostic.
    expect(JSON.stringify(d)).not.toContain(guid);
    expect(JSON.stringify(d)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('shows the current user own UPN/full name (already visible in the app shell)', () => {
    const d = buildAdminEntitlementDiagnostic(diagInput());
    expect(d.platformUserEmail).toBe(UPN);
    expect(d.platformUserFullName).toBe('Matthew Paller');
  });

  it('classifyCurrentUserIdentityMatch agrees with matchesCurrentUserIdentity', () => {
    const cu = currentUser();
    const rows = [
      eRow({ losUserProfileName: UPN }),
      eRow({ entitlementName: 'Executive Admin Access', losUserProfileName: undefined }),
    ];
    for (const r of rows) {
      expect(classifyCurrentUserIdentityMatch(cu, r) !== 'none').toBe(matchesCurrentUserIdentity(cu, r));
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 204H — identity attribution without the (non-selectable) profile label
// ---------------------------------------------------------------------------

describe('204H — live identity works with NO losUserProfileName field', () => {
  it('Matthew-style entitlement name prefix authorizes without losUserProfileName', () => {
    expect(
      authorizeUser([eRow({ entitlementName: 'Matthew Paller - Admin Full Access', losUserProfileName: undefined })]),
    ).toBe(true);
  });
  it('legacy profile-id still attributes without losUserProfileName', () => {
    expect(
      authorizeUser(
        [eRow({ losUserProfileId: 'p1', losUserProfileName: undefined, entitlementName: 'Generic Access', workspaceName: 'Admin Control Center' })],
        currentUser({ losUserProfileIds: ['p1'] }),
      ),
    ).toBe(true);
  });
  it('ckingma row (no profile label) still does not authorize Matthew', () => {
    expect(
      authorizeUser([eRow({ entitlementName: 'ckingma - Admin Full Access', losUserProfileName: undefined })]),
    ).toBe(false);
  });
  it('generic Executive Admin Access (no profile label) still does not authorize', () => {
    expect(authorizeUser([eRow({ entitlementName: 'Executive Admin Access', losUserProfileName: undefined })])).toBe(false);
  });
  it('owner is still never an authorization signal', () => {
    expect(
      authorizeUser([eRow({ entitlementName: 'Executive Admin Access', ownerName: 'Matthew Paller', losUserProfileName: undefined })]),
    ).toBe(false);
  });
  it('profile-label-upn match remains supported for candidates that DO carry it (pure tests)', () => {
    expect(matchesCurrentUserIdentity(currentUser(), eRow({ losUserProfileName: UPN, entitlementName: 'Generic' }))).toBe(true);
    expect(classifyCurrentUserIdentityMatch(currentUser(), eRow({ losUserProfileName: UPN, entitlementName: 'Generic' }))).toBe('profile-label-upn');
  });
  it('diagnostic reports query SUCCESS and a blank profile label when rows omit losUserProfileName', () => {
    const d = buildAdminEntitlementDiagnostic(
      diagInput({
        entitlements: [eRow({ entitlementName: 'Matthew Paller - Admin Full Access', losUserProfileName: undefined })],
      }),
    );
    expect(d.entitlementQuerySuccess).toBe(true);
    expect(d.finalResult).toBe('entitled');
    expect(d.rows[0]!.losUserProfileName).toBe('(blank)');
    expect(d.rows[0]!.identityMatchReason).toBe('full-name-admin-prefix');
  });
});

// ---------------------------------------------------------------------------
// Phase 204K — four-field read: no workspace display name selected live
// ---------------------------------------------------------------------------

describe('204K — admin shape works with workspaceName undefined', () => {
  it('Matthew-style entitlement-name row authorizes with workspaceName undefined', () => {
    expect(
      authorizeUser([eRow({ entitlementName: 'Matthew Paller - Admin Full Access', workspaceName: undefined, losUserProfileName: undefined })]),
    ).toBe(true);
  });
  it('generic Executive Admin Access still does not authorize Matthew', () => {
    expect(authorizeUser([eRow({ entitlementName: 'Executive Admin Access', workspaceName: undefined, losUserProfileName: undefined })])).toBe(false);
  });
  it('ckingma row still does not authorize Matthew', () => {
    expect(authorizeUser([eRow({ entitlementName: 'ckingma - Admin Full Access', workspaceName: undefined, losUserProfileName: undefined })])).toBe(false);
  });
  it('owner is still never an authorization signal', () => {
    expect(
      authorizeUser([eRow({ entitlementName: 'Executive Admin Access', ownerName: 'Matthew Paller', workspaceName: undefined, losUserProfileName: undefined })]),
    ).toBe(false);
  });
  it('diagnostic renders workspaceName as "(not selected)" when no workspace field is read', () => {
    const d = buildAdminEntitlementDiagnostic(
      diagInput({
        entitlements: [eRow({ entitlementName: 'Matthew Paller - Admin Full Access', workspaceName: undefined, losUserProfileName: undefined })],
      }),
    );
    expect(d.rows[0]!.workspaceName).toBe('(not selected)');
    expect(d.rows[0]!.hasAdminWorkspace).toBe(false);
    expect(d.rows[0]!.finalEligible).toBe(true);
  });
});
