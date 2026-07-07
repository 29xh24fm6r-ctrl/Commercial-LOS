import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  updateDealProfile,
  type UpdateDealProfileDeps,
  type UpdateDealProfileInput,
  type DealProfilePatch,
} from './updateDealProfile';
import {
  Cr664_loandealscr664_customertype,
  Cr664_loandealscr664_industry,
} from '../../generated/models/Cr664_loandealsModel';

/**
 * Governed Deal Profile update.
 *
 * Pins: fail-closed authorization, field validation, unknown-field rejection,
 * empty-patch rejection, allow-listed writes (never amount/stage/status/client),
 * readback verification, and an audited outcome.
 */

const AUTH = { authorized: true as const, actorEmail: 'banker@bank.com', actorSystemUserId: 'sys-1' };

function input(patch: DealProfilePatch, over: Partial<UpdateDealProfileInput> = {}): UpdateDealProfileInput {
  return { ...AUTH, dealId: 'deal-1', patch, ...over };
}

/** Deps whose readback echoes exactly what was written (happy path). */
function fakeDeps(over: Partial<UpdateDealProfileDeps> = {}): {
  deps: UpdateDealProfileDeps;
  store: { body?: Record<string, unknown> };
  calls: { update: number; read: number; audit: number };
  auditInputs: unknown[];
} {
  const store: { body?: Record<string, unknown> } = {};
  const calls = { update: 0, read: 0, audit: 0 };
  const auditInputs: unknown[] = [];
  const deps: UpdateDealProfileDeps = {
    updateDeal: async (_dealId, body) => {
      calls.update += 1;
      store.body = body;
      return { success: true };
    },
    readDeal: async () => {
      calls.read += 1;
      // Echo the written body back under the same keys (the write/read keys match).
      return { success: true, row: { ...(store.body ?? {}) } };
    },
    emitAudit: async (a) => {
      calls.audit += 1;
      auditInputs.push(a);
      return { ok: true, id: 'audit-1' };
    },
    ...over,
  };
  return { deps, store, calls, auditInputs };
}

describe('updateDealProfile — authorization + validation', () => {
  it('rejects an unauthorized actor (no write)', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({ collateralSummary: 'A/R' }, { authorized: false }), deps);
    expect(out.kind).toBe('unauthorized');
    expect(calls.update).toBe(0);
  });

  it('is identity-unresolved when no Dataverse identity is present', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({ collateralSummary: 'A/R' }, { actorSystemUserId: '', actorEmail: '' }), deps);
    expect(out.kind).toBe('identity-unresolved');
    expect(calls.update).toBe(0);
  });

  it('rejects an empty patch', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({}), deps);
    expect(out.kind).toBe('empty-patch');
    expect(calls.update).toBe(0);
  });

  it('rejects unknown / protected fields', async () => {
    const { deps, calls } = fakeDeps();
    // amount / stage / status / client are not editable here.
    const out = await updateDealProfile(input({ amount: '999', stage: 'Closed' } as unknown as DealProfilePatch), deps);
    expect(out.kind).toBe('invalid-input');
    expect(calls.update).toBe(0);
  });

  it('rejects an off-list choice value', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({ industry: 'Cyberpunk' }), deps);
    expect(out.kind).toBe('invalid-input');
    if (out.kind === 'invalid-input') expect(out.field).toBe('industry');
    expect(calls.update).toBe(0);
  });

  it('rejects an invalid date', async () => {
    const { deps } = fakeDeps();
    const out = await updateDealProfile(input({ targetCloseDate: 'not-a-date' }), deps);
    expect(out.kind).toBe('invalid-input');
  });

  it('rejects a blank string (null must be used to clear)', async () => {
    const { deps } = fakeDeps();
    const out = await updateDealProfile(input({ collateralSummary: '   ' }), deps);
    expect(out.kind).toBe('invalid-input');
  });
});

