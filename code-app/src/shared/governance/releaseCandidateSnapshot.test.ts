import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
  DELIBERATELY_BLOCKED,
} from './platformInventory';

/**
 * Phase 111 — Release-Candidate Readiness Snapshot pin.
 *
 * This file is the lightweight CI-time guard that the
 * `docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md` doc's headline
 * counts stay in sync with the actual inventory data. It does NOT
 * pin behavior — that's the job of the Phase 104–110 governance
 * sweeps. It pins ONLY:
 *
 *   1. The Phase 111 doc exists on disk.
 *   2. The four inventory counts the doc cites match what the
 *      `platformInventory.ts` module reports.
 *   3. The Phase 104–110 governance pin files all exist on disk,
 *      so an operator running this test can trust that the rest
 *      of the release-lock evidence is in place.
 *
 * Intentional non-scope:
 *   - Bundle size is NOT pinned (rebuild noise is not a release
 *     signal).
 *   - Test count is NOT pinned (every new test would force a doc
 *     refresh, which is too tight).
 *   - Per-id presence is NOT re-pinned (Phase 110's lock file
 *     already covers id-level invariants).
 *
 * Failure mode: if any inventory count slips, this test fails with
 * a message naming the count that drifted, and the operator must
 * update the Phase 111 snapshot doc before promoting.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

/**
 * Snapshot anchor at Phase 111. If any value drifts, refresh
 * `docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md` §0 to match and
 * update the value here in the same commit.
 */
const PHASE_111_SNAPSHOT = Object.freeze({
  governedWrites: 12,
  localOnlyFlows: 16,
  notWired: 8,
  deliberatelyBlocked: 1,
});

describe('Phase 111 — Release-candidate snapshot exists and is current', () => {
  it('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md exists on disk', () => {
    expect(
      existsSync(resolve(REPO_ROOT, 'docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md')),
    ).toBe(true);
  });

  it('Phase 111 doc cites the current GOVERNED_WRITES count', () => {
    expect(GOVERNED_WRITES.length).toBe(PHASE_111_SNAPSHOT.governedWrites);
    const doc = readDoc('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md');
    // The doc's snapshot table cites the count in a row like:
    //   | `GOVERNED_WRITES` | **12** entries | ... |
    const pattern = new RegExp(
      `\\\`GOVERNED_WRITES\\\`\\s*\\|\\s*\\*\\*${PHASE_111_SNAPSHOT.governedWrites}\\*\\*`,
    );
    expect(
      pattern.test(doc),
      `Phase 111 doc must cite GOVERNED_WRITES = ${PHASE_111_SNAPSHOT.governedWrites}`,
    ).toBe(true);
  });

  it('Phase 111 doc cites the current LOCAL_ONLY_FLOWS count', () => {
    expect(LOCAL_ONLY_FLOWS.length).toBe(PHASE_111_SNAPSHOT.localOnlyFlows);
    const doc = readDoc('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md');
    const pattern = new RegExp(
      `\\\`LOCAL_ONLY_FLOWS\\\`\\s*\\|\\s*\\*\\*${PHASE_111_SNAPSHOT.localOnlyFlows}\\*\\*`,
    );
    expect(pattern.test(doc)).toBe(true);
  });

  it('Phase 111 doc cites the current NOT_WIRED count', () => {
    expect(NOT_WIRED.length).toBe(PHASE_111_SNAPSHOT.notWired);
    const doc = readDoc('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md');
    const pattern = new RegExp(
      `\\\`NOT_WIRED\\\`\\s*\\|\\s*\\*\\*${PHASE_111_SNAPSHOT.notWired}\\*\\*`,
    );
    expect(pattern.test(doc)).toBe(true);
  });

  it('Phase 111 doc cites the current DELIBERATELY_BLOCKED count', () => {
    expect(DELIBERATELY_BLOCKED.length).toBe(
      PHASE_111_SNAPSHOT.deliberatelyBlocked,
    );
    const doc = readDoc('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md');
    const pattern = new RegExp(
      `\\\`DELIBERATELY_BLOCKED\\\`\\s*\\|\\s*\\*\\*${PHASE_111_SNAPSHOT.deliberatelyBlocked}\\*\\*`,
    );
    expect(pattern.test(doc)).toBe(true);
  });
});

