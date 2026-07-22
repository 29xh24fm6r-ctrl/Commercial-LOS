// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
import { render, screen } from '@testing-library/react';
import { GreetingHeader } from './GreetingHeader';

/**
 * D19 — GreetingHeader had no dedicated test file. Pins the read-only banner's
 * exact text, guarding against the mojibake regression previously present here
 * (the identity-chip separator was double-mis-encoded as "Ã‚Â·" instead of "·").
 */
function baseProps() {
  return {
    fullName: 'Jane Banker',
    email: 'jane@oldglorybank.com',
    writeDisabledReason: undefined as string | undefined,
    systemUserId: 'sys-1',
    bankerId: 'b-1',
    activityDealOptions: [],
    openTaskCount: 3,
    now: new Date('2026-07-22T15:00:00Z'),
  };
}

describe('GreetingHeader', () => {
  it('renders the greeting with no read-only banner when writes are enabled', () => {
    render(<GreetingHeader {...baseProps()} />);
    expect(screen.getByText(/Jane/)).toBeInTheDocument();
    expect(screen.queryByText(/Read-only mode/)).toBeNull();
  });

  it('D19 — the read-only identity chip uses a correctly-encoded middle dot, not mojibake', () => {
    render(
      <GreetingHeader
        {...baseProps()}
        writeDisabledReason="No Dataverse identity is available for your sign-in."
      />,
    );
    const banner = screen.getByText('Read-only mode.').closest('div') as HTMLElement;
    expect(banner.textContent).toContain('(Identity chip: Jane Banker · jane@oldglorybank.com.)');
  });
});
