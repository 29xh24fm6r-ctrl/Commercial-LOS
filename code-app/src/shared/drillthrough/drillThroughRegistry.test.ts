import { describe, it, expect } from 'vitest';
import {
  buildDrillThroughTarget,
  drillThroughAccessibleName,
  hasDrillThroughContent,
  resolveDrillThroughAction,
  validateDrillThroughTarget,
} from './drillThroughTypes';
import {
  buildGenericSurfaceTarget,
  createDrillThroughRegistry,
  createRecentSurfaceRegistry,
  drillThroughIssues,
  RECENT_SURFACE_DESCRIPTORS,
} from './drillThroughRegistry';

describe('Phase 144A — buildDrillThroughTarget normalization', () => {
  it('forces readOnly:true and freezes collections', () => {
    const t = buildDrillThroughTarget({
      id: 'k1',
      title: 'Total exposure',
      surface: 'portfolio_command_center',
      entityKind: 'kpi',
      summary: 'Aggregate committed exposure across the book.',
      sourceCounts: [{ label: 'Deals', count: 42 }],
    });
    expect(t.readOnly).toBe(true);
    expect(Object.isFrozen(t.sourceCounts)).toBe(true);
    expect(Object.isFrozen(t.warnings)).toBe(true);
    expect(() => {
      (t.warnings as string[]).push('x');
    }).toThrow();
  });

  it('fills an honest unavailable reason when there is no content and no route', () => {
    const t = buildDrillThroughTarget({
      id: 'empty',
      title: 'Mystery metric',
      surface: 'generic',
      entityKind: 'metric',
      summary: 'A value with nothing behind it yet.',
    });
    expect(t.unavailableReason).toBeTruthy();
    expect(resolveDrillThroughAction(t)).toEqual({ kind: 'unavailable', reason: t.unavailableReason });
  });

  it('does not overwrite an explicit unavailable reason', () => {
    const t = buildDrillThroughTarget({
      id: 'e2',
      title: 'KYC detail',
      surface: 'aml_kyc_policy_gate',
      entityKind: 'status',
      summary: 'Bureau detail is gated.',
      unavailableReason: 'Bureau pull is disabled; no detail to show.',
    });
    expect(t.unavailableReason).toBe('Bureau pull is disabled; no detail to show.');
  });
});

describe('Phase 144A — resolveDrillThroughAction (no dead cards)', () => {
  it('content → panel', () => {
    const t = buildDrillThroughTarget({
      id: 'c', title: 'Blocked deals', surface: 'manager_control_panel', entityKind: 'kpi',
      summary: '3 deals blocked.', sourceCounts: [{ label: 'Blocked', count: 3 }],
    });
    expect(resolveDrillThroughAction(t).kind).toBe('panel');
    expect(hasDrillThroughContent(t)).toBe(true);
  });

  it('route only → route', () => {
    const t = buildDrillThroughTarget({
      id: 'r', title: 'Deal ABC', surface: 'deal_cockpit', entityKind: 'deal',
      summary: 'Open the deal cockpit.', routeHref: '/deals/abc',
    });
    expect(resolveDrillThroughAction(t)).toEqual({ kind: 'route', href: '/deals/abc' });
  });

  it('nothing → unavailable with a reason', () => {
    const t = buildDrillThroughTarget({
      id: 'u', title: 'TBD', surface: 'generic', entityKind: 'generic', summary: 'Pending.',
    });
    const action = resolveDrillThroughAction(t);
    expect(action.kind).toBe('unavailable');
    if (action.kind === 'unavailable') expect(action.reason.length).toBeGreaterThan(0);
  });

  it('accessible name reflects the action', () => {
    const panel = buildDrillThroughTarget({ id: 'p', title: 'Exposure', surface: 'generic', entityKind: 'kpi', summary: 's', sourceCounts: [{ label: 'n', count: 1 }] });
    const route = buildDrillThroughTarget({ id: 'q', title: 'Deal', surface: 'deal_cockpit', entityKind: 'deal', summary: 's', routeHref: '/d/1' });
    const gone = buildDrillThroughTarget({ id: 'g', title: 'Gap', surface: 'generic', entityKind: 'generic', summary: 's' });
    expect(drillThroughAccessibleName(panel)).toMatch(/view details/i);
    expect(drillThroughAccessibleName(route)).toMatch(/open full record/i);
    expect(drillThroughAccessibleName(gone)).toMatch(/unavailable/i);
  });
});

