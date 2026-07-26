import { describe, it, expect, vi } from 'vitest';
import {
  orchestrateDealOrigination,
  type DealOriginationInput,
  type RunGovernedCreate,
} from './dealOriginationOrchestrator';
import type { NewDealCreateOutcome } from './newDealCreateAdapter';

/**
 * Phase 171-180 -- deal origination orchestrator (controlled pipeline).
 *
 * Everything is disabled by default; the governed create is injected and
 * downstream IO is injected, so no Dataverse write ever happens. The
 * test-only `modules` override exercises top-level determination.
 */

const FORM = {
  dealName: 'V1 Create Proof - test',
  assignedBankerId: 'banker-1',
  actorSystemUserId: 'sys-1',
};

function input(over: Partial<DealOriginationInput> = {}): DealOriginationInput {
  return { form: FORM, ...over };
}

function createReturning(outcome: NewDealCreateOutcome): RunGovernedCreate {
  return vi.fn(async () => outcome);
}

const SUCCESS: NewDealCreateOutcome = { kind: 'success', dealId: 'deal-1', correlationId: 'c1' };

describe('orchestrator -- default is fully disabled, no IO', () => {
  it('default deps -> top "disabled", no create, all downstream skipped', async () => {
    const res = await orchestrateDealOrigination(input());
    expect(res.kind).toBe('disabled');
    expect(res.createOutcome.kind).toBe('skipped');
    expect(res.createdDealId).toBeUndefined();
    expect(res.crmOutcome.kind).toBe('disabled');
    expect(res.userFacingMessage).toMatch(/No record has been created/i);
  });
});

describe('orchestrator -- create outcome mapping (no downstream on non-success)', () => {
  const cases: Array<[NewDealCreateOutcome, string]> = [
    [{ kind: 'validation_error', field: 'dealName', message: 'x' }, 'validation_error'],
    [{ kind: 'unauthorized', reason: 'x' }, 'unauthorized'],
    [{ kind: 'resolver_not_ready', resolution: 'missingStage', detail: 'x' }, 'resolver_not_ready'],
    [{ kind: 'create_failed', error: 'boom' }, 'create_failed'],
  ];
  for (const [outcome, expected] of cases) {
    it(`create ${outcome.kind} -> top ${expected}`, async () => {
      const runCrmLink = vi.fn();
      const res = await orchestrateDealOrigination(input(), {
        runGovernedCreate: createReturning(outcome),
        runCrmLink,
      });
      expect(res.kind).toBe(expected);
      expect(runCrmLink).not.toHaveBeenCalled();
    });
  }

  // Factory Arc Phase 11 — the adapter's specific resolverDetail() text must
  // reach the banker-facing userFacingMessage verbatim, not be discarded in
  // favor of one generic "Stage/Status references are not ready" sentence.
  it('resolver_not_ready propagates the adapter\'s specific detail into userFacingMessage', async () => {
    const res = await orchestrateDealOrigination(input(), {
      runGovernedCreate: createReturning({
        kind: 'resolver_not_ready',
        resolution: 'serviceError',
        detail: 'Could not reach Dataverse to verify Stage/Status references (timeout after 30s).',
      }),
    });
    expect(res.kind).toBe('resolver_not_ready');
    expect(res.userFacingMessage).toContain('Could not reach Dataverse to verify Stage/Status references (timeout after 30s).');
    expect(res.userFacingMessage).toMatch(/No record has been created/i);
  });

  it('create audit_failed_partial -> top audit_failed_partial, downstream NOT run', async () => {
    const crm = vi.fn(async () => ({ module: 'crm-automation', kind: 'success' as const }));
    const res = await orchestrateDealOrigination(input(), {
      runGovernedCreate: createReturning({
        kind: 'audit_failed_partial',
        dealId: 'deal-1',
        correlationId: 'c1',
        auditError: 'audit boom',
      }),
      modules: { crm },
    });
    expect(res.kind).toBe('audit_failed_partial');
    expect(res.createdDealId).toBe('deal-1');
    expect(res.createOutcome.kind).toBe('success');
    expect(res.auditOutcome.kind).toBe('failed');
    expect(crm).not.toHaveBeenCalled();
  });
});

describe('orchestrator -- success + downstream determination', () => {
  it('create success + all downstream disabled -> success_created_only', async () => {
    const res = await orchestrateDealOrigination(input({ context: { authorized: true } }), {
      runGovernedCreate: createReturning(SUCCESS),
    });
    expect(res.kind).toBe('success_created_only');
    expect(res.createdDealId).toBe('deal-1');
    expect(res.crmOutcome.kind).toBe('disabled');
  });

  // PR A remediation — the banker-entered deal name is genuinely known at submit time (never
  // fabricated); carrying it through the result lets the UI show a human label alongside the raw
  // Dataverse id instead of only the id (see BankerNewDealCreate.tsx's OutcomeBanner).
  it('PR A: carries the banker-entered dealName through on every outcome kind, not just success', async () => {
    const success = await orchestrateDealOrigination(input({ context: { authorized: true } }), {
      runGovernedCreate: createReturning(SUCCESS),
    });
    expect(success.dealName).toBe('V1 Create Proof - test');

    const failed = await orchestrateDealOrigination(input(), {
      runGovernedCreate: createReturning({ kind: 'create_failed', error: 'boom' }),
    });
    expect(failed.dealName).toBe('V1 Create Proof - test');
  });

  it('create success + a downstream success -> success_created_with_automation', async () => {
    const res = await orchestrateDealOrigination(input({ context: { authorized: true } }), {
      runGovernedCreate: createReturning(SUCCESS),
      modules: { task: async () => ({ module: 'task-generation', kind: 'success' }) },
    });
    expect(res.kind).toBe('success_created_with_automation');
    expect(res.taskGenerationOutcome.kind).toBe('success');
  });

  it('create success + a downstream failure -> created_with_downstream_partial_failure', async () => {
    const res = await orchestrateDealOrigination(input({ context: { authorized: true } }), {
      runGovernedCreate: createReturning(SUCCESS),
      modules: {
        task: async () => ({ module: 'task-generation', kind: 'success' }),
        crm: async () => ({ module: 'crm-automation', kind: 'failed', detail: 'boom' }),
      },
    });
    expect(res.kind).toBe('created_with_downstream_partial_failure');
    expect(res.crmOutcome.kind).toBe('failed');
  });
});

