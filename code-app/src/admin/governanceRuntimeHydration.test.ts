import { describe, expect, it } from 'vitest';
import {
  evaluateGovernanceRuntimeRows,
  type GovernanceRuntimeRows,
} from './governanceRuntimeHydration';

const SHA = 'a'.repeat(64);
const NOW = '2026-08-03T12:00:00.000Z';

function validRows(): GovernanceRuntimeRows {
  return {
    profiles: [{
      cr664_creditgovernanceprofileid: 'profile-active',
      cr664_bankkey: 'OGB',
      cr664_displayname: 'Old Glory Bank Commercial Credit',
      cr664_profileenabled: true,
      statecode: 0,
    }],
    policies: [{
      cr664_creditpolicyversionid: 'policy-active',
      cr664_policyid: 'OGB-CREDIT-POLICY',
      cr664_versionnumber: 1,
      cr664_policystatus: 'ACTIVE',
      cr664_snapshotjson: JSON.stringify({ rules: [{}, {}, {}, {}] }),
      cr664_snapshotsha256: SHA,
      cr664_effectivefrom: '2026-07-30T00:00:00.000Z',
      statecode: 0,
    }],
    rules: [1, 2, 3, 4].map((ordinal) => ({
      cr664_governancepolicyruleid: `rule-${ordinal}`,
      cr664_ruleid: `OGB-RULE-${ordinal}`,
      cr664_description: `Governance rule ${ordinal}`,
      cr664_ruleordinal: ordinal,
      cr664_nonoverrideable: ordinal === 1,
      cr664_rulesha256: SHA,
      statecode: 0,
    })),
    authorities: [{
      cr664_authoritygrantid: 'authority-active',
      cr664_grantid: 'MATTHEW-OPTION-A',
      cr664_grantstate: 'ACTIVE',
      cr664_maximumamount: 1_000_000,
      cr664_maximumrelationshipexposure: 1_000_000,
      cr664_maximumunsecuredamount: 0,
      cr664_effectivefrom: '2026-07-30T00:00:00.000Z',
      _cr664_officer_value: 'officer-matthew',
      statecode: 0,
    }],
    roleAssignments: [{
      cr664_governanceroleassignmentid: 'role-active',
      cr664_assignmentid: 'MATTHEW-GOVERNANCE-ROLE',
      cr664_assignmentstate: 'ACTIVE',
      cr664_rolecode: 'AUTHORIZED_OFFICER',
      cr664_effectivefrom: '2026-07-30T00:00:00.000Z',
      _cr664_officer_value: 'officer-matthew',
      statecode: 0,
    }],
    officers: [{
      systemuserid: 'officer-matthew',
      fullname: 'Matthew Paller',
      domainname: 'mpaller@oldglorybank.com',
      isdisabled: false,
    }],
  };
}

describe('governance runtime hydration invariants', () => {
  it('returns GO only for a complete active profile, policy, rule set, authority, and role chain', () => {
    const result = evaluateGovernanceRuntimeRows(validRows(), NOW);
    expect(result.code).toBe('ACTIVE');
    expect(result.isGo).toBe(true);
    expect(result.evidence?.rules).toHaveLength(4);
    expect(result.evidence?.authorities[0]?.officerUpn).toBe('mpaller@oldglorybank.com');
  });

  it('fails closed when no profile exists', () => {
    const rows = validRows();
    const result = evaluateGovernanceRuntimeRows({ ...rows, profiles: [] }, NOW);
    expect(result).toMatchObject({ code: 'NO_PROFILE', isGo: false, queryPhase: 'profile' });
  });

  it('fails closed when the only profile is inactive', () => {
    const rows = validRows();
    const result = evaluateGovernanceRuntimeRows({
      ...rows,
      profiles: rows.profiles.map((profile) => ({ ...profile, cr664_profileenabled: false })),
    }, NOW);
    expect(result).toMatchObject({ code: 'PROFILE_INACTIVE', isGo: false });
  });

  it('deterministically resolves one uniquely active profile without relying on a browser selection', () => {
    const rows = validRows();
    const result = evaluateGovernanceRuntimeRows({
      ...rows,
      profiles: [
        ...rows.profiles,
        { ...rows.profiles[0]!, cr664_creditgovernanceprofileid: 'profile-retired', cr664_profileenabled: false, statecode: 1 },
      ],
    }, NOW);
    expect(result).toMatchObject({ code: 'ACTIVE', isGo: true });
    expect(result.evidence?.profile.id).toBe('profile-active');
  });

  it('fails closed when an immutable rule is absent', () => {
    const rows = validRows();
    const result = evaluateGovernanceRuntimeRows({ ...rows, rules: rows.rules.slice(0, 3) }, NOW);
    expect(result).toMatchObject({ code: 'RULES_MISSING', isGo: false });
  });
});
