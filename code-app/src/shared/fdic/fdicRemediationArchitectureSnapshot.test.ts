import { describe, it, expect } from 'vitest';
import {
  deriveFdicRemediationArchitectureSnapshot,
  type FDICEvidenceAvailabilityMap,
} from './fdicRemediationArchitectureSnapshot';
import {
  FDIC_REMEDIATION_CONTROLS,
  FDIC_CONTROL_STATUSES,
  isHonestFdicStatus,
} from './fdicRemediationOperatingModel';

/**
 * Phase 140A — FDIC remediation architecture snapshot pins.
 *
 * Pins that the pure deriver never fabricates evidence, never emits a
 * fake-compliance status, downgrades honestly when evidence is missing, and
 * recommends the Credit-Admin lane first. These are the guarantees a future
 * read-only control-tower UI (140B) will rely on.
 */

describe('Phase 140A — snapshot honesty', () => {
  it('default snapshot reports nothing wired_with_evidence', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    expect(snap.wiredWithEvidenceCount).toBe(0);
    expect(snap.totalControls).toBe(FDIC_REMEDIATION_CONTROLS.length);
  });

  it('every workspace row reports only honest counts that sum to its owned controls', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    for (const row of snap.workspaceRows) {
      const sum =
        row.mappedNotWiredCount +
        row.evidenceGapCount +
        row.partiallyWiredCount +
        row.wiredWithEvidenceCount;
      expect(sum, `${row.workspace}`).toBe(row.ownedControlCount);
    }
  });

  it('the four status buckets sum to the total control count', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    expect(
      snap.mappedNotWiredCount +
        snap.evidenceGapCount +
        snap.partiallyWiredCount +
        snap.wiredWithEvidenceCount,
    ).toBe(snap.totalControls);
  });

  it('every effective status on every evidence gap row is one of the four honest statuses', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    for (const gap of snap.topEvidenceGaps) {
      expect(isHonestFdicStatus(gap.effectiveStatus)).toBe(true);
    }
  });

  it('the limitations never assert compliance, remediation, FDIC approval, or examiner readiness as a fact', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    const joined = snap.limitations.join(' ');
    // Allowed: negations ("does not assert ... compliant"). Forbidden:
    // affirmative self-claims. Assert the affirmative constructions are absent.
    expect(joined).not.toMatch(/\bis\s+fully\s+remediated\b/i);
    expect(joined).not.toMatch(/\bnow\s+compliant\b/i);
    expect(joined).not.toMatch(/\bcertified\s+compliant\b/i);
    expect(joined).not.toMatch(/\bexaminer[\s-]ready\b/i);
    // It DOES make the no-regulatory-claim statement.
    expect(joined).toMatch(/no regulatory claim/i);
  });
});

describe('Phase 140A — snapshot never fabricates evidence', () => {
  it('claiming all evidence is available does NOT upgrade controls the model has not wired', () => {
    // Build an availability map that lies "available" for every evidence type.
    const evidenceAvailability: FDICEvidenceAvailabilityMap = {};
    for (const c of FDIC_REMEDIATION_CONTROLS) {
      for (const e of c.evidenceRequired) evidenceAvailability[e] = 'available';
    }
    const snap = deriveFdicRemediationArchitectureSnapshot({
      evidenceAvailability,
    });
    // No control's own status says wired_with_evidence, so even with all
    // evidence "available" the snapshot must not invent wiring.
    expect(snap.wiredWithEvidenceCount).toBe(0);
  });

  it('missing evidence resolves to evidence_gap or mapped_not_wired, never something invented', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    const buckets = snap.mappedNotWiredCount + snap.evidenceGapCount;
    expect(buckets).toBe(snap.totalControls);
    for (const s of FDIC_CONTROL_STATUSES) {
      expect(isHonestFdicStatus(s)).toBe(true);
    }
  });

  it('the only path to wired requires BOTH a model wired-status AND available evidence (legitimate, opt-in)', () => {
    // A synthetic control proves the deriver CAN report wired — but only when
    // the control itself already claims it and the evidence is truly available.
    const synthetic = {
      ...FDIC_REMEDIATION_CONTROLS[0]!,
      id: 'SYNTH-WIRED-1',
      currentStatus: 'wired_with_evidence' as const,
      evidenceRequired: ['repayment_capacity_analysis'] as const,
    };
    const wired = deriveFdicRemediationArchitectureSnapshot({
      controls: [synthetic],
      evidenceAvailability: { repayment_capacity_analysis: 'available' },
    });
    expect(wired.wiredWithEvidenceCount).toBe(1);

    // Remove the evidence: the same control downgrades, proving no fabrication.
    const downgraded = deriveFdicRemediationArchitectureSnapshot({
      controls: [synthetic],
    });
    expect(downgraded.wiredWithEvidenceCount).toBe(0);
  });
});

describe('Phase 140A — snapshot build-lane recommendation', () => {
  it('recommends the Credit-Admin document/core-data exception-queue lane first', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    expect(snap.nextRecommendedBuildLane).toMatch(/Credit Admin/i);
    expect(snap.nextRecommendedBuildLane).toMatch(/140C/);
  });

  it('reports board-attention controls owned by the executive/board layer', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    expect(snap.boardAttentionControls).toContain('FDIC-BOARD-OVERSIGHT-1');
  });

  it('portfolio is represented but is not the only workspace with controls', () => {
    const snap = deriveFdicRemediationArchitectureSnapshot();
    const withControls = snap.workspaceRows.filter(
      (r) => r.ownedControlCount > 0,
    );
    expect(withControls.length).toBeGreaterThanOrEqual(5);
    expect(snap.controlsByWorkspace.portfolio_command_center).toBeGreaterThan(0);
    expect(snap.controlsByWorkspace.portfolio_command_center).toBeLessThan(
      snap.totalControls,
    );
  });
});
