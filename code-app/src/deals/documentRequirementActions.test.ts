import { describe, it, expect, vi } from 'vitest';
import {
  performDocumentRequirementAction,
  REQUIREMENT_STATUS_CODES,
  type DocumentRequirementActionDeps,
  type DocumentRequirementActionInput,
} from './documentRequirementActions';
import { isBlockingRequirementStatus, isRequirementSatisfied } from './documentRequirementLifecycle';
import type { ActorChangedByResolution } from './newDealAuditActorResolver';

const resolvedActor: ActorChangedByResolution = { ok: true, changedByBind: '/cr664_users(u-1)' };
const unresolvedActor: ActorChangedByResolution = { ok: false, reason: 'no match' };

function baseInput(overrides: Partial<DocumentRequirementActionInput> = {}): DocumentRequirementActionInput {
  return {
    action: 'acknowledge',
    dealId: 'deal-1',
    documentId: undefined,
    documentName: 'Business Financial Statements',
    currentStatus: 'not_assessed',
    systemUserId: 'su-1',
    actorEmail: 'banker@oldglorybank.com',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<DocumentRequirementActionDeps> = {}): DocumentRequirementActionDeps {
  return {
    findRowByName: vi.fn().mockResolvedValue({ ok: true, row: undefined }),
    createRow: vi.fn().mockResolvedValue({ ok: true, id: 'row-new' }),
    updateRow: vi.fn().mockResolvedValue({ ok: true }),
    resolveActorChangedBy: vi.fn().mockResolvedValue(resolvedActor),
    emitAudit: vi.fn().mockResolvedValue({ ok: true }),
    emitTimeline: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe('performDocumentRequirementAction', () => {
  describe('authorization (unauthorized users cannot write)', () => {
    it('fails closed with unauthorized when no systemUserId is present, before touching any dependency', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(baseInput({ systemUserId: undefined }), deps);
      expect(outcome).toEqual({ kind: 'unauthorized', message: 'Actor is not authorized.' });
      expect(deps.findRowByName).not.toHaveBeenCalled();
      expect(deps.createRow).not.toHaveBeenCalled();
      expect(deps.updateRow).not.toHaveBeenCalled();
    });

    it('fails closed with dependency_not_ready when no deps are injected, even for an authorized actor', async () => {
      const outcome = await performDocumentRequirementAction(baseInput());
      expect(outcome).toEqual({ kind: 'dependency_not_ready', detail: 'No live requirement-action dependency injected.' });
    });

    it('acknowledge fails closed with unauthorized when the actor identity cannot be resolved (identity-bound action)', async () => {
      const deps = makeDeps({ resolveActorChangedBy: vi.fn().mockResolvedValue(unresolvedActor) });
      const outcome = await performDocumentRequirementAction(baseInput(), deps);
      expect(outcome.kind).toBe('unauthorized');
      expect(deps.createRow).not.toHaveBeenCalled();
    });
  });

  describe('acknowledgment creates or updates an outstanding requirement', () => {
    it('creates a new row when none exists yet, with required/acknowledged/acknowledgedBy/acknowledgedDate stamped', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(baseInput(), deps);
      expect(outcome).toEqual({ kind: 'success', documentId: 'row-new', status: 'outstanding' });
      expect(deps.createRow).toHaveBeenCalledWith(
        expect.objectContaining({
          dealId: 'deal-1',
          documentName: 'Business Financial Statements',
          fields: expect.objectContaining({
            cr664_requirementstatus: REQUIREMENT_STATUS_CODES.outstanding,
            cr664_required: true,
            cr664_acknowledged: true,
            cr664_acknowledgeddate: expect.any(String),
            'cr664_AcknowledgedBy@odata.bind': '/cr664_users(u-1)',
          }),
        }),
      );
    });

    it('updates the existing row instead of creating a new one when a legacy unacknowledged row is found', async () => {
      const deps = makeDeps({
        findRowByName: vi.fn().mockResolvedValue({ ok: true, row: { id: 'row-legacy', acknowledged: false } }),
      });
      const outcome = await performDocumentRequirementAction(baseInput(), deps);
      expect(outcome).toEqual({ kind: 'success', documentId: 'row-legacy', status: 'outstanding' });
      expect(deps.createRow).not.toHaveBeenCalled();
      expect(deps.updateRow).toHaveBeenCalledWith(
        'row-legacy',
        expect.objectContaining({ cr664_acknowledged: true, 'cr664_AcknowledgedBy@odata.bind': '/cr664_users(u-1)' }),
      );
    });
  });

  it('acknowledgment does not satisfy the blocker — the resulting status is still blocking', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(baseInput(), deps);
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.status).toBe('outstanding');
      expect(isBlockingRequirementStatus(outcome.status)).toBe(true);
      expect(isRequirementSatisfied({ required: true, status: outcome.status })).toBe(false);
    }
  });

  describe('duplicate acknowledgments do not create duplicate rows', () => {
    it('a second acknowledge on an already-acknowledged row reports already-acknowledged and writes nothing', async () => {
      const deps = makeDeps({
        findRowByName: vi.fn().mockResolvedValue({ ok: true, row: { id: 'row-1', acknowledged: true } }),
      });
      const outcome = await performDocumentRequirementAction(baseInput(), deps);
      expect(outcome).toEqual({ kind: 'already-acknowledged', documentId: 'row-1' });
      expect(deps.createRow).not.toHaveBeenCalled();
      expect(deps.updateRow).not.toHaveBeenCalled();
      expect(deps.emitAudit).not.toHaveBeenCalled();
    });

    it('the pure transition guard alone also rejects a second acknowledge against known (non-virtual) UI state', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(
        baseInput({ documentId: 'row-1', currentStatus: 'outstanding' }),
        deps,
      );
      expect(outcome.kind).toBe('invalid-transition');
      expect(deps.findRowByName).not.toHaveBeenCalled();
    });
  });

  describe('received without reviewed remains incomplete where review is required', () => {
    it('receive transitions outstanding -> under_review, stamps receivedDate, and persists the resolved receiver identity (identity-bound, N-16)', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(
        baseInput({ action: 'receive', documentId: 'row-1', currentStatus: 'outstanding' }),
        deps,
      );
      expect(outcome).toEqual({ kind: 'success', documentId: 'row-1', status: 'under_review' });
      expect(deps.updateRow).toHaveBeenCalledWith(
        'row-1',
        expect.objectContaining({
          cr664_requirementstatus: REQUIREMENT_STATUS_CODES.under_review,
          cr664_receiveddate: expect.any(String),
          'cr664_ReceivedBy@odata.bind': '/cr664_users(u-1)',
        }),
      );
      expect(isRequirementSatisfied({ required: true, status: 'under_review' }, 'reviewed')).toBe(false);
    });

    it('receive fails closed with unauthorized when the actor identity cannot be resolved (identity-bound action, N-16)', async () => {
      const deps = makeDeps({ resolveActorChangedBy: vi.fn().mockResolvedValue(unresolvedActor) });
      const outcome = await performDocumentRequirementAction(
        baseInput({ action: 'receive', documentId: 'row-1', currentStatus: 'outstanding' }),
        deps,
      );
      expect(outcome.kind).toBe('unauthorized');
      expect(deps.updateRow).not.toHaveBeenCalled();
    });

    it('review is rejected when the row has not been received yet (still outstanding)', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(
        baseInput({ action: 'review', documentId: 'row-1', currentStatus: 'outstanding', reviewerName: 'Jane Banker' }),
        deps,
      );
      expect(outcome.kind).toBe('invalid-transition');
      expect(deps.updateRow).not.toHaveBeenCalled();
    });
  });

  it('reviewed clears the blocker', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'review', documentId: 'row-1', currentStatus: 'under_review', reviewerName: 'Jane Banker' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'success', documentId: 'row-1', status: 'reviewed' });
    expect(deps.updateRow).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ cr664_requirementstatus: REQUIREMENT_STATUS_CODES.reviewed, cr664_revieweddate: expect.any(String), cr664_reviewer: 'Jane Banker' }),
    );
    expect(isBlockingRequirementStatus('reviewed')).toBe(false);
    expect(isRequirementSatisfied({ required: true, status: 'reviewed' })).toBe(true);
  });

  describe('segregation of duties (N-16): the same resolved identity cannot both receive and review', () => {
    it('blocks review with no write when receivedByCoreUserId matches the reviewing actor\'s resolved identity', async () => {
      const deps = makeDeps({ resolveActorChangedBy: vi.fn().mockResolvedValue({ ok: true, changedByBind: '/cr664_users(u-1)' }) });
      const outcome = await performDocumentRequirementAction(
        baseInput({
          action: 'review',
          documentId: 'row-1',
          currentStatus: 'under_review',
          reviewerName: 'Jane Banker',
          receivedByCoreUserId: 'u-1',
        }),
        deps,
      );
      expect(outcome.kind).toBe('segregation-of-duties');
      expect(deps.updateRow).not.toHaveBeenCalled();
      expect(deps.emitAudit).not.toHaveBeenCalled();
    });

    it('a different resolved reviewer identity may review a document received by someone else', async () => {
      const deps = makeDeps({ resolveActorChangedBy: vi.fn().mockResolvedValue({ ok: true, changedByBind: '/cr664_users(u-2)' }) });
      const outcome = await performDocumentRequirementAction(
        baseInput({
          action: 'review',
          documentId: 'row-1',
          currentStatus: 'under_review',
          reviewerName: 'Jane Banker',
          receivedByCoreUserId: 'u-1',
        }),
        deps,
      );
      expect(outcome.kind).toBe('success');
      expect(deps.updateRow).toHaveBeenCalled();
    });

    it('review proceeds when no receivedByCoreUserId is known (legacy row predating this fact)', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(
        baseInput({ action: 'review', documentId: 'row-1', currentStatus: 'under_review', reviewerName: 'Jane Banker' }),
        deps,
      );
      expect(outcome.kind).toBe('success');
    });
  });

  it('review without a reviewer name is rejected as invalid-input, never reaching the transport', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'review', documentId: 'row-1', currentStatus: 'under_review', reviewerName: '  ' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'invalid-input', reason: 'A reviewer name is required.' });
    expect(deps.updateRow).not.toHaveBeenCalled();
  });

  describe('waiver requires a reason and audit identity', () => {
    it('rejects a waiver with no reason, never reaching the transport', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(
        baseInput({ action: 'waive', documentId: 'row-1', currentStatus: 'outstanding', waiverReason: '  ' }),
        deps,
      );
      expect(outcome).toEqual({ kind: 'invalid-input', reason: 'A waiver reason is required.' });
      expect(deps.updateRow).not.toHaveBeenCalled();
    });

    it('rejects a waiver when the actor identity cannot be resolved (no audit identity, no write)', async () => {
      const deps = makeDeps({ resolveActorChangedBy: vi.fn().mockResolvedValue(unresolvedActor) });
      const outcome = await performDocumentRequirementAction(
        baseInput({ action: 'waive', documentId: 'row-1', currentStatus: 'outstanding', waiverReason: 'Immaterial exposure' }),
        deps,
      );
      expect(outcome.kind).toBe('unauthorized');
      expect(deps.updateRow).not.toHaveBeenCalled();
    });

    it('a valid waiver stamps the reason, waived flag, and status, and resolves a real audit identity', async () => {
      const deps = makeDeps();
      const outcome = await performDocumentRequirementAction(
        baseInput({ action: 'waive', documentId: 'row-1', currentStatus: 'outstanding', waiverReason: 'Immaterial exposure' }),
        deps,
      );
      expect(outcome).toEqual({ kind: 'success', documentId: 'row-1', status: 'waived' });
      expect(deps.updateRow).toHaveBeenCalledWith(
        'row-1',
        expect.objectContaining({
          cr664_requirementstatus: REQUIREMENT_STATUS_CODES.waived,
          cr664_waived: true,
          cr664_waiverreason: 'Immaterial exposure',
        }),
      );
      expect(deps.emitAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: resolvedActor, waiverReason: 'Immaterial exposure' }));
      expect(isBlockingRequirementStatus('waived')).toBe(false);
    });
  });

  it('request: outstanding -> requested, stamps requestDate', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'request', documentId: 'row-1', currentStatus: 'outstanding' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'success', documentId: 'row-1', status: 'requested' });
  });

  it('mark_not_applicable: sets required=false and status not_applicable', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'mark_not_applicable', documentId: 'row-1', currentStatus: 'not_assessed' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'success', documentId: 'row-1', status: 'not_applicable' });
    expect(deps.updateRow).toHaveBeenCalledWith('row-1', expect.objectContaining({ cr664_required: false }));
  });

  it('return_for_correction clears receivedDate/reviewedDate/reviewer and returns to requested', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'return_for_correction', documentId: 'row-1', currentStatus: 'under_review' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'success', documentId: 'row-1', status: 'requested' });
    expect(deps.updateRow).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ cr664_receiveddate: null, cr664_revieweddate: null, cr664_reviewer: null }),
    );
  });

  it('reopen: reviewed -> outstanding, clears the waiver fields and re-arms required', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'reopen', documentId: 'row-1', currentStatus: 'waived' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'success', documentId: 'row-1', status: 'outstanding' });
    expect(deps.updateRow).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ cr664_waived: false, cr664_waiverreason: null, cr664_required: true }),
    );
  });

  it('rejects an invalid transition for a non-acknowledge action too, before touching the transport', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'review', documentId: 'row-1', currentStatus: 'waived', reviewerName: 'Jane' }),
      deps,
    );
    expect(outcome.kind).toBe('invalid-transition');
    expect(deps.updateRow).not.toHaveBeenCalled();
  });

  it('reports write-failed (with a correlation id) when the update transport fails', async () => {
    const deps = makeDeps({ updateRow: vi.fn().mockResolvedValue({ ok: false, error: 'row locked' }) });
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'request', documentId: 'row-1', currentStatus: 'outstanding' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'write-failed', error: 'row locked', correlationId: expect.any(String) });
    expect(deps.emitAudit).not.toHaveBeenCalled();
  });

  it('reports governance-partial (with a correlation id) when the audit write fails after a verified update', async () => {
    const deps = makeDeps({ emitAudit: vi.fn().mockResolvedValue({ ok: false, error: 'audit rejected' }) });
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'request', documentId: 'row-1', currentStatus: 'outstanding' }),
      deps,
    );
    expect(outcome).toEqual({
      kind: 'governance-partial',
      auditError: 'audit rejected',
      timelineError: undefined,
      correlationId: expect.any(String),
    });
  });

  it('reports governance-partial (with a correlation id) when the timeline write fails after a verified update', async () => {
    const deps = makeDeps({ emitTimeline: vi.fn().mockResolvedValue({ ok: false, error: 'timeline rejected' }) });
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'request', documentId: 'row-1', currentStatus: 'outstanding' }),
      deps,
    );
    expect(outcome).toEqual({
      kind: 'governance-partial',
      auditError: undefined,
      timelineError: 'timeline rejected',
      correlationId: expect.any(String),
    });
  });

  it('a non-acknowledge action with no documentId is rejected as invalid-input', async () => {
    const deps = makeDeps();
    const outcome = await performDocumentRequirementAction(
      baseInput({ action: 'request', documentId: undefined, currentStatus: 'outstanding' }),
      deps,
    );
    expect(outcome).toEqual({ kind: 'invalid-input', reason: 'No document id to update.' });
  });
});
