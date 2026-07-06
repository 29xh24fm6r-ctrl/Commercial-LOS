import { describe, it, expect, vi } from 'vitest';
import {
  loadPortfolioManagerOptionsWith,
  mapPortfolioManagerOption,
  PORTFOLIO_MANAGER_SELECT,
  PORTFOLIO_MANAGER_FILTER,
  type SystemUserReader,
  type SystemUserReadResponse,
} from './portfolioManagerOptions';

/**
 * PM-1 — assignable portfolio-manager options loader. Real systemuser lookup;
 * no fabrication (a failed read throws so the form shows an honest state and
 * boards without a manager rather than inventing one).
 */

function ok(data: readonly Record<string, unknown>[]): SystemUserReadResponse {
  return { success: true, data: data as never };
}
function fail(message: string): SystemUserReadResponse {
  return { success: false, error: { message } };
}

describe('mapPortfolioManagerOption', () => {
  it('maps a real user to id + display name + email', () => {
    expect(
      mapPortfolioManagerOption({
        systemuserid: 'u-1',
        fullname: 'Jordan Banker',
        internalemailaddress: 'jordan@bank.test',
      }),
    ).toEqual({ id: 'u-1', name: 'Jordan Banker', email: 'jordan@bank.test' });
  });

  it('falls back to email then id when fullname is absent', () => {
    expect(mapPortfolioManagerOption({ systemuserid: 'u-2', internalemailaddress: 'x@bank.test' })?.name).toBe('x@bank.test');
    expect(mapPortfolioManagerOption({ systemuserid: 'u-3' })?.name).toBe('u-3');
  });

  it('drops rows with no systemuserid, disabled users, and application (service) users', () => {
    expect(mapPortfolioManagerOption({ fullname: 'No Id' })).toBeNull();
    expect(mapPortfolioManagerOption({ systemuserid: 'u-4', isdisabled: true })).toBeNull();
    expect(mapPortfolioManagerOption({ systemuserid: 'u-5', applicationid: 'app-guid' })).toBeNull();
  });
});

describe('loadPortfolioManagerOptionsWith', () => {
  it('requests the manager columns and returns enabled users sorted by name', async () => {
    const read = vi.fn<SystemUserReader>(async () =>
      ok([
        { systemuserid: 'u-2', fullname: 'Zoe Zimmer', internalemailaddress: 'zoe@bank.test' },
        { systemuserid: 'u-1', fullname: 'Ada Adams', internalemailaddress: 'ada@bank.test' },
      ]),
    );

    const options = await loadPortfolioManagerOptionsWith(read);

    expect(read.mock.calls[0][0]).toEqual(PORTFOLIO_MANAGER_SELECT);
    expect(options.map((o) => o.name)).toEqual(['Ada Adams', 'Zoe Zimmer']);
    expect(options[0]).toMatchObject({ id: 'u-1', email: 'ada@bank.test' });
  });

  it('filters out disabled/app users that slip past the server-side filter', async () => {
    const read = vi.fn<SystemUserReader>(async () =>
      ok([
        { systemuserid: 'real', fullname: 'Real User' },
        { systemuserid: 'svc', fullname: 'Service Principal', applicationid: 'app-1' },
        { systemuserid: 'off', fullname: 'Disabled User', isdisabled: true },
      ]),
    );

    const options = await loadPortfolioManagerOptionsWith(read);

    expect(options).toHaveLength(1);
    expect(options[0].id).toBe('real');
  });

  it('throws (fails closed, no fabrication) when the read is not successful', async () => {
    const read = vi.fn<SystemUserReader>(async () => fail('Timeout contacting Dataverse'));
    await expect(loadPortfolioManagerOptionsWith(read)).rejects.toThrow(/Timeout contacting Dataverse/);
  });

  it('exposes a filter that excludes disabled and application users', () => {
    expect(PORTFOLIO_MANAGER_FILTER).toContain('isdisabled eq false');
    expect(PORTFOLIO_MANAGER_FILTER).toContain('applicationid eq null');
  });
});
