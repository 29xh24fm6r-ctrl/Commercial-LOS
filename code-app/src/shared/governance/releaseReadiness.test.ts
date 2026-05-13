import { describe, it, expect } from 'vitest';
import {
  deriveReleaseReadiness,
  type ReleaseReadinessInput,
  type ReleaseCategoryStatus,
} from './releaseReadiness';
import { stageProgressionDiagnostics } from './stageProgressionAvailability';

// A diagnostic shape representing the "schema gap closed" future
// state, used as the baseline for the all-ready test.
const STAGE_DIAGNOSTICS_ALL_READY = {
  available: true,
  overallSeverity: 'clear' as const,
  checks: [],
  affectedFeatures: [],
  remediation: [],
};

function baseInput(
  overrides: Partial<ReleaseReadinessInput> = {},
): ReleaseReadinessInput {
  return {
    stage: STAGE_DIAGNOSTICS_ALL_READY,
    dataQualityOpenCount: 0,
    auditAnomalyCount: 0,
    criticalAlertCount: 0,
    totalOpenAlerts: 0,
    refreshStatusStaleFlag: false,
    execTransitionalFallbackFeatures: [],
    governedWritesShipped: [{ id: 'a', label: 'A' }],
    workspaceIsolationVerified: true,
    permissionBeforeQueryVerified: true,
    ...overrides,
  };
}

function statusFor(result: ReturnType<typeof deriveReleaseReadiness>, id: string) {
  const row = result.categories.find((c) => c.id === id);
  if (!row) throw new Error(`No category row found for id=${id}`);
  return row.status;
}

