import { describe, it, expect } from 'vitest';
import {
  resolveNewDealCrmClientLink,
  newDealCrmLinkSatisfied,
  NEW_DEAL_CRM_LINKAGE_REQUIRED,
  type CanonicalCrmClientRef,
} from './newDealCrmClientLinkage';
import { CRM_TEAM_READINESS_LEDGER } from '../readiness/unifiedCrmReadiness';

const CLIENTS: CanonicalCrmClientRef[] = [
  { id: 'org-1', name: 'Acme Holdings' },
  { id: 'org-2', name: 'Beta Corp' },
];

describe('CRM-F — new-deal → CRM client linkage', () => {
  it('linkage is a required, wired step in the new-deal flow', () => {
    expect(NEW_DEAL_CRM_LINKAGE_REQUIRED).toBe(true);
  });

  it('a new deal can select/link an existing canonical CRM client', () => {
    const link = resolveNewDealCrmClientLink({ selectedClientId: 'org-2', canonicalClients: CLIENTS });
    expect(link.status).toBe('linked');
    expect(link.linkedClientId).toBe('org-2');
    expect(link.linkedClientName).toBe('Beta Corp');
    expect(link.blocked).toBe(false);
    expect(link.fabricated).toBe(false);
    expect(newDealCrmLinkSatisfied(link)).toBe(true);
  });

  it('a missing client produces an actionable blocked state (deal cannot proceed)', () => {
    const link = resolveNewDealCrmClientLink({ canonicalClients: CLIENTS });
    expect(link.status).toBe('blocked-no-client-selected');
    expect(link.blocked).toBe(true);
    expect(link.actionRequired).toMatch(/select an existing crm client/i);
    expect(newDealCrmLinkSatisfied(link)).toBe(false);
  });

  it('never creates a fake client: an unknown name / id is blocked, not fabricated', () => {
    const byName = resolveNewDealCrmClientLink({ selectedClientName: 'Ghost LLC', canonicalClients: CLIENTS });
    expect(byName.status).toBe('blocked-client-not-canonical');
    expect(byName.linkedClientId).toBeNull();
    expect(byName.fabricated).toBe(false);

    const byBadId = resolveNewDealCrmClientLink({ selectedClientId: 'org-999', canonicalClients: CLIENTS });
    expect(byBadId.status).toBe('blocked-client-not-canonical');
    expect(byBadId.fabricated).toBe(false);
  });

  it('a governed-create request routes to the identity-gated create, still creating no client here', () => {
    const link = resolveNewDealCrmClientLink({
      selectedClientName: 'New Borrower Inc',
      requestGovernedClientCreate: true,
      canonicalClients: CLIENTS,
    });
    expect(link.status).toBe('governed-create-required');
    expect(link.blocked).toBe(true);
    expect(link.fabricated).toBe(false);
    expect(link.actionRequired).toMatch(/governed crm create/i);
  });

  it('the delivery ledger records new-deal linkage as operational', () => {
    expect(CRM_TEAM_READINESS_LEDGER.newDealLinkageOperational).toBe(true);
  });
});
