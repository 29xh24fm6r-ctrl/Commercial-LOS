// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformViewCatalogPanel } from './PlatformViewCatalogPanel';
import { derivePlatformViewCatalog } from './derivePlatformViewCatalog';

const views = derivePlatformViewCatalog({ context: { workspace: 'strategy' } });

describe('Phase 142B — view catalog panel', () => {
  it('renders the view catalog', () => {
    render(<PlatformViewCatalogPanel views={views} />);
    expect(screen.getByText('Banker active deals')).toBeInTheDocument();
    expect(screen.getByText('Manager exception queue')).toBeInTheDocument();
  });

  it('shows every view as read-only', () => {
    render(<PlatformViewCatalogPanel views={views} />);
    expect(screen.getAllByText(/read-only/i).length).toBeGreaterThanOrEqual(views.length);
  });

  it('has no create / edit / save view or arbitrary query controls', () => {
    const { container } = render(<PlatformViewCatalogPanel views={views} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    // The only input is the local search box.
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBe(1);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('create view');
    expect(text).not.toContain('save view');
    expect(text).not.toContain('run query');
  });
});
