import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { buildChartDrillThrough, buildChartSegmentDrillThrough } from '../drillthrough/chartDrillThrough';
import { hasDrillThroughContent, resolveDrillThroughAction, validateDrillThroughTarget } from '../drillthrough/drillThroughTypes';

/**
 * Phase 144C — chart segment drill-through governance.
 *
 * Proves the Manager / Portfolio / Team / Executive chart cards opt into the
 * shared chart-level drill-through, the chart primitive renders a keyboard-
 * accessible disclosure + read-only panel, every chart target is read-only and
 * resolves (panel / unavailable, never blank), and the chart drill-through source
 * adds NO write/network pattern and NO approve/deny/vote/sync affordance.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const CHART_PROD_FILES: readonly string[] = [
  'src/shared/drillthrough/chartDrillThrough.ts',
  'src/shared/CommandChartPrimitives.tsx',
];

const CHART_RETROFIT_COCKPITS: ReadonlyArray<{ workspace: string; file: string; surface: string }> = [
  { workspace: 'manager', file: 'src/manager/ManagerBloombergControlPanel.tsx', surface: 'manager_control_panel' },
  { workspace: 'portfolio', file: 'src/portfolio/PortfolioCommandCenter.tsx', surface: 'portfolio_command_center' },
  { workspace: 'team', file: 'src/team/TeamOpsQueue.tsx', surface: 'team_ops_queue' },
  { workspace: 'executive', file: 'src/executive/ExecutiveCommandCenter.tsx', surface: 'executive_command_center' },
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SCANNED = CHART_PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 144C — chart drill-through wiring exists', () => {
  it('the chart drill-through builder + doc exist', () => {
    for (const rel of [...CHART_PROD_FILES, 'src/shared/drillthrough/chartDrillThrough.test.tsx', 'docs/PHASE_144C_CHART_SEGMENT_DRILL_THROUGH.md']) {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    }
  });

  it('the shared chart primitive renders a chart-details disclosure + read-only panel', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'src/shared/CommandChartPrimitives.tsx'), 'utf8');
    expect(src).toMatch(/DrillThroughPanel/);
    expect(src).toMatch(/View chart details/);
    expect(src).toMatch(/data-manager-chart-drilldown/);
    expect(src).toMatch(/buildChartDrillThrough/);
  });

  for (const c of CHART_RETROFIT_COCKPITS) {
    it(`${c.workspace} cockpit opts its charts into drill-through (${c.surface})`, () => {
      const src = readFileSync(resolve(REPO_ROOT, c.file), 'utf8');
      expect(src).toMatch(new RegExp(`drillThroughSurface=["']${c.surface}["']`));
    });
  }
});

describe('Phase 144C — chart drill-through source adds no write / network / affordance', () => {
  it('no fetch / XMLHttpRequest / axios', () => {
    const hits = SCANNED.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SCANNED.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Dataverse create / update / upsert / delete call', () => {
    const hits = SCANNED.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Salesforce / nCino write, Graph / Outlook / Power Automate', () => {
    const hits = SCANNED.filter((f) => /salesforce\w*write|ncino\w*write|graph\.microsoft|microsoftgraph|outlook(client|service|services|api)|power[\s_-]?automate/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no eval / Function constructor', () => {
    const hits = SCANNED.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no <button> / <form> / onClick / onSubmit (charts use a native disclosure)', () => {
    const hits = SCANNED.filter((f) => /<button\b|<form\b|onClick|onSubmit/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sync-now / push-now / apply-now / approve / deny / vote affordance label', () => {
    const hits = SCANNED.filter((f) => /['"][^'"]*\b(sync now|push now|apply now|approve|deny|vote)\b[^'"]*['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fake / sample / mock data', () => {
    const hits = SCANNED.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 144C — chart targets are read-only and never blank', () => {
  it('a populated chart resolves to a panel with segment rows', () => {
    const t = buildChartDrillThrough({
      chartTitle: 'Pipeline by stage', surface: 'portfolio_command_center',
      segments: [{ label: 'Application', value: 3 }, { label: 'Underwriting', value: 2 }],
    });
    expect(t.readOnly).toBe(true);
    expect(validateDrillThroughTarget(t)).toEqual([]);
    expect(resolveDrillThroughAction(t).kind).toBe('panel');
    expect(hasDrillThroughContent(t)).toBe(true);
    expect(t.detailSections[0].rows.length).toBe(2);
  });

  it('an all-zero chart resolves to an honest, generic unavailable reason', () => {
    const t = buildChartDrillThrough({
      chartTitle: 'Win rate', surface: 'portfolio_command_center', segments: [{ label: 'n/a', value: 0 }],
    });
    const action = resolveDrillThroughAction(t);
    expect(action.kind).toBe('unavailable');
    if (action.kind === 'unavailable') expect(action.reason).not.toMatch(/Win rate/);
  });

  it('a segment with no contributing rows resolves to an honest unavailable reason', () => {
    const t = buildChartSegmentDrillThrough({
      chartTitle: 'Risk distribution', surface: 'team_ops_queue', segmentLabel: 'Clear', value: 4,
    });
    expect(resolveDrillThroughAction(t).kind).toBe('unavailable');
  });
});
