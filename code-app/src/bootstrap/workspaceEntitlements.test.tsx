// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  deriveWorkspaceLinks,
  _resetWorkspaceEntitlementCacheForTests,
  useManagerEntitlement,
  useEntitledRoutes,
} from './workspaceEntitlements';
import { WORKSPACE_ROUTES } from './workspaceRoutes';
import { BootstrapProvider } from './BootstrapContext';
import type { BootstrapResult } from './bootstrapFlow';

/**
 * Phase 124C — workspaceEntitlements tests.
 *
 * Pins:
 *   - deriveWorkspaceLinks: bootstrap-primary route always present;
 *     entitled additional routes appended in catalog order; isCurrent
 *     toggled by currentRoute; duplicates collapsed honestly;
 *   - useManagerEntitlement: cache shared at module level (one
 *     loadManagerIdentity call per upn); fires for new upn; surfaces
 *     'ready' as entitled, 'not-banker' / 'no-team' as not-entitled,
 *     'failed' / throws as failed;
 *   - useEntitledRoutes: returns 'loading' until probe settles;
 *     manager route appears iff probe returns entitled.
 */

// ---------------------------------------------------------------------------
// Mock loadManagerIdentity
// ---------------------------------------------------------------------------

const { loadManagerIdentityMock } = vi.hoisted(() => ({
  loadManagerIdentityMock: vi.fn(),
}));

vi.mock('../manager/managerQueries', () => ({
  loadManagerIdentity: loadManagerIdentityMock,
}));

beforeEach(() => {
  loadManagerIdentityMock.mockReset();
  _resetWorkspaceEntitlementCacheForTests();
});

// ---------------------------------------------------------------------------
// deriveWorkspaceLinks — pure
// ---------------------------------------------------------------------------

describe('Phase 124C — deriveWorkspaceLinks', () => {
  it('returns just the bootstrap-primary link when no additional entitlements', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [],
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      key: 'banker',
      label: 'Banker Workspace',
      route: WORKSPACE_ROUTES.banker,
      isCurrent: true,
    });
  });

  it('appends additional entitled routes in catalog order', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.manager],
    });
    expect(links.map((l) => l.key)).toEqual(['banker', 'manager']);
    expect(links[0].isCurrent).toBe(true);
    expect(links[1].isCurrent).toBe(false);
    expect(links[1]).toEqual({
      key: 'manager',
      label: 'Manager Workspace',
      route: WORKSPACE_ROUTES.manager,
      isCurrent: false,
    });
  });

  it('marks the entitled route as current when the user is rendering it', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [WORKSPACE_ROUTES.manager],
    });
    expect(links.find((l) => l.key === 'banker')?.isCurrent).toBe(false);
    expect(links.find((l) => l.key === 'manager')?.isCurrent).toBe(true);
  });

  it('deduplicates the bootstrap route if it also appears in entitledRoutes', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.banker, WORKSPACE_ROUTES.manager],
    });
    expect(links.filter((l) => l.key === 'banker')).toHaveLength(1);
    expect(links.map((l) => l.key)).toEqual(['banker', 'manager']);
  });

  it('orders links by catalog (banker → team → manager → executive → admin)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.executive,
      currentRoute: WORKSPACE_ROUTES.executive,
      entitledRoutes: [
        WORKSPACE_ROUTES.admin,
        WORKSPACE_ROUTES.banker,
        WORKSPACE_ROUTES.manager,
        WORKSPACE_ROUTES.team,
      ],
    });
    expect(links.map((l) => l.key)).toEqual([
      'banker',
      'team',
      'manager',
      'executive',
      'admin',
    ]);
  });

  it('ignores unknown routes in entitledRoutes (defensive — no fake link injected)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: ['/workspaces/nonexistent'],
    });
    expect(links.map((l) => l.key)).toEqual(['banker']);
  });
});

// ---------------------------------------------------------------------------
// useManagerEntitlement — module-cached probe
// ---------------------------------------------------------------------------

function bootstrapResult(upn = 'banker@oldglorybank.com'): BootstrapResult {
  return {
    upn,
    fullName: 'Test User',
    entraObjectId: 'oid-1',
    profileId: 'profile-1',
    profileName: 'Test Profile',
    workspaceName: 'Banker Workspace',
    route: WORKSPACE_ROUTES.banker,
  } as BootstrapResult;
}

function withBootstrap(value: BootstrapResult) {
  return ({ children }: { children: ReactNode }) => (
    <BootstrapProvider value={value}>{children}</BootstrapProvider>
  );
}

describe('Phase 124C — useManagerEntitlement', () => {
  it('starts in loading and resolves to entitled when loadManagerIdentity returns ready', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b1',
        fullName: 'Test',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    expect(result.current.kind).toBe('loading');
    await waitFor(() => {
      expect(result.current.kind).toBe('entitled');
    });
    if (result.current.kind === 'entitled') {
      expect(result.current.teamId).toBe('team-1');
      expect(result.current.teamName).toBe('Capital Markets');
    }
  });

  it('resolves to not-entitled when loadManagerIdentity returns not-banker', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('not-entitled');
    });
  });

  it('resolves to not-entitled when loadManagerIdentity returns no-team', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'no-team' });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('not-entitled');
    });
  });

  it('resolves to failed when loadManagerIdentity returns failed', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'failed',
      message: 'OData 5xx',
    });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('failed');
    });
    if (result.current.kind === 'failed') {
      expect(result.current.message).toBe('OData 5xx');
    }
  });

  it('resolves to failed when loadManagerIdentity throws', async () => {
    loadManagerIdentityMock.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('failed');
    });
    if (result.current.kind === 'failed') {
      expect(result.current.message).toBe('network error');
    }
  });

  it('shares one probe per upn across multiple mounts (module-level cache)', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    const wrapper = withBootstrap(bootstrapResult());
    const a = renderHook(() => useManagerEntitlement(), { wrapper });
    const b = renderHook(() => useManagerEntitlement(), { wrapper });
    const c = renderHook(() => useManagerEntitlement(), { wrapper });
    await waitFor(() => {
      expect(a.result.current.kind).toBe('not-entitled');
      expect(b.result.current.kind).toBe('not-entitled');
      expect(c.result.current.kind).toBe('not-entitled');
    });
    expect(loadManagerIdentityMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// useEntitledRoutes
// ---------------------------------------------------------------------------

describe('Phase 124C — useEntitledRoutes', () => {
  it("returns 'loading' until the manager probe settles", async () => {
    let resolve: (v: { kind: 'ready'; identity: unknown } | { kind: 'not-banker' }) => void = () => undefined;
    loadManagerIdentityMock.mockReturnValue(
      new Promise((r) => {
        resolve = r as typeof resolve;
      }),
    );
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    expect(result.current.kind).toBe('loading');
    resolve({ kind: 'not-banker' });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
  });

  it('includes the manager route only when the manager probe returns entitled', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b1',
        fullName: 'Test',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).toEqual([WORKSPACE_ROUTES.manager]);
  });

  it('returns an empty routes list when the probe returns not-entitled', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).toEqual([]);
  });

  it('returns an empty routes list when the probe failed (no fake widening on error)', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'failed',
      message: 'down',
    });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).toEqual([]);
  });
});
