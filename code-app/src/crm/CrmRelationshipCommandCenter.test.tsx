// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrmRelationshipCommandCenter } from './CrmRelationshipCommandCenter';
import { createDisabledCrmPersistenceAdapter } from './crmPersistenceAdapter';
import { createEmptyCrmMaster, type CrmMaster } from '../shared/crm/crmTypes';

function master(): CrmMaster {
  return {
    ...createEmptyCrmMaster(),
    organizations: [{ orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' }],
    people: [{ personId: 'P1', fullName: 'Synthetic Person', orgId: 'ORG1', personType: 'customer_contact', status: 'active' }],
  };
}

describe('Phase 141B-H — CRM command center renders honest states', () => {
  it('empty master shows honest empty network + task states', () => {
    render(<CrmRelationshipCommandCenter master={createEmptyCrmMaster()} asOfDate="2026-06-08" />);
    expect(screen.getByText('No organizations in CRM.')).toBeInTheDocument();
    expect(screen.getByText('No CRM contact tasks.')).toBeInTheDocument();
  });

  it('renders authorized organizations + surfaces missing-contact tasks (no fake rows)', () => {
    render(<CrmRelationshipCommandCenter master={master()} asOfDate="2026-06-08" />);
    expect(screen.getAllByText('Synthetic Org').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('add_primary_contact')).toBeInTheDocument();
  });

  it('has no create/edit/delete write affordance', () => {
    const { container } = render(<CrmRelationshipCommandCenter master={master()} />);
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});

describe('Phase 141B-H — disabled CRM adapter writes nothing', () => {
  it('every operation fails closed with not_configured', async () => {
    const a = createDisabledCrmPersistenceAdapter();
    expect(a.enabled).toBe(false);
    const save = await a.saveOrganization({ orgId: 'X', orgType: 'customer', status: 'active' });
    const read = await a.readCrmMaster();
    expect(save.ok).toBe(false);
    expect(save.errorCode).toBe('not_configured');
    expect(read.ok).toBe(false);
  });
});