describe('deriveReleaseReadiness', () => {
  it('overall is "not-wired" in the all-clean baseline because test/build verification is intentionally Not Wired', () => {
    // The brief: "If build/test status is not available as data, show
    // Not Wired." Test/build is always Not Wired in-app, so even a
    // clean signal-wise app must NOT report Ready overall.
    const result = deriveReleaseReadiness(baseInput());
    expect(result.overall).toBe('not-wired');
    expect(statusFor(result, 'test-coverage-build-verification')).toBe('not-wired');
  });

  it('every other category is Ready in the clean baseline (workspace, permission, exec, admin, governed-writes, stage, backlog)', () => {
    const result = deriveReleaseReadiness(baseInput());
    expect(statusFor(result, 'workspace-isolation')).toBe('ready');
    expect(statusFor(result, 'permission-before-query')).toBe('ready');
    expect(statusFor(result, 'executive-snapshot-safety')).toBe('ready');
    expect(statusFor(result, 'admin-diagnostics-health')).toBe('ready');
    expect(statusFor(result, 'governed-write-coverage')).toBe('ready');
    expect(statusFor(result, 'stage-progression-readiness')).toBe('ready');
    expect(statusFor(result, 'data-quality-alert-backlog')).toBe('ready');
  });

  it('rolls overall up to blocked when stage governance is blocked (real Phase 28/29 state)', () => {
    const realStageDiagnostics = stageProgressionDiagnostics();
    const result = deriveReleaseReadiness(
      baseInput({ stage: realStageDiagnostics }),
    );
    expect(result.overall).toBe('blocked');
    expect(statusFor(result, 'stage-progression-readiness')).toBe('blocked');
  });

  it('rolls overall up to blocked when the executive snapshot is reported stale', () => {
    const result = deriveReleaseReadiness(baseInput({ refreshStatusStaleFlag: true }));
    expect(result.overall).toBe('blocked');
    expect(statusFor(result, 'executive-snapshot-safety')).toBe('blocked');
  });

  it('rolls overall up to blocked when any critical alert is open', () => {
    const result = deriveReleaseReadiness(
      baseInput({ criticalAlertCount: 2, totalOpenAlerts: 5 }),
    );
    expect(result.overall).toBe('blocked');
    expect(statusFor(result, 'data-quality-alert-backlog')).toBe('blocked');
  });

  it('reports needs-review (not blocked) when only transitional executive fallback is in use', () => {
    const result = deriveReleaseReadiness(
      baseInput({
        execTransitionalFallbackFeatures: ['PipelineByStage', 'MonthlyClosingForecast'],
      }),
    );
    expect(statusFor(result, 'executive-snapshot-safety')).toBe('needs-review');
    // The other categories are clean, so overall is at most
    // not-wired (the test/build row) — confirm it is not blocked.
    expect(result.overall).not.toBe('blocked');
  });

  it('reports needs-review for backlog when DQ flags or audit anomalies are open but no critical alerts exist', () => {
    const result = deriveReleaseReadiness(
      baseInput({
        dataQualityOpenCount: 3,
        auditAnomalyCount: 0,
      }),
    );
    expect(statusFor(result, 'data-quality-alert-backlog')).toBe('needs-review');
  });

  it('reports not-wired when admin counts are still loading (undefined)', () => {
    const result = deriveReleaseReadiness(
      baseInput({
        dataQualityOpenCount: undefined,
        auditAnomalyCount: undefined,
        totalOpenAlerts: undefined,
        criticalAlertCount: undefined,
        refreshStatusStaleFlag: undefined,
      }),
    );
    expect(statusFor(result, 'admin-diagnostics-health')).toBe('not-wired');
    expect(statusFor(result, 'data-quality-alert-backlog')).toBe('not-wired');
    expect(statusFor(result, 'executive-snapshot-safety')).toBe('not-wired');
    // Test/build verification is ALWAYS not-wired.
    expect(statusFor(result, 'test-coverage-build-verification')).toBe('not-wired');
    expect(result.overall).toBe('not-wired');
  });

  it('test-coverage / build-verification is ALWAYS Not Wired — never Ready and never observable', () => {
    // Even with every other signal observed and Ready, this row stays
    // Not Wired. The brief is explicit: do not pretend to know test
    // results unless they are available in-app.
    const r = deriveReleaseReadiness(baseInput());
    expect(statusFor(r, 'test-coverage-build-verification')).toBe('not-wired');
    const r2 = deriveReleaseReadiness(
      baseInput({
        dataQualityOpenCount: 0,
        auditAnomalyCount: 0,
        criticalAlertCount: 0,
        totalOpenAlerts: 0,
        refreshStatusStaleFlag: false,
        execTransitionalFallbackFeatures: [],
      }),
    );
    expect(statusFor(r2, 'test-coverage-build-verification')).toBe('not-wired');
  });

  it('blocks if no governed write has shipped yet (Phase 18 baseline)', () => {
    const result = deriveReleaseReadiness(
      baseInput({ governedWritesShipped: [] }),
    );
    expect(statusFor(result, 'governed-write-coverage')).toBe('blocked');
    expect(result.overall).toBe('blocked');
  });

  it('needs-review for workspace isolation when static invariant is not verified', () => {
    const r1 = deriveReleaseReadiness(
      baseInput({ workspaceIsolationVerified: false }),
    );
    expect(statusFor(r1, 'workspace-isolation')).toBe('needs-review');
    const r2 = deriveReleaseReadiness(
      baseInput({ permissionBeforeQueryVerified: false }),
    );
    expect(statusFor(r2, 'permission-before-query')).toBe('needs-review');
  });

  it('max-wins severity: blocked + needs-review + not-wired + ready rolls up to blocked', () => {
    const r = deriveReleaseReadiness(
      baseInput({
        refreshStatusStaleFlag: true, // blocked
        execTransitionalFallbackFeatures: ['X'], // would be needs-review on its own
        dataQualityOpenCount: 3, // would be needs-review on its own
      }),
    );
    expect(r.overall).toBe('blocked');
  });

  it('sortedCategories puts blocked first, then needs-review, then not-wired, then ready', () => {
    const r = deriveReleaseReadiness(
      baseInput({
        refreshStatusStaleFlag: true, // exec-snapshot blocked
        dataQualityOpenCount: 3, // backlog needs-review
      }),
    );
    const order = r.sortedCategories.map((c) => c.status);
    // The first item must be blocked; the last must be ready (we
    // know workspace-isolation is ready in this fixture).
    expect(order[0]).toBe('blocked');
    expect(order[order.length - 1]).toBe('ready');
    // Verify strict non-increasing severity across the full list.
    const rank: Record<ReleaseCategoryStatus, number> = {
      blocked: 0,
      'needs-review': 1,
      'not-wired': 2,
      ready: 3,
    };
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i]!]).toBeGreaterThanOrEqual(rank[order[i - 1]!]);
    }
  });

  it('every reason / nextAction uses conservative copy — no "fail", "approved", "deploy", "promote" verbs as actions', () => {
    const r = deriveReleaseReadiness(baseInput({ refreshStatusStaleFlag: true }));
    const text = r.categories
      .map((c) => `${c.label} ${c.reason} ${c.nextAction}`)
      .join(' ');
    // The gate never says the deal/app is "approved", and it never
    // tells the operator to "deploy" or "promote now". Promotion is
    // a process step performed elsewhere.
    expect(/\bapproved\b/i.test(text)).toBe(false);
    expect(/\bdeploy now\b/i.test(text)).toBe(false);
    expect(/\bpromote now\b/i.test(text)).toBe(false);
    // Failure language is allowed in reasons ("test verification has
    // no in-process signal") but the cards must not call ANY signal
    // "ineligible" or "invalid".
    expect(/\bineligible\b/i.test(text)).toBe(false);
    expect(/\binvalid\b/i.test(text)).toBe(false);
  });
});
