import { describe, it, expect } from 'vitest';
import {
  detectDuplicateOrganizationFlags,
  findDuplicateDealClusters,
  detectDuplicateDealFlags,
  detectZeroAmountDealFlags,
  parseAdminEntitlementIdentity,
  detectDuplicateEntitlementFlags,
  detectInconsistentBoardingLinkageFlags,
  buildDataQualityFlagCandidates,
  excludeAlreadyFlagged,
  type DealScanRow,
  type EntitlementScanRow,
  type BoardingLinkageDealRow,
  type BoardedLoanLinkRow,
} from './dataQualityFlagCandidates';
import type { DataQualityFlagRow } from '../adminDiagnosticsQueries';

describe('Workstream O — detectDuplicateOrganizationFlags', () => {
  it('emits one candidate per duplicate-organization cluster', () => {
    const flags = detectDuplicateOrganizationFlags([
      { organizationId: 'o1', name: 'Acme LLC' },
      { organizationId: 'o2', name: 'ACME, L.L.C.' },
      { organizationId: 'o3', name: 'Distinct Co' },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.category).toBe('duplicate-organization');
    expect(flags[0]!.sourceTable).toBe('cr664_crmorganizations');
    expect(flags[0]!.sourceRecordId).toBe('o1');
    expect(flags[0]!.flagDescription).toContain('o1');
    expect(flags[0]!.flagDescription).toContain('o2');
  });

  it('emits no candidates when nothing duplicates', () => {
    expect(
      detectDuplicateOrganizationFlags([{ organizationId: 'o1', name: 'Solo Inc' }]),
    ).toHaveLength(0);
  });
});

describe('Workstream O — findDuplicateDealClusters', () => {
  const deals: DealScanRow[] = [
    { dealId: 'd1', dealName: 'Acme Working Capital', clientName: 'Acme LLC' },
    { dealId: 'd2', dealName: 'ACME WORKING CAPITAL', clientName: 'Acme Inc' },
    { dealId: 'd3', dealName: 'Beta Term Loan', clientName: 'Beta Co' },
  ];

  it('clusters deals by normalized deal name', () => {
    const clusters = findDuplicateDealClusters(deals);
    const nameCluster = clusters.find((c) => c.matchType === 'dealName');
    expect([...(nameCluster?.dealIds ?? [])].sort()).toEqual(['d1', 'd2']);
  });

  it('does not re-report a deal already claimed by a stronger match', () => {
    const clusters = findDuplicateDealClusters(deals);
    // d1/d2 matched on dealName; they must not ALSO appear in a clientName cluster.
    const clientCluster = clusters.find((c) => c.matchType === 'clientName');
    expect(clientCluster).toBeUndefined();
  });

  it('never clusters a lone deal', () => {
    const clusters = findDuplicateDealClusters([{ dealId: 'solo', dealName: 'Solo Deal' }]);
    expect(clusters).toHaveLength(0);
  });
});

describe('Workstream O — detectDuplicateDealFlags', () => {
  it('emits a duplicate-deal candidate AND a suspicious-active-deal candidate per cluster member context', () => {
    const flags = detectDuplicateDealFlags([
      { dealId: 'd1', dealName: 'Gamma Corp Loan' },
      { dealId: 'd2', dealName: 'Gamma Corp Loan' },
    ]);
    const categories = flags.map((f) => f.category).sort();
    expect(categories).toEqual(['duplicate-deal', 'suspicious-active-deal']);
    for (const f of flags) {
      expect(f.sourceTable).toBe('cr664_loandeal');
      expect(f.sourceRecordId).toBe('d1');
    }
  });

  it('emits nothing when no deals cluster', () => {
    expect(
      detectDuplicateDealFlags([{ dealId: 'd1', dealName: 'Unique Deal' }]),
    ).toHaveLength(0);
  });
});

describe('Workstream O — detectZeroAmountDealFlags', () => {
  it('flags a deal with amount exactly zero', () => {
    const flags = detectZeroAmountDealFlags([{ dealId: 'd1', dealName: 'X', amount: 0 }]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.category).toBe('zero-amount-deal');
    expect(flags[0]!.flagDescription).toContain('zero');
  });

  it('flags a deal with no amount recorded (undefined)', () => {
    const flags = detectZeroAmountDealFlags([{ dealId: 'd1', dealName: 'X' }]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.flagDescription).toContain('not recorded');
  });

  it('does not flag a deal with a positive amount', () => {
    expect(
      detectZeroAmountDealFlags([{ dealId: 'd1', dealName: 'X', amount: 500_000 }]),
    ).toHaveLength(0);
  });
});

describe('Workstream O — parseAdminEntitlementIdentity', () => {
  it('parses the "{upn} - Admin {level} Access" convention, case-insensitively', () => {
    expect(parseAdminEntitlementIdentity('jane@bank.com - Admin Full Access')).toEqual({
      upn: 'jane@bank.com',
      level: 'full',
    });
    expect(parseAdminEntitlementIdentity('JANE@BANK.COM - admin ADMIN access')).toEqual({
      upn: 'jane@bank.com',
      level: 'admin',
    });
  });

  it('returns undefined for a name that does not match the convention', () => {
    expect(parseAdminEntitlementIdentity('Some unrelated entitlement name')).toBeUndefined();
  });
});

describe('Workstream O — detectDuplicateEntitlementFlags', () => {
  const rows: EntitlementScanRow[] = [
    { id: 'e1', entitlementName: 'jane@bank.com - Admin Full Access', accessLevelKind: 'Full', active: true },
    { id: 'e2', entitlementName: 'jane@bank.com - Admin Full Access', accessLevelKind: 'Full', active: true },
    { id: 'e3', entitlementName: 'sam@bank.com - Admin Admin Access', accessLevelKind: 'Admin', active: true },
  ];

  it('flags two active entitlements resolving to the same upn + level', () => {
    const flags = detectDuplicateEntitlementFlags(rows);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.category).toBe('duplicate-entitlement');
    expect(flags[0]!.sourceTable).toBe('cr664_workspaceentitlementses');
    expect(flags[0]!.flagDescription).toContain('jane@bank.com');
  });

  it('ignores inactive rows entirely', () => {
    const flags = detectDuplicateEntitlementFlags([
      { ...rows[0]!, active: false },
      { ...rows[1]!, active: false },
    ]);
    expect(flags).toHaveLength(0);
  });

  it('ignores entitlement names that do not parse', () => {
    const flags = detectDuplicateEntitlementFlags([
      { id: 'e9', entitlementName: 'garbage', accessLevelKind: 'Full', active: true },
      { id: 'e10', entitlementName: 'garbage', accessLevelKind: 'Full', active: true },
    ]);
    expect(flags).toHaveLength(0);
  });
});

