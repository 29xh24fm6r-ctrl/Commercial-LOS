// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformMetadataDashboard } from './PlatformMetadataDashboard';

describe('Phase 142B — platform metadata dashboard', () => {
  it('renders the dashboard with object / view / relationship counts', () => {
    render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(screen.getByText('Objects')).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Relationship edges')).toBeInTheDocument();
  });

  it('shows the metadata-only safety banner', () => {
    render(<PlatformMetadataDashboard />);
    expect(screen.getByText(/Metadata only — no schema mutation/i)).toBeInTheDocument();
  });

  it('renders workspace capability groups and next phases', () => {
    render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(screen.getByText(/Workspace capability groups/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 142C/)).toBeInTheDocument();
  });

  it('has no mutation controls (no buttons) and no external links', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('a[href^="http"]').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });

  it('is permission-scoped (banker dashboard hides manager-only objects)', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'banker' }} />);
    expect(container.textContent ?? '').not.toContain('FDIC Package');
  });
});