describe('orchestrator -- CRM-first client gate (Step 1, before create)', () => {
  it('requireCrmClient + no client -> client_required, create NOT run (honest pre-create blocker)', async () => {
    const runGovernedCreate = createReturning(SUCCESS);
    const res = await orchestrateDealOrigination(
      input({ context: { authorized: true, requireCrmClient: true, clientRelationshipsExist: true } }),
      { runGovernedCreate },
    );
    expect(res.kind).toBe('client_required');
    expect(runGovernedCreate).not.toHaveBeenCalled();
    expect(res.createOutcome.kind).toBe('skipped');
    expect(res.userFacingMessage).toMatch(/Select the CRM client relationship/i);
  });

  it('requireCrmClient + NO clients exist -> honest create/import blocker copy', async () => {
    const res = await orchestrateDealOrigination(
      input({ context: { authorized: true, requireCrmClient: true, clientRelationshipsExist: false } }),
      { runGovernedCreate: createReturning(SUCCESS) },
    );
    expect(res.kind).toBe('client_required');
    expect(res.userFacingMessage).toMatch(/No CRM client relationship exists yet/i);
  });

  it('requireCrmClient + a selected client -> create proceeds', async () => {
    const runGovernedCreate = createReturning(SUCCESS);
    const res = await orchestrateDealOrigination(
      input({
        form: { ...FORM, existingClientId: 'client-1' },
        context: { authorized: true, requireCrmClient: true },
      }),
      { runGovernedCreate },
    );
    expect(res.kind).toBe('success_created_only');
    expect(runGovernedCreate).toHaveBeenCalledTimes(1);
  });

  it('admin allowance lets a client-less deal proceed', async () => {
    const res = await orchestrateDealOrigination(
      input({ context: { authorized: true, requireCrmClient: true, allowCreateWithoutClient: true } }),
      { runGovernedCreate: createReturning(SUCCESS) },
    );
    expect(res.kind).toBe('success_created_only');
  });

  it('link_readback_mismatch -> honest partial, downstream NOT run', async () => {
    const crm = vi.fn(async () => ({ module: 'crm-automation', kind: 'success' as const }));
    const res = await orchestrateDealOrigination(
      input({ form: { ...FORM, existingClientId: 'client-1' }, context: { authorized: true } }),
      {
        runGovernedCreate: createReturning({
          kind: 'link_readback_mismatch',
          dealId: 'deal-1',
          correlationId: 'c1',
          detail: 'created deal does not point at the selected client relationship',
        }),
        modules: { crm },
      },
    );
    expect(res.kind).toBe('link_readback_mismatch');
    expect(res.createdDealId).toBe('deal-1');
    expect(res.createOutcome.kind).toBe('success');
    expect(res.auditOutcome.kind).toBe('failed');
    expect(crm).not.toHaveBeenCalled();
  });
});

describe('orchestrator -- duplicate policy block (pre-create)', () => {
  it('exact duplicate + policy block -> downstream_blocked_by_policy, no create', async () => {
    const runGovernedCreate = createReturning(SUCCESS);
    const res = await orchestrateDealOrigination(
      input({
        context: {
          detectionEnabledOverride: true,
          exactDuplicateBlocks: true,
          existingDeals: [{ dealId: 'dupe-1', dealName: 'V1 Create Proof - test' }],
        },
      }),
      { runGovernedCreate },
    );
    expect(res.kind).toBe('downstream_blocked_by_policy');
    expect(res.duplicateOutcome.kind).toBe('exact_duplicate_found');
    expect(runGovernedCreate).not.toHaveBeenCalled();
    expect(res.createOutcome.kind).toBe('skipped');
  });

  it('exact duplicate WITHOUT policy block -> warns only, create proceeds', async () => {
    const res = await orchestrateDealOrigination(
      input({
        context: {
          authorized: true,
          detectionEnabledOverride: true,
          exactDuplicateBlocks: false,
          existingDeals: [{ dealId: 'dupe-1', dealName: 'V1 Create Proof - test' }],
        },
      }),
      { runGovernedCreate: createReturning(SUCCESS) },
    );
    expect(res.duplicateOutcome.kind).toBe('exact_duplicate_found');
    expect(res.kind).toBe('success_created_only');
  });
});
