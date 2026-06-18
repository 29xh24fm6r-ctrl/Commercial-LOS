import { describe, it, expect } from 'vitest';
import { buildDocumentChecklistUiEnableReadiness } from './documentChecklistUiEnableReadiness';

/**
 * Phase 188I -- the UI-enable readiness view-model is a pure, advisory plan for a
 * FUTURE controlled generate action. It enables nothing: canGenerate is ALWAYS
 * false and both enablement gates are reported false, even when the would-be
 * readiness verdict is `ready_for_future_enablement`.
 */

const APPROVED = ['2024 Business Tax Return', 'Debt Schedule'];
const READY_INPUT = {
  evaluateFutureReadiness: true as const,
  actorIdentity: { email: 'mpaller@oldglorybank.com', coreUserId: '940a202e-756a-f111-ab0c-70a8a59be491' },
  dealId: '1a10a165-756a-f111-ab0c-70a8a59be491',
  approvedChecklistNames: APPROVED,
  existingChecklistRows: [] as readonly string[],
  graphReadinessSafe: true,
};

describe('buildDocumentChecklistUiEnableReadiness -- hard invariants (188I)', () => {
  it('default call reports disabled_by_default and never generates', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({ approvedChecklistNames: APPROVED });
    expect(vm.status).toBe('disabled_by_default');
    expect(vm.canGenerate).toBe(false);
    expect(vm.uiEnabledNow).toBe(false);
    expect(vm.runtimeGenerationEnabled).toBe(false);
    expect(vm.futureEnableConditionMet).toBe(false);
  });

  it('canGenerate stays false even when fully ready for future enablement', () => {
    const vm = buildDocumentChecklistUiEnableReadiness(READY_INPUT);
    expect(vm.status).toBe('ready_for_future_enablement');
    // The whole point of 188I: ready != enabled.
    expect(vm.canGenerate).toBe(false);
    expect(vm.uiEnabledNow).toBe(false);
    expect(vm.runtimeGenerationEnabled).toBe(false);
    expect(vm.futureEnableConditionMet).toBe(true);
  });
});

describe('would-be readiness evaluation (advisory only)', () => {
  it('missing actor identity blocks future enablement', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({ ...READY_INPUT, actorIdentity: null });
    expect(vm.status).toBe('missing_actor_identity');
    expect(vm.canGenerate).toBe(false);
    expect(vm.blockers.join(' ')).toMatch(/cr664_users/);
  });

  it('an actor with neither email nor core user id is treated as missing', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({
      ...READY_INPUT,
      actorIdentity: { email: '  ', coreUserId: '' },
    });
    expect(vm.status).toBe('missing_actor_identity');
  });

  it('missing deal id blocks future enablement', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({ ...READY_INPUT, dealId: '   ' });
    expect(vm.status).toBe('missing_deal_id');
    expect(vm.canGenerate).toBe(false);
  });

  it('missing approved names blocks future enablement', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({ ...READY_INPUT, approvedChecklistNames: [] });
    expect(vm.status).toBe('missing_approved_names');
    expect(vm.canGenerate).toBe(false);
  });

  it('an unsafe / un-inspected graph blocks future enablement', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({ ...READY_INPUT, graphReadinessSafe: false });
    expect(vm.status).toBe('unsafe_graph');
    expect(vm.canGenerate).toBe(false);
  });

  it('already-generated is informational only (no blocker, no action)', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({
      ...READY_INPUT,
      existingChecklistRows: ['2024 business tax return', 'debt schedule'],
    });
    expect(vm.status).toBe('already_generated');
    expect(vm.blockers).toEqual([]);
    expect(vm.canGenerate).toBe(false);
    expect(vm.futureEnableConditionMet).toBe(false);
  });

  it('ready_for_future_enablement requires a name not already present', () => {
    const vm = buildDocumentChecklistUiEnableReadiness({
      ...READY_INPUT,
      existingChecklistRows: ['Debt Schedule'],
    });
    expect(vm.status).toBe('ready_for_future_enablement');
    expect(vm.wouldCreateNames).toEqual(['2024 Business Tax Return']);
    expect(vm.alreadyPresentNames).toEqual(['Debt Schedule']);
    expect(vm.canGenerate).toBe(false);
  });
});

describe('the model documents the future 188J contract', () => {
  const vm = buildDocumentChecklistUiEnableReadiness(READY_INPUT);

  it('lists the two-gate future enablement preconditions', () => {
    const joined = vm.futureEnablementPreconditions.join(' | ');
    expect(joined).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED/);
    expect(joined).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED/);
  });

  it('pins the required actor, deal, and approved-name source contracts', () => {
    expect(vm.requiredActorIdentity).toMatch(/\/cr664_users\(<CoreUser>\)/);
    expect(vm.requiredActorIdentity).toMatch(/never \/systemusers/);
    expect(vm.requiredDealIdentity).toMatch(/exact .*id/i);
    expect(vm.requiredDealIdentity).toMatch(/no --deal-name/);
    expect(vm.approvedNamesSource).toMatch(/DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES/);
    expect(vm.approvedNamesSource).toMatch(/never invented at runtime/i);
  });

  it('maps every adapter status to a UI state', () => {
    const map = vm.uiStateByAdapterStatus;
    expect(map.disabled).toBe('action_hidden_or_disabled');
    expect(map.success).toBe('success_refresh_checklist');
    expect(map.skipped_duplicate_detected).toBe('informational_already_generated');
    expect(map.partial_success).toMatch(/review/);
    expect(map.audit_failed_partial).toMatch(/audit_failed/);
    // all nine adapter kinds are mapped
    expect(Object.keys(map)).toHaveLength(9);
  });

  it('requires the audit facts including audit-only correlation id', () => {
    const facts = vm.requiredAuditFacts.join(' | ');
    expect(facts).toMatch(/\/cr664_users\(<CoreUser>\)/);
    expect(facts).toMatch(/[Cc]orrelation id \(audit-only/);
  });

  it('keeps borrower comms, send flow, auto-run, and documenttype forbidden', () => {
    const forbidden = vm.forbiddenAfterEnablement.join(' | ');
    expect(forbidden).toMatch(/No borrower email \/ SMS \/ Outlook \/ handoff/);
    expect(forbidden).toMatch(/No document request send flow/);
    expect(forbidden).toMatch(/No New Deal auto-run/);
    expect(forbidden).toMatch(/No cr664_documenttype usage/);
    expect(forbidden).toMatch(/cr664_documentname \+ cr664_Deal@odata\.bind/);
  });

  it('documents a fail-closed two-switch rollback', () => {
    expect(vm.rollbackSwitch).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED=false/);
    expect(vm.rollbackSwitch).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED=false/);
    expect(vm.rollbackSwitch).toMatch(/fail closed/i);
  });

  it('describes a read-only post-generation refresh', () => {
    expect(vm.postGenerationRefresh).toMatch(/re-read|re-derive|read-only/i);
  });
});
