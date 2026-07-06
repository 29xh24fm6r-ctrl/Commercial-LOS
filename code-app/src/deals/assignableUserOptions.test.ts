import { describe, it, expect, vi } from 'vitest';
import {
  loadAssignableUsersWith,
  mapAssignableUser,
  ASSIGNABLE_USER_FILTER,
  type SystemUserReader,
  type SystemUserReadResponse,
} from './assignableUserOptions';

/** WF-1A — assignee picker options. Real systemuser lookup; fails closed. */

function ok(data: readonly Record<string, unknown>[]): SystemUserReadResponse {
  return { success: true, data: data as never };
}
function fail(message: string): SystemUserReadResponse {
  return { success: false, error: { message } };
}

describe('mapAssignableUser', () => {
  it('maps a real user; drops no-id / disabled / application users', () => {
    expect(mapAssignableUser({ systemuserid: 'u-1', fullname: 'Ada', internalemailaddress: 'a@b.test' })).toEqual({
      id: 'u-1',
      name: 'Ada',
      email: 'a@b.test',
    });
    expect(mapAssignableUser({ fullname: 'No Id' })).toBeNull();
    expect(mapAssignableUser({ systemuserid: 'u-2', isdisabled: true })).toBeNull();
    expect(mapAssignableUser({ systemuserid: 'u-3', applicationid: 'app' })).toBeNull();
  });
});

describe('loadAssignableUsersWith', () => {
  it('returns enabled users sorted by name', async () => {
    const read = vi.fn<SystemUserReader>(async () =>
      ok([
        { systemuserid: 'u-2', fullname: 'Zoe' },
        { systemuserid: 'u-1', fullname: 'Ada' },
      ]),
    );
    const users = await loadAssignableUsersWith(read);
    expect(users.map((u) => u.name)).toEqual(['Ada', 'Zoe']);
  });

  it('throws (fails closed) when the read is not successful', async () => {
    const read = vi.fn<SystemUserReader>(async () => fail('Timeout'));
    await expect(loadAssignableUsersWith(read)).rejects.toThrow(/Timeout/);
  });

  it('excludes disabled and application users at the query level', () => {
    expect(ASSIGNABLE_USER_FILTER).toContain('isdisabled eq false');
    expect(ASSIGNABLE_USER_FILTER).toContain('applicationid eq null');
  });
});