describe('updateDealProfile — allow-listed writes', () => {
  it('writes ONLY approved cr664 columns, mapping choices to option-set integers', async () => {
    const { deps, store } = fakeDeps();
    const out = await updateDealProfile(
      input({
        targetCloseDate: '2026-09-30',
        collateralSummary: 'A/R, inventory',
        customerType: 'New',
        industry: 'Manufacturing',
        guarantorStructure: 'Limited',
      }),
      deps,
    );
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({
      cr664_targetclosedate: '2026-09-30',
      cr664_collateralsummary: 'A/R, inventory',
      cr664_customertype: Number(
        Object.entries(Cr664_loandealscr664_customertype).find(([, v]) => v === 'New')![0],
      ),
      cr664_industry: Number(
        Object.entries(Cr664_loandealscr664_industry).find(([, v]) => v === 'Manufacturing')![0],
      ),
      cr664_guarantorstructure: 788190001, // 'Limited'
    });
    // No forbidden columns ever appear.
    for (const forbidden of ['cr664_amount', 'cr664_StageReference@odata.bind', 'cr664_StatusReference@odata.bind', 'cr664_AssignedBanker@odata.bind', 'cr664_Client@odata.bind']) {
      expect(store.body).not.toHaveProperty(forbidden);
    }
  });

  it('clears a field when the patch value is null', async () => {
    const { deps, store } = fakeDeps();
    const out = await updateDealProfile(input({ collateralSummary: null }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ cr664_collateralsummary: null });
  });
});

describe('updateDealProfile — readback verification', () => {
  it('returns updated with the verified display values + audit id', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({ customerType: 'Existing', collateralSummary: 'Equipment' }), deps);
    expect(out.kind).toBe('updated');
    if (out.kind === 'updated') {
      expect(out.verified.customerType).toBe('Existing');
      expect(out.verified.collateralSummary).toBe('Equipment');
      expect(out.changedLabels).toEqual(expect.arrayContaining(['Customer type', 'Collateral']));
      expect(out.auditId).toBe('audit-1');
      expect(out.correlationId).toBeTruthy();
    }
    expect(calls.read).toBe(1);
    expect(calls.audit).toBe(1);
  });

  it('returns readback-mismatch when the persisted value does not match (no audit)', async () => {
    const { deps, calls } = fakeDeps({
      readDeal: async () => ({ success: true, row: { cr664_collateralsummary: 'something else' } }),
    });
    const out = await updateDealProfile(input({ collateralSummary: 'A/R' }), deps);
    expect(out.kind).toBe('readback-mismatch');
    expect(calls.audit).toBe(0);
  });

  it('tolerates date format differences on readback (calendar-day compare)', async () => {
    const { deps } = fakeDeps({
      updateDeal: async () => ({ success: true }),
      readDeal: async () => ({ success: true, row: { cr664_targetclosedate: '2026-09-30T00:00:00Z' } }),
    });
    const out = await updateDealProfile(input({ targetCloseDate: '2026-09-30' }), deps);
    expect(out.kind).toBe('updated');
  });

  it('returns write-failed when the update IO fails (no readback / audit)', async () => {
    const { deps, calls } = fakeDeps({
      updateDeal: async () => ({ success: false, error: { message: 'boom' } }),
    });
    const out = await updateDealProfile(input({ collateralSummary: 'A/R' }), deps);
    expect(out.kind).toBe('write-failed');
    expect(calls.read).toBe(0);
    expect(calls.audit).toBe(0);
  });

  it('returns audit-failed (deal persisted) when only the audit fails', async () => {
    const { deps } = fakeDeps({ emitAudit: async () => ({ ok: false, error: 'audit down' }) });
    const out = await updateDealProfile(input({ collateralSummary: 'A/R' }), deps);
    expect(out.kind).toBe('audit-failed');
    if (out.kind === 'audit-failed') expect(out.auditError).toBe('audit down');
  });

  it('passes the actor + correlation id to the audit', async () => {
    const { deps, auditInputs } = fakeDeps();
    await updateDealProfile(input({ industry: 'Retail' }), deps);
    expect(auditInputs[0]).toMatchObject({ dealId: 'deal-1', actorSystemUserId: 'sys-1', actorEmail: 'banker@bank.com' });
    expect((auditInputs[0] as { correlationId: string }).correlationId).toBeTruthy();
  });
});

describe('updateDealProfile — write-boundary discipline (source)', () => {
  const SRC = readFileSync(resolve(__dirname, 'updateDealProfile.ts'), 'utf8');

  it('never writes amount / stage / status / banker / client', () => {
    // The forbidden columns appear only in the guard list, never as write keys.
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_amount'/);
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_StageReference/);
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_StatusReference/);
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_AssignedBanker/);
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_Client/);
  });

  it('creates nothing (no record-create call, no borrower / CRM service)', () => {
    // The adapter only ever UPDATEs the loan deal; it never creates a record.
    expect(SRC).not.toMatch(/\.create\(/);
    // No borrower / CRM entity service is imported (assert on import lines, not
    // the prose in the doc comment which legitimately says "no borrowers").
    const importLines = SRC.split('\n').filter((l) => /^\s*import /.test(l)).join('\n');
    expect(importLines).not.toMatch(/borrower|crmorganization|clientrelationship|crmperson/i);
  });
});
