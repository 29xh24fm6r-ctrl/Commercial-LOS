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
    // Phase 122B — Automated Dataverse lookup repair. Replaces the
    // manual Maker Portal click-path with a Node script
    // (scripts/phase122-lookup-repair.mjs) that audits the live
    // env, prints a full plan with exact Web API payloads, and
    // refuses to execute live writes unless every safety gate
    // passes (LoanOpsExport publisher prefix = cr664, rollback
    // artifacts exist, DATAVERSE_BEARER_TOKEN env var set, no
    // plan step is a stop-condition, zero non-NULL rows on every
    // pseudo-column scheduled for deletion). Default is dry-run;
    // --commit explicitly required for writes. 29 new static-
    // source pins on the script's safety guards + constants in
    // phase122BScriptContract.test.ts. Continues to honor the
    // Phase 122 react-side contract pins (22 cases) and Phase
    // 110 communication lock.
    'docs/PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md',
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
    // Phase 125E — Full deal cockpit recomposition. Replaces
    // the Phase 125D layout with a recomposed visual hierarchy:
    // command hero (no metric strip — identity slots only) +
    // 6 large tonal KPI tiles + completeness ring + a big
    // Attention Console (severity meter + missing-data
    // checklist + signal rows) + a large connected-node
    // Stage Map (44/52px nodes + thick connectors + cobalt
    // halo) + an icon-led Action Console + workstream bars +
    // detail cards with WidgetHeader (icon halo + count badge
    // + mini progress bar) on every right-rail widget. Deal
    // Summary demoted to the bottom of the left column as a
    // compact key/value table. New shared primitives:
    // cockpitIcons.tsx (16 inline-SVG glyphs + IconChip
    // halo wrapper), LargeMetricTile + WidgetHeader added
    // to cockpitPrimitives.tsx. New typography.size.display
    // scale token. Phase 125 hook hoist preserved.
    // Composition-only — no Dataverse / loader / governed-
    // write / email-lane changes. 13 new Phase 125E invariant
    // tests in phase125ERecomposition.test.tsx.
    'docs/PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md',
    // Phase 125F — Lending OS shell restoration. Restores the
    // original Lending OS reference shell ACROSS the banker home
    // AND the per-deal cockpit (unified chrome). Extracts a
    // shared LendingOSLayout (dark sidebar with grouped nav,
    // current-workspace pill, identity card). Adds GreetingHeader
    // (personal "Good afternoon, X" greeting + honest task /
    // meeting count + disabled-placeholder search / Log Activity
    // / + New Deal). Flattens the KPI grid into 10 tonal tiles
    // (BankerKpiGrid) with cockpit-icon halos; WEIGHTED / WIN
    // RATE / HIGH PROB / YTD CLOSED render italic "Not yet wired"
    // with Phase 118 bucket-C tooltips. Adds tab count badges,
    // renames "Closing soon" rail to "Today's Schedule" with an
    // honest calendar disclaimer. Disabled-placeholder sidebar
    // entries for Schedule / Contacts / Vendors / Settings /
    // Help & Support carry aria-disabled + tooltips. Wraps
    // BankerDealWorkspace inside LendingOSLayout so the dark
    // sidebar persists when a banker clicks a deal. Phase 48
    // cross-role-import allowlist extended. Phase 125 hook hoist
    // preserved. Composition-only — no Dataverse / loader /
    // governed-write / email-lane changes. 13 new Phase 125F
    // invariant tests + BankerShell.test.tsx rewrite.
    'docs/PHASE_125F_LENDING_OS_SHELL_RESTORATION.md',
    // Phase 125G — Lending OS cockpit fit-and-finish. Polish
    // pass after Phase 125F. Six targeted changes: (1) stable
    // .cc-kpi-grid CSS class for the banker KPI grid (5×2 /
    // 4×3 / 2×5 explicit breakpoints — no orphan tile);
    // (2) stable .cc-metric-deck-tiles class for the deal
    // metric deck (3×2 / 2×3 / 1) + tighter padding + ring
    // divider; (3) new DealCockpitNav 8-anchor strip under
    // the deck with smooth-scroll links to every cockpit
    // module (anchor IDs declared on each module's outer
    // wrapper in BankerDealWorkspace); (4) AttentionConsole
    // missing-field chips grouped by category (Economics /
    // Parties / Timing / Stage & status / Structure);
    // (5) DealHeader "Deal Cockpit" lockup pill + brighter
    // eyebrow accent; (6) right-rail widget minHeight for
    // consistent height. Composition-only — no Dataverse /
    // loader / governed-write / email-lane changes. Phase
    // 125 hook hoist preserved. 16 new Phase 125G invariant
    // tests.
    'docs/PHASE_125G_LENDING_OS_COCKPIT_FIT_AND_FINISH.md',
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

// ---------------------------------------------------------------------------
// Phase 135A — Executive demo readiness + release snapshot
// ---------------------------------------------------------------------------

describe('Phase 135A — Executive workspace release docs exist on disk', () => {
  const REQUIRED_EXECUTIVE_DOCS: readonly string[] = [
    'docs/PHASE_133A_EXECUTIVE_WORKSPACE_COMMAND_CENTER.md',
    'docs/PHASE_133B_EXECUTIVE_WORKSPACE_REACHABILITY.md',
    'docs/PHASE_133C_EXECUTIVE_PRIMARY_WORKSPACE_SEED.md',
    'docs/PHASE_134A_EXECUTIVE_WORKSPACE_RUNTIME_VERIFICATION.md',
    'docs/PHASE_134B_EXECUTIVE_COMMAND_CENTER_DENSITY.md',
    'docs/PHASE_135A_EXECUTIVE_DEMO_READINESS.md',
    'docs/PHASE_135B_EXECUTIVE_FINAL_DEMO_SMOKE.md',
  ];
  for (const rel of REQUIRED_EXECUTIVE_DOCS) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 135A — Executive demo contract is pinned in the doc', () => {
  const doc = readDoc('docs/PHASE_135A_EXECUTIVE_DEMO_READINESS.md');

  it('pins that Executive is primary-workspace-name gated', () => {
    expect(doc).toMatch(/primary[- ]workspace[- ]name gated/i);
    expect(doc).toMatch(/Executive Dashboard/);
  });

  it('pins that manager/team entitlement does not proxy Executive access', () => {
    expect(doc).toMatch(
      /Manager\/team entitlement does (?:\*\*)?not(?:\*\*)? proxy Executive access/i,
    );
  });

  it('pins that the Executive cockpit is dense but honest', () => {
    expect(doc).toMatch(/Executive cockpit is dense but honest/i);
  });

  it('pins that empty/partial states are expected demo states', () => {
    expect(doc).toMatch(/Empty\/partial states are expected demo states/i);
  });

  it('pins that live provisioning remains pending operator auth availability', () => {
    expect(doc).toMatch(
      /Live provisioning remains pending operator auth availability/i,
    );
  });

  it('pins that Copilot remains not-configured unless a future connector phase changes it', () => {
    expect(doc).toMatch(
      /Copilot remains not-configured[\s\S]*?future connector phase/i,
    );
  });

  it('explicitly states no fake metrics / no runtime mock data / no access widening / no Copilot live connector', () => {
    expect(doc).toMatch(/No fake metrics\./i);
    expect(doc).toMatch(/No runtime mock data\./i);
    expect(doc).toMatch(/No access widening\./i);
    expect(doc).toMatch(/No Copilot live connector\./i);
  });

  it('does not imply any live Dataverse write is part of Phase 135A', () => {
    expect(doc).toMatch(/No live Dataverse write is part of Phase 135A/i);
  });
});

