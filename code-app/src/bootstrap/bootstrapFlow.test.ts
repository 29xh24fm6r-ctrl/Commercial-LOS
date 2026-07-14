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

describe('2026-07-14 regression — live "No LOS profile exists" investigation', () => {
  /**
   * Pins runBootstrap()'s behavior against the EXACT live record shape reported
   * for mpaller@oldglorybank.com after the "Access not provisioned" failure
   * surfaced post-deploy: an active cr664_platformuser row exists (verified live
   * via the Dataverse Web API using the same signed-in account), yet the deployed
   * app rendered NotProvisionedError.
   *
   * This test proves the CODE resolves this exact shape successfully — so if the
   * live app is still failing against a record that looks like this, the bug is
   * NOT in runBootstrap()/AuthGate.tsx's resolution logic (which this test suite
   * has pinned since Phase 115 and is unchanged), and is instead in something
   * outside this versioned source: most likely the generated SDK's data-source
   * binding for cr664_platformusers (code-app/.power/schemas/appschemas/
   * dataSourcesInfo.ts — gitignored, never committed, regenerated locally by
   * `pac code add-data-source`) returning an empty/errored result that this
   * function has no way to distinguish from "no such record" (see the fail-closed
   * note below) — or a stale/mismatched live deployment.
   *
   * Deliberately does NOT include cr664_losuserprofiles or the linked
   * workspaceentitlements row from the live report: runBootstrap() never queries
   * either table (see the Phase 115 header comment), so their state is provably
   * irrelevant to whether this resolves — confirming the reported LOS-profile/
   * entitlement data has no bearing on this specific failure.
   */
  it('resolves successfully for the exact live platformuser record reported for mpaller@oldglorybank.com', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com', 'Matthew Paller'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [
        platformUserRow({
          cr664_platformuserid: 'e20d1fcd-4fbc-4439-962e-975c1db08aeb',
          cr664_email: 'mpaller@oldglorybank.com',
          cr664_fullname: 'Matthew Paller',
          cr664_activestatus: true,
          _cr664_primaryworkspace_value: 'ws-admin-live',
        }),
      ],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow({
        cr664_platformworkspaceid: 'ws-admin-live',
        cr664_workspacename: 'Admin Workspace',
      }),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    const result = await runBootstrap();

    expect(result.upn).toBe('mpaller@oldglorybank.com');
    expect(result.profileId).toBe('e20d1fcd-4fbc-4439-962e-975c1db08aeb');
    expect(result.route).toBe('/workspaces/admin');
  });

  /**
   * Documents the exact ambiguity a live investigator needs to rule out: this
   * function cannot tell "the API call succeeded with zero matching rows" apart
   * from "the API call errored / hit a broken data-source binding and the SDK
   * swallowed it into an empty result." Both present identically here. If the
   * generated Cr664_platformusersService ever starts surfacing thrown errors
   * instead of an empty `.data` array for a broken connection, this seam should
   * NOT reclassify that as "not provisioned" — it should propagate as a distinct
   * failure so AuthGate's 'failed' state (not 'not-provisioned') renders instead,
   * pointing an operator at a connection problem rather than a missing user.
   */
  it('cannot distinguish "no matching row" from "data.length === 0 for any other reason" — both throw NotProvisionedError', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    // Same shape as a genuine empty result — this is the ambiguity, made explicit.
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);

    await expect(runBootstrap()).rejects.toBeInstanceOf(NotProvisionedError);
  });
});

describe('2026-07-14 fix — IOperationResult.success is checked, not just .data', () => {
  /**
   * The actual root-cause fix: a broken data-source connection/binding can
   * resolve `IOperationResult<T>` with `success: false` rather than throwing.
   * Before this fix, runBootstrap() read `.data?.[0]` directly with no
   * `.success` check, so this case was indistinguishable from "zero matching
   * rows" and surfaced as the misleading NotProvisionedError ("No LOS profile
   * exists") — even for a signed-in user with a verified-live, verified-active
   * PlatformUser record (see the exact reported shape pinned above). These
   * tests pin the corrected behavior: a lookup failure must throw a plain
   * Error (which AuthGate's 'failed' state renders as "Sign-in failed"), never
   * NotProvisionedError or UnresolvedWorkspaceError.
   */
  it('throws a plain Error (not NotProvisionedError) when the PlatformUser lookup itself fails', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: false,
      data: undefined,
      error: new Error('data source connection error'),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);

    let caught: unknown;
    try {
      await runBootstrap();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(NotProvisionedError);
    expect((caught as Error).message).toContain('PlatformUser lookup failed');
    expect((caught as Error).message).toContain('mpaller@oldglorybank.com');
    expect((caught as Error).message).toContain('data source connection error');
    // The broken lookup must not be silently retried against the workspace
    // service — the chain fails at the earliest broken link.
    expect(platformWorkspaceGetMock).not.toHaveBeenCalled();
  });

  it('describes a PowerDataRuntimeHttpError-shaped failure (no Error instance, just a message field) without crashing', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: false,
      data: undefined,
      error: { message: 'HTTP 401 Unauthorized' },
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);

    await expect(runBootstrap()).rejects.toThrow(/HTTP 401 Unauthorized/);
  });

  it('throws a plain Error when a lookup fails with no error detail at all', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: false,
      data: undefined,
      error: undefined,
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);

    await expect(runBootstrap()).rejects.toThrow(/no error detail returned/);
  });

  it('throws a plain Error (not UnresolvedWorkspaceError) when the PlatformWorkspace lookup itself fails', async () => {
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [platformUserRow({ _cr664_primaryworkspace_value: 'ws-admin-live' })],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: false,
      data: undefined,
      error: new Error('data source connection error'),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    let caught: unknown;
    try {
      await runBootstrap();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(UnresolvedWorkspaceError);
    expect((caught as Error).message).toContain('PlatformWorkspace lookup failed');
    expect((caught as Error).message).toContain('ws-admin-live');
    expect((caught as Error).message).toContain('data source connection error');
  });

  it('resolves successfully for the exact live record shape when both lookups report success: true (control case for the fix)', async () => {
    // Same exact live shape as the regression test above, re-run to confirm
    // the .success-check addition is purely additive: a healthy connection
    // still resolves the real user through to their real route.
    getContextMock.mockResolvedValue(ctxFor('mpaller@oldglorybank.com', 'Matthew Paller'));
    platformUserGetAllMock.mockResolvedValue({
      success: true,
      data: [
        platformUserRow({
          cr664_platformuserid: 'e20d1fcd-4fbc-4439-962e-975c1db08aeb',
          cr664_email: 'mpaller@oldglorybank.com',
          cr664_fullname: 'Matthew Paller',
          cr664_activestatus: true,
          _cr664_primaryworkspace_value: 'ws-admin-live',
        }),
      ],
    } as unknown as Awaited<ReturnType<typeof Cr664_platformusersService.getAll>>);
    platformWorkspaceGetMock.mockResolvedValue({
      success: true,
      data: workspaceRow({
        cr664_platformworkspaceid: 'ws-admin-live',
        cr664_workspacename: 'Admin Workspace',
      }),
    } as unknown as Awaited<ReturnType<typeof Cr664_platformworkspacesService.get>>);

    const result = await runBootstrap();
    expect(result.route).toBe('/workspaces/admin');
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
