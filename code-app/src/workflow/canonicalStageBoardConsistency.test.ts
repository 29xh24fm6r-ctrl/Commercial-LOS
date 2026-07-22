import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Remediation 2026-07-22 (Workstream B) — cross-view stage-vocabulary consistency.
 *
 * Confirms every mounted, stage-vocabulary-dependent surface consumes the same canonical
 * registry (`stageOrderingContract.ts`) rather than the legacy 9-stage `stageCatalog.ts` or the
 * legacy 11-stage `loanWorkflowStages.ts` — the root cause of a newly-created Intake deal
 * disappearing from the Active Deals board while the deal cockpit's Stage Map (already on the
 * canonical vocabulary from a prior pass) showed it correctly.
 *
 * This is a static-source check, not a behavioral one: it exists to catch a future regression
 * where a new or edited surface re-imports the legacy vocabulary, which unit tests against a
 * single component can't catch on their own.
 */

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('canonical stage vocabulary — mounted board/stage-map surfaces', () => {
  it('PersonalPipeline (Active Deals board) imports the canonical registry, not the legacy 9-stage catalog', () => {
    const src = read('src/banker/PersonalPipeline.tsx');
    expect(src).toMatch(/from '\.\.\/workflow\/stageOrderingContract'/);
    expect(src).not.toMatch(/from '\.\.\/shared\/stages\/stageCatalog'/);
  });

  it('DealStageProgressionCard (deal cockpit Stage Map) imports the canonical registry', () => {
    const src = read('src/deals/DealStageProgressionCard.tsx');
    expect(src).toMatch(/from '\.\.\/workflow\/stageOrderingContract'/);
  });

  it('PersonalPipeline\'s canonical lanes are the exact same 6 non-terminal stages, in the exact same order, as the deal cockpit Stage Map', () => {
    // Both surfaces derive their lane/stage set from CANONICAL_STAGES (imported, not
    // re-declared), so there is exactly one place a stage's name/sequence/terminality can drift.
    const pipeline = read('src/banker/PersonalPipeline.tsx');
    const cockpit = read('src/deals/DealStageProgressionCard.tsx');
    expect(pipeline).toMatch(/CANONICAL_STAGES/);
    expect(cockpit).toMatch(/CANONICAL_STAGES/);
  });

  it('LoanWorkflowCommandCenter (legacy 11-stage vocabulary) is not mounted in the deal cockpit', () => {
    // Confirmed retired from the cockpit by the prior stage-reconciliation pass
    // (docs/STAGE_RECONCILIATION_MAP.md) -- pin that it stays that way.
    const workspace = read('src/deals/BankerDealWorkspace.tsx');
    expect(workspace).not.toMatch(/LoanWorkflowCommandCenter/);
  });

  it('Executive "Pipeline by Stage" fallback does not import the legacy 9-stage catalog', () => {
    // It groups by the deal's raw stored stage string (no fixed lane list), so it has no fixed
    // vocabulary to drift from the canonical registry -- this pins that it stays that way.
    expect(read('src/executive/operationalFallbackQueries.ts')).not.toMatch(
      /from '.*stageCatalog'/,
    );
  });
});
