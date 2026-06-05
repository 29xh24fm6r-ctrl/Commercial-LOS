// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { BootstrapResult } from '../bootstrap/bootstrapFlow';
import type { WorkspaceLink } from '../bootstrap/workspaceEntitlements';
import { _resetWorkspaceEntitlementCacheForTests } from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 136A — BankerWorkspace cross-workspace smoke.
 *
 * The Banker route entry point (BankerWorkspace) had no dedicated test —
 * BankerShell internals are covered by BankerShell.test.tsx, but the
 * compositional contract (the route mounts the shell/cockpit path and
 * derives an HONEST workspace-link set) was only exercised transitively.
 *
 * This smoke pins, without re-testing the shell internals:
 *   - the banker shell/cockpit path renders from the route entry point;
 *   - a banker-only user gets a single workspace link (no executive, no
 *     portfolio — no proxy widening at the banker route);
 *   - a manager-entitled banker gets banker/team/manager/portfolio links
 *     but STILL no executive link (executive is primary-name gated only).
 */

const { useBootstrapMock } = vi.hoisted(() => ({ useBootstrapMock: vi.fn() }));
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: useBootstrapMock,
  BootstrapProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// BankerProvider is the identity boundary; pass children through so the
// smoke does not require a live Dataverse banker row.
vi.mock('../banker/BankerProvider', () => ({
  BankerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Capture the props the route hands the shell so we can assert the
// derived workspace-link set without rendering the full shell.
const { bankerShellSpy } = vi.hoisted(() => ({ bankerShellSpy: vi.fn() }));
vi.mock('../banker/BankerShell', () => ({
  BankerShell: (props: { workspaceName?: string; workspaceLinks?: WorkspaceLink[] }) => {
    bankerShellSpy(props);
    return <div data-testid="banker-shell">Banker Shell / cockpit path</div>;
  },
}));

// Mock the manager probe so useEntitledRoutes resolves without Dataverse.
const { loadManagerIdentityMock } = vi.hoisted(() => ({
  loadManagerIdentityMock: vi.fn(),
}));
vi.mock('../manager/managerQueries', () => ({
  loadManagerIdentity: loadManagerIdentityMock,
}));

import { BankerWorkspace } from './BankerWorkspace';

function bootstrap(over: Partial<BootstrapResult> = {}): BootstrapResult {
  return {
    upn: 'banker@oldglorybank.com',
    fullName: 'Matthew Paller',
    entraObjectId: 'oid-1',
    profileId: 'profile-1',
    profileName: 'Banker Profile',
    workspaceName: 'Banker Workspace',
    route: WORKSPACE_ROUTES.banker,
    ...over,
  } as BootstrapResult;
}

const managerIdentity = {
  bankerId: 'b-1',
  fullName: 'Matthew Paller',
  email: 'banker@oldglorybank.com',
  teamId: 'team-1',
  teamName: 'Capital Markets',
};

beforeEach(() => {
  useBootstrapMock.mockReset();
  loadManagerIdentityMock.mockReset();
  bankerShellSpy.mockReset();
  _resetWorkspaceEntitlementCacheForTests();
  useBootstrapMock.mockReturnValue(bootstrap());
});

function renderBankerWorkspace() {
  return render(
    <MemoryRouter initialEntries={[WORKSPACE_ROUTES.banker]}>
      <BankerWorkspace />
    </MemoryRouter>,
  );
}

function lastLinks(): WorkspaceLink[] {
  const call = bankerShellSpy.mock.calls.at(-1);
  return (call?.[0]?.workspaceLinks ?? []) as WorkspaceLink[];
}

describe('Phase 136A — BankerWorkspace renders its shell/cockpit path', () => {
  it('mounts the BankerShell from the route entry point', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    renderBankerWorkspace();
    expect(await screen.findByTestId('banker-shell')).toBeInTheDocument();
  });

  it('passes the bootstrap workspaceName through to the shell', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    renderBankerWorkspace();
    await screen.findByTestId('banker-shell');
    expect(bankerShellSpy.mock.calls.at(-1)?.[0]?.workspaceName).toBe(
      'Banker Workspace',
    );
  });

  it('a banker-only user gets a single workspace link — no executive, no portfolio proxy', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    renderBankerWorkspace();
    await screen.findByTestId('banker-shell');
    // Probe settles to not-entitled; the link set must remain just the
    // bootstrap-primary banker link.
    await waitFor(() => {
      const keys = lastLinks().map((l) => l.key);
      expect(keys).toEqual(['banker']);
    });
    expect(lastLinks().map((l) => l.key)).not.toContain('executive');
    expect(lastLinks().map((l) => l.key)).not.toContain('portfolio');
  });

  it('a manager-entitled banker gets banker/team/manager/portfolio links but STILL no executive link', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: managerIdentity,
    });
    renderBankerWorkspace();
    await screen.findByTestId('banker-shell');
    await waitFor(() => {
      const keys = lastLinks().map((l) => l.key);
      expect(keys).toContain('manager');
      expect(keys).toContain('team');
      expect(keys).toContain('portfolio');
    });
    // The whole point: manager/team/portfolio entitlement is NOT an
    // executive proxy.
    expect(lastLinks().map((l) => l.key)).not.toContain('executive');
    // Portfolio is a render surface on the manager route — never a new route.
    const portfolio = lastLinks().find((l) => l.key === 'portfolio');
    expect(portfolio?.route).toBe('/workspaces/manager?surface=portfolio');
  });
});

describe('Phase 136A — BankerWorkspace route entry stays read-only (static source)', () => {
  const SRC = readFileSync(resolve(__dirname, 'BankerWorkspace.tsx'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

  it('adds no write affordance or write-surface import at the route entry', () => {
    expect(CODE).not.toMatch(/<form\b/i);
    expect(CODE).not.toMatch(/\bonSubmit\b/);
    expect(CODE).not.toMatch(/SendEmail|Office365/i);
    expect(CODE).not.toMatch(/microsoft-graph|graph\.microsoft/i);
    expect(CODE).not.toMatch(/from ['"][^'"]*\/generated\//);
  });

  it('mounts the BankerShell cockpit path and derives links from the entitlement source', () => {
    expect(SRC).toMatch(/<BankerShell/);
    expect(SRC).toMatch(/useEntitledRoutes/);
    expect(SRC).toMatch(/deriveWorkspaceLinks/);
  });
});
