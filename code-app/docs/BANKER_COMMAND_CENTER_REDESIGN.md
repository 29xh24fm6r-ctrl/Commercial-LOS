# Banker Operating Command Center — status board → action cockpit

Branch: `feature/banker-command-center` (from `integration/all-work-20260630c`). Branch only; not pushed.

## The reframe
The Command Center used to render eight dense paragraphs, each describing a *subsystem's governance
state* ("CRM relationship intelligence / OPERATIONAL / Active / …relationship context are available…
Next: review CRM intelligence before advancing deal work."). Accurate, but a **status board for the
builder**. It's now an **action board for the banker**: what needs me, where my pipeline sits, and
the governance truth demoted to quiet pills.

## What changed
- **New work model** `src/banker/bankerCommandCenterWorkModel.ts` (pure, tested): `deriveBankerWorkQueue`
  turns the KPI rollup the dashboard already computes into a priority queue (urgent → overdue tasks →
  due diligence → stale → closing-soon → open tasks), most-urgent first, only non-zero buckets, each
  routing to a real existing tab. `deriveBankerPipelineByStage` groups active deals by their **actual**
  stage value (no faked distribution; no-stage → "Unstaged"). Fabricates nothing.
- **Redesigned component** `BankerOperatingCommandCenter.tsx` (now data-driven via props from the shell):
  1. **What needs you** (the visual lead) — actionable rows, big tabular count, one next-action each;
     honest "No urgent items — you're clear." empty state.
  2. **Pipeline at a glance** — total active + amount + the honest by-stage breakdown.
  3. **System status** (demoted) — every domain from the old cards as a compact pill (label + value,
     state-tinted) with the **full old summary in a tooltip**; plus the email transport pill.
- **Shell wiring**: `BankerShell` now passes `kpis` / `deals` / `loading` / `onSelectTab` into the
  dashboard's Command Center (reusing the existing `deriveBankerPersonalActivity` rollup + work-queue
  deals — no new data subsystem).

## Governance honesty — demoted, not deleted (self-critique)
Every fact from the old seven/eight cards is still here, just not the headline:
- crm, loan-workflow, daily-actions, **new-deal (Create gated)**, **document-readiness (Generation
  gated)**, **borrower-communications (Send gated)**, **crm-writeback (Read-only)**, **portfolio-handoff
  (Boarding persistence gated)**, and **email (DRY_RUN)** all render as pills carrying their honest
  value + a tooltip with the full summary. A gated live-write domain **still never reads "enabled"** —
  pinned by the rewritten component test (each gated pill's value is asserted and matched against
  `/\benabled\b/i` = none). The model `bankerOperatingCommandCenterModel.ts` is **unchanged**, so the
  cross-panel launch-coherence guard still reads it and stays green — nothing made to *look* enabled
  that is gated.
- **No fabricated work or metrics**: every count is a real KPI/deal value; all-zero is the honest
  "you're clear" state.
- **No new write paths / no arming**: the component reads + navigates only (the no-write-primitive
  source scan is preserved in both the component test and phase232). `verify:launch-evidence` stays
  honest-red.

## Intaglio v3 polish
Floating cards (`shadow.elevated`, the KPI-card token), **bright text** (`palette.text` headings/labels
— the dim-text bug is gone on this surface), tabular figures (`cc-tnum`) on all counts, and exactly
**one Seal-Red accent** — the `urgent` work row (tone `urgent` → `palette.accent`); attention is amber,
info is Treasury-Blue. Single-primary per row (one action each). Active-voice banker copy ("2 documents
need due diligence", "Review now"), not subsystem prose.

### Screenshot-review intent (eyes-on, post-deploy)
Headless here, so this was verified analytically. On a dev deploy, check on real pixels: the lead
"What needs you" rows read as the obvious focus over the quiet status strip; the urgent row's Seal-Red
count is the only accent; the pill strip is legible-but-subordinate on the dark shell; and at laptop
width the two-col (pipeline + status) collapses cleanly. The work-queue ordering should match the
banker's instinct (urgent first).

## Gate
`tsc 0 · vitest 10,589 passed / 2 skipped · lint 0 · audit:reachability 0 · build 0 ·
verify:launch-evidence exit 1 (honest-red, by design)`. New tests: work model 8, component 12.
Branch not pushed.
