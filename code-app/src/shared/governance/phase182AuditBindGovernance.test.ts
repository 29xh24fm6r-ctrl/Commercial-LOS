import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX -- source-wide governance: no New Deal / audit source may bind the
 * actor's systemuser id into a custom cr664_user lookup (e.g. cr664_ActorUser).
 * The first/second/third live proofs failed audit with
 *   "Entity 'cr664_User' With Id = <actor systemuser id> Does Not Exist"
 * because cr664_ActorUser targets cr664_user while we bound /systemusers(id).
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

    it(`${rel} binds a systemuser id only via cr664_ChangedBy`, () => {
      const src = read(rel);
      const binds = src.match(/'(cr664_\w+)@odata\.bind'\s*:\s*`\/systemusers\(/g) ?? [];
      for (const b of binds) expect(b).toMatch(/cr664_ChangedBy/);
    });
  }

  it('the canonical builder + the adapter agree: ChangedBy is the only actor bind', async () => {
    const audit = await import('../../deals/dealOriginationAudit');
    const payload = audit.buildNewDealAuditPayload(
      {
        eventName: 'New Deal Created',
        dealId: 'deal-x',
        actorSystemUserId: 'sys-x',
        correlationId: 'corr-x',
        outcome: audit.AUDIT_OUTCOME_SUCCEEDED,
        sourceProcess: 'test',
        notes: 'n',
      },
      '2026-06-16T00:00:00.000Z',
    );
    const systemuserBinds = Object.entries(payload).filter(
      ([k, v]) => k.endsWith('@odata.bind') && typeof v === 'string' && v.startsWith('/systemusers('),
    );
    expect(systemuserBinds.map(([k]) => k)).toEqual(['cr664_ChangedBy@odata.bind']);
    expect(payload).not.toHaveProperty('cr664_ActorUser@odata.bind');
  });
});
