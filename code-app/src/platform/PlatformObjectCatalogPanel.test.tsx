// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlatformObjectCatalogPanel } from './PlatformObjectCatalogPanel';
import { derivePlatformObjectCatalog } from './derivePlatformObjectCatalog';

const objects = derivePlatformObjectCatalog({ context: { workspace: 'strategy' } });

describe('Phase 142B — object catalog panel', () => {
  it('renders the object catalog', () => {
    render(<PlatformObjectCatalogPanel objects={objects} />);
    expect(screen.getByText('CRM Organization')).toBeInTheDocument();
    expect(screen.getByText('Deal')).toBeInTheDocument();
  });

  it('renders forbidden actions and write-gated status', () => {
    render(<PlatformObjectCatalogPanel objects={objects} />);
    expect(screen.getAllByText(/Forbidden:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/schema_mutate/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/available write gated/i).length).toBeGreaterThanOrEqual(1);
  });

  it('supports local search only (filters the rendered list)', async () => {
    render(<PlatformObjectCatalogPanel objects={objects} />);
    const input = screen.getByLabelText('Search objects');
    await userEvent.type(input, 'organization');
    expect(screen.getByText('CRM Organization')).toBeInTheDocument();
    expect(screen.queryByText('Deal')).toBeNull();
  });

  it('has no create / edit / add-field / write controls', () => {
    const { container } = render(<PlatformObjectCatalogPanel objects={objects} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('create object');
    expect(text).not.toContain('add field');
    expect(text).not.toContain('enable write');
  });
});