describe('Phase 111 — Phase 104–110 governance pin files all still exist', () => {
  const REQUIRED_PIN_FILES: readonly string[] = [
    // Phase 106 — operator-safety release-readiness pin.
    'src/shared/governance/emailLiveReleaseReadiness.test.ts',
    // Phase 107 — activity-evidence consistency pin.
    'src/shared/governance/communicationActivityLedger.test.ts',
    // Phase 108 — post-send refresh wiring.
    'src/deals/borrowerUpdateRefresh.test.tsx',
    // Phase 109 — operator smoke-test harness.
    'src/admin/emailLiveSmokeTest.test.ts',
    'src/admin/EmailLiveDiagnostics.test.tsx',
    // Phase 110 — final communication-lane release lock.
    'src/shared/governance/communicationLaneReleaseLock.test.ts',
  ];

  for (const rel of REQUIRED_PIN_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 111 — Phase 104–110 release doc files all still exist', () => {
  const REQUIRED_DOC_FILES: readonly string[] = [
    'docs/PHASE_104_OUTLOOK_LIVE_SEND.md',
    'docs/PHASE_105_BORROWER_UPDATE_LIVE_SEND.md',
    'docs/PHASE_106_EMAIL_MODE_RELEASE_READINESS.md',
    'docs/PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md',
    'docs/PHASE_108_BORROWER_UPDATE_REFRESH.md',
    'docs/PHASE_109_EMAIL_LIVE_SMOKE_TEST.md',
    'docs/PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md',
    'docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md',
    // Phase 112 — operator-facing release-candidate validation script.
    // Pin added alongside the Phase 112 doc itself so a future docs-only
    // edit cannot quietly delete the operator script.
    'docs/PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md',
    // Phase 113 — Microsoft environment landing plan. Phase 112 cannot
    // execute against a deployed app until §G.1–G.6 of Phase 113 are
    // green; deleting the landing plan would silently strand the
    // operator validation script.
    'docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md',
    // Phase 115 — first-launch identity provisioning. Documents the
    // legacy cr664_user → cr664_platformuser entry-point swap that
    // unblocked the deployed app's AuthGate.
    'docs/PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md',
    // Phase 116 — first-live-launch stabilization. Documents the
    // explicit Platform Workspace alias map + the maker-portal grid
    // pitfall + the Portfolio Management → manager routing decision.
    'docs/PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md',
    // Phase 117 — banker workspace UX parity. Documents the
    // product-grade shell (dark sidebar, KPI grid, tabs, right rail)
    // that replaces the pre-Phase-117 bare stacked-card surface, plus
    // the deliberate omission of Contacts / Due Diligence / Alerts
    // tabs and New Deal / Log Activity buttons.
    'docs/PHASE_117_BANKER_WORKSPACE_UX_PARITY.md',
    // Phase 118 — original UI/UX inventory + restoration backlog.
    // Classifies every original Banker Workspace UI surface against
    // the Phase 117 shell into A–F buckets (already-implemented-
    // not-composed, implemented-needs-seed, loader-missing, write-
    // missing, deliberately-blocked, pure polish). Sequences the
    // restoration phases against governance reality. Docs-only: no
    // production code change.
    'docs/PHASE_118_ORIGINAL_UI_UX_INVENTORY.md',
    // Phase 119 — restore original Banker Workspace UI/UX, part 1
    // (bucket-A wave 1 from the Phase 118 backlog). Stage-grouped
    // pipeline + 3 new derived KPI tiles (Urgent items, In
    // Underwriting, Stale 14d+) + My-Tasks right-rail panel. No
    // schema change, no new loader, no governed write, no email-
    // lane change.
    'docs/PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md',
    // Phase 120 — restore original Banker Workspace UI/UX, part 2
    // (bucket-A wave 2 from the Phase 118 backlog). Activity tab +
    // Due Diligence tab (both composition-only, no new query) +
    // per-row stale badges in PersonalPipeline + sidebar-footer
    // workspace switcher rendering the honest single-workspace
    // state from the bootstrap result. No schema change, no new
    // loader, no governed write, no email-lane change. Tab bar
    // grew 5 → 7.
    'docs/PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md',
    // Phase 121 — live banker data seed (deferred). Manual seed
    // recipe the operator runs in make.powerapps.com so the
    // restored workspace can be validated in a populated state.
    // Now unblocked once Phase 120 ships. Docs-only: no schema
    // change, no React fake data, no automation, no email-lane
    // exercise.
    'docs/PHASE_121_LIVE_BANKER_DATA_SEED.md',
    // Phase 121 — simplified click-by-click operator checklist
    // produced after a `pac env fetch` pre-flight against the
    // deployed environment. Carries pre-verified live values
    // (Matt's banker row id, environment id, the §2.3 reference-
    // table-empty fallback path made mandatory by audit findings).
    // The streamlined entry point for execution; the longer
    // PHASE_121_LIVE_BANKER_DATA_SEED.md doc remains as the
    // reference runbook. Docs-only.
    'docs/PHASE_121_OPERATOR_SEED_CHECKLIST.md',
    // Phase 122 — Dataverse-config phase that retargets the
    // modern operational child-table Deal lookups (confirmed:
    // cr664_documentchecklist.cr664_Deal; candidates: dealtask1
    // / creditmemo1 / creditmemodraftsection / dealtimelineevent)
    // from legacy cr664_deal to cr664_loandeal. Explicitly NOT a
    // React phase — production app already binds correctly to
    // /cr664_loandeals(...); Phase 122 makes the live schema
    // match. Unblocks the deferred Phase 121 Steps 6 + 7.
    'docs/PHASE_122_RETARGET_DEAL_LOOKUPS.md',
    // Phase 122A — OGB LOS original UI/UX recovery audit.
    // Documentation-only. Headline finding: no archived richer
    // UI exists in the repo; the Phase 117/119/120 shell IS the
    // only banker UI ever built here. Audit produces a forward-
    // looking visual restoration backlog (A/B/C/D buckets) and
    // proposes Phases 123–129 covering banker-shell visual
    // polish, Kanban pipeline, deal-workspace cockpit, signals/
    // relationships polish, credit-memo workspace, task/doc UX
    // after Phase 122, and manager/team/executive visual parity.
    'docs/PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md',
    // Phase 123 — Premium OGB Banker Command Center visual
    // shell. First wave of bucket-A visual restoration: hero
    // header band, KPI grid grouped into Pipeline / Work items /
    // Attention with hero anchor tiles (Active deals + Pipeline),
    // premium tab bar, accent-striped right-rail panels,
    // polished sidebar + workspace switcher pill, framed empty
    // states across PersonalPipeline / Activity / Due Diligence
    // / right rail. Composition-only — no Dataverse / loader /
    // governed-write changes, no new dependencies, no email-
    // lane changes. Two additive theme shadow tokens added.
    'docs/PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md',
    // Phase 124 — Rich pipeline / stage-board. Replaces the
    // Phase 119 flat-table-per-stage Pipeline tab with a
    // horizontal Kanban: one lane per canonical non-terminal
    // STAGE_CATALOG stage + custom lanes for operator-named
    // stages + Stage-unknown fallback. Premium deal cards
    // (name + stale badge + client + status + amount-or-
    // "Amount not set" + target-close-if-real + last-touched).
    // Lane headers with deal-count pill + compact-currency
    // amount summary (honestly omitted when no parseable
    // amounts). Terminal stages excluded — loader already
    // filters them out. Composition-only — no Dataverse /
    // loader / governed-write / email-lane changes. 8 new
    // regression tests added.
    'docs/PHASE_124_RICH_PIPELINE_STAGE_BOARD.md',
    // Phase 125 — Deal workspace cockpit. DealHeader becomes a
    // hero band (primary accent stripe + hero name + amount
    // hero block + relative target-close countdown + honest
    // "Not set" copy for missing fields). DealBlockers +
    // DealStageProgressionCard signal/reason rows get
    // severity-tinted framed treatment. DealTasks /
    // DealDocuments / CreditMemo / ActivityTimeline /
    // BorrowerCommunication honest-empty states become framed
    // dashed-border cards consistent with Phase 123/124
    // pattern. Composition-only — no Dataverse / loader /
    // governed-write / email-lane changes. 10 new test cases
    // in new src/deals/DealHeader.test.tsx.
    'docs/PHASE_125_DEAL_WORKSPACE_COCKPIT.md',
    // Phase 125B — Deal workspace visual redesign. Implements
    // the design-pass-first critique against the live deal
    // workspace screenshot: navy hero band with glass metric
    // strip, two-column cockpit layout (left = intelligence,
    // right = attention + work), honest "Not set" copy across
    // every metric cell. Preserves the Phase 125 hook hoist in
    // DealAutopilotPanel. Composition-only — no Dataverse /
    // loader / governed-write / email-lane changes. 10 new
    // BankerDealWorkspace cockpit tests + updated DealHeader
    // markup assertions.
    'docs/PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md',
    // Phase 125C — Premium deal cockpit visual upgrade. Adds the
    // cobalt / teal / cyan / violet accent families to the Phase
    // 79 theme tokens (light + dark + explicit data-theme="dark"
    // blocks). Adds a layered shadow.glow + shadow.hero stack on
    // the DealHeader navy band. Adds a horizontal canonical-stage
    // pill rail to DealStageProgressionCard (current-stage
    // aria-current + past/future tone discipline + custom-stage
    // fallback note for the Phase 121 sparse-seed path). Adds a
    // shared inline-SVG SeverityGlyph (warning triangle / alert
    // circle / info circle) replacing the small color dot on
    // DealBlockers signal rows and DealStageProgressionCard reason
    // rows. Adds a cobalt liquid-glass overlay backdrop to the
    // BankerDealWorkspace right column (column-level backdrop —
    // each card keeps its own framing). Refreshes the
    // DealAutopilotPanel priority stripe color system (high
    // → at-risk, medium → cobalt, low → teal). Phase 125 hook
    // hoist preserved verbatim. Composition-only — no Dataverse
    // / loader / governed-write / email-lane changes. 10 new
    // Phase 125C invariant tests across two new files.
    'docs/PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md',
    // Phase 125D — Bloomberg / Apple deal cockpit redesign.
    // Promotes the workspace to a fully instrumented operating
    // cockpit: slate panel backdrop (Phase 79 token system gains
    // panelBg / deckBg / deckTile / glassPanel / panelBorder),
    // pure-function deriveDealCockpitMetrics() producing every
    // KPI deck / workstream bar / right-rail count badge value,
    // six shared visual primitives (MetricTile / CompletenessRing
    // / WorkstreamBar / CountBadge / SeverityMeter / GlassPanel),
    // DealMetricDeck KPI strip (8 tonal tiles + ring + missing-
    // fields readout), DealWorkstreamPanel (4 mini progress bars),
    // DealBlockers Attention Console (severity meter header),
    // DealStageProgressionCard Stage Map (connected nodes +
    // glass next-action command strip), DealAutopilotPanel
    // Action Console (priority meter header), DealSummary
    // grouped metric sections, right-rail count badges on
    // Tasks + Documents. Phase 125 hook hoist preserved.
    // Composition-only — no Dataverse / loader / governed-write
    // / email-lane changes. 37 new Phase 125D invariant tests
    // across three new files.
    'docs/PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md',
    // Phase 126 — Relationships + Signals visual restoration.
    // RelationshipMemory client rows gain a primary-accent left
    // stripe + bumped client-name typography. BankerAutopilotRollup
    // rows gain a severity-tinted left stripe driven by row
    // priority. Both cards' empty / loading states become
    // framed dashed-border cards. All Phase 76 / 82 / 83 / 100
    // / 101 derivations + local ledgers + clipboard / mailto
    // handoffs preserved verbatim. Composition-only — no
    // Dataverse / loader / governed-write / email-lane changes.
    // 8 new static-source pin cases added (4 per file) asserting
    // Phase 110 lock + no fabricated-AI claim vocabulary on
    // both source files.
    'docs/PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md',
  ];

  for (const rel of REQUIRED_DOC_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 112 — Operator validation script cross-references', () => {
  it('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md references Phase 112 as the operator validation script', () => {
    const doc = readDoc('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md');
    expect(doc).toMatch(/PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT\.md/);
  });

  it('docs/STABILIZATION_CHECKLIST.md references the Phase 112 operator validation script', () => {
    const doc = readDoc('docs/STABILIZATION_CHECKLIST.md');
    expect(doc).toMatch(/PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT\.md/);
  });

  it('docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md references the Phase 112 operator validation script', () => {
    const doc = readDoc('docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md');
    expect(doc).toMatch(/PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT\.md/);
  });
});

describe('Phase 111 — Stable cross-doc pointers', () => {
  it('STABILIZATION_CHECKLIST.md points at the current snapshot (Phase 111), not the previous one (Phase 103)', () => {
    const doc = readDoc('docs/STABILIZATION_CHECKLIST.md');
    // The header pointer block must reference Phase 111 as the
    // current authoritative snapshot. Phase 103 may still appear as
    // a historical reference, but the "current counts" pointer
    // belongs at Phase 111.
    expect(doc).toMatch(/Phase 111/);
    expect(doc).toMatch(/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT\.md/);
  });

  it('MICROSOFT_VIBE_CAPABILITY_COVERAGE.md references the Phase 111 snapshot somewhere', () => {
    const doc = readDoc('docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md');
    expect(doc).toMatch(/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT\.md/);
  });
});
