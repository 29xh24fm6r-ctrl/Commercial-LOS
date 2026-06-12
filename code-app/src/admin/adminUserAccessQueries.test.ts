import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 169B -- User & Access read queries are read-only and fail closed.
 */

vi.mock('../generated/services/Cr664_platformusersService', () => ({
  Cr664_platformusersService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_workspaceentitlementsesService', () => ({
  Cr664_workspaceentitlementsesService: { getAll: vi.fn() },
}));

import { Cr664_platformusersService } from '../generated/services/Cr664_platformusersService';
import { Cr664_workspaceentitlementsesService } from '../generated/services/Cr664_workspaceentitlementsesService';
import {
  loadAdminUserAccessSummary,
  loadAdminUserRows,
  ADMIN_USER_ACCESS_ROW_CAP,
} from './adminUserAccessQueries';

const usersGetAll = vi.mocked(Cr664_platformusersService.getAll);
const entGetAll = vi.mocked(Cr664_workspaceentitlementsesService.getAll);

// The generated IOperationResult carries a large row type; tests only
// need the fields the loaders read, so cast partial fixtures.
const ok = (data: unknown[]) => ({ success: true, data }) as never;
const fail = (message: string) => ({ success: false, error: { message } }) as never;

beforeEach(() => {
  usersGetAll.mockReset();
  entGetAll.mockReset();
});

describe('Phase 169B -- read-only queries', () => {
  it('selects least-privilege fields, orders, and caps row count for users', async () => {
    usersGetAll.mockResolvedValue(ok([]));
    await loadAdminUserRows();
    const opts = usersGetAll.mock.calls[0]![0]!;
    expect(opts.top).toBe(ADMIN_USER_ACCESS_ROW_CAP);
    expect(opts.select).toContain('cr664_email');
    expect(opts.select).toContain('cr664_fullname');
    // Never selects security/role columns.
    expect(opts.select?.join(' ')).not.toMatch(/roleid|securityrole|businessunit/i);
  });

  it('maps real rows without fabricating data', async () => {
    usersGetAll.mockResolvedValue(
      ok([
        {
          cr664_platformuserid: 'u1',
          cr664_email: 'a@b.com',
          cr664_fullname: 'A B',
          cr664_activestatus: true,
          cr664_identitystatusname: 'Active',
          cr664_primaryworkspacename: 'Banker Workspace',
        },
      ]),
    );
    const rows = await loadAdminUserRows();
    expect(rows).toEqual([
      {
        id: 'u1',
        email: 'a@b.com',
        fullName: 'A B',
        primaryWorkspaceName: 'Banker Workspace',
        active: true,
        identityStatus: 'Active',
      },
    ]);
  });

  it('fails closed (throws) when a read is unsuccessful', async () => {
    usersGetAll.mockResolvedValue(fail('denied'));
    await expect(loadAdminUserRows()).rejects.toThrow(/denied/);
  });

  it('summary fails closed if either underlying read rejects', async () => {
    usersGetAll.mockResolvedValue(ok([]));
    entGetAll.mockResolvedValue(fail('ent denied'));
    await expect(loadAdminUserAccessSummary()).rejects.toThrow(/ent denied/);
  });

  it('aggregates counts from the two reads', async () => {
    usersGetAll.mockResolvedValue(
      ok([{ cr664_platformuserid: 'u1', cr664_email: 'a@b.com', cr664_fullname: 'A', cr664_activestatus: true }]),
    );
    entGetAll.mockResolvedValue(
      ok([{ cr664_workspaceentitlementsid: 'e1', cr664_entitlementname: 'Banker (ReadOnly)', cr664_isdefault: false }]),
    );
    const summary = await loadAdminUserAccessSummary();
    expect(summary.userCount).toBe(1);
    expect(summary.entitlementCount).toBe(1);
  });
});

describe('Phase 169B -- query module never writes', () => {
  const SRC = readFileSync(resolve(__dirname, 'adminUserAccessQueries.ts'), 'utf8');

  it('calls no create/update/delete and no fetch/Graph', () => {
    expect(SRC).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
  });

  it('hardcodes no Dataverse GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
