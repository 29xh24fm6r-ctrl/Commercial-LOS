export type GovernanceRuntimeCode =
  | 'ACTIVE'
  | 'NO_PROFILE'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_AMBIGUOUS'
  | 'POLICY_MISSING'
  | 'POLICY_AMBIGUOUS'
  | 'POLICY_INVALID'
  | 'RULES_MISSING'
  | 'AUTHORITY_MISSING'
  | 'ROLE_ASSIGNMENT_MISSING'
  | 'QUERY_FAILED';

export interface GovernanceRuntimeProfile {
  readonly id: string;
  readonly bankKey: string;
  readonly displayName: string;
  readonly enabled: boolean;
}

export interface GovernanceRuntimePolicy {
  readonly id: string;
  readonly policyId: string;
  readonly versionNumber: number;
  readonly status: string;
  readonly snapshotSha256: string;
  readonly effectiveFrom: string;
  readonly effectiveThrough?: string;
}

export interface GovernanceRuntimeRule {
  readonly id: string;
  readonly ruleId: string;
  readonly description: string;
  readonly ordinal: number;
  readonly nonOverrideable: boolean;
  readonly sha256: string;
}

export interface GovernanceRuntimeAuthority {
  readonly id: string;
  readonly grantId: string;
  readonly officerId: string;
  readonly officerName: string;
  readonly officerUpn: string;
  readonly maximumAmount?: number;
  readonly maximumRelationshipExposure?: number;
  readonly maximumUnsecuredAmount?: number;
  readonly effectiveFrom: string;
  readonly effectiveThrough?: string;
}

export interface GovernanceRuntimeRoleAssignment {
  readonly id: string;
  readonly assignmentId: string;
  readonly officerId: string;
  readonly officerName: string;
  readonly officerUpn: string;
  readonly roleCode: string;
  readonly effectiveFrom: string;
  readonly effectiveThrough?: string;
}

export interface GovernanceRuntimeEvidence {
  readonly profile: GovernanceRuntimeProfile;
  readonly policy: GovernanceRuntimePolicy;
  readonly rules: readonly GovernanceRuntimeRule[];
  readonly authorities: readonly GovernanceRuntimeAuthority[];
  readonly roleAssignments: readonly GovernanceRuntimeRoleAssignment[];
}

export interface GovernanceRuntimeState {
  readonly code: GovernanceRuntimeCode;
  readonly isGo: boolean;
  readonly diagnostic: string;
  readonly queriedAt: string;
  readonly queryPhase?: string;
  readonly evidence?: GovernanceRuntimeEvidence;
}

interface ProfileRow {
  readonly cr664_creditgovernanceprofileid: string;
  readonly cr664_bankkey: string;
  readonly cr664_displayname: string;
  readonly cr664_profileenabled: boolean;
  readonly statecode: number;
}

interface PolicyRow {
  readonly cr664_creditpolicyversionid: string;
  readonly cr664_policyid: string;
  readonly cr664_versionnumber: number;
  readonly cr664_policystatus: string;
  readonly cr664_snapshotjson: string;
  readonly cr664_snapshotsha256: string;
  readonly cr664_effectivefrom: string;
  readonly cr664_effectivethrough?: string;
  readonly statecode: number;
}

interface RuleRow {
  readonly cr664_governancepolicyruleid: string;
  readonly cr664_ruleid: string;
  readonly cr664_description: string;
  readonly cr664_ruleordinal: number;
  readonly cr664_nonoverrideable: boolean;
  readonly cr664_rulesha256: string;
  readonly statecode: number;
}

interface AuthorityRow {
  readonly cr664_authoritygrantid: string;
  readonly cr664_grantid: string;
  readonly cr664_grantstate: string;
  readonly cr664_maximumamount?: number;
  readonly cr664_maximumrelationshipexposure?: number;
  readonly cr664_maximumunsecuredamount?: number;
  readonly cr664_effectivefrom: string;
  readonly cr664_effectivethrough?: string;
  readonly _cr664_officer_value?: string;
  readonly statecode: number;
}

interface RoleRow {
  readonly cr664_governanceroleassignmentid: string;
  readonly cr664_assignmentid: string;
  readonly cr664_assignmentstate: string;
  readonly cr664_rolecode: string;
  readonly cr664_effectivefrom: string;
  readonly cr664_effectivethrough?: string;
  readonly _cr664_officer_value?: string;
  readonly statecode: number;
}

interface OfficerRow {
  readonly systemuserid: string;
  readonly fullname?: string;
  readonly domainname?: string;
  readonly isdisabled?: boolean;
}

export interface GovernanceRuntimeRows {
  readonly profiles: readonly ProfileRow[];
  readonly policies: readonly PolicyRow[];
  readonly rules: readonly RuleRow[];
  readonly authorities: readonly AuthorityRow[];
  readonly roleAssignments: readonly RoleRow[];
  readonly officers: readonly OfficerRow[];
}

