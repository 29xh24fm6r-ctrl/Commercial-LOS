import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 115 — bootstrapFlow identity-chain tests.
 *
 * Pins the chain change from the legacy `cr664_user` entry point to
 * the canonical `cr664_platformuser` entry point. The previous
 * chain assumed a populated `cr664_user` row + a populated
 * `cr664_losuserprofile`; the deployed environment landed by
 * Phase 113 has neither — only `cr664_platformuser` is seeded.
 *
 * Each test mocks the SDK boundary so the @microsoft/power-apps
 * runtime is not loaded. The bootstrap module's failure-closed
 * contract is the load-bearing invariant — every link in the
 * chain that can't resolve must throw, never default to a
 * landing workspace.
 */

vi.mock('@microsoft/power-apps/app', () => ({
  getContext: vi.fn(),
}));

vi.mock('../generated/services/Cr664_platformusersService', () => ({
  Cr664_platformusersService: { getAll: vi.fn() },
}));

vi.mock('../generated/services/Cr664_platformworkspacesService', () => ({
  Cr664_platformworkspacesService: { get: vi.fn() },
}));

import { getContext } from '@microsoft/power-apps/app';
import { Cr664_platformusersService } from '../generated/services/Cr664_platformusersService';
import { Cr664_platformworkspacesService } from '../generated/services/Cr664_platformworkspacesService';
import { runBootstrap } from './bootstrapFlow';
import { NotProvisionedError, UnresolvedWorkspaceError } from './errors';

const getContextMock = vi.mocked(getContext);
const platformUserGetAllMock = vi.mocked(Cr664_platformusersService.getAll);
const platformWorkspaceGetMock = vi.mocked(Cr664_platformworkspacesService.get);

function ctxFor(upn: string | undefined, fullName = 'M. Paller', objectId = 'oid-1') {
  return {
    user: {
      userPrincipalName: upn,
      fullName,
      objectId,
    },
    // Other fields the live SDK provides but bootstrap doesn't read.
    locale: 'en-US',
  } as unknown as Awaited<ReturnType<typeof getContext>>;
}

function platformUserRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_platformuserid: 'pu-1',
    cr664_email: 'mpaller@oldglorybank.com',
    cr664_fullname: 'Matt Paller',
    cr664_normalizedemail: 'mpaller@oldglorybank.com',
    cr664_identitystatus: 788190000, // Active
    cr664_activestatus: true,
    cr664_createdat: '2026-05-01T00:00:00Z',
    _cr664_primaryworkspace_value: 'ws-banker-1',
    ...overrides,
  };
}

function workspaceRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_platformworkspaceid: 'ws-banker-1',
    cr664_workspacename: 'Banker Workspace',
    ...overrides,
  };
}

beforeEach(() => {
  getContextMock.mockReset();
  platformUserGetAllMock.mockReset();
  platformWorkspaceGetMock.mockReset();
});

describe('Phase 115 — runBootstrap happy path', () => {
  it('resolves UPN → PlatformUser → PrimaryWorkspace → route and returns the full BootstrapResult', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow()],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow(),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    const result = await runBootstrap();

    expect(result.upn).toBe('mpaller@oldglorybank.com');
    expect(result.fullName).toBe('M. Paller');
    expect(result.entraObjectId).toBe('oid-1');
    // Phase 115: profileId is now the PlatformUser id, not the LOS
    // profile id. Field name retained for backward compat with
    // AdminProvider + any downstream that reads it.
    expect(result.profileId).toBe('pu-1');
    expect(result.profileName).toBe('Matt Paller');
    expect(result.workspaceId).toBe('ws-banker-1');
    expect(result.workspaceName).toBe('Banker Workspace');
    expect(result.route).toBe('/workspaces/banker');
  });

  it('queries PlatformUser by cr664_email matching the UPN (OData-escaped)', async () => {
    getContextMock.mockResolvedValue(
      ctxFor("o'malley@oldglorybank.com"),
    );
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow({ cr664_email: "o'malley@oldglorybank.com" })],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow(),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    await runBootstrap();

    // Single quote in the UPN must be doubled per OData literal rules.
    expect(platformUserGetAllMock).toHaveBeenCalledTimes(1);
    const call = platformUserGetAllMock.mock.calls[0]![0]!;
    expect(call.filter).toBe(
      `cr664_email eq 'o''malley@oldglorybank.com'`,
    );
    expect(call.top).toBe(1);
  });

  it('does NOT call the legacy Cr664_usersService or Cr664_losuserprofilesService anywhere in the chain', async () => {
    // Belt-and-suspenders: confirm the new chain truly avoids the
    // legacy lookups. We do this by inspecting the bootstrap source
    // at import-time: if it ever re-introduces those services, the
    // assertion fires.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('./bootstrapFlow.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(src).not.toMatch(/Cr664_usersService/);
    expect(src).not.toMatch(/Cr664_losuserprofilesService/);
    expect(src).not.toMatch(/Cr664_workspaceentitlementsesService/);
  });

  it('routes a Manager Workspace name to the manager route', async () => {
    getContextMock.mockResolvedValue(ctxFor('mgr@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow({ _cr664_primaryworkspace_value: 'ws-mgr' })],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow({
        cr664_platformworkspaceid: 'ws-mgr',
        cr664_workspacename: 'Manager Command Center',
      }),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    const result = await runBootstrap();
    expect(result.route).toBe('/workspaces/manager');
  });

  it('routes an Admin Control Center name to the admin route', async () => {
    getContextMock.mockResolvedValue(ctxFor('admin@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow({ _cr664_primaryworkspace_value: 'ws-admin' })],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow({
        cr664_platformworkspaceid: 'ws-admin',
        cr664_workspacename: 'Admin Control Center',
      }),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    const result = await runBootstrap();
    expect(result.route).toBe('/workspaces/admin');
  });
});

