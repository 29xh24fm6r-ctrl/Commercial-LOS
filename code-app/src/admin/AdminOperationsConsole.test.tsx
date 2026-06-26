// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { BootstrapProvider } from '../bootstrap/BootstrapContext';

// The User & Access panel performs a read on mount; mock it so the
// console tests stay deterministic and never hit a live service.
vi.mock('./adminUserAccessQueries', () => ({
  ADMIN_USER_ACCESS_ROW_CAP: 100,
  loadAdminUserAccessSummary: vi.fn().mockResolvedValue({
    userCount: 0,
    entitlementCount: 0,
    users: [],
    entitlements: [],
    usersTruncated: false,
    entitlementsTruncated: false,
  }),
}));

// The Phase 170H New Deal resolver readiness card reads the typed
// Stage/Status data sources on mount; mock the reader so console tests
// stay deterministic and never load the generated services.
vi.mock('../deals/newDealReferenceReader', () => ({
  resolveConfiguredNewDealReferences: vi
    .fn()
    .mockResolvedValue({ kind: 'notConfigured', reason: 'mocked in console test' }),
}));

// Phase 204 Ã¢â‚¬â€ the console reads admin entitlement via useEntitledRoutes; mock it
// (the real module statically pulls SDK-bound queries). Default: no admin route
// (so authorization stays purely route-based unless a test opts in).
const { useEntitledRoutesMock } = vi.hoisted(() => ({
  useEntitledRoutesMock: vi.fn(() => ({ kind: 'ready' as const, routes: [] as string[] })),
}));
vi.mock('../bootstrap/workspaceEntitlements', () => ({
  useEntitledRoutes: useEntitledRoutesMock,
}));

import type { BootstrapResult } from '../bootstrap/bootstrapFlow';
import { AdminIdentityProvider, type AdminIdentity } from './AdminContext';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { AdminOperationsConsole } from './AdminOperationsConsole';

/**
 * Phase 169A -- Admin Operations Console component tests.
 *
 * The console is mounted inside the already-gated AdminWorkspace. These
 * tests prove its own defense-in-depth gating, its honest read-only
 * card states, and that no write affordance is enabled. They use the
 * real Bootstrap + Admin providers with test values (no context mocks).
 */

function bootstrap(route: string | undefined): BootstrapResult {
  return {
    upn: 'admin@oldglorybank.com',
    fullName: 'Ada Admin',
    entraObjectId: 'oid-1',
    profileName: 'Ada Admin',
    workspaceName: 'Admin Control Center',
    route: route as string,
  } as unknown as BootstrapResult;
}

function adminIdentity(writeDisabledReason: string | undefined = undefined): AdminIdentity {
  return {
    upn: 'admin@oldglorybank.com',
    fullName: 'Ada Admin',
    profileName: 'Ada Admin',
    entraObjectId: 'oid-1',
    systemUserId: writeDisabledReason ? undefined : 'sys-admin-1',
    writeDisabledReason,
  };
}

function renderConsole(
  route: string | undefined,
  writeDisabledReason?: string,
) {
  return render(
    <BootstrapProvider value={bootstrap(route)}>
      <AdminIdentityProvider value={adminIdentity(writeDisabledReason)}>
        <AdminOperationsConsole />
      </AdminIdentityProvider>
    </BootstrapProvider>,
  );
}

