// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ExceptionQueuePanel } from './ExceptionQueuePanel';
import { deriveCreditAdminExceptions } from './creditAdminExceptions';

describe('ExceptionQueuePanel', () => {
  it('shows honest absence with no open exceptions', () => {
    render(<ExceptionQueuePanel queues={[]} />);
    const panel = screen.getByLabelText('Credit-admin exceptions');
    expect(panel).toHaveAttribute('data-exception-queue', 'empty');
  });

  it('renders totals + severity split + highest-frequency types', () => {
    const q = deriveCreditAdminExceptions({ loanId: 'L1', now: '2026-06-30' }); // all missing
    render(<ExceptionQueuePanel queues={[q]} />);
    const panel = screen.getByLabelText('Credit-admin exceptions');
    expect(panel).toHaveAttribute('data-exception-queue', 'ready');
    expect(within(panel).getByText(/open/i)).toBeInTheDocument();
    expect(panel.querySelector('[data-exception-by-type]')).not.toBeNull();
  });
});
