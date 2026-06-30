import { describe, it, expect } from 'vitest';
import {
  deriveAdvisorLinks,
  advisorsForClient,
  clientsForAdvisor,
  type RelationshipRow,
} from './advisorViewModel';

const ROWS: RelationshipRow[] = [
  // advisor link by relationshiptype
  {
    cr664_relationshiptype: 'Advisor',
    cr664_role: 'CPA / Accountant',
    _cr664_sourceorganization_value: 'smith-cpa',
    cr664_sourceorganizationname: 'Smith CPA',
    _cr664_targetorganization_value: 'acme',
    cr664_targetorganizationname: 'Acme LLC',
  },
  // advisor link by on-list role (no explicit type), deal-scoped
  {
    cr664_role: 'CDC (Certified Development Company)',
    _cr664_sourceorganization_value: 'metro-cdc',
    cr664_sourceorganizationname: 'Metro CDC',
    _cr664_targetorganization_value: 'acme',
    cr664_targetorganizationname: 'Acme LLC',
    _cr664_originatedloandeal_value: 'deal-504',
    cr664_originatedloandealname: 'Acme 504',
  },
  // not an advisor relationship (generic)
  {
    cr664_relationshiptype: 'Subsidiary',
    cr664_role: 'Parent',
    _cr664_sourceorganization_value: 'x',
    _cr664_targetorganization_value: 'y',
  },
  // advisor role but missing a party → dropped (honest)
  {
    cr664_role: 'Attorney',
    _cr664_sourceorganization_value: 'lex',
    _cr664_targetorganization_value: null,
  },
];

describe('deriveAdvisorLinks', () => {
  it('keeps only advisor relationships with both parties; maps source=advisor, target=client', () => {
    const links = deriveAdvisorLinks(ROWS);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ advisorOrgId: 'smith-cpa', clientOrgId: 'acme', role: 'CPA / Accountant' });
    expect(links[1]).toMatchObject({ advisorOrgId: 'metro-cdc', dealId: 'deal-504', dealName: 'Acme 504' });
  });
});

describe('advisorsForClient / clientsForAdvisor', () => {
  const links = deriveAdvisorLinks(ROWS);
  it('lists advisors on a client', () => {
    const onAcme = advisorsForClient(links, 'acme');
    expect(onAcme.map((l) => l.advisorOrgId).sort()).toEqual(['metro-cdc', 'smith-cpa']);
  });
  it('scopes advisors to a deal when asked', () => {
    expect(advisorsForClient(links, 'acme', 'deal-504').map((l) => l.advisorOrgId)).toEqual(['metro-cdc']);
  });
  it('lists the clients/deals an advisor touches (reverse)', () => {
    expect(clientsForAdvisor(links, 'metro-cdc')).toHaveLength(1);
    expect(clientsForAdvisor(links, 'metro-cdc')[0].clientName).toBe('Acme LLC');
  });
});