describe('Workstream O — detectInconsistentBoardingLinkageFlags', () => {
  const deals: BoardingLinkageDealRow[] = [
    { dealId: 'd1', dealName: 'Boarded No Record', stage: 'BOARDED' },
    { dealId: 'd2', dealName: 'Underwriting Deal', stage: 'UNDERWRITING' },
    { dealId: 'd3', dealName: 'Properly Boarded', stage: 'BOARDED' },
  ];

  it('flags a deal claiming BOARDED with no active handoff record (missing-handoff)', () => {
    const flags = detectInconsistentBoardingLinkageFlags(deals, []);
    const forD1 = flags.filter((f) => f.sourceRecordId === 'd1');
    expect(forD1).toHaveLength(1);
    expect(forD1[0]!.flagDescription).toMatch(/no active/i);
  });

  it('flags an active handoff record on a deal not at BOARDED (premature-handoff)', () => {
    const boardedLoans: BoardedLoanLinkRow[] = [
      { portfolioBoardedLoanId: 'b1', originatedLoanDealId: 'd2', assignedServicingOwnerId: undefined, active: true },
      { portfolioBoardedLoanId: 'b2', originatedLoanDealId: 'd3', assignedServicingOwnerId: 'u1', active: true },
    ];
    const flags = detectInconsistentBoardingLinkageFlags(deals, boardedLoans);
    const forD2 = flags.find((f) => f.sourceRecordId === 'd2');
    expect(forD2).toBeDefined();
    expect(forD2!.flagDescription).toMatch(/not BOARDED|premature/i);
    // d3 is properly boarded with an active record -- never flagged.
    expect(flags.some((f) => f.sourceRecordId === 'd3')).toBe(false);
  });
});

describe('Workstream O — buildDataQualityFlagCandidates composes all five detectors', () => {
  it('returns candidates from every detector given a mixed input', () => {
    const candidates = buildDataQualityFlagCandidates({
      organizations: [
        { organizationId: 'o1', name: 'Acme LLC' },
        { organizationId: 'o2', name: 'Acme Inc' },
      ],
      deals: [
        { dealId: 'd1', dealName: 'Dup Deal', amount: 0, stage: 'BOARDED' },
        { dealId: 'd2', dealName: 'Dup Deal', amount: 100, stage: 'UNDERWRITING' },
      ],
      entitlements: [
        { id: 'e1', entitlementName: 'a@b.com - Admin Full Access', accessLevelKind: 'Full', active: true },
        { id: 'e2', entitlementName: 'a@b.com - Admin Full Access', accessLevelKind: 'Full', active: true },
      ],
      boardedLoans: [],
    });
    const categories = new Set(candidates.map((c) => c.category));
    expect(categories.has('duplicate-organization')).toBe(true);
    expect(categories.has('duplicate-deal')).toBe(true);
    expect(categories.has('suspicious-active-deal')).toBe(true);
    expect(categories.has('zero-amount-deal')).toBe(true);
    expect(categories.has('duplicate-entitlement')).toBe(true);
    expect(categories.has('inconsistent-boarding-linkage')).toBe(true);
  });
});

describe('Workstream O — excludeAlreadyFlagged', () => {
  it('drops a candidate that already has a matching open flag', () => {
    const candidates = buildDataQualityFlagCandidates({
      organizations: [],
      deals: [{ dealId: 'd1', dealName: 'X', amount: 0 }],
      entitlements: [],
      boardedLoans: [],
    });
    const openFlags: DataQualityFlagRow[] = [
      {
        id: 'f1',
        flagName: candidates[0]!.flagName,
        flagDescription: undefined,
        flagType: 'InvalidValue',
        resolutionStatus: 'Open',
        flaggedDate: undefined,
        sourceTable: candidates[0]!.sourceTable,
        sourceRecordId: candidates[0]!.sourceRecordId,
      },
    ];
    expect(excludeAlreadyFlagged(candidates, openFlags)).toHaveLength(0);
  });

  it('keeps a candidate with no matching open flag', () => {
    const candidates = buildDataQualityFlagCandidates({
      organizations: [],
      deals: [{ dealId: 'd1', dealName: 'X', amount: 0 }],
      entitlements: [],
      boardedLoans: [],
    });
    expect(excludeAlreadyFlagged(candidates, [])).toHaveLength(candidates.length);
  });
});
