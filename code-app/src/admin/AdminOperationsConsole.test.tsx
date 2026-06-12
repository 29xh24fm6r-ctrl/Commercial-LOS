// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { BootstrapProvider } from '../bootstrap/BootstrapContext';
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
    renderConsole(WORKSPACE_ROUTES.admin);
    expect(
      screen.getByRole('region', { name: 'Admin Operations Console' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Operations Console/i })).toBeInTheDocument();
    for (const title of [
      'User & Access Management',
      'New Deal Intake',
      'Portfolio Boarding',
      'CRM Onboarding',
      'Security / Dataverse Roles',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('shows the app-level-only governance disclaimer (Power Platform admin center handoff)', () => {
    const { container } = renderConsole(WORKSPACE_ROUTES.admin);
    const disclaimer = container.querySelector('[data-admin-ops-disclaimer]');
    expect(disclaimer).not.toBeNull();
    expect(disclaimer?.textContent).toMatch(/app-level entitlements/i);
    expect(disclaimer?.textContent).toMatch(/Power Platform admin center/i);
  });

  it('renders honest blocker / next-step copy on the cards', () => {
    renderConsole(WORKSPACE_ROUTES.admin);
    expect(
      screen.getByText(/no Stage\/Status reference data source is registered/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED defaults to false/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/CRM_LIVE_PERSISTENCE_ENABLED defaults to false/),
    ).toBeInTheDocument();
  });

  it('exposes NO enabled write buttons -- every action is a disabled placeholder', () => {
    const { container } = renderConsole(WORKSPACE_ROUTES.admin);
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b).toBeDisabled();
      expect(b.getAttribute('aria-disabled')).toBe('true');
    }
    expect(container.querySelectorAll('[data-admin-ops-action]').length).toBe(5);
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
