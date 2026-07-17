import { describe, it, expect } from 'vitest';
import { deriveLiveBankerCrmDailyActionInput } from './deriveLiveBankerCrmDailyActionInput';
import type { OrgHealthInputResult } from '../workspace/crmRelationshipHealthData';
import type { CrmHealthInput } from '../crmRelationshipHealthModel';

const NOW = '2026-07-17T00:00:00.000Z';

function orgResult(organizationId: string, organizationName: string, input: CrmHealthInput): OrgHealthInputResult {
  return { organizationId, organizationName, input };
}

describe('deriveLiveBankerCrmDailyActionInput — metaphor-lane categories are always empty (hard-pinned regression)', () => {
  it('matchConflicts, sourceOfTruthConflicts, syncPreviewBlocked, ncinoWorkflowGaps, salesforceOpportunityGaps stay empty regardless of input', () => {
    const orgHealthInputs: OrgHealthInputResult[] = [
      orgResult('o1', 'Acme Holdings', { contactCount: 0, activityCount: 0, lastActivityIso: null, nowIso: NOW }),
      orgResult('o2', 'Globex Inc', { contactCount: undefined, activityCount: undefined, lastActivityIso: undefined, nowIso: NOW }),
    ];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.matchConflicts).toEqual([]);
    expect(result.sourceOfTruthConflicts).toEqual([]);
    expect(result.syncPreviewBlocked).toEqual([]);
    expect(result.ncinoWorkflowGaps).toEqual([]);
    expect(result.salesforceOpportunityGaps).toEqual([]);
  });

  it('stays empty even with an empty orgHealthInputs list', () => {
    const result = deriveLiveBankerCrmDailyActionInput([], new Map());
    expect(result.matchConflicts).toEqual([]);
    expect(result.sourceOfTruthConflicts).toEqual([]);
    expect(result.syncPreviewBlocked).toEqual([]);
    expect(result.missingContactReadiness).toEqual([]);
    expect(result.activityGaps).toEqual([]);
    expect(result.ncinoWorkflowGaps).toEqual([]);
    expect(result.salesforceOpportunityGaps).toEqual([]);
  });
});

describe('deriveLiveBankerCrmDailyActionInput — missingContactReadiness (real signal only)', () => {
  it('flags an org with a real evidenced zero contacts', () => {
    const orgHealthInputs = [orgResult('o1', 'Acme Holdings', { contactCount: 0, nowIso: NOW })];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.missingContactReadiness).toHaveLength(1);
    expect(result.missingContactReadiness[0].description).toMatch(/Acme Holdings has no CRM contacts/);
    expect(result.missingContactReadiness[0].dealName).toBe('Acme Holdings');
  });

  it('does NOT flag an org whose contact domain failed to load (contactCount undefined — honestly unknown, not a gap)', () => {
    const orgHealthInputs = [orgResult('o1', 'Acme Holdings', { contactCount: undefined, nowIso: NOW })];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.missingContactReadiness).toEqual([]);
  });

  it('does NOT flag an org with a real non-zero contact count', () => {
    const orgHealthInputs = [orgResult('o1', 'Acme Holdings', { contactCount: 2, nowIso: NOW })];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.missingContactReadiness).toEqual([]);
  });

  it('threads dealRouteHref through from the supplied map', () => {
    const orgHealthInputs = [orgResult('o1', 'Acme Holdings', { contactCount: 0, nowIso: NOW })];
    const dealHrefByOrgId = new Map([['o1', '/deals/d1']]);
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, dealHrefByOrgId);
    expect(result.missingContactReadiness[0].dealRouteHref).toBe('/deals/d1');
  });
});

describe('deriveLiveBankerCrmDailyActionInput — activityGaps (real signal only)', () => {
  it('flags a stale-activity org (watch severity)', () => {
    const orgHealthInputs = [
      orgResult('o1', 'Acme Holdings', {
        activityCount: 1,
        lastActivityIso: '2026-01-01T00:00:00.000Z', // far more than 90 days before NOW
        nowIso: NOW,
      }),
    ];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.activityGaps).toHaveLength(1);
    expect(result.activityGaps[0].description).toMatch(/Acme Holdings:/);
    expect(result.activityGaps[0].description).toMatch(/day\(s\) ago/i);
  });

  it('flags an org with a real evidenced absence of any activity (activityCount 0, not undefined)', () => {
    const orgHealthInputs = [orgResult('o1', 'Acme Holdings', { activityCount: 0, lastActivityIso: null, nowIso: NOW })];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.activityGaps).toHaveLength(1);
    expect(result.activityGaps[0].description).toMatch(/No activity on record/i);
  });

  it('does NOT flag an org whose activity domain failed to load (activityCount undefined)', () => {
    const orgHealthInputs = [orgResult('o1', 'Acme Holdings', { activityCount: undefined, lastActivityIso: undefined, nowIso: NOW })];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.activityGaps).toEqual([]);
  });

  it('does NOT flag an org with recent activity', () => {
    const orgHealthInputs = [
      orgResult('o1', 'Acme Holdings', { activityCount: 1, lastActivityIso: '2026-07-10T00:00:00.000Z', nowIso: NOW }),
    ];
    const result = deriveLiveBankerCrmDailyActionInput(orgHealthInputs, new Map());
    expect(result.activityGaps).toEqual([]);
  });
});
