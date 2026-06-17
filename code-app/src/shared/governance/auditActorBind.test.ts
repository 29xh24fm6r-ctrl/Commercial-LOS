import { describe, it, expect } from 'vitest';
import {
  CORE_USER_ENTITY_SET,
  SYSTEM_USER_ENTITY_SET,
  bindEntitySet,
  isCoreUserBind,
  assertChangedByCoreUserBind,
} from './auditActorBind';

describe('audit-actor bind guard (Phase 187H / G-6)', () => {
  it('pins the metadata-backed entity sets', () => {
    expect(CORE_USER_ENTITY_SET).toBe('cr664_users');
    expect(SYSTEM_USER_ENTITY_SET).toBe('systemusers');
  });

  it('extracts the entity set from a bind value', () => {
    expect(bindEntitySet('/cr664_users(11111111-1111-1111-1111-111111111111)')).toBe('cr664_users');
    expect(bindEntitySet('/systemusers(22222222-2222-2222-2222-222222222222)')).toBe('systemusers');
    expect(bindEntitySet(undefined)).toBeNull();
    expect(bindEntitySet('not-a-bind')).toBeNull();
  });

  it('recognises a cr664_users bind', () => {
    expect(isCoreUserBind('/cr664_users(33333333-3333-3333-3333-333333333333)')).toBe(true);
    expect(isCoreUserBind('/systemusers(44444444-4444-4444-4444-444444444444)')).toBe(false);
    expect(isCoreUserBind(undefined)).toBe(false);
  });

  it('accepts a well-formed cr664_users ChangedBy bind', () => {
    expect(() =>
      assertChangedByCoreUserBind('/cr664_users(55555555-5555-5555-5555-555555555555)'),
    ).not.toThrow();
  });

  it('rejects a systemusers bind with an explicit, id-free message (the known regression)', () => {
    expect(() =>
      assertChangedByCoreUserBind('/systemusers(66666666-6666-6666-6666-666666666666)'),
    ).toThrow(/targets cr664_user/);
    // never leaks the record id
    try {
      assertChangedByCoreUserBind('/systemusers(66666666-6666-6666-6666-666666666666)');
    } catch (e) {
      expect((e as Error).message).not.toContain('66666666');
    }
  });

  it('rejects any other target and a non-bind value', () => {
    expect(() => assertChangedByCoreUserBind('/cr664_platformusers(7)')).toThrow(/must bind \/cr664_users/);
    expect(() => assertChangedByCoreUserBind(undefined)).toThrow(/non-@odata\.bind value/);
  });
});