describe('Phase 115 — runBootstrap fail-closed paths', () => {
  it('throws NotProvisionedError when no UPN is in the Power Apps context', async () => {
    getContextMock.mockResolvedValue(ctxFor(undefined));
    await expect(runBootstrap()).rejects.toBeInstanceOf(NotProvisionedError);
    // Adapter is not consulted when the UPN itself is missing.
    expect(platformUserGetAllMock).not.toHaveBeenCalled();
  });

  it('throws NotProvisionedError when no PlatformUser row matches the UPN (live env: signed-in user has no identity row yet)', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);

    await expect(runBootstrap()).rejects.toBeInstanceOf(NotProvisionedError);
    // PlatformWorkspace lookup is not consulted when there is no
    // PlatformUser — the chain fails closed at the earliest broken
    // link.
    expect(platformWorkspaceGetMock).not.toHaveBeenCalled();
  });

  it('NotProvisionedError carries the UPN so the AuthGate can surface it honestly', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);

    try {
      await runBootstrap();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NotProvisionedError);
      expect((err as NotProvisionedError).upn).toBe('mpaller@oldglorybank.com');
    }
  });

  it('throws UnresolvedWorkspaceError(undefined) when the PlatformUser has no PrimaryWorkspace value', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [
        platformUserRow({ _cr664_primaryworkspace_value: undefined }),
      ],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);

    try {
      await runBootstrap();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnresolvedWorkspaceError);
      expect((err as UnresolvedWorkspaceError).workspaceName).toBeUndefined();
    }
    // PlatformWorkspace lookup is skipped when there is no FK to
    // resolve.
    expect(platformWorkspaceGetMock).not.toHaveBeenCalled();
  });

  it('throws UnresolvedWorkspaceError(name) when the workspace name does not match any known route', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow({ _cr664_primaryworkspace_value: 'ws-borrower' })],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow({
        cr664_platformworkspaceid: 'ws-borrower',
        cr664_workspacename: 'Borrower Portal',
      }),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    try {
      await runBootstrap();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnresolvedWorkspaceError);
      // The unrecognized workspace name flows through so the
      // AuthGate can render it honestly to the user.
      expect((err as UnresolvedWorkspaceError).workspaceName).toBe('Borrower Portal');
    }
  });

  it('does NOT default to any known route when resolution fails (permission-before-render invariant)', async () => {
    // Catch a hypothetical regression where someone "helpfully"
    // adds a fallback like `route ?? '/workspaces/banker'`. Any
    // unresolved workspace MUST throw, never silently default.
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow({ _cr664_primaryworkspace_value: 'ws-x' })],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow({
        cr664_platformworkspaceid: 'ws-x',
        cr664_workspacename: 'Some Untracked Surface',
      }),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    await expect(runBootstrap()).rejects.toBeInstanceOf(UnresolvedWorkspaceError);
  });
});

describe('Phase 115 — bootstrap result shape', () => {
  it('keeps the BootstrapResult shape unchanged from pre-Phase-115 (no breaking field changes for downstream consumers)', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow()],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow(),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    const result = await runBootstrap();
    expect(Object.keys(result).sort()).toEqual(
      [
        'upn',
        'fullName',
        'entraObjectId',
        'profileId',
        'profileName',
        'workspaceId',
        'workspaceName',
        'route',
      ].sort(),
    );
  });
});
