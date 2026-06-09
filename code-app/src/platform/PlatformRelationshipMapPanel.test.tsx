// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformRelationshipMapPanel } from './PlatformRelationshipMapPanel';
import { derivePlatformObjectRelationshipMap } from './derivePlatformObjectRelationshipMap';

describe('Phase 142B — relationship map panel', () => {
  it('renders relationship edges', () => {
    render(<PlatformRelationshipMapPanel edges={derivePlatformObjectRelationshipMap({ context: { workspace: 'strategy' } })} />);
    expect(screen.getAllByText('crm_organization').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('memo_package').length).toBeGreaterThanOrEqual(1);
  });

  it('redacts hidden targets', () => {
    render(<PlatformRelationshipMapPanel edges={derivePlatformObjectRelationshipMap({ context: { workspace: 'banker' } })} />);
    expect(screen.getAllByText('redacted').length).toBeGreaterThanOrEqual(1);
  });

  it('has no relationship-mutation controls and no external graph dependency', () => {
    const { container } = render(<PlatformRelationshipMapPanel edges={derivePlatformObjectRelationshipMap({ context: { workspace: 'strategy' } })} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('canvas').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('create relationship');
    expect(text).not.toContain('create lookup');
  });

  it('carries no record IDs or PII in the rendered DOM', () => {
    const { container } = render(<PlatformRelationshipMapPanel edges={derivePlatformObjectRelationshipMap({ context: { workspace: 'strategy' } })} />);
    expect(container.innerHTML).not.toMatch(/recordId|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});
