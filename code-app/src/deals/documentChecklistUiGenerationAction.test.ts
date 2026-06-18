import { describe, it, expect, vi } from 'vitest';
import {
  runDocumentChecklistUiGenerationAction,
  type DocumentChecklistUiGenerationActionInput,
  type DocumentChecklistUiGenerationAdapter,
  type DocumentChecklistUiGenerationAdapterRequest,
  type DocumentChecklistUiReadOnlyRefresh,
} from './documentChecklistUiGenerationAction';
import { buildDocumentChecklistUiEnableReadiness } from './documentChecklistUiEnableReadiness';
import type { DocumentChecklistOutcome } from './dealOriginationOutcomes';

/**
 * Phase 188J -- the controlled banker-UI generation bridge. Fail-closed by
 * default: it refuses (and never invokes the injected adapter) unless every
 * preflight passes. Only a fully-enabled, test-only configuration drives one
 * adapter call. No live write, no borrower contact, no New Deal auto-run.
 */

const DEAL_ID = '1a10a165-756a-f111-ab0c-70a8a59be491';
const CORE_USER_BIND = '/cr664_users(940a202e-756a-f111-ab0c-70a8a59be491)';
const APPROVED = ['2024 Business Tax Return', 'Debt Schedule'];

const READY = buildDocumentChecklistUiEnableReadiness({
  evaluateFutureReadiness: true,
  actorIdentity: { email: 'banker@oldglorybank.com', coreUserId: 'cu-1' },
  dealId: DEAL_ID,
  approvedChecklistNames: APPROVED,
  existingChecklistRows: [],
  graphReadinessSafe: true,
});

const ALREADY = buildDocumentChecklistUiEnableReadiness({
  evaluateFutureReadiness: true,
  actorIdentity: { email: 'banker@oldglorybank.com', coreUserId: 'cu-1' },
  dealId: DEAL_ID,
  approvedChecklistNames: APPROVED,
  existingChecklistRows: APPROVED, // all present -> already_generated
  graphReadinessSafe: true,
});

function okRefresh(names: readonly string[] = APPROVED): DocumentChecklistUiReadOnlyRefresh {
  return vi.fn(async () => ({ ok: true, names }));
}

function adapterReturning(outcome: DocumentChecklistOutcome): DocumentChecklistUiGenerationAdapter {
  return vi.fn(async () => outcome);
}

function fullyEnabledInput(
  overrides: Partial<DocumentChecklistUiGenerationActionInput> = {},
): DocumentChecklistUiGenerationActionInput {
  return {
    readiness: READY,
    gates: { pilotUiEnabled: true, uiGenerateActionEnabled: true },
    actor: { email: 'banker@oldglorybank.com', changedByBind: CORE_USER_BIND },
    dealId: DEAL_ID,
    approvedNames: APPROVED,
    generateChecklist: adapterReturning({
      module: 'document-checklist',
      kind: 'success',
      detail: '2 checklist row(s) created.',
      correlationId: 'dc-audit-123',
    }),
    refreshChecklist: okRefresh(),
    correlationId: 'dc-audit-123',
    ...overrides,
  };
}

