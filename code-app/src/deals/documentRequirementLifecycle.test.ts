import { describe, it, expect } from 'vitest';
import {
  applyLifecycleAction,
  validActionsForStatus,
  isBlockingRequirementStatus,
  isRequirementSatisfied,
  describeRequirementStatus,
  DOCUMENT_REQUIREMENT_ACTIONS,
  type DocumentRequirementStatus,
} from './documentRequirementLifecycle';

describe('applyLifecycleAction', () => {
  it('acknowledge: not_assessed -> outstanding', () => {
    expect(applyLifecycleAction('not_assessed', 'acknowledge')).toEqual({ ok: true, nextStatus: 'outstanding' });
  });

  it('acknowledge is rejected from every other status (no re-acknowledging an already-acknowledged row)', () => {
    const others: DocumentRequirementStatus[] = ['outstanding', 'requested', 'under_review', 'reviewed', 'waived', 'not_applicable'];
    for (const s of others) {
      const r = applyLifecycleAction(s, 'acknowledge');
      expect(r.ok, s).toBe(false);
    }
  });

  it('request: outstanding -> requested; rejected from not_assessed', () => {
    expect(applyLifecycleAction('outstanding', 'request')).toEqual({ ok: true, nextStatus: 'requested' });
    expect(applyLifecycleAction('not_assessed', 'request').ok).toBe(false);
  });

  it('receive: outstanding or requested -> under_review', () => {
    expect(applyLifecycleAction('outstanding', 'receive')).toEqual({ ok: true, nextStatus: 'under_review' });
    expect(applyLifecycleAction('requested', 'receive')).toEqual({ ok: true, nextStatus: 'under_review' });
    expect(applyLifecycleAction('not_assessed', 'receive').ok).toBe(false);
  });

  it('review: under_review -> reviewed; rejected everywhere else, including outstanding (received without reviewed stays incomplete)', () => {
    expect(applyLifecycleAction('under_review', 'review')).toEqual({ ok: true, nextStatus: 'reviewed' });
    for (const s of ['not_assessed', 'outstanding', 'requested', 'reviewed', 'waived', 'not_applicable'] as const) {
      expect(applyLifecycleAction(s, 'review').ok, s).toBe(false);
    }
  });

  it('return_for_correction: under_review or reviewed -> requested (reopens for a corrected re-submission)', () => {
    expect(applyLifecycleAction('under_review', 'return_for_correction')).toEqual({ ok: true, nextStatus: 'requested' });
    expect(applyLifecycleAction('reviewed', 'return_for_correction')).toEqual({ ok: true, nextStatus: 'requested' });
  });

  it('waive: valid from not_assessed/outstanding/requested only; rejected once under review or reviewed', () => {
    for (const s of ['not_assessed', 'outstanding', 'requested'] as const) {
      expect(applyLifecycleAction(s, 'waive')).toEqual({ ok: true, nextStatus: 'waived' });
    }
    for (const s of ['under_review', 'reviewed'] as const) {
      expect(applyLifecycleAction(s, 'waive').ok, s).toBe(false);
    }
  });

  it('mark_not_applicable: valid from not_assessed/outstanding only', () => {
    expect(applyLifecycleAction('not_assessed', 'mark_not_applicable')).toEqual({ ok: true, nextStatus: 'not_applicable' });
    expect(applyLifecycleAction('outstanding', 'mark_not_applicable')).toEqual({ ok: true, nextStatus: 'not_applicable' });
    expect(applyLifecycleAction('requested', 'mark_not_applicable').ok).toBe(false);
  });

  it('reopen: waived/not_applicable/reviewed -> outstanding', () => {
    for (const s of ['waived', 'not_applicable', 'reviewed'] as const) {
      expect(applyLifecycleAction(s, 'reopen')).toEqual({ ok: true, nextStatus: 'outstanding' });
    }
    expect(applyLifecycleAction('outstanding', 'reopen').ok).toBe(false);
  });

  it('an invalid transition reports a human-readable reason naming the action and status', () => {
    const r = applyLifecycleAction('reviewed', 'acknowledge');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/acknowledge/);
      expect(r.reason).toMatch(/reviewed/);
    }
  });
});