describe('Phase 169A -- Admin Operations Console rendering', () => {
  it('an admin (admin route) sees the Operations Console with all five module cards', () => {
    const { container } = renderConsole(WORKSPACE_ROUTES.admin);
    expect(
      screen.getByRole('region', { name: 'Admin Operations Console' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Operations Console/i })).toBeInTheDocument();
    // Scope to the module-card grid: "User & Access Management" also
    // appears as the Phase 169B panel heading below the grid.
    const grid = container.querySelector('[data-admin-ops-grid]') as HTMLElement;
    for (const title of [
      'User & Access Management',
      'New Deal Intake',
      'Portfolio Boarding',
      'CRM Onboarding',
      'Security / Dataverse Roles',
    ]) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
  });

  it('shows the app-level-only governance disclaimer (Power Platform admin center handoff)', () => {
    const { container } = renderConsole(WORKSPACE_ROUTES.admin);
    const disclaimer = container.querySelector('[data-admin-ops-disclaimer]');
    expect(disclaimer).not.toBeNull();
    expect(disclaimer?.textContent).toMatch(/app-level entitlements/i);
    expect(disclaimer?.textContent).toMatch(/Power Platform admin center/i);
  });

  it('renders active internal CRM and portfolio scope copy', () => {
    renderConsole(WORKSPACE_ROUTES.admin);
    expect(
      screen.getByText(/New Deal create is live for authorized bankers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/internal OGB workflow \/ boarding system/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/internal OGB CRM relationship system/),
    ).toBeInTheDocument();
  });

  it('exposes a real Manage affordance per module and no stale launch-phase copy', () => {
    const { container } = renderConsole(WORKSPACE_ROUTES.admin);
    const grid = container.querySelector('[data-admin-ops-grid]') as HTMLElement;
    // Five manage affordances, one per module.
    expect(grid.querySelectorAll('[data-admin-ops-action]').length).toBe(5);
    // Active modules link to their real workspaces.
    expect(
      grid.querySelector('[data-admin-ops-action="new-deal-intake"]')?.getAttribute('href'),
    ).toBe(WORKSPACE_ROUTES.banker);
    expect(
      grid.querySelector('[data-admin-ops-action="portfolio-boarding"]')?.getAttribute('href'),
    ).toBe(WORKSPACE_ROUTES.manager);
    expect(
      grid.querySelector('[data-admin-ops-action="crm-onboarding"]')?.getAttribute('href'),
    ).toBe(WORKSPACE_ROUTES.banker);
    // User & Access manages entitlement in-console (anchors to the panel below).
    expect(
      grid.querySelector('[data-admin-ops-action="user-access"]')?.getAttribute('href'),
    ).toBe('#admin-user-access');
    // Security roles are honestly external (no in-app affordance).
    expect(
      grid.querySelector('[data-admin-ops-action="security-roles"]')?.getAttribute('data-admin-ops-manage'),
    ).toBe('external');
    // No stale launch-phase / not-yet-available copy anywhere in the grid.
    const text = (grid.textContent ?? '').toLowerCase();
    for (const banned of ['not yet available', 'later phase', 'later, separately-gated', 'blocked']) {
      expect(text).not.toContain(banned);
    }
  });

  it('surfaces the write-attribution reason when admin identity has no systemuser', () => {
    const { container } = renderConsole(
      WORKSPACE_ROUTES.admin,
      'No Dataverse systemuser is provisioned for the current Entra identity.',
    );
    const disclaimer = container.querySelector('[data-admin-ops-disclaimer]');
    expect(disclaimer?.textContent).toMatch(/Write attribution is currently unavailable/i);
  });

  it('does not fabricate any user / deal / loan / CRM record (static descriptors only)', () => {
    const { container } = renderConsole(WORKSPACE_ROUTES.admin);
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['synced successfully', 'record created', 'user added', 'deal created', 'loan boarded']) {
      expect(text).not.toContain(banned);
    }
  });
});

describe('Phase 169A -- Admin Operations Console fails closed', () => {
  it('a non-admin (banker route) is denied and sees no module cards', () => {
    const { container } = renderConsole(WORKSPACE_ROUTES.banker);
    expect(container.querySelector('[data-admin-ops-console="denied"]')).not.toBeNull();
    expect(container.querySelector('[data-admin-ops-console="ready"]')).toBeNull();
    expect(screen.queryByText('User & Access Management')).toBeNull();
    expect(container.querySelectorAll('[data-admin-ops-action]').length).toBe(0);
  });

  it('fails closed when admin identity cannot be proven (no route)', () => {
    renderConsole(undefined);
    expect(screen.getByRole('alert')).toHaveTextContent(/Admin access could not be verified/i);
  });
});

describe('Phase 169A -- Admin Operations Console source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'AdminOperationsConsole.tsx'), 'utf8');

  it('introduces no fetch / XMLHttpRequest / Graph / Dataverse write call', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });

  it('does not import from another role directory (banker/manager/team/executive)', () => {
    expect(SRC).not.toMatch(/from\s+['"]\.\.\/(banker|manager|team|executive)\//);
  });
});

describe('Phase 204 -- admin-entitled (non-primary) authorization', () => {
  it('authorizes the console for an admin-entitled user even when the primary route is not admin', () => {
    useEntitledRoutesMock.mockReturnValueOnce({ kind: 'ready', routes: [WORKSPACE_ROUTES.admin] });
    const { container } = renderConsole(WORKSPACE_ROUTES.banker);
    // Not the denied state Ã¢â‚¬â€ the admin-entitlement signal authorizes it.
    expect(container.querySelector('[data-admin-ops-console="denied"]')).toBeNull();
  });

  it('stays denied for a non-admin user with no admin entitlement (fail-closed)', () => {
    useEntitledRoutesMock.mockReturnValueOnce({ kind: 'ready', routes: [WORKSPACE_ROUTES.manager] });
    const { container } = renderConsole(WORKSPACE_ROUTES.banker);
    expect(container.querySelector('[data-admin-ops-console="denied"]')).not.toBeNull();
  });
});
