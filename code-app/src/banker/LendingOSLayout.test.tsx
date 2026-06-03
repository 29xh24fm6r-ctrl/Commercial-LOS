// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { LendingOSLayout } from './LendingOSLayout';
import type { WorkspaceLink } from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 124C — LendingOSLayout workspace switcher tests.
 *
 * Pins:
 *   - when workspaceLinks is undefined OR has a single entitlement,
 *     the sidebar preserves the existing static "Current workspace"
 *     pill (single-workspace-per-user posture — no implication that
 *     the pill is clickable);
 *   - when workspaceLinks has 2+ entitlements, the sidebar renders
 *     the WorkspaceSwitcher in dark tone instead of the pill;
 *   - navigating to a non-current entitled workspace is via <Link>
 *     to WORKSPACE_ROUTES.<route>;
 *   - the existing nav sections / placeholders / identity card
 *     continue to render unchanged.
 */

function bankerOnlyLinks(): WorkspaceLink[] {
  return [
    {
      key: 'banker',
      label: 'Banker Workspace',
      route: WORKSPACE_ROUTES.banker,
      isCurrent: true,
    },
  ];
}

function bankerAndManagerLinks(): WorkspaceLink[] {
  return [
    {
      key: 'banker',
      label: 'Banker Workspace',
      route: WORKSPACE_ROUTES.banker,
      isCurrent: true,
    },
    {
      key: 'manager',
      label: 'Manager Workspace',
      route: WORKSPACE_ROUTES.manager,
      isCurrent: false,
    },
  ];
}

function renderShell(workspaceLinks: ReadonlyArray<WorkspaceLink> | undefined) {
  return render(
    <MemoryRouter>
      <LendingOSLayout
        activeNav="dashboard"
        fullName="Matthew Paller"
        email="mpaller@oldglorybank.com"
        workspaceName="Banker Workspace"
        workspaceLinks={workspaceLinks}
      >
        <div data-testid="layout-children">content</div>
      </LendingOSLayout>
    </MemoryRouter>,
  );
}

describe('Phase 124C — LendingOSLayout: single-entitlement users see static pill', () => {
  it('renders the static current-workspace pill when workspaceLinks is undefined', () => {
    renderShell(undefined);
    // Existing pill is labelled "Current workspace" via the role=group.
    expect(
      screen.getByRole('group', { name: /Current workspace/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: /Workspace switcher/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the static pill (not the switcher) when only one workspace link is supplied', () => {
    renderShell(bankerOnlyLinks());
    expect(
      screen.getByRole('group', { name: /Current workspace/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: /Workspace switcher/i }),
    ).not.toBeInTheDocument();
  });
});

describe('Phase 124C — LendingOSLayout: multi-entitlement users see switcher', () => {
  it('renders the WorkspaceSwitcher in dark tone when two or more links are supplied', () => {
    renderShell(bankerAndManagerLinks());
    const nav = screen.getByRole('navigation', { name: /Workspace switcher/i });
    expect(nav.getAttribute('data-workspace-switcher')).toBe('dark');
    expect(
      screen.queryByRole('group', { name: /Current workspace/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the Manager Workspace link to /workspaces/manager when banker is current', () => {
    renderShell(bankerAndManagerLinks());
    const managerLink = screen.getByLabelText('Switch to Manager Workspace');
    expect(managerLink.tagName).toBe('A');
    expect(managerLink.getAttribute('href')).toBe(WORKSPACE_ROUTES.manager);
  });

  it('does NOT expose a Manager link when only the banker link is supplied (no unauthorized leak)', () => {
    renderShell(bankerOnlyLinks());
    expect(
      screen.queryByLabelText('Switch to Manager Workspace'),
    ).not.toBeInTheDocument();
  });
});

describe('Phase 124C — LendingOSLayout: existing chrome preserved', () => {
  it('still renders the dark sidebar nav + content area when the switcher is mounted', () => {
    renderShell(bankerAndManagerLinks());
    expect(screen.getByRole('navigation', { name: /Lending OS navigation/i })).toBeInTheDocument();
    expect(screen.getByTestId('layout-children')).toBeInTheDocument();
    // Identity card preserved.
    expect(screen.getByLabelText('Signed in banker')).toBeInTheDocument();
  });
});
