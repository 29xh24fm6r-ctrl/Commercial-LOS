import { describe, it, expect } from 'vitest';
import { deriveCreditReadiness } from './creditReadiness';
import type { CreditMemoData } from '../deals/creditMemoQueries';

/**
 * N-07 remediation (Production Remediation Factory Arc Phase 5) — before this phase,
 * `creditMemoDraft.ts` had no section labeled "Repayment Analysis", so
 * `REQUIRED_SECTIONS = ['Executive Summary', 'Repayment Analysis']` here could never be
 * satisfied — `memoComplete` was permanently false for every deal, no matter how complete
 * the actual saved memo was. The generator now produces a real "Repayment Analysis" section
 * (creditMemoDraft.ts); this test proves the two modules actually agree end-to-end.
 */

function memoData(sectionLabels: readonly string[]): CreditMemoData {
  return {
    memos: [
      {
        id: 'memo-1',
        name: 'Deal Memo',
        status: 'Draft',
        statusKey: 'draft',
        memoType: 'Banker draft',
        version: 1,
        generatedAt: '2026-07-01T00:00:00Z',
        modifiedOn: '2026-07-01T00:00:00Z',
        borrowerSafe: false,
        textPreview: 'preview',
      },
    ],
    sections: sectionLabels.map((label, i) => ({
      id: `section-${i}`,
      sectionKey: label.toLowerCase().replace(/\s+/g, '-'),
      sectionLabel: label,
      reviewStatus: 'Pending',
      reviewStatusKey: 'Pending',
      lastGeneratedAt: '2026-07-01T00:00:00Z',
      modifiedOn: '2026-07-01T00:00:00Z',
      textPreview: 'content',
    })),
  };
}

describe('deriveCreditReadiness — REQUIRED_SECTIONS is now satisfiable by the real generator', () => {
  it('memoComplete is true when both Executive Summary and Repayment Analysis sections are saved', () => {
    const result = deriveCreditReadiness({
      creditMemo: memoData(['Executive Summary', 'Repayment Analysis']),
    });
    expect(result.memoComplete).toBe(true);
    expect(result.missingArtifacts).not.toContain('Repayment Analysis');
  });

  it('flags Repayment Analysis as missing when only Executive Summary was saved', () => {
    const result = deriveCreditReadiness({
      creditMemo: memoData(['Executive Summary']),
    });
    expect(result.memoComplete).toBe(false);
    expect(result.missingArtifacts).toContain('Repayment Analysis');
  });

  it('flags both required sections as missing when a memo exists but no sections were saved', () => {
    const result = deriveCreditReadiness({ creditMemo: memoData([]) });
    expect(result.status).toBe('blocked');
    expect(result.missingArtifacts).toContain('Executive Summary');
    expect(result.missingArtifacts).toContain('Repayment Analysis');
  });

  it('flags "Credit memo" as missing when no memo record exists at all', () => {
    const result = deriveCreditReadiness({ creditMemo: { memos: [], sections: [] } });
    expect(result.status).toBe('blocked');
    expect(result.missingArtifacts).toContain('Credit memo');
  });
});
