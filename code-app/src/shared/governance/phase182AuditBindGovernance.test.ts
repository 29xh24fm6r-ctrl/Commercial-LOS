import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX -- source-wide governance for the New Deal audit actor bind.
 *
 * The live proofs failed audit with
 *   "Entity 'cr664_User' With Id = <actor systemuser id> Does Not Exist"
 * because cr664_ChangedBy is a REQUIRED lookup to the custom cr664_user table
 * while we bound /systemusers(<actor>). The fix: cr664_ChangedBy carries a
 * caller-resolved /cr664_users(<id>) bind (from the platform-user bridge,
 * fail-closed) and NO New Deal audit source may bind a systemuser id into any
 * lookup, nor set cr664_ActorUser.
 */

const ROOT = resolve(__dirname, '..', '..', '..');

// Every file that builds or emits a New Deal create audit payload.
const NEW_DEAL_AUDIT_FILES = [
  'src/deals/dealOriginationAudit.ts',
  'src/deals/newDealCreateAdapter.ts',
] as const;

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('BUGFIX -- no cr664_user / ActorUser bind receives a systemuser id', () => {
  for (const rel of NEW_DEAL_AUDIT_FILES) {
    it(`${rel} sets no cr664_ActorUser@odata.bind in any audit payload`, () => {
      const src = read(rel);
      // The string may appear in EXPLANATORY comments; forbid only an actual
      // object-literal assignment of the bind key.
      expect(src).not.toMatch(/'cr664_ActorUser@odata\.bind'\s*:/);
    });

    it(`${rel} binds nothing to the custom cr664_user / cr664_users table`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/@odata\.bind'\s*:\s*`?\/cr664_[Uu]sers?\(/);
    });

    it(`${rel} binds NO systemuser id into any audit lookup`, () => {
      const src = read(rel);
      // cr664_ChangedBy targets cr664_user, so a /systemusers bind into any
      // audit lookup is a regression. The bind value is a resolved variable.
      const binds = src.match(/'(cr664_\w+)@odata\.bind'\s*:\s*`\/systemusers\(/g) ?? [];
      expect(binds).toEqual([]);
    });
  }

  it('the canonical builder binds ChangedBy to /cr664_users (resolved) and no systemuser bind', async () => {
    const audit = await import('../../deals/dealOriginationAudit');
    const payload = audit.buildNewDealAuditPayload(
      {
        eventName: 'New Deal Created',
        dealId: 'deal-x',
        changedByBind: '/cr664_users(core-x)',
        actorSystemUserId: 'sys-x',
        correlationId: 'corr-x',
        outcome: audit.AUDIT_OUTCOME_SUCCEEDED,
        sourceProcess: 'test',
        notes: 'n',
      },
      '2026-06-16T00:00:00.000Z',
    );
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(core-x)');
    const systemuserBinds = Object.entries(payload).filter(
      ([k, v]) => k.endsWith('@odata.bind') && typeof v === 'string' && v.startsWith('/systemusers('),
    );
    expect(systemuserBinds).toEqual([]);
    expect(payload).not.toHaveProperty('cr664_ActorUser@odata.bind');
  });
});
