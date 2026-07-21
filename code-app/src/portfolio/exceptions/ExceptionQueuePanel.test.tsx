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

  it('D9 — discloses an unwired feed as "not-available", never as a confirmed-clean queue', () => {
    render(<ExceptionQueuePanel queues={[]} dataAvailable={false} />);
    const panel = screen.getByLabelText('Credit-admin exceptions');
    expect(panel).toHaveAttribute('data-exception-queue', 'not-available');
    expect(panel).toHaveTextContent(/not yet connected/i);
    expect(panel).not.toHaveTextContent(/^No open exceptions\./);
  });

  it('D9 — dataAvailable defaults to true so existing honest-zero callers are unaffected', () => {
    render(<ExceptionQueuePanel queues={[]} />);
    const panel = screen.getByLabelText('Credit-admin exceptions');
    expect(panel).toHaveAttribute('data-exception-queue', 'empty');
    expect(panel).toHaveTextContent(/No open exceptions/);
  });
});
