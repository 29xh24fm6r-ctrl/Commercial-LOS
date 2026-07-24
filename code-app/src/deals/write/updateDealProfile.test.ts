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

describe('updateDealProfile — governed reference lookups', () => {
  const PT = '11111111-1111-1111-1111-111111111111';
  const LS = '22222222-2222-2222-2222-222222222222';
  const PR = '33333333-3333-3333-3333-333333333333';

  function refInput(over: Partial<UpdateDealProfileInput> = {}): UpdateDealProfileInput {
    return {
      ...AUTH,
      dealId: 'deal-1',
      patch: {},
      referencePatch: {
        productType: { id: PT, name: 'SBA 7(a)' },
        loanStructure: { id: LS, name: 'Term Loan' },
        pricingType: { id: PR, name: 'Variable' },
      },
      allowedReferenceIds: [PT, LS, PR],
      ...over,
    };
  }

  it('writes the correct @odata.bind payloads and verifies the lookups on readback', async () => {
    const store: { body?: Record<string, unknown> } = {};
    const deps: UpdateDealProfileDeps = {
      updateDeal: async (_id, body) => { store.body = body; return { success: true }; },
      // Dataverse returns the persisted lookups as lowercase _value fields.
      readDeal: async () => ({
        success: true,
        row: {
          _cr664_producttypereference_value: PT.toLowerCase(),
          _cr664_loanstructuretypereference_value: LS.toLowerCase(),
          _cr664_pricingtypereference_value: PR.toLowerCase(),
        },
      }),
      emitAudit: async () => ({ ok: true, id: 'a-1' }),
    };
    const out = await updateDealProfile(refInput(), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({
      'cr664_ProductTypeReference@odata.bind': `/cr664_producttypereferences(${PT})`,
      'cr664_LoanStructureTypeReference@odata.bind': `/cr664_producttypereferences(${LS})`,
      'cr664_PricingTypeReference@odata.bind': `/cr664_producttypereferences(${PR})`,
    });
    if (out.kind === 'updated') {
      expect(out.verified.productType).toBe('SBA 7(a)');
      expect(out.verified.loanStructure).toBe('Term Loan');
      expect(out.verified.pricingType).toBe('Variable');
    }
  });

  it('rejects an arbitrary GUID that is not in the loaded reference list', async () => {
    const deps = fakeDeps().deps;
    const out = await updateDealProfile(
      refInput({
        referencePatch: { productType: { id: '99999999-9999-9999-9999-999999999999', name: 'Fake' } },
        allowedReferenceIds: [PT, LS, PR],
      }),
      deps,
    );
    expect(out.kind).toBe('invalid-input');
    if (out.kind === 'invalid-input') expect(out.reason).toMatch(/not one of the loaded reference options/i);
  });

  it('rejects a non-GUID reference id', async () => {
    const deps = fakeDeps().deps;
    const out = await updateDealProfile(
      refInput({ referencePatch: { productType: { id: 'not-a-guid', name: 'x' } }, allowedReferenceIds: ['not-a-guid'] }),
      deps,
    );
    expect(out.kind).toBe('invalid-input');
  });

  it('rejects any reference selection when no allow-list was provided', async () => {
    const deps = fakeDeps().deps;
    const out = await updateDealProfile(
      refInput({ referencePatch: { productType: { id: PT, name: 'SBA' } }, allowedReferenceIds: undefined }),
      deps,
    );
    expect(out.kind).toBe('invalid-input');
  });

  it('clears a reference lookup with null (bind null, readback empty)', async () => {
    const store: { body?: Record<string, unknown> } = {};
    const deps: UpdateDealProfileDeps = {
      updateDeal: async (_id, body) => { store.body = body; return { success: true }; },
      readDeal: async () => ({ success: true, row: { _cr664_producttypereference_value: null } }),
      emitAudit: async () => ({ ok: true, id: 'a-1' }),
    };
    const out = await updateDealProfile(refInput({ referencePatch: { productType: null }, allowedReferenceIds: [] }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ 'cr664_ProductTypeReference@odata.bind': null });
  });

  it('returns readback-mismatch when the lookup did not persist', async () => {
    const deps: UpdateDealProfileDeps = {
      updateDeal: async () => ({ success: true }),
      readDeal: async () => ({ success: true, row: { _cr664_producttypereference_value: 'some-other-guid' } }),
      emitAudit: async () => ({ ok: true, id: 'a-1' }),
    };
    const out = await updateDealProfile(
      refInput({ referencePatch: { productType: { id: PT, name: 'SBA' } }, allowedReferenceIds: [PT] }),
      deps,
    );
    expect(out.kind).toBe('readback-mismatch');
  });

  it('mixes scalar + reference fields in one governed write', async () => {
    const store: { body?: Record<string, unknown> } = {};
    const deps: UpdateDealProfileDeps = {
      updateDeal: async (_id, body) => { store.body = body; return { success: true }; },
      readDeal: async () => ({
        success: true,
        row: { cr664_collateralsummary: 'A/R', _cr664_producttypereference_value: PT.toLowerCase() },
      }),
      emitAudit: async () => ({ ok: true, id: 'a-1' }),
    };
    const out = await updateDealProfile(
      {
        ...AUTH, dealId: 'deal-1',
        patch: { collateralSummary: 'A/R' },
        referencePatch: { productType: { id: PT, name: 'SBA 7(a)' } },
        allowedReferenceIds: [PT],
      },
      deps,
    );
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({
      cr664_collateralsummary: 'A/R',
      'cr664_ProductTypeReference@odata.bind': `/cr664_producttypereferences(${PT})`,
    });
  });

  it('still refuses amount/stage/status/banker/client alongside references', async () => {
    const deps = fakeDeps().deps;
    const out = await updateDealProfile(
      refInput({ patch: { stage: 'Closed' } as never }),
      deps,
    );
    expect(out.kind).toBe('invalid-input');
  });
});

describe('updateDealProfile — loan amount (governed number field)', () => {
  it('writes cr664_amount as a number and returns a numeric verified amount (audited)', async () => {
    const { deps, store, calls } = fakeDeps();
    const out = await updateDealProfile(input({ amount: '2500000' }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ cr664_amount: 2500000 });
    expect(calls.audit).toBe(1);
    if (out.kind === 'updated') {
      expect(out.verified.amount).toBe(2500000);
      expect(typeof out.verified.amount).toBe('number');
      expect(out.changedLabels).toContain('Loan amount');
    }
  });

  it('accepts a lightly-formatted amount ($2,500,000)', async () => {
    const { deps, store } = fakeDeps();
    const out = await updateDealProfile(input({ amount: '$2,500,000' }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ cr664_amount: 2500000 });
  });

  it('rejects a zero / negative / non-numeric amount (no write)', async () => {
    for (const bad of ['0', '-5', 'abc']) {
      const { deps, calls } = fakeDeps();
      const out = await updateDealProfile(input({ amount: bad }), deps);
      expect(out.kind).toBe('invalid-input');
      expect(calls.update).toBe(0);
    }
  });

  it('fails closed (readback-mismatch) when the amount does not read back as written', async () => {
    const { deps } = fakeDeps({ readDeal: async () => ({ success: true, row: { cr664_amount: 999 } }) });
    const out = await updateDealProfile(input({ amount: '2500000' }), deps);
    expect(out.kind).toBe('readback-mismatch');
  });
});

describe('updateDealProfile — amortization months (Remediation 2026-07-22, Workstream E, governed integer field)', () => {
  it('writes cr664_amortizationmonths as an integer and returns a numeric verified value (audited)', async () => {
    const { deps, store, calls } = fakeDeps();
    const out = await updateDealProfile(input({ amortizationMonths: '240' }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ cr664_amortizationmonths: 240 });
    expect(calls.audit).toBe(1);
    if (out.kind === 'updated') {
      expect(out.verified.amortizationMonths).toBe(240);
      expect(typeof out.verified.amortizationMonths).toBe('number');
      expect(out.changedLabels).toContain('Amortization (months)');
    }
  });

  it('rejects zero / negative / non-integer / implausibly large values (no write)', async () => {
    for (const bad of ['0', '-12', 'abc', '36.5', '601']) {
      const { deps, calls } = fakeDeps();
      const out = await updateDealProfile(input({ amortizationMonths: bad }), deps);
      expect(out.kind).toBe('invalid-input');
      expect(calls.update).toBe(0);
    }
  });

  it('fails closed (readback-mismatch) when the value does not read back as written', async () => {
    const { deps } = fakeDeps({ readDeal: async () => ({ success: true, row: { cr664_amortizationmonths: 60 } }) });
    const out = await updateDealProfile(input({ amortizationMonths: '240' }), deps);
    expect(out.kind).toBe('readback-mismatch');
  });
});

describe('updateDealProfile — loan structure fields (Factory Arc Phase 3, PR105 columns)', () => {
  it('writes cr664_loanpurpose (text) and returns the verified value (audited)', async () => {
    const { deps, store, calls } = fakeDeps();
    const out = await updateDealProfile(input({ loanPurpose: 'Acquisition' }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ cr664_loanpurpose: 'Acquisition' });
    expect(calls.audit).toBe(1);
    if (out.kind === 'updated') {
      expect(out.verified.loanPurpose).toBe('Acquisition');
      expect(out.changedLabels).toContain('Loan Purpose');
    }
  });

  it('rejects a loan purpose over 200 characters (no write) — the same class of bug Phase 1 fixed for the credit memo', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({ loanPurpose: 'A'.repeat(201) }), deps);
    expect(out.kind).toBe('invalid-input');
    expect(calls.update).toBe(0);
  });

  it('accepts a loan purpose at exactly the 200-character ceiling', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({ loanPurpose: 'A'.repeat(200) }), deps);
    expect(out.kind).toBe('updated');
    expect(calls.update).toBe(1);
  });

  it('writes cr664_loantermmonths as an integer and returns a numeric verified value (audited)', async () => {
    const { deps, store, calls } = fakeDeps();
    const out = await updateDealProfile(input({ loanTermMonths: '60' }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ cr664_loantermmonths: 60 });
    expect(calls.audit).toBe(1);
    if (out.kind === 'updated') {
      expect(out.verified.loanTermMonths).toBe(60);
      expect(typeof out.verified.loanTermMonths).toBe('number');
      expect(out.changedLabels).toContain('Loan Term (months)');
    }
  });

  it('rejects zero / negative / non-integer / implausibly large loan terms (no write)', async () => {
    for (const bad of ['0', '-12', 'abc', '36.5', '601']) {
      const { deps, calls } = fakeDeps();
      const out = await updateDealProfile(input({ loanTermMonths: bad }), deps);
      expect(out.kind).toBe('invalid-input');
      expect(calls.update).toBe(0);
    }
  });

  it('writes cr664_ownershipstructure (text) and returns the verified value (audited)', async () => {
    const { deps, store, calls } = fakeDeps();
    const out = await updateDealProfile(input({ ownershipStructure: 'LLC' }), deps);
    expect(out.kind).toBe('updated');
    expect(store.body).toEqual({ cr664_ownershipstructure: 'LLC' });
    expect(calls.audit).toBe(1);
    if (out.kind === 'updated') {
      expect(out.verified.ownershipStructure).toBe('LLC');
      expect(out.changedLabels).toContain('Ownership Structure');
    }
  });

  it('rejects an ownership structure over 100 characters (no write)', async () => {
    const { deps, calls } = fakeDeps();
    const out = await updateDealProfile(input({ ownershipStructure: 'A'.repeat(101) }), deps);
    expect(out.kind).toBe('invalid-input');
    expect(calls.update).toBe(0);
  });

  it('fails closed (readback-mismatch) when a loan-structure value does not read back as written', async () => {
    const { deps } = fakeDeps({ readDeal: async () => ({ success: true, row: { cr664_loanpurpose: 'Refinance' } }) });
    const out = await updateDealProfile(input({ loanPurpose: 'Acquisition' }), deps);
    expect(out.kind).toBe('readback-mismatch');
  });

  it('clears loanPurpose / loanTermMonths / ownershipStructure when the patch value is null', async () => {
    for (const [field, writeKey] of [
      ['loanPurpose', 'cr664_loanpurpose'],
      ['loanTermMonths', 'cr664_loantermmonths'],
      ['ownershipStructure', 'cr664_ownershipstructure'],
    ] as const) {
      const { deps, store } = fakeDeps({ readDeal: async () => ({ success: true, row: { [writeKey]: null } }) });
      const out = await updateDealProfile(input({ [field]: null } as DealProfilePatch), deps);
      expect(out.kind).toBe('updated');
      expect(store.body).toEqual({ [writeKey]: null });
    }
  });
});

describe('updateDealProfile — write-boundary discipline (source)', () => {
  const SRC = readFileSync(resolve(__dirname, 'updateDealProfile.ts'), 'utf8');

  it('never writes stage / status / banker / client (amount is now an approved governed field)', () => {
    // Loan amount (cr664_amount) is a mandatory Intake exit criterion and is now edited here through
    // the governed authorize→validate→update→readback→audit path, so it IS an approved write key.
    expect(SRC).toMatch(/writeKey:\s*'cr664_amount'/);
    // Stage / status / banker / client stay forbidden — they move only through their own governed flows.
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_StageReference/);
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_StatusReference/);
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_AssignedBanker/);
    expect(SRC).not.toMatch(/writeKey:\s*'cr664_Client/);
    // The protected lookups remain in the defense-in-depth forbidden list.
    for (const forbidden of ['cr664_StageReference', 'cr664_StatusReference', 'cr664_AssignedBanker', 'cr664_Client']) {
      expect(SRC).toContain(forbidden);
    }
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
