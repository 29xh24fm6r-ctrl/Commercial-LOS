// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AdminPolicyStudio } from './AdminPolicyStudio';
import type { GovernanceRuntimeState } from './governanceRuntimeHydration';

const inactiveRuntime: GovernanceRuntimeState = {
  code: 'NO_PROFILE',
  isGo: false,
  diagnostic: 'No governance profile was returned by Dataverse.',
  queriedAt: '2026-08-03T12:00:00.000Z',
  queryPhase: 'profile',
};

const activeRuntime: GovernanceRuntimeState = {
  code: 'ACTIVE',
  isGo: true,
  diagnostic: 'Complete live governance evidence resolved.',
  queriedAt: '2026-08-03T12:00:00.000Z',
  evidence: {
    profile: { id: 'profile', bankKey: 'OGB', displayName: 'Old Glory Bank Commercial Credit', enabled: true },
    policy: { id: 'policy', policyId: 'OGB-CREDIT-POLICY', versionNumber: 1, status: 'ACTIVE', snapshotSha256: 'a'.repeat(64), effectiveFrom: '2026-07-30T00:00:00Z' },
    rules: [1, 2, 3, 4].map((ordinal) => ({ id: `rule-${ordinal}`, ruleId: `OGB-RULE-${ordinal}`, description: `Rule ${ordinal}`, ordinal, nonOverrideable: ordinal === 1, sha256: 'b'.repeat(64) })),
    authorities: [{ id: 'grant', grantId: 'OPTION-A', officerId: 'matthew', officerName: 'Matthew Paller', officerUpn: 'mpaller@oldglorybank.com', maximumAmount: 1_000_000, maximumRelationshipExposure: 1_000_000, maximumUnsecuredAmount: 0, effectiveFrom: '2026-07-30T00:00:00Z' }],
    roleAssignments: [{ id: 'role', assignmentId: 'assignment', officerId: 'matthew', officerName: 'Matthew Paller', officerUpn: 'mpaller@oldglorybank.com', roleCode: 'AUTHORIZED_OFFICER', effectiveFrom: '2026-07-30T00:00:00Z' }],
  },
};

describe('AdminPolicyStudio', () => {
  it('creates, validates, and simulates a draft without claiming production activation', async () => {
    const user = userEvent.setup();
    render(<AdminPolicyStudio actorId="admin@example.test" runtimeLoader={async () => inactiveRuntime} />);

    expect(await screen.findByText(/NO-GO · no profile/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Institution key'), 'bank-a');
    await user.type(screen.getByLabelText('Profile name'), 'Commercial policy');
    await user.selectOptions(screen.getByLabelText('Operating model'), 'SINGLE_OFFICER');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(screen.getAllByText(/v1 · DRAFT/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(screen.getByRole('status')).toHaveTextContent(/VALID/);

    await user.type(screen.getByLabelText('Actor identity ID'), 'unknown-user');
    await user.click(screen.getByRole('button', { name: 'Simulate route' }));
    expect(screen.getByTestId('policy-simulation-result')).toHaveTextContent(/^BLOCK:/);
    expect(screen.getByRole('status')).toHaveTextContent(/No lifecycle action was executed/);
  });

  it('renders the complete active Production evidence chain as GO', async () => {
    render(<AdminPolicyStudio actorId="admin@example.test" runtimeLoader={async () => activeRuntime} />);

    expect(await screen.findByText(/GO · production active/i)).toBeInTheDocument();
    expect(screen.getByText(/Old Glory Bank Commercial Credit/)).toBeInTheDocument();
    expect(screen.getByText(/OGB-CREDIT-POLICY · v1 · ACTIVE/)).toBeInTheDocument();
    expect(screen.getByText('mpaller@oldglorybank.com')).toBeInTheDocument();
    expect(screen.getByText(/Individual: \$1,000,000/)).toBeInTheDocument();
    expect(screen.queryByText(/No profile selected/i)).not.toBeInTheDocument();
  });

  it('fails closed and diagnoses a rejected live query', async () => {
    render(<AdminPolicyStudio actorId="admin@example.test" runtimeLoader={async () => { throw new Error('Dataverse unavailable'); }} />);

    await waitFor(() => expect(screen.getByText(/NO-GO · query failed/i)).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/QUERY_FAILED · phase: loader/);
    expect(screen.queryByText(/GO · production active/i)).not.toBeInTheDocument();
  });
});
