// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { deriveCrmAccountSurfaceViewModel } from './crmAccountViewModel';
import { CrmAccountSurface } from './CrmAccountSurfaces';
import { toProvisionalAccount, coverageTeamFromAuthorizedFacts } from './crmSalesforceSpineModel';

/** Phase 193D — account / contact / coverage surfaces. */

const provisionalAccount = toProvisionalAccount({ id: 'client-1', name: 'Provided Client Name', lookupClassification: 'real-lookup' });
const coverage = coverageTeamFromAuthorizedFacts({
  assignedBanker: { id: 'b-1', name: 'Coverage Banker' },
  team: { id: 't-1', name: 'Commercial East' },
});

describe('view-model marks missing / provisional honestly', () => {
  it('a provisional account exposes name as provisional and full-account fields as missing', () => {
    const vm = deriveCrmAccountSurfaceViewModel({ account: provisionalAccount });
    expect(vm.isProvisional).toBe(true);
    const name = vm.accountIdentity.find((f) => f.label === 'Name');
    const industry = vm.accountIdentity.find((f) => f.label === 'Industry');
    expect(name?.state).toBe('provisional');
    expect(industry?.state).toBe('missing');
  });

  it('with no account it produces an empty state and names missing sections', () => {
    const vm = deriveCrmAccountSurfaceViewModel({ account: null });
    expect(vm.hasAccount).toBe(false);
    expect(vm.emptyStateCopy).toMatch(/No CRM account/i);
    expect(vm.missingSections).toEqual(
      expect.arrayContaining(['contacts', 'coverageTeam', 'relatedDeals', 'relationshipRoles', 'relationshipHealth', 'sourceFacts']),
    );
  });

  it('derives coverage rows only from authorized facts (never fabricated)', () => {
    const vm = deriveCrmAccountSurfaceViewModel({ account: provisionalAccount, coverageTeam: coverage });
    expect(vm.coverage).toHaveLength(2);
    expect(vm.missingSections).not.toContain('coverageTeam');
  });

  it('surfaces decision influence as missing (not invented) for a loaded contact', () => {
    const vm = deriveCrmAccountSurfaceViewModel({
      account: provisionalAccount,
      contacts: [{ id: 'c-1', accountId: 'client-1', fullName: 'Loaded Contact', title: null, origin: 'seeded-spine', backingLogicalName: 'cr664_crmperson' }],
    });
    const di = vm.contacts[0].fields.find((f) => f.label === 'Decision influence');
    expect(di?.state).toBe('missing');
  });
});

describe('surface rendering', () => {
  it('renders the empty state with no account', () => {
    render(<CrmAccountSurface input={{ account: null }} />);
    expect(screen.getByTestId('crm-account-empty')).toBeInTheDocument();
    expect(screen.getByTestId('crm-account-surface').getAttribute('data-has-account')).toBe('false');
    cleanup();
  });

  it('renders a provisional account with identity + coverage + missing contacts marker', () => {
    render(<CrmAccountSurface input={{ account: provisionalAccount, coverageTeam: coverage }} />);
    expect(screen.getByTestId('crm-account-surface').getAttribute('data-provisional')).toBe('true');
    expect(screen.getByTestId('crm-account-identity')).toBeInTheDocument();
    expect(screen.getByTestId('crm-coverage-t-1')).toBeInTheDocument();
    // No contacts provided → explicit missing marker, never mocked.
    const missing = screen.getAllByTestId('crm-section-missing').map((n) => n.getAttribute('data-missing-section'));
    expect(missing).toContain('contacts');
    cleanup();
  });
});
