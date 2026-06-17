import { describe, it, expect, vi } from 'vitest';
import {
  buildActorChangedByResolver,
  type PlatformUserRetrieve,
  type RawPlatformUserRow,
} from './newDealAuditActorResolver';

/**
 * BUGFIX (banker create audit ChangedBy) -- the fail-closed resolver that maps
 * the actor's email to the REQUIRED cr664_ChangedBy bind `/cr664_users(<id>)`
 * via the registered cr664_platformusers bridge (`_cr664_coreuser_value`). It
 * must NEVER bind a systemuser id and must fail closed on every ambiguous /
 * missing / inactive case.
 */

function retrieveReturning(
  rows: readonly RawPlatformUserRow[],
  capture?: (ds: string, opts: { select: readonly string[]; filter?: string }) => void,
): PlatformUserRetrieve {
  return async (ds, opts) => {
    capture?.(ds, opts);
    return { success: true, data: rows };
  };
}

const ACTIVE_MATCH: RawPlatformUserRow = {
  cr664_platformuserid: 'pu-1',
  cr664_email: 'M.Paller@bank.test',
  cr664_normalizedemail: 'm.paller@bank.test',
  cr664_activestatus: true,
  statecode: 0,
  _cr664_coreuser_value: 'core-user-1',
};

describe('buildActorChangedByResolver -- happy path', () => {
  it('resolves exactly one active matched row to /cr664_users(<coreUserId>)', async () => {
    const resolve = buildActorChangedByResolver(retrieveReturning([ACTIVE_MATCH]));
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(true);
    expect(out.changedByBind).toBe('/cr664_users(core-user-1)');
    expect(out.reason).toBeUndefined();
  });

  it('matches case-insensitively against cr664_email when normalizedemail is empty', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([{ ...ACTIVE_MATCH, cr664_normalizedemail: undefined }]),
    );
    const out = await resolve('M.PALLER@BANK.TEST');
    expect(out.ok).toBe(true);
    expect(out.changedByBind).toBe('/cr664_users(core-user-1)');
  });

  it('reads ONLY the least-privilege bridge columns and never binds /systemusers', async () => {
    let seenSelect: readonly string[] = [];
    let seenDs = '';
    const resolve = buildActorChangedByResolver(
      retrieveReturning([ACTIVE_MATCH], (ds, opts) => {
        seenDs = ds;
        seenSelect = opts.select;
      }),
    );
    const out = await resolve('m.paller@bank.test');
    expect(seenDs).toBe('cr664_platformusers');
    expect(seenSelect).toContain('_cr664_coreuser_value');
    expect(seenSelect).not.toContain('cr664_password');
    expect(out.changedByBind).not.toMatch(/systemusers/);
    expect(out.changedByBind).toMatch(/^\/cr664_users\(/);
  });
});

describe('buildActorChangedByResolver -- fail-closed', () => {
  it('fails closed when no actor email is supplied (never reads)', async () => {
    const retrieve = vi.fn<PlatformUserRetrieve>(async () => ({ success: true, data: [] }));
    const out = await buildActorChangedByResolver(retrieve)(undefined);
    expect(out.ok).toBe(false);
    expect(out.changedByBind).toBeUndefined();
    expect(retrieve).not.toHaveBeenCalled();
    expect(out.reason).toMatch(/no actor email/i);
  });

  it('fails closed when the bridge read returns non-success', async () => {
    const resolve = buildActorChangedByResolver(async () => ({
      success: false,
      error: { message: 'boom' },
    }));
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/lookup failed.*boom/i);
  });

  it('fails closed when the bridge read throws', async () => {
    const resolve = buildActorChangedByResolver(async () => {
      throw new Error('network down');
    });
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/threw.*network down/i);
  });

  it('fails closed when no row matches the actor email', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([{ ...ACTIVE_MATCH, cr664_email: 'someone.else@bank.test', cr664_normalizedemail: 'someone.else@bank.test' }]),
    );
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/no platform-user identity matched/i);
  });

  it('fails closed when the matched row has no CoreUser link', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([{ ...ACTIVE_MATCH, _cr664_coreuser_value: '' }]),
    );
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/no linked cr664_user/i);
  });

  it('fails closed when the only matched row is inactive', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([{ ...ACTIVE_MATCH, cr664_activestatus: false }]),
    );
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/inactive/i);
  });

  it('fails closed when statecode marks the row inactive', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([{ ...ACTIVE_MATCH, statecode: 1 }]),
    );
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/inactive/i);
  });

  it('fails closed when multiple distinct cr664_user identities match', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([
        ACTIVE_MATCH,
        { ...ACTIVE_MATCH, cr664_platformuserid: 'pu-2', _cr664_coreuser_value: 'core-user-2' },
      ]),
    );
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/multiple distinct cr664_user/i);
  });

  it('still resolves when duplicate rows point at the SAME cr664_user', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([
        ACTIVE_MATCH,
        { ...ACTIVE_MATCH, cr664_platformuserid: 'pu-dup' },
      ]),
    );
    const out = await resolve('m.paller@bank.test');
    expect(out.ok).toBe(true);
    expect(out.changedByBind).toBe('/cr664_users(core-user-1)');
  });

  it('exposes no record GUIDs in the fail-closed reason', async () => {
    const resolve = buildActorChangedByResolver(
      retrieveReturning([{ ...ACTIVE_MATCH, cr664_activestatus: false }]),
    );
    const out = await resolve('m.paller@bank.test');
    expect(out.reason ?? '').not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/);
  });
});