function fail(
  code: Exclude<GovernanceRuntimeCode, 'ACTIVE'>,
  diagnostic: string,
  queriedAt: string,
  queryPhase?: string,
): GovernanceRuntimeState {
  return { code, isGo: false, diagnostic, queriedAt, queryPhase };
}

function activeAt(
  statecode: number,
  state: string,
  effectiveFrom: string,
  effectiveThrough: string | undefined,
  now: number,
): boolean {
  const from = Date.parse(effectiveFrom);
  const through = effectiveThrough ? Date.parse(effectiveThrough) : Number.POSITIVE_INFINITY;
  return statecode === 0
    && state.trim().toUpperCase() === 'ACTIVE'
    && Number.isFinite(from)
    && from <= now
    && through > now;
}

function expectedRuleCount(snapshotJson: string): number | undefined {
  try {
    const parsed = JSON.parse(snapshotJson) as { rules?: unknown };
    return Array.isArray(parsed.rules) ? parsed.rules.length : undefined;
  } catch {
    return undefined;
  }
}

function officerMap(rows: readonly OfficerRow[]): ReadonlyMap<string, OfficerRow> {
  return new Map(rows.map((row) => [row.systemuserid.toLowerCase(), row]));
}

export function evaluateGovernanceRuntimeRows(
  rows: GovernanceRuntimeRows,
  nowIso = new Date().toISOString(),
): GovernanceRuntimeState {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return fail('QUERY_FAILED', 'The governance clock value is invalid.', nowIso, 'evaluation');

  if (rows.profiles.length === 0) {
    return fail('NO_PROFILE', 'No governance profile was returned by Dataverse.', nowIso, 'profile');
  }
  const profiles = rows.profiles.filter((row) => row.statecode === 0 && row.cr664_profileenabled);
  if (profiles.length === 0) {
    return fail('PROFILE_INACTIVE', 'Governance profile rows exist, but none is enabled and active.', nowIso, 'profile');
  }
  if (profiles.length !== 1) {
    return fail('PROFILE_AMBIGUOUS', `Expected one enabled governance profile; found ${profiles.length}.`, nowIso, 'profile');
  }
  const profileRow = profiles[0]!;

  const policies = rows.policies.filter((row) => activeAt(
    row.statecode,
    row.cr664_policystatus,
    row.cr664_effectivefrom,
    row.cr664_effectivethrough,
    now,
  ));
  if (policies.length === 0) {
    return fail('POLICY_MISSING', 'The active profile has no currently effective ACTIVE policy version.', nowIso, 'policy');
  }
  if (policies.length !== 1) {
    return fail('POLICY_AMBIGUOUS', `Expected one currently effective ACTIVE policy; found ${policies.length}.`, nowIso, 'policy');
  }
  const policyRow = policies[0]!;
  const expectedRules = expectedRuleCount(policyRow.cr664_snapshotjson);
  if (expectedRules === undefined || expectedRules < 1 || !/^[a-f0-9]{64}$/i.test(policyRow.cr664_snapshotsha256)) {
    return fail('POLICY_INVALID', 'The active policy snapshot or immutable SHA-256 is malformed.', nowIso, 'policy');
  }

  const rules = rows.rules
    .filter((row) => row.statecode === 0)
    .sort((left, right) => left.cr664_ruleordinal - right.cr664_ruleordinal);
  const uniqueRuleIds = new Set(rules.map((row) => row.cr664_ruleid));
  const ruleEvidenceValid = rules.length === expectedRules
    && uniqueRuleIds.size === rules.length
    && rules.every((row) => /^[a-f0-9]{64}$/i.test(row.cr664_rulesha256));
  if (!ruleEvidenceValid) {
    return fail(
      'RULES_MISSING',
      `The policy snapshot requires ${expectedRules} rule(s), but ${rules.length} complete active rule row(s) resolved.`,
      nowIso,
      'rules',
    );
  }

  const officers = officerMap(rows.officers);
  const authorities = rows.authorities.filter((row) => activeAt(
    row.statecode,
    row.cr664_grantstate,
    row.cr664_effectivefrom,
    row.cr664_effectivethrough,
    now,
  ) && Boolean(row._cr664_officer_value));
  const authoritiesWithIdentity = authorities.filter((row) => {
    const officer = officers.get(row._cr664_officer_value!.toLowerCase());
    return officer && !officer.isdisabled && Boolean(officer.fullname?.trim()) && Boolean(officer.domainname?.trim());
  });
  if (authorities.length === 0 || authoritiesWithIdentity.length !== authorities.length) {
    return fail(
      'AUTHORITY_MISSING',
      'No complete, currently effective authority grant with an enabled resolved officer identity was found.',
      nowIso,
      'authority',
    );
  }

  const assignments = rows.roleAssignments.filter((row) => activeAt(
    row.statecode,
    row.cr664_assignmentstate,
    row.cr664_effectivefrom,
    row.cr664_effectivethrough,
    now,
  ) && Boolean(row._cr664_officer_value));
  const assignmentsWithIdentity = assignments.filter((row) => {
    const officer = officers.get(row._cr664_officer_value!.toLowerCase());
    return officer && !officer.isdisabled;
  });
  if (assignments.length === 0 || assignmentsWithIdentity.length !== assignments.length) {
    return fail(
      'ROLE_ASSIGNMENT_MISSING',
      'No complete, currently effective governance role assignment with an enabled officer was found.',
      nowIso,
      'role assignment',
    );
  }

  const profile: GovernanceRuntimeProfile = {
    id: profileRow.cr664_creditgovernanceprofileid,
    bankKey: profileRow.cr664_bankkey,
    displayName: profileRow.cr664_displayname,
    enabled: profileRow.cr664_profileenabled,
  };
  const policy: GovernanceRuntimePolicy = {
    id: policyRow.cr664_creditpolicyversionid,
    policyId: policyRow.cr664_policyid,
    versionNumber: policyRow.cr664_versionnumber,
    status: policyRow.cr664_policystatus,
    snapshotSha256: policyRow.cr664_snapshotsha256,
    effectiveFrom: policyRow.cr664_effectivefrom,
    effectiveThrough: policyRow.cr664_effectivethrough,
  };
  const mappedRules: GovernanceRuntimeRule[] = rules.map((row) => ({
    id: row.cr664_governancepolicyruleid,
    ruleId: row.cr664_ruleid,
    description: row.cr664_description,
    ordinal: row.cr664_ruleordinal,
    nonOverrideable: row.cr664_nonoverrideable,
    sha256: row.cr664_rulesha256,
  }));
  const mappedAuthorities: GovernanceRuntimeAuthority[] = authorities.map((row) => {
    const officer = officers.get(row._cr664_officer_value!.toLowerCase())!;
    return {
      id: row.cr664_authoritygrantid,
      grantId: row.cr664_grantid,
      officerId: officer.systemuserid,
      officerName: officer.fullname!,
      officerUpn: officer.domainname!,
      maximumAmount: row.cr664_maximumamount,
      maximumRelationshipExposure: row.cr664_maximumrelationshipexposure,
      maximumUnsecuredAmount: row.cr664_maximumunsecuredamount,
      effectiveFrom: row.cr664_effectivefrom,
      effectiveThrough: row.cr664_effectivethrough,
    };
  });
  const mappedAssignments: GovernanceRuntimeRoleAssignment[] = assignments.map((row) => {
    const officer = officers.get(row._cr664_officer_value!.toLowerCase())!;
    return {
      id: row.cr664_governanceroleassignmentid,
      assignmentId: row.cr664_assignmentid,
      officerId: officer.systemuserid,
      officerName: officer.fullname!,
      officerUpn: officer.domainname!,
      roleCode: row.cr664_rolecode,
      effectiveFrom: row.cr664_effectivefrom,
      effectiveThrough: row.cr664_effectivethrough,
    };
  });

  return {
    code: 'ACTIVE',
    isGo: true,
    diagnostic: 'One enabled profile, one effective policy, its complete immutable rule set, active authority, and active role assignments resolved from live Dataverse evidence.',
    queriedAt: nowIso,
    evidence: { profile, policy, rules: mappedRules, authorities: mappedAuthorities, roleAssignments: mappedAssignments },
  };
}