describe('validActionsForStatus', () => {
  it('every action returned for a status is itself a valid transition from that status', () => {
    const statuses: DocumentRequirementStatus[] = [
      'not_assessed', 'outstanding', 'requested', 'under_review', 'reviewed', 'waived', 'not_applicable',
    ];
    for (const s of statuses) {
      for (const a of validActionsForStatus(s)) {
        expect(applyLifecycleAction(s, a).ok, `${a} from ${s}`).toBe(true);
      }
    }
  });

  it('every one of the 8 canonical actions is reachable from at least one status', () => {
    const statuses: DocumentRequirementStatus[] = [
      'not_assessed', 'outstanding', 'requested', 'under_review', 'reviewed', 'waived', 'not_applicable',
    ];
    const reachable = new Set(statuses.flatMap((s) => validActionsForStatus(s)));
    for (const a of DOCUMENT_REQUIREMENT_ACTIONS) {
      expect(reachable.has(a), a).toBe(true);
    }
  });

  it('not_assessed offers Acknowledge Required, Waive, and Mark Not Applicable only', () => {
    expect(validActionsForStatus('not_assessed')).toEqual(['acknowledge', 'waive', 'mark_not_applicable']);
  });
});

describe('isBlockingRequirementStatus / isRequirementSatisfied', () => {
  it('not_assessed, outstanding, requested, and under_review all block', () => {
    for (const s of ['not_assessed', 'outstanding', 'requested', 'under_review'] as const) {
      expect(isBlockingRequirementStatus(s), s).toBe(true);
      expect(isRequirementSatisfied({ required: true, status: s }), s).toBe(false);
    }
  });

  it('reviewed, waived, and not_applicable do not block', () => {
    for (const s of ['reviewed', 'waived', 'not_applicable'] as const) {
      expect(isBlockingRequirementStatus(s), s).toBe(false);
      expect(isRequirementSatisfied({ required: true, status: s }), s).toBe(true);
    }
  });

  it('a non-required row is always satisfied regardless of status', () => {
    expect(isRequirementSatisfied({ required: false, status: 'not_assessed' })).toBe(true);
  });

  it('under_review (received, not yet reviewed) is INCOMPLETE by default (reviewLevel defaults to reviewed)', () => {
    expect(isRequirementSatisfied({ required: true, status: 'under_review' })).toBe(false);
  });

  it('under_review satisfies a reviewLevel:"received" requirement (review not required for this document)', () => {
    expect(isRequirementSatisfied({ required: true, status: 'under_review' }, 'received')).toBe(true);
  });

  it('under_review does NOT satisfy a reviewLevel:"reviewed" requirement', () => {
    expect(isRequirementSatisfied({ required: true, status: 'under_review' }, 'reviewed')).toBe(false);
  });

  it('reviewed always satisfies the requirement regardless of reviewLevel', () => {
    expect(isRequirementSatisfied({ required: true, status: 'reviewed' }, 'received')).toBe(true);
    expect(isRequirementSatisfied({ required: true, status: 'reviewed' }, 'reviewed')).toBe(true);
  });
});

describe('describeRequirementStatus', () => {
  it('renders "Required — Outstanding" immediately after acknowledgment', () => {
    expect(describeRequirementStatus({ required: true, status: 'outstanding' })).toBe('Required — Outstanding');
  });

  it('renders distinct labels for every status', () => {
    const statuses: DocumentRequirementStatus[] = [
      'not_assessed', 'outstanding', 'requested', 'under_review', 'reviewed', 'waived', 'not_applicable',
    ];
    const labels = statuses.map((status) => describeRequirementStatus({ required: true, status }));
    expect(new Set(labels).size).toBe(statuses.length);
  });

  it('a non-required row renders "Not Required" regardless of status', () => {
    expect(describeRequirementStatus({ required: false, status: 'reviewed' })).toBe('Not Required');
  });
});
