import { describe, it, expect, vi } from 'vitest';
import { buildAdvisorRelationshipInput, addAdvisorLink } from './advisorLink';
import { ADVISOR_ROLES, isValidAdvisorRole } from './advisorRoles';
import type { CrmWriteDeps } from '../write/crmWriteAdapter';

const ACTOR = { actorEmail: 'banker@bank.test', actorSystemUserId: 'sys-1', authorized: true };

function stubDeps(over: Partial<CrmWriteDeps> = {}): CrmWriteDeps {
  const ok = async () => ({ success: true, id: 'rel-1' });
  const read = async () => ({ success: true, data: { cr664_name: 'X' } });
  return {
    createOrganization: vi.fn(ok),
    readOrganization: vi.fn(read),
    createPerson: vi.fn(ok),
    readPerson: vi.fn(read),
    createRelationship: vi.fn(ok),
    readRelationship: vi.fn(read),
    createTimelineEvent: vi.fn(ok),
    readTimelineEvent: vi.fn(read),
    createContactPoint: vi.fn(ok),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-id' })),
    ...over,
  };
}

describe('advisor roles', () => {
  it('treats CDC as a first-class role', () => {
    expect(ADVISOR_ROLES).toContain('CDC (Certified Development Company)');
    expect(isValidAdvisorRole('CDC (Certified Development Company)')).toBe(true);
  });
  it('rejects off-list roles', () => {
    expect(isValidAdvisorRole('Sidekick')).toBe(false);
  });
});

describe('buildAdvisorRelationshipInput', () => {
  const base = {
    ...ACTOR,
    advisorOrganizationId: 'adv-1',
    clientOrganizationId: 'cli-1',
    role: 'CPA / Accountant',
    advisorName: 'Smith CPA',
    clientName: 'Acme LLC',
  };

  it('maps an advisor link to a governed relationship (advisor=source, client=target)', () => {
    const r = buildAdvisorRelationshipInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sourceOrganizationId).toBe('adv-1');
      expect(r.value.targetOrganizationId).toBe('cli-1');
      expect(r.value.role).toBe('CPA / Accountant');
      expect(r.value.relationshipType).toBe('Advisor');
      expect(r.value.name).toBe('Smith CPA — CPA / Accountant → Acme LLC');
    }
  });

  it('carries an optional deal id for deal-level attribution', () => {
    const r = buildAdvisorRelationshipInput({ ...base, originatedDealId: 'deal-9' });
    expect(r.ok && r.value.originatedDealId).toBe('deal-9');
  });

  it('fails closed on an off-list role / missing parties', () => {
    expect(buildAdvisorRelationshipInput({ ...base, role: 'Wizard' }).ok).toBe(false);
    expect(buildAdvisorRelationshipInput({ ...base, advisorOrganizationId: '' }).ok).toBe(false);
    expect(buildAdvisorRelationshipInput({ ...base, clientOrganizationId: '' }).ok).toBe(false);
  });
});

describe('addAdvisorLink (governed)', () => {
  it('writes a relationship binding advisor → client with the role, and an audit', async () => {
    const deps = stubDeps();
    const outcome = await addAdvisorLink(
      { ...ACTOR, advisorOrganizationId: 'adv-1', clientOrganizationId: 'cli-1', role: 'Attorney', advisorName: 'Lex Law', clientName: 'Acme' },
      deps,
    );
    expect(outcome.kind).toBe('success');
    const payload = (deps.createRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload['cr664_SourceOrganization@odata.bind']).toBe('/cr664_crmorganizations(adv-1)');
    expect(payload['cr664_TargetOrganization@odata.bind']).toBe('/cr664_crmorganizations(cli-1)');
    expect(payload.cr664_role).toBe('Attorney');
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
  });

  it('binds the deal lookup when a deal id is given (deal-level)', async () => {
    const deps = stubDeps();
    await addAdvisorLink(
      { ...ACTOR, advisorOrganizationId: 'cdc-1', clientOrganizationId: 'cli-1', role: 'CDC (Certified Development Company)', originatedDealId: 'deal-504' },
      deps,
    );
    const payload = (deps.createRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload['cr664_OriginatedLoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-504)');
  });

  it('rejects an off-list role without writing', async () => {
    const deps = stubDeps();
    const outcome = await addAdvisorLink(
      { ...ACTOR, advisorOrganizationId: 'adv-1', clientOrganizationId: 'cli-1', role: 'Consigliere' },
      deps,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(deps.createRelationship).not.toHaveBeenCalled();
  });
});
