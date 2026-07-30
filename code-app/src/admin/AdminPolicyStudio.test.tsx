// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AdminPolicyStudio } from './AdminPolicyStudio';

describe('AdminPolicyStudio', () => {
  it('creates, validates, and simulates a draft without claiming production activation', async () => {
    const user = userEvent.setup();
    render(<AdminPolicyStudio actorId="admin@example.test" />);

    expect(screen.getByText(/NO-GO · production inactive/i)).toBeInTheDocument();
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
});