describe('Phase 144A — validation', () => {
  it('flags missing title/summary', () => {
    const bad = buildDrillThroughTarget({ id: 'b', title: '   ', surface: 'generic', entityKind: 'generic', summary: '' });
    const issues = validateDrillThroughTarget(bad).map((i) => i.problem);
    expect(issues).toContain('missing title');
    expect(issues).toContain('missing summary');
  });

  it('a well-formed target has no issues', () => {
    const ok = buildDrillThroughTarget({ id: 'ok', title: 'Good', surface: 'generic', entityKind: 'kpi', summary: 'Fine.', sourceCounts: [{ label: 'x', count: 1 }] });
    expect(drillThroughIssues(ok)).toEqual([]);
  });
});

describe('Phase 144A — registry', () => {
  it('registers, builds, and lists surfaces', () => {
    const reg = createDrillThroughRegistry();
    reg.register({ surface: 'generic', label: 'Generic', entityKind: 'generic', phase: 'test' }, (p: { title: string }) =>
      buildDrillThroughTarget({ id: 'x', title: p.title, surface: 'generic', entityKind: 'generic', summary: 'built', sourceFields: [{ label: 'a', value: 'b' }] }),
    );
    expect(reg.has('generic')).toBe(true);
    const built = reg.build('generic', { title: 'Hello' });
    expect(built?.title).toBe('Hello');
    expect(reg.surfaces()).toContain('generic');
    expect(reg.list()[0].label).toBe('Generic');
  });

  it('returns undefined for an unregistered surface', () => {
    const reg = createDrillThroughRegistry();
    expect(reg.build('deal_cockpit', {})).toBeUndefined();
  });
});

describe('Phase 144A — recent Phase 142/143 surfaces are under contract', () => {
  const reg = createRecentSurfaceRegistry();

  it('registers every recent surface descriptor', () => {
    for (const d of RECENT_SURFACE_DESCRIPTORS) {
      expect(reg.has(d.surface)).toBe(true);
    }
    expect(reg.list().length).toBe(RECENT_SURFACE_DESCRIPTORS.length);
  });

  it('every recent surface yields a read-only target with content from a content payload', () => {
    for (const d of RECENT_SURFACE_DESCRIPTORS) {
      const t = reg.build(d.surface, {
        id: `${d.surface}-1`,
        title: d.label,
        summary: `${d.label} summary.`,
        sourceCounts: [{ label: 'Items', count: 1 }],
        nextReviewStep: 'Human review.',
      });
      expect(t).toBeDefined();
      expect(t!.readOnly).toBe(true);
      expect(t!.surface).toBe(d.surface);
      expect(resolveDrillThroughAction(t!).kind).toBe('panel');
      expect(drillThroughIssues(t!)).toEqual([]);
    }
  });

  it('every recent surface yields an honest unavailable target from an empty payload (no fabricated rows)', () => {
    for (const d of RECENT_SURFACE_DESCRIPTORS) {
      const t = reg.build(d.surface, { id: `${d.surface}-e`, title: d.label, summary: 'No detail yet.' });
      expect(t!.unavailableReason).toBeTruthy();
      expect(t!.detailSections.length).toBe(0);
      expect(resolveDrillThroughAction(t!).kind).toBe('unavailable');
    }
  });
});

describe('Phase 144A — buildGenericSurfaceTarget defaults entity kind from descriptor', () => {
  it('uses descriptor entityKind when payload omits it', () => {
    const t = buildGenericSurfaceTarget(
      { surface: 'product_profitability_roe', label: 'ROE', entityKind: 'metric', phase: '142S' },
      { id: 'roe', title: 'ROE availability', summary: 'Availability only.', unavailableReason: 'ROE inputs not provided.' },
    );
    expect(t.entityKind).toBe('metric');
    expect(t.surface).toBe('product_profitability_roe');
  });
});
