// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinalOperatingCertificationPanel } from './FinalOperatingCertificationPanel';

describe('FinalOperatingCertificationPanel', () => {
  it('renders the withheld verdict and all evidence categories', () => {
    render(<FinalOperatingCertificationPanel />);
    expect(screen.getByText('NOT PRODUCTION GO')).toBeInTheDocument();
    expect(screen.getAllByText(/Blocked: dual-user test/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Intentionally deferred/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1\/6 activation domains/i)).toBeInTheDocument();
  });
});