describe('runDocumentChecklistUiGenerationAction -- fail-closed preflight', () => {
  it('refuses and does not invoke the adapter when the UI gate is false', async () => {
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({
        gates: { pilotUiEnabled: false, uiGenerateActionEnabled: true },
        generateChecklist: adapter,
      }),
    );
    expect(res.category).toBe('refused');
    expect(res.uiState).toBe('refused_gate_disabled');
    expect(res.invokedAdapter).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses when the UI generate-action gate is false', async () => {
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({
        gates: { pilotUiEnabled: true, uiGenerateActionEnabled: false },
        generateChecklist: adapter,
      }),
    );
    expect(res.uiState).toBe('refused_gate_disabled');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses when the readiness verdict is not 188J-ready', async () => {
    const notReady = buildDocumentChecklistUiEnableReadiness({
      evaluateFutureReadiness: true,
      actorIdentity: { email: 'banker@oldglorybank.com' },
      dealId: DEAL_ID,
      approvedChecklistNames: APPROVED,
      graphReadinessSafe: false, // -> unsafe_graph
    });
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ readiness: notReady, generateChecklist: adapter }),
    );
    expect(res.uiState).toBe('refused_not_ready');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses when the actor is missing', async () => {
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ actor: null, generateChecklist: adapter }),
    );
    expect(res.uiState).toBe('refused_missing_actor');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses a /systemusers actor bind (never binds systemuser)', async () => {
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({
        actor: { email: 'banker@oldglorybank.com', changedByBind: '/systemusers(abc)' },
        generateChecklist: adapter,
      }),
    );
    expect(res.uiState).toBe('refused_unsafe_actor_bind');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses a missing deal id', async () => {
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ dealId: '   ', generateChecklist: adapter }),
    );
    expect(res.uiState).toBe('refused_missing_deal_id');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses empty approved names', async () => {
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ approvedNames: ['  ', ''], generateChecklist: adapter }),
    );
    expect(res.uiState).toBe('refused_missing_approved_names');
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe('runDocumentChecklistUiGenerationAction -- controlled enabled path', () => {
  it('calls the injected adapter exactly once when fully enabled (test-only)', async () => {
    const adapter = adapterReturning({
      module: 'document-checklist',
      kind: 'success',
      detail: '2 created.',
      correlationId: 'dc-audit-123',
    });
    const refresh = okRefresh();
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ generateChecklist: adapter, refreshChecklist: refresh }),
    );
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(res.invokedAdapter).toBe(true);
    expect(res.category).toBe('success');
    expect(res.uiState).toBe('success_refresh_checklist');
  });

  it('passes the exact deal id and approved names (only) to the adapter', async () => {
    const adapter = vi.fn(
      async (_request: DocumentChecklistUiGenerationAdapterRequest): Promise<DocumentChecklistOutcome> => ({
        module: 'document-checklist',
        kind: 'success',
      }),
    );
    await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ generateChecklist: adapter }),
    );
    const request = adapter.mock.calls[0][0];
    expect(request.dealId).toBe(DEAL_ID);
    expect(request.approvedNames).toEqual(APPROVED);
    // The request never names a checklist row field beyond the allow-list.
    expect(Object.keys(request)).not.toContain('cr664_documentname');
    expect(Object.keys(request)).not.toContain('cr664_documenttype');
    expect(Object.keys(request)).not.toContain('cr664_Deal@odata.bind');
  });

  it('treats the correlation id as audit-only (never a row field)', async () => {
    const adapter = vi.fn(
      async (_request: DocumentChecklistUiGenerationAdapterRequest): Promise<DocumentChecklistOutcome> => ({
        module: 'document-checklist',
        kind: 'success',
        correlationId: 'dc-audit-xyz',
      }),
    );
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ generateChecklist: adapter, correlationId: 'dc-audit-xyz' }),
    );
    const request = adapter.mock.calls[0][0];
    expect(request.correlationId).toBe('dc-audit-xyz');
    // It rides the request + result as audit metadata, NOT as cr664_correlationid.
    expect(Object.keys(request)).not.toContain('cr664_correlationid');
    expect(res.correlationId).toBe('dc-audit-xyz');
  });

  it('runs a read-only refresh ONLY after success', async () => {
    const refresh = okRefresh(['2024 Business Tax Return', 'Debt Schedule']);
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ refreshChecklist: refresh }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(DEAL_ID);
    expect(res.refreshed).toBe(true);
    expect(res.refreshedNames).toEqual(['2024 Business Tax Return', 'Debt Schedule']);
  });

  it('does NOT refresh after a controlled error outcome', async () => {
    const adapter = adapterReturning({
      module: 'document-checklist',
      kind: 'failed',
      detail: 'No checklist rows created.',
    });
    const refresh = okRefresh();
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ generateChecklist: adapter, refreshChecklist: refresh }),
    );
    expect(res.category).toBe('error');
    expect(res.uiState).toBe('error_no_rows_created');
    expect(res.refreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('maps a partial failure to a controlled error UI state', async () => {
    const adapter = adapterReturning({
      module: 'document-checklist',
      kind: 'partial_success',
      detail: '1 created, 1 failed.',
      correlationId: 'dc-audit-1',
    });
    const refresh = okRefresh();
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ generateChecklist: adapter, refreshChecklist: refresh }),
    );
    expect(res.category).toBe('error');
    expect(res.uiState).toBe('error_partial_review_required');
    expect(res.refreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('maps an already-generated adapter skip to a non-error UI state and refreshes', async () => {
    const adapter = adapterReturning({
      module: 'document-checklist',
      kind: 'skipped_duplicate_detected',
      detail: 'All checklist rows already exist.',
    });
    const refresh = okRefresh();
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ generateChecklist: adapter, refreshChecklist: refresh }),
    );
    expect(res.category).toBe('informational');
    expect(res.uiState).toBe('informational_already_generated');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('short-circuits an already_generated readiness verdict without invoking the adapter', async () => {
    const adapter = adapterReturning({ module: 'document-checklist', kind: 'success' });
    const refresh = okRefresh();
    const res = await runDocumentChecklistUiGenerationAction(
      fullyEnabledInput({ readiness: ALREADY, generateChecklist: adapter, refreshChecklist: refresh }),
    );
    expect(res.invokedAdapter).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
    expect(res.category).toBe('informational');
    expect(res.uiState).toBe('informational_already_generated');
    expect(refresh).toHaveBeenCalledTimes(1); // read-only refresh after already-generated
  });
});
