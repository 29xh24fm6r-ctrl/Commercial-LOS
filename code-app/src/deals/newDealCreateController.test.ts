import { describe, it, expect, vi } from 'vitest';
import {
  getNewDealCreateViewState,
  canSubmitNewDeal,
  submitGovernedNewDeal,
} from './newDealCreateController';
import type { NewDealCreateEnablementInput } from './newDealCreateEnablement';
import type {
  GovernedNewDealCreateInput,
  NewDealCreateOutcome,
} from './newDealCreateAdapter';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../admin/adminNewDealIntakeModel';

/**
 * Phase 170N / 170P -- governed create controller (guarded UI boundary).
 *
 * No generated service is imported here: the controller view-state is pure,
 * and submit uses an INJECTED runCreate so the adapter (and its SDK services)
 * never load. The default config is disabled, so no record is ever created.
 * The `intakeEnabled` override is test-only and proves the gated delegation
 * path without flipping the committed NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED.
 */

function approvedNonProd(over: Partial<NewDealCreateEnablementInput> = {}): NewDealCreateEnablementInput {
  return {
    config: { adapterEnabled: true, auditWired: true, allowedNonProdEnvironments: ['pilot'] },
    environment: { name: 'pilot', isProduction: false },
    authorization: { isAdminOrDev: true, actorSystemUserId: 'sys-1' },
    resolverReady: true,
    ...over,
  };
}

const FORM: GovernedNewDealCreateInput = {
  dealName: 'TEST - Controlled New Deal',
  assignedBankerId: 'banker-1',
  actorSystemUserId: 'sys-1',
};

function okCreate(outcome?: NewDealCreateOutcome) {
  return vi.fn(
    async () => outcome ?? ({ kind: 'success', dealId: 'd1', correlationId: 'c1' } as NewDealCreateOutcome),
  );
}

describe('Phase 170N -- view-state is honest and disabled by default', () => {
  it('default config -> disabled, submit not allowed', () => {
    const view = getNewDealCreateViewState();
    expect(view.kind).toBe('disabled');
    expect(canSubmitNewDeal(view)).toBe(false);
    if (view.kind === 'disabled') expect(view.reason).toMatch(/No record has been created/i);
  });

  it('maps each gate to an honest, distinct view-state', () => {
    expect(getNewDealCreateViewState(approvedNonProd({ authorization: { isAdminOrDev: false } })).kind).toBe(
      'unauthorized',
    );
    expect(getNewDealCreateViewState(approvedNonProd({ environment: { name: 'staging' } })).kind).toBe(
      'environment_not_allowed',
    );
    expect(getNewDealCreateViewState({ config: { adapterEnabled: 'x' as unknown as boolean } }).kind).toBe(
      'config_invalid',
    );
    expect(getNewDealCreateViewState(approvedNonProd({ resolverReady: false })).kind).toBe(
      'resolver_not_ready',
    );
  });

  it('every non-ready view-state carries an honest "No record has been created" reason', () => {
    for (const input of [
      {},
      approvedNonProd({ authorization: { isAdminOrDev: false } }),
      approvedNonProd({ environment: { name: 'staging' } }),
      approvedNonProd({ resolverReady: false }),
    ]) {
      const view = getNewDealCreateViewState(input);
      expect(view.kind).not.toBe('ready');
      if (view.kind !== 'ready') expect(view.reason).toMatch(/No record has been created/i);
    }
  });
});

describe('Phase 170N -- public intake gate is a hard floor', () => {
  it('stays disabled even when the controlled gate would open, because intake is off', () => {
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    const view = getNewDealCreateViewState(approvedNonProd());
    expect(view.kind).toBe('disabled');
    expect(canSubmitNewDeal(view)).toBe(false);
  });

  it('reaches ready ONLY when both the controlled gate and the intake floor are open', () => {
    // The override is test-only; production never passes it.
    const view = getNewDealCreateViewState(approvedNonProd(), /* intakeEnabled */ true);
    expect(view.kind).toBe('ready');
    expect(canSubmitNewDeal(view)).toBe(true);
  });
});

describe('Phase 170P -- submit refuses before touching the adapter unless gated', () => {
  it('does NOT call runCreate while disabled (default) and returns disabled', async () => {
    const runCreate = okCreate();
    const out = await submitGovernedNewDeal(FORM, {}, { runCreate });
    expect(out.kind).toBe('disabled');
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('does NOT call runCreate when unauthorized', async () => {
    const runCreate = okCreate();
    const out = await submitGovernedNewDeal(
      FORM,
      approvedNonProd({ authorization: { isAdminOrDev: false } }),
      { runCreate, intakeEnabled: true },
    );
    expect(out.kind).toBe('unauthorized');
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('does NOT call runCreate when resolver is not ready', async () => {
    const runCreate = okCreate();
    const out = await submitGovernedNewDeal(FORM, approvedNonProd({ resolverReady: false }), {
      runCreate,
      intakeEnabled: true,
    });
    expect(out.kind).toBe('resolver_not_ready');
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('does NOT call runCreate when the environment is not allowed (maps to disabled)', async () => {
    const runCreate = okCreate();
    const out = await submitGovernedNewDeal(FORM, approvedNonProd({ environment: { name: 'staging' } }), {
      runCreate,
      intakeEnabled: true,
    });
    expect(out.kind).toBe('disabled');
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('does NOT call runCreate while the intake floor is closed even if the controlled gate is open', async () => {
    const runCreate = okCreate();
    // intakeEnabled defaults to the committed false constant.
    const out = await submitGovernedNewDeal(FORM, approvedNonProd(), { runCreate });
    expect(out.kind).toBe('disabled');
    expect(runCreate).not.toHaveBeenCalled();
  });
});

describe('Phase 170P -- gated submit delegates and passes outcomes through verbatim', () => {
  it('calls runCreate exactly once and returns success', async () => {
    const runCreate = okCreate();
    const out = await submitGovernedNewDeal(FORM, approvedNonProd(), { runCreate, intakeEnabled: true });
    expect(runCreate).toHaveBeenCalledTimes(1);
    expect(runCreate).toHaveBeenCalledWith(FORM);
    expect(out).toMatchObject({ kind: 'success', dealId: 'd1' });
  });

  it('passes create_failed and audit_failed_partial through unchanged', async () => {
    const failed = okCreate({ kind: 'create_failed', error: 'boom' });
    expect(
      await submitGovernedNewDeal(FORM, approvedNonProd(), { runCreate: failed, intakeEnabled: true }),
    ).toMatchObject({ kind: 'create_failed', error: 'boom' });

    const partial = okCreate({
      kind: 'audit_failed_partial',
      dealId: 'd1',
      correlationId: 'c1',
      auditError: 'audit boom',
    });
    expect(
      await submitGovernedNewDeal(FORM, approvedNonProd(), { runCreate: partial, intakeEnabled: true }),
    ).toMatchObject({ kind: 'audit_failed_partial', dealId: 'd1', auditError: 'audit boom' });
  });
});