describe('Phase 135B — Executive final demo smoke contract is pinned in the doc', () => {
  const doc = readDoc('docs/PHASE_135B_EXECUTIVE_FINAL_DEMO_SMOKE.md');

  it('declares itself a finish pass, not a feature expansion', () => {
    expect(doc).toMatch(/demo-ready and stable/i);
    expect(doc).toMatch(/final polish\/hardening pass/i);
    expect(doc).toMatch(/not(?:\*\*)? a (?:new )?feature expansion/i);
  });

  it('documents the four+ exact demo states (no-auth, auth-pending, populated, empty, partial)', () => {
    expect(doc).toMatch(/No-auth ?\/ ?local state/i);
    expect(doc).toMatch(/Auth-pending state/i);
    expect(doc).toMatch(/Populated Executive data/i);
    expect(doc).toMatch(/Empty Executive data/i);
    expect(doc).toMatch(/Partial Executive data/i);
  });

  it('pins the known limitations (auth-dependent provisioning, figures not wired, Copilot not configured)', () => {
    expect(doc).toMatch(
      /Live Phase 133C provisioning still depends on operator auth\s+availability/i,
    );
    expect(doc).toMatch(
      /Profitability and performance figures remain not wired by\s+governance\s+choice/i,
    );
    expect(doc).toMatch(/Copilot remains not configured/i);
  });

  it('reaffirms the no-write / no-widening guardrails', () => {
    expect(doc).toMatch(/No Dataverse writes/i);
    expect(doc).toMatch(/No entitlement widening/i);
    expect(doc).toMatch(/No write affordances/i);
    expect(doc).toMatch(/Phase 133C seed behavior unchanged/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 136A — Cross-workspace final parity smoke
// ---------------------------------------------------------------------------

describe('Phase 136A — Cross-workspace final smoke doc exists and is smoke-only', () => {
  it('docs/PHASE_136A_CROSS_WORKSPACE_FINAL_SMOKE.md exists on disk', () => {
    expect(
      existsSync(
        resolve(REPO_ROOT, 'docs/PHASE_136A_CROSS_WORKSPACE_FINAL_SMOKE.md'),
      ),
    ).toBe(true);
  });

  const doc = readDoc('docs/PHASE_136A_CROSS_WORKSPACE_FINAL_SMOKE.md');

  it('declares itself a tests + docs smoke phase (not feature work)', () => {
    expect(doc).toMatch(/tests \+ docs smoke phase/i);
    expect(doc).toMatch(/not new feature\s+work/i);
  });

  it('pins that it does not widen access (Executive stays primary-name gated; no proxy)', () => {
    expect(doc).toMatch(
      /Executive access comes only from the primary workspace name/i,
    );
    expect(doc).toMatch(/Portfolio is a query marker on the manager route/i);
    expect(doc).toMatch(/no manager\/team\/executive proxy/i);
  });

  it('pins that it adds no live connectors and keeps every surface read-only', () => {
    expect(doc).toMatch(/no Copilot live connector/i);
    expect(doc).toMatch(/Copilot stays governed/i);
    expect(doc).toMatch(/Every surface is read-only/i);
  });

  it('pins the known limitations (Executive auth, Copilot not configured, profitability future work)', () => {
    expect(doc).toMatch(
      /Executive live provisioning still needs operator auth/i,
    );
    expect(doc).toMatch(/Copilot remains not configured/i);
    expect(doc).toMatch(
      /Profitability \/ live-connector metrics remain governed future\s+work/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 137A — Copilot live connector implementation DECISION (doc-only)
// ---------------------------------------------------------------------------

describe('Phase 137A — Copilot live connector decision is recorded and runtime stays not-configured', () => {
  const rel = 'docs/PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md';

  it('the Phase 137A decision doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as a decision/spec/governance phase — not an implementation', () => {
    expect(doc).toMatch(/decision ?\/ ?spec ?\/ ?governance phase, not an\s+implementation/i);
  });

  it('pins the recommended primary path (Dataverse Custom API + server-side Azure OpenAI)', () => {
    expect(doc).toMatch(/Dataverse Custom API/i);
    expect(doc).toMatch(/Azure OpenAI server-side/i);
  });

  it('pins that the Copilot live connector remains decision-only / not-configured after 137A', () => {
    expect(doc).toMatch(/Decision documented only\. Runtime remains\s+not-configured/i);
    expect(doc).toMatch(/No connector code\./i);
    expect(doc).toMatch(/No enabling live mode\./i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137B — Copilot Custom API CONTRACT (docs + tests only)
// ---------------------------------------------------------------------------

describe('Phase 137B — Copilot Custom API contract is recorded and runtime stays not_configured', () => {
  const rel = 'docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md';

  it('the Phase 137B contract doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as contract/spec only — no implementation in this phase', () => {
    expect(doc).toMatch(/Contract ?\/ ?spec only/i);
    expect(doc).toMatch(/No implementation\./i);
    expect(doc).toMatch(/No live traffic\./i);
  });

  it('pins the future Custom API boundary (browser → Dataverse Custom API → server-side Azure OpenAI)', () => {
    expect(doc).toMatch(/cr664_RunLosCopilotAssist|cr664_RunCopilotAssist/);
    expect(doc).toMatch(/The browser calls the Dataverse Custom API only/i);
    expect(doc).toMatch(/calls Azure OpenAI server-side/i);
  });

  it('pins that the Copilot runtime remains not_configured after 137B', () => {
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137C — Copilot connector adapter skeleton (disabled by default)
// ---------------------------------------------------------------------------

describe('Phase 137C — Copilot connector skeleton is inert and runtime stays not_configured', () => {
  const rel = 'docs/PHASE_137C_COPILOT_CONNECTOR_SKELETON.md';

  it('the Phase 137C skeleton doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the skeleton as disabled-by-default with no network call', () => {
    expect(doc).toMatch(/disabled by default/i);
    expect(doc).toMatch(/no network call/i);
    expect(doc).toMatch(/No transport is wired/i);
  });

  it('pins that no live mode is enabled and the runtime default stays not_configured', () => {
    expect(doc).toMatch(/No live mode\./i);
    expect(doc).toMatch(/default stays \*?\*?`?not_configured`?/i);
  });

  it('pins that the contract + adapter skeleton files were added', () => {
    expect(doc).toMatch(/copilotCustomApiContract\.ts/);
    expect(doc).toMatch(/copilotCustomApiAdapter\.ts/);
  });
});

// ---------------------------------------------------------------------------
// Phase 137D — Copilot transport seam + config resolver (disabled by default)
// ---------------------------------------------------------------------------

describe('Phase 137D — Copilot transport seam adds config gating only, no concrete transport', () => {
  const rel = 'docs/PHASE_137D_COPILOT_TRANSPORT_SEAM.md';

  it('the Phase 137D transport-seam doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the config resolver + transport seam as disabled-by-default with no network', () => {
    expect(doc).toMatch(/config resolver/i);
    expect(doc).toMatch(/transport seam/i);
    expect(doc).toMatch(/no network call/i);
    expect(doc).toMatch(/disabled by default/i);
  });

  it('pins that no concrete transport exists and the default stays not_configured', () => {
    expect(doc).toMatch(/it does not exist in this phase|no concrete transport exists yet/i);
    expect(doc).toMatch(/default (?:stays|remains) `?not_configured`?/i);
  });

  it('pins that secret-looking config fails closed', () => {
    expect(doc).toMatch(/fail(?:s|ing)? closed/i);
    expect(doc).toMatch(/secret/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137E — Copilot Custom API transport stub (no concrete live transport)
// ---------------------------------------------------------------------------

describe('Phase 137E — Copilot transport stub is fail-closed and no live transport is enabled', () => {
  const rel = 'docs/PHASE_137E_COPILOT_CUSTOM_API_TRANSPORT_STUB.md';

  it('the Phase 137E transport-stub doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as a stub/factory only — no concrete live transport', () => {
    expect(doc).toMatch(/transport stub/i);
    expect(doc).toMatch(/fail(?:s|ing)? closed/i);
    expect(doc).toMatch(/no network call/i);
  });

  it('pins that the default stays not_configured and no transport is wired by default', () => {
    expect(doc).toMatch(/default (?:stays|remains) `?not_configured`?/i);
    expect(doc).toMatch(/there is no default/i);
  });

  it('pins the readiness blockers for a real implementation', () => {
    expect(doc).toMatch(/transport is not implemented/i);
    expect(doc).toMatch(/Audit \/ event ledger logger not wired/i);
    expect(doc).toMatch(/DLP and Azure OpenAI model policy not approved/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137G — Copilot Custom API metadata script (guarded dry-run first)
// ---------------------------------------------------------------------------

describe('Phase 137G — Copilot Custom API metadata script is dry-run-first with no live connector', () => {
  const rel = 'docs/PHASE_137G_COPILOT_CUSTOM_API_METADATA_SCRIPT.md';

  it('the Phase 137G metadata-script doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the script as dry-run-first / spec only with nothing created', () => {
    expect(doc).toMatch(/dry-run first/i);
    expect(doc).toMatch(/nothing is created/i);
    expect(doc).toMatch(/live metadata creation is[\s\S]{0,40}not\s+implemented/i);
  });

  it('pins the cr664_RunLosCopilotAssist target and the inspect/seed commands', () => {
    expect(doc).toMatch(/cr664_RunLosCopilotAssist/);
    expect(doc).toMatch(/--inspect-copilot-custom-api/);
    expect(doc).toMatch(/--seed-copilot-custom-api-metadata/);
  });

  it('pins that the runtime Copilot connector remains not_configured and no live connector is enabled', () => {
    expect(doc).toMatch(/stays \*?\*?`?not_configured`?|remains not_configured/i);
    expect(doc).toMatch(/no live enablement/i);
    expect(doc).toMatch(/no browser-direct Azure OpenAI|no real `?fetch`? to Azure\/OpenAI/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137H — Copilot server-side plugin / Azure Function skeleton spec
// ---------------------------------------------------------------------------

describe('Phase 137H — Copilot server-side skeleton spec is docs-only with no runtime/live behavior', () => {
  const rel = 'docs/PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md';

  it('the Phase 137H server-side skeleton-spec doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as server-side skeleton/spec only — nothing created', () => {
    expect(doc).toMatch(/server-side skeleton ?\/ ?spec only/i);
    expect(doc).toMatch(/No plugin code\./i);
    expect(doc).toMatch(/No live traffic\./i);
    expect(doc).toMatch(/No client runtime change\./i);
  });

  it('pins the cr664_RunLosCopilotAssist target + plugin-primary / Azure-Function-alternative recommendation', () => {
    expect(doc).toMatch(/cr664_RunLosCopilotAssist/);
    expect(doc).toMatch(/Dataverse plugin[\s\S]*?recommended/i);
    expect(doc).toMatch(/Azure Function/);
  });

  it('pins server-side Azure OpenAI only + audit/fail-closed + runtime not_configured', () => {
    expect(doc).toMatch(/Server-side only/i);
    expect(doc).toMatch(/audit_unavailable/);
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137I — Copilot audit / event ledger design (docs-only)
// ---------------------------------------------------------------------------

describe('Phase 137I — Copilot audit/event ledger design is docs-only with no runtime/live behavior', () => {
  const rel = 'docs/PHASE_137I_COPILOT_AUDIT_EVENT_LEDGER_DESIGN.md';

  it('the Phase 137I audit-ledger design doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as audit-design only — no table/migration/runtime created', () => {
    expect(doc).toMatch(/audit ?\/ ?event ledger design only/i);
    expect(doc).toMatch(/No Dataverse table creation\./i);
    expect(doc).toMatch(/No live enablement\./i);
  });

  it('pins the audit-before-model rule + audit_unavailable fail-closed', () => {
    expect(doc).toMatch(/before any Azure\s+OpenAI ?\/ ?model call/i);
    expect(doc).toMatch(/failClosedCode: audit_unavailable/);
  });

  it('pins the proposed cr664_copilotauditevent ledger + correlationId discipline', () => {
    expect(doc).toMatch(/cr664_copilotauditevent/);
    expect(doc).toMatch(/cr664_correlationid/);
  });

  it('pins that the runtime Copilot connector remains not_configured', () => {
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137J — Copilot audit-event table metadata script (dry-run first)
// ---------------------------------------------------------------------------

describe('Phase 137J — Copilot audit-table metadata script is dry-run-only with no live/runtime behavior', () => {
  const rel = 'docs/PHASE_137J_COPILOT_AUDIT_TABLE_METADATA_SCRIPT.md';

  it('the Phase 137J audit-table metadata-script doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the script as dry-run metadata script/spec only — no table created', () => {
    expect(doc).toMatch(/Dry-run metadata script ?\/ ?spec only/i);
    expect(doc).toMatch(/No table creation in Phase 137J/i);
    expect(doc).toMatch(/not implemented/i);
  });

  it('pins the cr664_copilotauditevent target + inspect/seed commands', () => {
    expect(doc).toMatch(/cr664_copilotauditevent/);
    expect(doc).toMatch(/--inspect-copilot-audit-table/);
    expect(doc).toMatch(/--seed-copilot-audit-table-metadata/);
  });

  it('pins the audit-before-model rule and runtime staying not_configured', () => {
    expect(doc).toMatch(/audit_start[\s\S]{0,80}before any Azure\s+OpenAI ?\/ ?model call/i);
    expect(doc).toMatch(/audit_unavailable/);
    expect(doc).toMatch(/remains[\s>*`]+not_configured/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 138B — Copilot audit-table guarded commit path (future-only)
// ---------------------------------------------------------------------------

describe('Phase 138B — Copilot audit-table commit path is operator-only and live stays not_configured', () => {
  const rel = 'docs/PHASE_138B_COPILOT_AUDIT_TABLE_COMMIT_PATH.md';

  it('the Phase 138B audit-table commit-path doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the commit path as future-only / not implemented, dry-run default, no write', () => {
    expect(doc).toMatch(/Dry-run remains the default/i);
    expect(doc).toMatch(/Commit is future-only ?\/ ?NOT IMPLEMENTED in 138B/i);
    expect(doc).toMatch(/No table is created/i);
  });

  it('pins commit mode as operator-only (not run by tests) + idempotent inspect-first contract', () => {
    expect(doc).toMatch(/test tenant/i);
    expect(doc).toMatch(/Inspect first/i);
    expect(doc).toMatch(/Idempotent/i);
    expect(doc).toMatch(/Bail on ambiguous/i);
  });

  it('pins live Copilot still remains not_configured after 138B', () => {
    expect(doc).toMatch(/Copilot still remains not_configured/i);
    expect(doc).toMatch(/stays[\s>*`]+not_configured/i);
    expect(doc).toMatch(/cr664_copilotauditevent/);
  });
});

// ---------------------------------------------------------------------------
// Phase 138C — Copilot controlled live-enablement bundle (guarded, blocked)
// ---------------------------------------------------------------------------

describe('Phase 138C — Copilot controlled live-enablement bundle: guarded, production blocked', () => {
  const DOCS = [
    'docs/PHASE_138C_COPILOT_SERVER_HANDLER_DEPLOYMENT_PLAN.md',
    'docs/PHASE_138C_COPILOT_CONTROLLED_TEST_TENANT_ENABLEMENT.md',
    'docs/PHASE_138C_COPILOT_LIVE_READINESS_CERTIFICATION.md',
  ];

  for (const rel of DOCS) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  it('the live-readiness certification pins repo complete / live disabled / production blocked', () => {
    const doc = readDoc('docs/PHASE_138C_COPILOT_LIVE_READINESS_CERTIFICATION.md');
    expect(doc).toMatch(/Repo-side Copilot work is complete/i);
    expect(doc).toMatch(/Live Copilot remains disabled/i);
    expect(doc).toMatch(/Production[\s\S]{0,30}[Bb]locked/);
    expect(doc).toMatch(/Default connector mode:[\s\S]{0,20}not_configured/i);
  });

  it('the test-tenant runbook requires all prerequisites before live_read_only', () => {
    const doc = readDoc('docs/PHASE_138C_COPILOT_CONTROLLED_TEST_TENANT_ENABLEMENT.md');
    expect(doc).toMatch(/Audit table exists and verified/i);
    expect(doc).toMatch(/Custom API exists and verified/i);
    expect(doc).toMatch(/Disable switch configured/i);
    expect(doc).toMatch(/Test tenant only/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 139A — Copilot final completion bundle (repo complete, live blocked)
// ---------------------------------------------------------------------------

describe('Phase 139A — Copilot final completion: repo complete, live disabled, production blocked', () => {
  const DOCS = [
    'docs/PHASE_139A_COPILOT_FINAL_OPERATOR_COMMANDS.md',
    'docs/PHASE_139A_COPILOT_SERVER_HANDLER_PACKAGE_PLAN.md',
    'docs/PHASE_139A_COPILOT_TEST_TENANT_VALIDATION_PACKET.md',
    'docs/PHASE_139A_COPILOT_FINAL_COMPLETION_CERTIFICATION.md',
  ];

  for (const rel of DOCS) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const cert = readDoc('docs/PHASE_139A_COPILOT_FINAL_COMPLETION_CERTIFICATION.md');

  it('the final certification pins repo-complete end-to-end, live disabled, default not_configured', () => {
    expect(cert).toMatch(/Repo-side Copilot work is complete end-to-end/i);
    expect(cert).toMatch(/Live Copilot remains disabled/i);
    expect(cert).toMatch(/Default mode remains `?not_configured`?/i);
  });

  it('the final certification pins production blocked + both commit paths future-only', () => {
    expect(cert).toMatch(/Production remains blocked/i);
    expect(cert).toMatch(/Audit table tooling[\s\S]{0,60}commit future-only ?\/ ?not implemented/i);
    expect(cert).toMatch(/Custom API tooling[\s\S]{0,60}commit future-only ?\/ ?not implemented/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137K — Copilot audit-logger skeleton (disabled)
// ---------------------------------------------------------------------------

describe('Phase 137K — Copilot audit-logger skeleton is inert with no live write/runtime behavior', () => {
  const rel = 'docs/PHASE_137K_COPILOT_AUDIT_LOGGER_SKELETON.md';

  it('the Phase 137K audit-logger skeleton doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as skeleton/interface only — no Dataverse table write, no table creation', () => {
    expect(doc).toMatch(/Skeleton ?\/ ?interface only/i);
    expect(doc).toMatch(/No Dataverse table write\./i);
    expect(doc).toMatch(/No table creation\./i);
  });

  it('pins the disabled logger fail-closed behavior (audit_unavailable, no event id)', () => {
    expect(doc).toMatch(/audit_unavailable/);
    expect(doc).toMatch(/never fabricates an `?eventId`?/i);
    expect(doc).toMatch(/cr664_copilotauditevent/);
  });

  it('pins the audit-before-model rule and runtime staying not_configured', () => {
    expect(doc).toMatch(/before any Azure\s+OpenAI ?\/ ?model\s+call/i);
    expect(doc).toMatch(/remains[\s>*`]+not_configured/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137L — Copilot server handler + readiness bundle (disabled)
// ---------------------------------------------------------------------------

describe('Phase 137L — Copilot server-handler readiness bundle is disabled with no live behavior', () => {
  const rel = 'docs/PHASE_137L_COPILOT_SERVER_HANDLER_READINESS_BUNDLE.md';

  it('the Phase 137L readiness-bundle doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as a disabled readiness bundle with no live enablement', () => {
    expect(doc).toMatch(/Disabled readiness bundle only/i);
    expect(doc).toMatch(/No live enablement in (Phase )?137L/i);
  });

  it('pins the audit-before-model fail-closed handler + never-ready harness', () => {
    expect(doc).toMatch(/audit_start[\s\S]{0,120}before any Azure\s+OpenAI ?\/ ?model\s+call/i);
    expect(doc).toMatch(/audit_unavailable/);
    expect(doc).toMatch(/model boundary is (an interface only|never|never reached)/i);
  });

  it('pins runtime staying not_configured + the remaining blockers', () => {
    expect(doc).toMatch(/stays[\s>*`]+not_configured/i);
    expect(doc).toMatch(/cr664_copilotauditevent/);
    expect(doc).toMatch(/Live mode not enabled/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137M — Copilot governance checkpoint packet (docs-only)
// ---------------------------------------------------------------------------

describe('Phase 137M — Copilot governance checkpoint is docs-only with no runtime/live behavior', () => {
  const rel = 'docs/PHASE_137M_COPILOT_GOVERNANCE_CHECKPOINT.md';

  it('the Phase 137M governance checkpoint doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as a governance checkpoint only — no live enablement, no runtime change', () => {
    expect(doc).toMatch(/Governance checkpoint only/i);
    expect(doc).toMatch(/No live enablement in 137M/i);
    expect(doc).toMatch(/No runtime behavior change\./i);
  });

  it('pins the full 137A–137L summary + architecture + gates + runtime not_configured', () => {
    expect(doc).toMatch(/137A/);
    expect(doc).toMatch(/137L/);
    expect(doc).toMatch(/Browser → Dataverse Custom API/i);
    expect(doc).toMatch(/Gate 1/);
    expect(doc).toMatch(/Gate 9/);
    expect(doc).toMatch(/Runtime default remains `?not_configured`?/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 138A — Copilot completion certification (docs-only)
// ---------------------------------------------------------------------------

describe('Phase 138A — Copilot completion certification is docs-only and live not enabled', () => {
  const rel = 'docs/PHASE_138A_COPILOT_COMPLETION_CERTIFICATION.md';

  it('the Phase 138A completion certification doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  it('the full 137A–137M Copilot doc set still exists', () => {
    const DOCS = [
      'docs/PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md',
      'docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md',
      'docs/PHASE_137C_COPILOT_CONNECTOR_SKELETON.md',
      'docs/PHASE_137D_COPILOT_TRANSPORT_SEAM.md',
      'docs/PHASE_137E_COPILOT_CUSTOM_API_TRANSPORT_STUB.md',
      'docs/PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md',
      'docs/PHASE_137G_COPILOT_CUSTOM_API_METADATA_SCRIPT.md',
      'docs/PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md',
      'docs/PHASE_137I_COPILOT_AUDIT_EVENT_LEDGER_DESIGN.md',
      'docs/PHASE_137J_COPILOT_AUDIT_TABLE_METADATA_SCRIPT.md',
      'docs/PHASE_137K_COPILOT_AUDIT_LOGGER_SKELETON.md',
      'docs/PHASE_137L_COPILOT_SERVER_HANDLER_READINESS_BUNDLE.md',
      'docs/PHASE_137M_COPILOT_GOVERNANCE_CHECKPOINT.md',
    ];
    for (const d of DOCS) {
      expect(existsSync(resolve(REPO_ROOT, d)), d).toBe(true);
    }
  });

  const doc = readDoc(rel);

  it('pins Copilot readiness complete / live not enabled / default not_configured', () => {
    expect(doc).toMatch(/Copilot readiness is complete/i);
    expect(doc).toMatch(/live enablement is intentionally NOT active/i);
    expect(doc).toMatch(/Runtime default remains `?not_configured`?/i);
  });

  it('pins no live/runtime behavior + the remaining external gates', () => {
    expect(doc).toMatch(/No live enablement in 138A/i);
    expect(doc).toMatch(/No runtime UI change\./i);
    expect(doc).toMatch(/BLOCKED ?\/ ?EXTERNAL/i);
    expect(doc).toMatch(/Definition of done/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 137F — Copilot Custom API registration runbook (docs/spec only)
// ---------------------------------------------------------------------------

describe('Phase 137F — Copilot Custom API registration runbook is spec-only, no runtime change', () => {
  const rel = 'docs/PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md';

  it('the Phase 137F runbook doc exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  const doc = readDoc(rel);

  it('pins the doc as registration/runbook/spec only — nothing is created', () => {
    expect(doc).toMatch(/registration ?\/ ?runbook ?\/ ?spec only/i);
    expect(doc).toMatch(/No Custom API is created in this phase/i);
    expect(doc).toMatch(/No client runtime behavior change\./i);
  });

  it('pins the cr664_RunLosCopilotAssist target and runtime staying not_configured', () => {
    expect(doc).toMatch(/cr664_RunLosCopilotAssist/);
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
  });

  it('pins server-side Azure OpenAI only + audit-before-enable + future phases', () => {
    expect(doc).toMatch(/Call Azure OpenAI server-side only/i);
    expect(doc).toMatch(/before live\s+enablement/i);
    expect(doc).toMatch(/137G/);
    expect(doc).toMatch(/137K/);
  });
});

// ---------------------------------------------------------------------------
// Phase 140A — FDIC Remediation Lending OS Mega Foundation (model/docs/tests)
// ---------------------------------------------------------------------------

describe('Phase 140A — FDIC remediation foundation docs + model files exist', () => {
  const REQUIRED_FDIC_DOCS: readonly string[] = [
    'docs/PHASE_140A_FDIC_REMEDIATION_OPERATING_MODEL.md',
    'docs/FDIC_REMEDIATION_PLATFORM_BLUEPRINT.md',
  ];
  for (const rel of REQUIRED_FDIC_DOCS) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const REQUIRED_FDIC_MODEL_FILES: readonly string[] = [
    'src/shared/fdic/fdicRemediationOperatingModel.ts',
    'src/shared/fdic/fdicWorkspaceResponsibilityMap.ts',
    'src/shared/fdic/fdicEvidenceArchitecture.ts',
    'src/shared/fdic/fdicRemediationArchitectureSnapshot.ts',
    'src/shared/fdic/fdicRemediationRoadmap.ts',
    // The governance pin that holds the no-fake-compliance discipline.
    'src/shared/governance/fdicRemediationOperatingModelGovernance.test.ts',
  ];
  for (const rel of REQUIRED_FDIC_MODEL_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 140A — FDIC foundation pins the no-fake-compliance rule and is model/docs/tests only', () => {
  const opModel = readDoc('docs/PHASE_140A_FDIC_REMEDIATION_OPERATING_MODEL.md');
  const blueprint = readDoc('docs/FDIC_REMEDIATION_PLATFORM_BLUEPRINT.md');

  it('declares itself domain model + docs + tests with no visible UI / schema / writes', () => {
    expect(opModel).toMatch(/domain model \+ docs \+ tests only/i);
    expect(opModel).toMatch(/No visible UI change/i);
    expect(opModel).toMatch(/No Dataverse schema/i);
  });

  it('pins the no-fake-compliance rule in both FDIC docs', () => {
    expect(opModel).toMatch(/No fake compliance/i);
    expect(opModel).toMatch(/Evidence is not automatically compliance/i);
    expect(blueprint).toMatch(/No fake compliance/i);
    expect(blueprint).toMatch(/does not equal remediation/i);
  });

  it('pins portfolio as the control tower, not the sole remediation owner', () => {
    expect(opModel).toMatch(/control tower/i);
    expect(opModel).toMatch(/not the sole/i);
  });

  it('pins the future roadmap covering 140B through 140K', () => {
    expect(opModel).toMatch(/140B/);
    expect(opModel).toMatch(/140K/);
  });
});

// ---------------------------------------------------------------------------
// Phase 140B — Portfolio Loan Boarding System of Record (model/tests/docs)
// ---------------------------------------------------------------------------

describe('Phase 140B — portfolio loan boarding system of record exists', () => {
  const REQUIRED_BOARDING_FILES: readonly string[] = [
    'src/shared/portfolioBoarding/portfolioLoanBoardingTypes.ts',
    'src/shared/portfolioBoarding/portfolioLoanBoardingCatalog.ts',
    'src/shared/portfolioBoarding/portfolioLoanDocumentCatalog.ts',
    'src/shared/portfolioBoarding/derivePortfolioLoanBoardingCompleteness.ts',
    'src/shared/portfolioBoarding/portfolioLoanBoardingSnapshot.ts',
    // Tests that hold the foundation's discipline.
    'src/shared/portfolioBoarding/portfolioLoanBoardingCatalog.test.ts',
    'src/shared/portfolioBoarding/portfolioLoanDocumentCatalog.test.ts',
    'src/shared/portfolioBoarding/derivePortfolioLoanBoardingCompleteness.test.ts',
    'src/shared/portfolioBoarding/portfolioLoanBoardingSnapshot.test.ts',
    'src/shared/portfolioBoarding/portfolioLoanBoardingGovernance.test.ts',
  ];
  for (const rel of REQUIRED_BOARDING_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  it('docs/PHASE_140B_PORTFOLIO_LOAN_BOARDING_SYSTEM_OF_RECORD.md exists on disk', () => {
    expect(
      existsSync(
        resolve(
          REPO_ROOT,
          'docs/PHASE_140B_PORTFOLIO_LOAN_BOARDING_SYSTEM_OF_RECORD.md',
        ),
      ),
    ).toBe(true);
  });
});

describe('Phase 140B — boarding doc pins foundation-only scope', () => {
  const doc = readDoc(
    'docs/PHASE_140B_PORTFOLIO_LOAN_BOARDING_SYSTEM_OF_RECORD.md',
  );

  it('declares the manual closed-loan boarding path and foundation-first scope', () => {
    expect(doc).toMatch(/system of record/i);
    expect(doc).toMatch(/manual/i);
    expect(doc).toMatch(/foundation-first|foundation first/i);
  });

  it('pins the no-live-write / no-React-UI / no-fake-data constraints', () => {
    expect(doc).toMatch(/No live Dataverse writes/i);
    expect(doc).toMatch(/No React UI/i);
    expect(doc).toMatch(/No fake (portfolio|borrower)/i);
  });

  it('pins fail-closed readiness for FDIC / board / portfolio monitoring', () => {
    expect(doc).toMatch(/fail-closed/i);
    expect(doc).toMatch(/FDIC/);
    expect(doc).toMatch(/board/i);
    expect(doc).toMatch(/portfolio monitoring/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 140B-H — Portfolio Loan Boarding mega phase files
// ---------------------------------------------------------------------------

describe('Phase 140B-H — all mega-phase files exist on disk', () => {
  const REQUIRED_140BH_FILES: readonly string[] = [
    'docs/PHASE_140B_H_PORTFOLIO_LOAN_BOARDING_SYSTEM_OF_RECORD.md',
    'src/shared/portfolioBoarding/portfolioLoanBoardingTypes.ts',
    'src/shared/portfolioBoarding/portfolioLoanBoardingCatalog.ts',
    'src/shared/portfolioBoarding/portfolioLoanDocumentCatalog.ts',
    'src/shared/portfolioBoarding/derivePortfolioLoanBoardingCompleteness.ts',
    'src/shared/portfolioBoarding/portfolioLoanBoardingSnapshot.ts',
    'src/shared/portfolioBoarding/portfolioLoanDocumentClassifier.ts',
    'src/shared/portfolioBoarding/portfolioLoanEvidenceBinder.ts',
    'src/shared/portfolioBoarding/portfolioLoanDocumentReadiness.ts',
    'src/shared/portfolioBoarding/fdicExaminerPackage.ts',
    'src/portfolioBoarding/PortfolioLoanBoardingPreview.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingEditor.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingDocumentUploadPanel.tsx',
    'src/portfolioBoarding/portfolioLoanBoardingWriteAdapter.ts',
    'src/portfolioBoarding/portfolioLoanDocumentUploadAdapter.ts',
    'src/portfolioBoarding/portfolioLoanBoardingPersistenceTypes.ts',
    'src/portfolioBoarding/portfolioLoanBoardingDataverseMapper.ts',
    'src/portfolioBoarding/portfolioLoanBoardingDataverseAdapter.ts',
    'src/portfolioBoarding/portfolioBoardingCommandCenterAdapter.ts',
    'src/shared/portfolioBoarding/portfolioLoanBoardingGovernance.test.ts',
  ];
  for (const rel of REQUIRED_140BH_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Phase 140I — Portfolio Boarding Dataverse schema inspection + plan
// ---------------------------------------------------------------------------

describe('Phase 140I — portfolio boarding Dataverse schema inspection foundation exists', () => {
  const REQUIRED_140I_FILES: readonly string[] = [
    'docs/PHASE_140I_PORTFOLIO_BOARDING_DATAVERSE_SCHEMA_INSPECTION.md',
    'src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts',
    'src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.test.ts',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaInspectionReport.ts',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaInspectionReport.test.ts',
    // The Phase 140B-H doc must remain pinned alongside the new schema work.
    'docs/PHASE_140B_H_PORTFOLIO_LOAN_BOARDING_SYSTEM_OF_RECORD.md',
  ];
  for (const rel of REQUIRED_140I_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc(
    'docs/PHASE_140I_PORTFOLIO_BOARDING_DATAVERSE_SCHEMA_INSPECTION.md',
  );

  it('the doc pins read-only inspect/plan modes with no schema creation', () => {
    expect(doc).toMatch(/--inspect-portfolio-boarding-schema/);
    expect(doc).toMatch(/--plan-portfolio-boarding-schema/);
    expect(doc).toMatch(/no (actual )?Dataverse (table|schema) creation/i);
    expect(doc).toMatch(/dry-run only/i);
  });

  it('the script still exposes both read-only inspect/plan modes', () => {
    const script = readFileSync(
      resolve(REPO_ROOT, 'scripts/phase122-lookup-repair.mjs'),
      'utf8',
    );
    expect(script).toMatch(/'--inspect-portfolio-boarding-schema'/);
    expect(script).toMatch(/'--plan-portfolio-boarding-schema'/);
  });
});

// ---------------------------------------------------------------------------
// Phase 140J — Guarded portfolio boarding schema seed mode
// ---------------------------------------------------------------------------

describe('Phase 140J — guarded portfolio boarding schema seed foundation exists', () => {
  const REQUIRED_140J_FILES: readonly string[] = [
    'docs/PHASE_140J_PORTFOLIO_BOARDING_DATAVERSE_SCHEMA_SEED_MODE.md',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaSeedPlan.ts',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaSeedPlan.test.ts',
    // Phase 140I + 140B-H artifacts must remain pinned.
    'src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaInspectionReport.ts',
    'docs/PHASE_140I_PORTFOLIO_BOARDING_DATAVERSE_SCHEMA_INSPECTION.md',
    'docs/PHASE_140B_H_PORTFOLIO_LOAN_BOARDING_SYSTEM_OF_RECORD.md',
  ];
  for (const rel of REQUIRED_140J_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc(
    'docs/PHASE_140J_PORTFOLIO_BOARDING_DATAVERSE_SCHEMA_SEED_MODE.md',
  );

  it('the doc pins dry-run-default + explicit commit flag + no runtime persistence', () => {
    expect(doc).toMatch(/--seed-portfolio-boarding-schema/);
    expect(doc).toMatch(/--commit-seed-portfolio-boarding-schema/);
    expect(doc).toMatch(/dry-run/i);
    expect(doc).toMatch(/does not enable app runtime portfolio boarding writes/i);
  });

  it('the script gates the commit flag behind the seed mode and creates no loan records', () => {
    const script = readFileSync(
      resolve(REPO_ROOT, 'scripts/phase122-lookup-repair.mjs'),
      'utf8',
    );
    expect(script).toMatch(/'--seed-portfolio-boarding-schema'/);
    expect(script).toMatch(/'--commit-seed-portfolio-boarding-schema'/);
    expect(script).toMatch(
      /--commit-seed-portfolio-boarding-schema has no effect without --seed-portfolio-boarding-schema/,
    );
    expect(script).toMatch(/never loan records/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 140K — schema verification + optional-relationship repair
// ---------------------------------------------------------------------------

describe('Phase 140K — schema verification + optional-relationship repair foundation exists', () => {
  const REQUIRED_140K_FILES: readonly string[] = [
    'docs/PHASE_140K_PORTFOLIO_BOARDING_SCHEMA_VERIFICATION_AND_OPTIONAL_RELATIONSHIP_REPAIR.md',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaVerificationReport.ts',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaVerificationReport.test.ts',
    // Earlier-phase artifacts must remain pinned.
    'src/portfolioBoarding/derivePortfolioBoardingSchemaSeedPlan.ts',
    'src/portfolioBoarding/derivePortfolioBoardingSchemaInspectionReport.ts',
    'docs/PHASE_140J_PORTFOLIO_BOARDING_DATAVERSE_SCHEMA_SEED_MODE.md',
    'docs/PHASE_140B_H_PORTFOLIO_LOAN_BOARDING_SYSTEM_OF_RECORD.md',
  ];
  for (const rel of REQUIRED_140K_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc(
    'docs/PHASE_140K_PORTFOLIO_BOARDING_SCHEMA_VERIFICATION_AND_OPTIONAL_RELATIONSHIP_REPAIR.md',
  );

  it('the doc pins the repair mode (dry-run default), verification, and no runtime persistence', () => {
    expect(doc).toMatch(/--repair-portfolio-boarding-optional-relationships/);
    expect(doc).toMatch(/--commit-repair-portfolio-boarding-optional-relationships/);
    expect(doc).toMatch(/evidence.{0,3}document/i);
    expect(doc).toMatch(/no live app persistence/i);
  });

  it('the script exposes the repair mode, gates its commit flag, and adds the verification section', () => {
    const script = readFileSync(
      resolve(REPO_ROOT, 'scripts/phase122-lookup-repair.mjs'),
      'utf8',
    );
    expect(script).toMatch(/'--repair-portfolio-boarding-optional-relationships'/);
    expect(script).toMatch(/'--commit-repair-portfolio-boarding-optional-relationships'/);
    expect(script).toMatch(
      /--commit-repair-portfolio-boarding-optional-relationships has no effect without --repair-portfolio-boarding-optional-relationships/,
    );
    expect(script).toMatch(/PORTFOLIO_BOARDING_SCHEMA_VERIFICATION/);
    expect(script).toMatch(/safeForRuntimePersistenceCandidate/);
  });
});

// ---------------------------------------------------------------------------
// Phase 140L — live persistence adapter (disabled by default)
// ---------------------------------------------------------------------------

describe('Phase 140L — portfolio boarding live persistence adapter foundation exists', () => {
  const REQUIRED_140L_FILES: readonly string[] = [
    'docs/PHASE_140L_PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ADAPTER.md',
    'src/portfolioBoarding/portfolioLoanBoardingFeatureFlags.ts',
    'src/portfolioBoarding/portfolioLoanBoardingLivePersistence.ts',
    'src/portfolioBoarding/portfolioLoanBoardingLivePersistence.test.ts',
    'src/portfolioBoarding/resolvePortfolioLoanBoardingAdapter.ts',
    'src/shared/governance/portfolioBoardingLivePersistenceGovernance.test.ts',
    // Earlier-phase artifacts must remain pinned.
    'src/portfolioBoarding/derivePortfolioBoardingSchemaVerificationReport.ts',
    'docs/PHASE_140K_PORTFOLIO_BOARDING_SCHEMA_VERIFICATION_AND_OPTIONAL_RELATIONSHIP_REPAIR.md',
  ];
  for (const rel of REQUIRED_140L_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc('docs/PHASE_140L_PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ADAPTER.md');

  it('the doc pins disabled-by-default, schema-scoped, no-delete, no-route', () => {
    expect(doc).toMatch(/disabled by default/i);
    expect(doc).toMatch(/PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED/);
    expect(doc).toMatch(/no UI route/i);
    expect(doc).toMatch(/no delete/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 140M-P — operator UI, document/evidence persistence, FDIC package
// ---------------------------------------------------------------------------

describe('Phase 140M-P — portfolio boarding operator workflow + FDIC package exist', () => {
  const REQUIRED_140MP_FILES: readonly string[] = [
    'docs/PHASE_140M_P_PORTFOLIO_BOARDING_OPERATOR_UI_AND_FDIC_PACKAGE.md',
    // Pure logic + hooks
    'src/portfolioBoarding/portfolioBoardingAccess.ts',
    'src/portfolioBoarding/portfolioLoanBoardingAuditTrail.ts',
    'src/portfolioBoarding/PortfolioBoardingPackageExportModel.ts',
    'src/portfolioBoarding/loadPortfolioBoardedLoansForWorkspace.ts',
    'src/portfolioBoarding/portfolioBoardedLoanCommandCenterRows.ts',
    'src/portfolioBoarding/portfolioBoardingListRows.ts',
    'src/portfolioBoarding/usePortfolioLoanBoardingPersistence.ts',
    'src/portfolioBoarding/usePortfolioLoanDocumentPersistence.ts',
    // Operator UI
    'src/portfolioBoarding/PortfolioLoanBoardingWorkspace.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingList.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingSearchPanel.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingStatusBanner.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingDetail.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingCreateFlow.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingSaveBar.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingValidationSummary.tsx',
    // Document / evidence / examiner / audit
    'src/portfolioBoarding/PortfolioLoanBoardingDocumentManager.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingEvidenceManager.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingExaminerNotes.tsx',
    'src/portfolioBoarding/PortfolioLoanBoardingAuditPanel.tsx',
    // FDIC / board / portfolio package UI
    'src/portfolioBoarding/FdicBoardPackageWorkspace.tsx',
    'src/portfolioBoarding/FdicPackageSectionList.tsx',
    'src/portfolioBoarding/FdicEvidenceIndex.tsx',
    'src/portfolioBoarding/BoardLoanReviewPackagePreview.tsx',
    'src/portfolioBoarding/PortfolioManagerReviewPackagePreview.tsx',
    // Governance
    'src/shared/governance/portfolioBoardingRuntimeGovernance.test.ts',
    'src/shared/governance/portfolioBoardingPermissionGovernance.test.ts',
  ];
  for (const rel of REQUIRED_140MP_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc(
    'docs/PHASE_140M_P_PORTFOLIO_BOARDING_OPERATOR_UI_AND_FDIC_PACKAGE.md',
  );

  it('the doc pins the safety model: feature-flagged, adapter-gated, fail-closed, no fake data', () => {
    expect(doc).toMatch(/feature[- ]flag/i);
    expect(doc).toMatch(/adapter[- ]gated/i);
    expect(doc).toMatch(/fail[- ]closed/i);
    expect(doc).toMatch(/no fake data/i);
    expect(doc).toMatch(/no permission widening/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 140Q — final certification + release readiness
// ---------------------------------------------------------------------------

describe('Phase 140Q — portfolio boarding final certification + runtime gate exist', () => {
  const REQUIRED_140Q_FILES: readonly string[] = [
    'docs/PHASE_140Q_PORTFOLIO_BOARDING_FINAL_CERTIFICATION_AND_RELEASE_READINESS.md',
    'src/portfolioBoarding/portfolioBoardingRuntimeSchemaGate.ts',
    'src/portfolioBoarding/portfolioLoanBoardingLiveDataverseTransport.ts',
    'src/portfolioBoarding/resolvePortfolioLoanBoardingPersistenceAdapter.ts',
    'src/portfolioBoarding/portfolioBoardingFeatureFlags.ts',
    'src/portfolioBoarding/portfolioLoanBoardingEndToEndSmoke.test.tsx',
    'src/shared/governance/portfolioBoardingFinalCertification.test.ts',
    // Earlier-phase artifacts must remain pinned.
    'docs/PHASE_140M_P_PORTFOLIO_BOARDING_OPERATOR_UI_AND_FDIC_PACKAGE.md',
    'docs/PHASE_140L_PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ADAPTER.md',
  ];
  for (const rel of REQUIRED_140Q_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const cert = readDoc(
    'docs/PHASE_140Q_PORTFOLIO_BOARDING_FINAL_CERTIFICATION_AND_RELEASE_READINESS.md',
  );

  it('the cert doc pins disabled-by-default writes, schema scoping, no delete, rollback', () => {
    expect(cert).toMatch(/disabled by default/i);
    expect(cert).toMatch(/cr664_portfolioboardedloan/);
    expect(cert).toMatch(/no delete/i);
    expect(cert).toMatch(/Rollback plan/i);
    expect(cert).toMatch(/does NOT enable runtime writes/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 141A — annual portfolio review + financial collection
// ---------------------------------------------------------------------------

describe('Phase 141A — annual portfolio review command center exists', () => {
  const REQUIRED_141A_FILES: readonly string[] = [
    'docs/PHASE_141A_ANNUAL_PORTFOLIO_REVIEW_AND_FINANCIAL_COLLECTION.md',
    'src/shared/annualReview/annualReviewTypes.ts',
    'src/shared/annualReview/annualReviewRequirementCatalog.ts',
    'src/shared/annualReview/deriveAnnualReviewCollectionPlan.ts',
    'src/shared/annualReview/deriveAnnualReviewReadiness.ts',
    'src/shared/annualReview/deriveBorrowerSoundnessAssessment.ts',
    'src/shared/annualReview/deriveBorrowerFinancialRequestPackage.ts',
    'src/shared/annualReview/annualReviewTaskEngine.ts',
    'src/portfolioAnnualReview/AnnualPortfolioReviewCommandCenter.tsx',
    'src/portfolioAnnualReview/BorrowerFinancialRequestPreview.tsx',
    'src/portfolioAnnualReview/AnnualReviewTaskBoard.tsx',
    'src/shared/governance/annualReviewGovernance.test.ts',
  ];
  for (const rel of REQUIRED_141A_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc(
    'docs/PHASE_141A_ANNUAL_PORTFOLIO_REVIEW_AND_FINANCIAL_COLLECTION.md',
  );

  it('the doc pins fail-closed readiness, no outreach, preview-only, no fake data', () => {
    expect(doc).toMatch(/fail[- ]closed/i);
    expect(doc).toMatch(/no (automatic )?borrower (email|outreach)/i);
    expect(doc).toMatch(/preview/i);
    expect(doc).toMatch(/no fake data/i);
    expect(doc).toMatch(/insufficient_information/);
  });
});

// ---------------------------------------------------------------------------
// Phase 141B-H — CRM relationship master
// ---------------------------------------------------------------------------

describe('Phase 141B-H — CRM relationship master exists', () => {
  const REQUIRED_141BH_FILES: readonly string[] = [
    'docs/PHASE_141B_H_CRM_RELATIONSHIP_MASTER.md',
    'src/shared/crm/crmTypes.ts',
    'src/shared/crm/deriveCrmReadiness.ts',
    'src/shared/crm/deriveCrmRelationshipNetworkSnapshot.ts',
    'src/shared/crm/deriveCrmContactTasks.ts',
    'src/shared/crm/resolveBorrowerRequestRecipient.ts',
    'src/shared/crm/crmIntegrationSeams.ts',
    'src/shared/crm/crmDataverseSchemaPlan.ts',
    'src/crm/crmPersistenceTypes.ts',
    'src/crm/crmPersistenceAdapter.ts',
    'src/crm/CrmRelationshipCommandCenter.tsx',
    'src/crm/CrmRelationshipNetworkPanel.tsx',
    'src/crm/CrmContactTaskBoard.tsx',
    'src/shared/governance/crmGovernance.test.ts',
  ];
  for (const rel of REQUIRED_141BH_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc('docs/PHASE_141B_H_CRM_RELATIONSHIP_MASTER.md');

  it('the doc pins the safety model: no outreach, fail-closed, no live writes, no fake data', () => {
    expect(doc).toMatch(/no (automatic )?borrower outreach/i);
    expect(doc).toMatch(/do-not-contact/i);
    expect(doc).toMatch(/fail[- ]closed/i);
    expect(doc).toMatch(/no live CRM writes/i);
    expect(doc).toMatch(/no fake (customer|data)/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 141J-K — CRM Dataverse schema inspection + guarded seed
// ---------------------------------------------------------------------------

describe('Phase 141J-K — CRM Dataverse schema inspection + seed foundation exists', () => {
  const REQUIRED_141JK_FILES: readonly string[] = [
    'docs/PHASE_141J_K_CRM_DATAVERSE_SCHEMA_INSPECTION_AND_SEED.md',
    'src/crm/crmDataverseSchemaPlan.ts',
    'src/crm/crmDataverseSchemaPlan.test.ts',
    'src/crm/deriveCrmSchemaInspectionReport.ts',
    'src/crm/deriveCrmSchemaInspectionReport.test.ts',
    'src/crm/deriveCrmSchemaSeedPlan.ts',
    'src/crm/deriveCrmSchemaSeedPlan.test.ts',
  ];
  for (const rel of REQUIRED_141JK_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc('docs/PHASE_141J_K_CRM_DATAVERSE_SCHEMA_INSPECTION_AND_SEED.md');

  it('the doc pins the inspect → plan → dry-run → commit → verify workflow', () => {
    expect(doc).toMatch(/--inspect-crm-schema/);
    expect(doc).toMatch(/--plan-crm-schema/);
    expect(doc).toMatch(/--seed-crm-schema/);
    expect(doc).toMatch(/--commit-seed-crm-schema/);
  });

  it('the doc pins the safety model: no app-runtime CRM writes, no outreach, dry-run default', () => {
    expect(doc).toMatch(/no app[- ]runtime CRM writes/i);
    expect(doc).toMatch(/dry[- ]run/i);
    expect(doc).toMatch(/no borrower outreach/i);
    expect(doc).toMatch(/no fake (customer|data|CRM data)/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 141L — CRM live persistence adapter (disabled by default)
// ---------------------------------------------------------------------------

describe('Phase 141L — CRM live persistence adapter foundation exists', () => {
  const REQUIRED_141L_FILES: readonly string[] = [
    'docs/PHASE_141L_CRM_LIVE_PERSISTENCE_ADAPTER.md',
    'src/crm/crmFeatureFlags.ts',
    'src/crm/crmDataverseMapper.ts',
    'src/crm/crmLiveDataverseTransport.ts',
    'src/crm/crmLiveDataverseAdapter.ts',
    'src/crm/resolveCrmPersistenceAdapter.ts',
    'src/crm/crmRuntimeSchemaGate.ts',
    'src/crm/crmPersistenceTypes.ts',
    'src/crm/crmPersistenceAdapter.ts',
    'src/shared/governance/crmPersistenceGovernance.test.ts',
  ];
  for (const rel of REQUIRED_141L_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  const doc = readDoc('docs/PHASE_141L_CRM_LIVE_PERSISTENCE_ADAPTER.md');

  it('the doc pins disabled-by-default, no deletes, no outreach, table allow-list', () => {
    expect(doc).toMatch(/disabled by default/i);
    expect(doc).toMatch(/No deletes/i);
    expect(doc).toMatch(/no borrower outreach/i);
    expect(doc).toMatch(/allow-list/i);
    expect(doc).toMatch(/No app-runtime CRM writes/i);
  });
});