function unwrap<T>(result: { success: boolean; data?: T; error?: { message?: string } }, label: string): T {
  if (!result.success) throw new Error(result.error?.message ?? `${label} query failed`);
  if (result.data === undefined) throw new Error(`${label} query returned no data payload`);
  return result.data;
}

export async function loadGovernanceRuntimeState(): Promise<GovernanceRuntimeState> {
  const queriedAt = new Date().toISOString();
  let phase = 'profile';
  try {
    phase = 'Dataverse connector initialization';
    const [
      { Cr664_creditgovernanceprofilesService },
      { Cr664_creditpolicyversionsService },
      { Cr664_governancepolicyrulesService },
      { Cr664_authoritygrantsService },
      { Cr664_governanceroleassignmentsService },
      { SystemusersService },
    ] = await Promise.all([
      import('../generated/services/Cr664_creditgovernanceprofilesService'),
      import('../generated/services/Cr664_creditpolicyversionsService'),
      import('../generated/services/Cr664_governancepolicyrulesService'),
      import('../generated/services/Cr664_authoritygrantsService'),
      import('../generated/services/Cr664_governanceroleassignmentsService'),
      import('../generated/services/SystemusersService'),
    ]);
    phase = 'profile';
    const profiles = unwrap(await Cr664_creditgovernanceprofilesService.getAll({
      select: [
        'cr664_creditgovernanceprofileid',
        'cr664_bankkey',
        'cr664_displayname',
        'cr664_profileenabled',
        'statecode',
      ],
      top: 20,
    }), phase);

    const enabledProfiles = profiles.filter((row) => row.statecode === 0 && row.cr664_profileenabled);
    if (profiles.length === 0) return fail('NO_PROFILE', 'No governance profile was returned by Dataverse.', queriedAt, phase);
    if (enabledProfiles.length === 0) return fail('PROFILE_INACTIVE', 'Governance profile rows exist, but none is enabled and active.', queriedAt, phase);
    if (enabledProfiles.length !== 1) return fail('PROFILE_AMBIGUOUS', `Expected one enabled governance profile; found ${enabledProfiles.length}.`, queriedAt, phase);
    const profileId = enabledProfiles[0]!.cr664_creditgovernanceprofileid;

    phase = 'policy';
    const policies = unwrap(await Cr664_creditpolicyversionsService.getAll({
      select: [
        'cr664_creditpolicyversionid',
        'cr664_policyid',
        'cr664_versionnumber',
        'cr664_policystatus',
        'cr664_snapshotjson',
        'cr664_snapshotsha256',
        'cr664_effectivefrom',
        'cr664_effectivethrough',
        'statecode',
      ],
      filter: `_cr664_governanceprofile_value eq ${profileId}`,
      top: 20,
    }), phase);
    const now = Date.parse(queriedAt);
    const activePolicies = policies.filter((row) => activeAt(
      row.statecode,
      row.cr664_policystatus,
      row.cr664_effectivefrom,
      row.cr664_effectivethrough,
      now,
    ));
    if (activePolicies.length === 0) return fail('POLICY_MISSING', 'The active profile has no currently effective ACTIVE policy version.', queriedAt, phase);
    if (activePolicies.length !== 1) return fail('POLICY_AMBIGUOUS', `Expected one currently effective ACTIVE policy; found ${activePolicies.length}.`, queriedAt, phase);
    const policyId = activePolicies[0]!.cr664_creditpolicyversionid;

    phase = 'governance evidence';
    const [rulesResult, authoritiesResult, rolesResult] = await Promise.all([
      Cr664_governancepolicyrulesService.getAll({
        select: [
          'cr664_governancepolicyruleid',
          'cr664_ruleid',
          'cr664_description',
          'cr664_ruleordinal',
          'cr664_nonoverrideable',
          'cr664_rulesha256',
          'statecode',
        ],
        filter: `_cr664_policyversion_value eq ${policyId}`,
        orderBy: ['cr664_ruleordinal asc'],
      }),
      Cr664_authoritygrantsService.getAll({
        select: [
          'cr664_authoritygrantid',
          'cr664_grantid',
          'cr664_grantstate',
          'cr664_maximumamount',
          'cr664_maximumrelationshipexposure',
          'cr664_maximumunsecuredamount',
          'cr664_effectivefrom',
          'cr664_effectivethrough',
          '_cr664_officer_value',
          'statecode',
        ],
        filter: `_cr664_governanceprofile_value eq ${profileId}`,
      }),
      Cr664_governanceroleassignmentsService.getAll({
        select: [
          'cr664_governanceroleassignmentid',
          'cr664_assignmentid',
          'cr664_assignmentstate',
          'cr664_rolecode',
          'cr664_effectivefrom',
          'cr664_effectivethrough',
          '_cr664_officer_value',
          'statecode',
        ],
        filter: `_cr664_governanceprofile_value eq ${profileId}`,
      }),
    ]);
    const rules = unwrap(rulesResult, 'rules');
    const authorities = unwrap(authoritiesResult, 'authority');
    const roleAssignments = unwrap(rolesResult, 'role assignment');

    phase = 'officer identity';
    const officerIds = [...new Set([
      ...authorities.map((row) => row._cr664_officer_value),
      ...roleAssignments.map((row) => row._cr664_officer_value),
    ].filter((value): value is string => Boolean(value)))];
    const officers = await Promise.all(officerIds.map(async (id) => unwrap(await SystemusersService.get(id, {
      select: ['systemuserid', 'fullname', 'domainname', 'isdisabled'],
    }), `officer ${id}`)));

    return evaluateGovernanceRuntimeRows({
      profiles,
      policies,
      rules,
      authorities,
      roleAssignments,
      officers,
    }, queriedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Dataverse query failure';
    return fail('QUERY_FAILED', `Live governance hydration failed closed during ${phase}: ${message}`, queriedAt, phase);
  }
}
