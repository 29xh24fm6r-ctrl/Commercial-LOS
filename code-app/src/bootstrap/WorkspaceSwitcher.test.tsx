// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import type { WorkspaceLink } from './workspaceEntitlements';
import { WORKSPACE_ROUTES } from './workspaceRoutes';

/**
 * Phase 124C — WorkspaceSwitcher tests.
 *
 * Pins:
 *   - the current workspace renders as a static element with
 *     aria-current="page" — never a navigation link;
 *   - every non-current workspace renders as a <Link> to its
 *     route;
 *   - both tones render the labelled <nav> with the same link
 *     contract;
 *   - the switcher carries data-workspace-link-key + data-current
 *     attributes for test-friendly inspection.
 */

function link(over: Partial<WorkspaceLink>): WorkspaceLink {
  return {
    key: 'banker',
    label: 'Banker Workspace',
    route: WORKSPACE_ROUTES.banker,
    isCurrent: false,
    ...over,
  };
}

function renderSwitcher(links: ReadonlyArray<WorkspaceLink>, tone: 'light' | 'dark' = 'light') {
  return render(
    <MemoryRouter>
      <WorkspaceSwitcher links={links} tone={tone} />
    </MemoryRouter>,
  );
}

describe('Phase 124C — WorkspaceSwitcher rendering', () => {
  it('renders one current item + one navigation link for a banker+manager user on the banker route', () => {
    const links = [
      link({ key: 'banker', isCurrent: true }),
      link({ key: 'manager', label: 'Manager Workspace', route: WORKSPACE_ROUTES.manager, isCurrent: false }),
    ];
    renderSwitcher(links);
    const nav = screen.getByRole('navigation', { name: /Workspace switcher/i });

    const current = within(nav).getByText('Banker Workspace');
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.getAttribute('data-workspace-link-current')).toBe('true');

    const managerLink = within(nav).getByLabelText('Switch to Manager Workspace');
    expect(managerLink.tagName).toBe('A');
    expect(managerLink.getAttribute('href')).toBe(WORKSPACE_ROUTES.manager);
    expect(managerLink.getAttribute('data-workspace-link-current')).toBe('false');
  });

  it('renders the current item with aria-current and never as a navigation link', () => {
    const links = [
      link({ key: 'banker', isCurrent: false }),
      link({ key: 'manager', label: 'Manager Workspace', route: WORKSPACE_ROUTES.manager, isCurrent: true }),
    ];
    renderSwitcher(links);
    const nav = screen.getByRole('navigation', { name: /Workspace switcher/i });
    // The current 'manager' item is a <span aria-current="page">; not a link.
    const manager = within(nav).getByText('Manager Workspace');
    expect(manager.tagName).toBe('SPAN');
    expect(manager.getAttribute('aria-current')).toBe('page');
    expect(within(nav).queryByLabelText('Switch to Manager Workspace')).toBeNull();

    // The banker link points to the banker route.
    const bankerLink = within(nav).getByLabelText('Switch to Banker Workspace');
    expect(bankerLink.getAttribute('href')).toBe(WORKSPACE_ROUTES.banker);
  });

  it('renders the light and dark tones with distinct surface attributes', () => {
    const links = [link({ isCurrent: true }), link({ key: 'manager', label: 'M', route: WORKSPACE_ROUTES.manager })];
    const { unmount } = renderSwitcher(links, 'light');
    expect(
      screen.getByRole('navigation', { name: /Workspace switcher/i }).getAttribute('data-workspace-switcher'),
    ).toBe('light');
    unmount();
    renderSwitcher(links, 'dark');
    expect(
      screen.getByRole('navigation', { name: /Workspace switcher/i }).getAttribute('data-workspace-switcher'),
    ).toBe('dark');
  });
});
