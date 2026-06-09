import { describe, it, expect } from 'vitest';
import { deriveAnnualReviewPackageWorkflow } from './deriveAnnualReviewPackageWorkflow';
import { createDisabledAnnualReviewPackageExportAdapter } from './annualReviewPackageExportAdapter';
import { pipeline } from './packageTestFixtures';

/**
 * Phase 141P — package workflow pins.
 */

function workflow(opts = {}) {
  const p = pipeline(opts);
  return deriveAnnualReviewPackageWorkflow({ memo: p.memo, board: p.board, fdic: p.fdic, readiness: p.pkgReadiness, exportAdapter: createDisabledAnnualReviewPackageExportAdapter() });
}

describe('Phase 141P — package workflow', () => {
  it('exposes read-only preview actions', () => {
    const w = workflow();
    expect(w.availableActions.map((a) => a.code)).toContain('preview_memo');
    expect(w.availableActions.every((a) => a.code.startsWith('preview_') || a.code === 'view_evidence')).toBe(true);
  });

  it('blocks approve / submit / file / export / send / waive', () => {
    const codes = workflow().blockedActions.map((a) => a.code);
    for (const c of ['approve_credit', 'submit_package', 'file_package', 'export_final', 'send_package', 'waive_covenant']) {
      expect(codes).toContain(c);
    }
  });

  it('next best action points to remediation when blocked', () => {
    const w = workflow({ facts: [] });
    expect(w.workflowStatus).toBe('blocked');
    expect(w.nextBestAction.code).toBe('complete_financials');
  });

  it('has no final package state', () => {
    const serialized = JSON.stringify(workflow());
    expect(serialized).not.toMatch(/\b(approved|submitted|filed|exported_final)\b/);
    expect(['draft_preview', 'blocked', 'disabled_not_configured']).toContain(workflow().workflowStatus);
  });
});
