import { describe, it, expect } from 'vitest';
import * as model from './crmSalesforceSpineModel';
import {
  CRM_SPINE_ENTITIES,
  coverageTeamFromAuthorizedFacts,
  getCrmSpineEntity,
  toProvisionalAccount,
} from './crmSalesforceSpineModel';
import type { CrmCanonicalClientNode } from './crmRelationshipViewModel';

/**
 * Phase 189J — Salesforce CRM spine MODEL behavior.
 *
 * Proves the model offers only honest projections of facts already held and
 * fabricates no records.
 */

const clientStub: CrmCanonicalClientNode = {
  id: 'client-guid',
  name: 'Acme Holdings LLC',
  lookupClassification: 'real-lookup',
};

describe('toProvisionalAccount — stub maps to PROVISIONAL identity, not a full Account', () => {
  it('projects the client stub into a provisional account with full-account fields null', () => {
    const acct = toProvisionalAccount(clientStub);
    expect(acct).not.toBeNull();
    expect(acct!.isProvisional).toBe(true);
    expect(acct!.origin).toBe('provisional-stub');
    expect(acct!.name).toBe('Acme Holdings LLC');
    expect(acct!.provisionalFromLogicalName).toBe('cr664_clientrelationship');
    expect(acct!.provisionalFromRecordId).toBe('client-guid');
    // NOT a full Account — every full-account attribute stays null.
    expect(acct!.accountType).toBeNull();
    expect(acct!.legalName).toBeNull();
    expect(acct!.industry).toBeNull();
    expect(acct!.relationshipStartDate).toBeNull();
  });

  it('returns null when there is no stub (never invents an account)', () => {
    expect(toProvisionalAccount(null)).toBeNull();
    expect(toProvisionalAccount(undefined)).toBeNull();
  });
});

describe('coverageTeamFromAuthorizedFacts — derived ONLY from authorized banker/team facts', () => {
  it('derives a banker + team member from the facts', () => {
    const members = coverageTeamFromAuthorizedFacts({
      assignedBanker: { id: 'banker-guid', name: 'Dana Banker' },
      team: { id: 'team-guid', name: 'Commercial East' },
    });
    expect(members).toHaveLength(2);
    const banker = members.find((m) => m.memberType === 'banker');
    const team = members.find((m) => m.memberType === 'team');
    expect(banker?.coverageRole).toBe('assigned-banker');
    expect(banker?.sourceLogicalName).toBe('cr664_banker');
    expect(banker?.origin).toBe('authorized-fact');
    expect(team?.coverageRole).toBe('coverage-team');
    expect(team?.sourceLogicalName).toBe('cr664_team');
  });

  it('returns an empty list when there are no authorized facts (no fabrication)', () => {
    expect(coverageTeamFromAuthorizedFacts({})).toEqual([]);
    expect(coverageTeamFromAuthorizedFacts({ assignedBanker: null, team: null })).toEqual([]);
  });
});

describe('entity registry covers all 11 launch entities with honest requirements', () => {
  it('registers exactly the 11 named spine entities', () => {
    const keys = CRM_SPINE_ENTITIES.map((e) => e.key).sort();
    expect(keys).toEqual(
      [
        'account',
        'contact',
        'accountContactRelationship',
        'relationshipRole',
        'coverageTeamMember',
        'dealRelationship',
        'activity',
        'task',
        'relationshipHealth',
        'sourceFact',
        'visibilityRequirement',
      ].sort(),
    );
  });

  it('account requires schema + seed + migration (stub → organization)', () => {
    const a = getCrmSpineEntity('account');
    expect(a.schemaRequired).toBe(true);
    expect(a.seedRequired).toBe(true);
    expect(a.migrationRequired).toBe(true);
    expect(a.backingTable).toBe('cr664_crmorganization');
  });

  it('contact / activity / relationshipRole are seed+schema spine entities', () => {
    for (const key of ['contact', 'activity', 'relationshipRole'] as const) {
      const e = getCrmSpineEntity(key);
      expect(e.sourceKind).toBe('seeded-spine');
      expect(e.seedRequired).toBe(true);
      expect(e.schemaRequired).toBe(true);
    }
  });

  it('task has no planned table (schema-required, no spine table key)', () => {
    const t = getCrmSpineEntity('task');
    expect(t.spineTableKey).toBeNull();
    expect(t.schemaRequired).toBe(true);
    expect(t.backingTable).toBe('cr664_crmtask');
  });

  it('coverage team / deal relationship / health are derived authorized facts (no schema/seed)', () => {
    for (const key of ['coverageTeamMember', 'dealRelationship', 'relationshipHealth'] as const) {
      const e = getCrmSpineEntity(key);
      expect(e.sourceKind).toBe('authorized-fact');
      expect(e.schemaRequired).toBe(false);
      expect(e.seedRequired).toBe(false);
    }
  });

  it('source fact / visibility requirement are renderable policy/meta', () => {
    for (const key of ['sourceFact', 'visibilityRequirement'] as const) {
      expect(getCrmSpineEntity(key).sourceKind).toBe('policy');
    }
  });
});

describe('the model fabricates nothing', () => {
  it('exposes no constructor for contacts/roles/activities/tasks/timeline', () => {
    const m = model as unknown as Record<string, unknown>;
    for (const forbidden of [
      'createContact',
      'createAccount',
      'fakeContact',
      'sampleAccount',
      'createRole',
      'createActivity',
      'createTask',
      'seedContacts',
      'buildTimeline',
    ]) {
      expect(m[forbidden]).toBeUndefined();
    }
    // The only pure projections offered are the two honest ones.
    expect(typeof model.toProvisionalAccount).toBe('function');
    expect(typeof model.coverageTeamFromAuthorizedFacts).toBe('function');
  });
});
