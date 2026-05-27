# Phase 125C — Premium Deal Cockpit Visual Upgrade

**Status:** **Shipped.** Visual-only upgrade of the Banker Deal
Workspace cockpit landed in Phase 125B. Phase 125C is the
"premium polish" pass: richer accent palette (cobalt / teal /
cyan / violet) added to the theme, a horizontal stage
progression rail, a layered cobalt glow on the navy hero band,
inline-SVG severity glyphs on signal rows, a cobalt
liquid-glass overlay behind the right-rail attention column,
and a refreshed priority-stripe color system on the
DealAutopilotPanel. **No Dataverse schema changes. No new
loaders. No new governed writes. No fake data. No fake AI /
predictive / ranking / approval-odds language. No email-lane
changes.** The Phase 125 hook hoist in `DealAutopilotPanel`
(the React error #310 fix) is preserved unchanged.

Phase 125D — charting / donut / readiness-meter modules — is
explicitly **out of scope** here. Phase 125C ships the
foundation layer (theme + structural pills + glyphs + glass
treatments) that Phase 125D will build on.

Related canonical sources:
- [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md) — the design-pass-first redesign Phase 125C polishes. Navy hero, glass metric strip, and two-column cockpit grid are preserved verbatim; Phase 125C adds depth, shape glyphs, and accent stripes inside that frame.
- [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — the foundational cockpit upgrade and the React error #310 hotfix. The `useSuggestionLedger()` hoist is preserved unchanged.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md), [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md), [PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md](PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md) — sibling phases sharing the premium-cockpit design language.
- [PHASE_79_THEME_TOKEN_FOUNDATION.md](PHASE_79_THEME_TOKEN_FOUNDATION.md) — the `--cc-*` CSS-variable system Phase 125C extends with the cobalt / teal / cyan / violet accent families and a layered `shadow.glow`.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants Phase 125C honors (zero changes to any communication-lane file).
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — the seeded `TEST — Deal Phase 121` whose sparse shape Phase 125C specifically still honors (custom-stage rail fallback case).

---

## 1. What changed

### 1.1 Theme — premium-cockpit accent palette

[src/index.css](../src/index.css) and
[src/shared/theme.ts](../src/shared/theme.ts) each gain four new
accent families (light + dark values):

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--cc-cobalt` / `palette.cobalt` | `#2563eb` | `#6da6f8` | Premium primary accent (current-stage pill, autopilot medium-priority stripe, hero cobalt glow). |
| `--cc-teal` / `palette.teal` | `#0d9488` | `#3bbfae` | Healthy / positive premium accent (autopilot low-priority stripe; reserved for Phase 125D readiness modules). |
| `--cc-cyan` / `palette.cyan` | `#0891b2` | `#46b9d6` | Reserved for Phase 125D data-viz / dashboard accents. |
| `--cc-violet` / `palette.violet` | `#7c3aed` | `#a78bfa` | Reserved for Phase 125D premium intelligence accents. |

Each family ships with `*-bg` and `*-fg` companions so badge /
chip / surface usage stays inside the existing
`severityPalette`-style triad pattern.

`shadow.glow` is added as a layered cobalt inset glow + soft
outer drop shadow:

```ts
glow: '0 0 0 1px rgba(96, 165, 250, 0.18) inset, 0 12px 28px rgba(15, 23, 42, 0.16)',
```

Light + dark + explicit `[data-theme="dark"]` blocks all
declare the new variables. The Phase 79 token discipline is
preserved (palette values flow through `var(--cc-*)`, never
literal hex outside the theme block).

### 1.2 DealStageProgressionCard — horizontal stage rail

[src/deals/DealStageProgressionCard.tsx](../src/deals/DealStageProgressionCard.tsx)
gains a new `StageRail` component that renders the canonical
non-terminal `STAGE_CATALOG` labels as a horizontal pill rail:

```
[1 Origination] [2 Screening] [3 Application] [4 Pricing]
  [5 Underwriting (current)] [6 Committee] [7 Documentation]
  [8 Closing] [9 Funded]
```

Tone discipline:
- **Past** stages (lower ordinal than current): clear-green pill — completed in the canonical order.
- **Current** stage: cobalt pill with a soft cobalt halo ring + bold weight + `aria-current="step"` for AT support.
- **Future** stages: muted neutral pill with a dashed border — not yet reached.
- **Custom stage** (live deal's stage doesn't match any canonical entry — the Phase 121 sparse seed exercises this with `TEST — Stage Phase 121`): all rail steps render with the `future` tone (no canonical landmark to highlight) and a small italic footnote reads `Current: <custom name> (custom stage — not in canonical sequence)`. No fabricated ordering, no AI estimate, no predicted close date.

Hook surface unchanged — the rail consumes the same `eligibility.currentStage` the card already computes.

### 1.3 DealHeader — layered cobalt glow

[src/deals/DealHeader.tsx](../src/deals/DealHeader.tsx) box-shadow
becomes:

```ts
boxShadow: `${shadow.glow}, ${shadow.hero}`,
```

The Phase 125B navy gradient + glass metric strip is preserved
verbatim. The new layered shadow gives the hero band a soft
cobalt edge glow + the Phase 123 deeper outer shadow, so the
hero reads as a more dimensional surface without becoming a
popover. No markup change.

### 1.4 DealBlockers + DealStageProgressionCard — inline-SVG severity glyphs

A new shared
[src/shared/SeverityGlyph.tsx](../src/shared/SeverityGlyph.tsx)
component replaces the small `StatusDot` chip on
[src/deals/DealBlockers.tsx](../src/deals/DealBlockers.tsx)
signal rows and
[src/deals/DealStageProgressionCard.tsx](../src/deals/DealStageProgressionCard.tsx)
reason rows. The glyph renders a shape-bearing SVG icon inside
a tinted halo:

- **blocked** → warning triangle (with exclamation)
- **atRisk** → alert circle (with exclamation)
- **info / clear / neutral** → info circle

Severity now reads at-a-glance from **shape**, not just color
— a non-trivial accessibility win for low-vision and
color-deficient bankers. The glyph is `aria-hidden`; the
surrounding row label carries the semantic content.

No new dependency (no icon font, no asset). Single inline SVG
per render.

### 1.5 BankerDealWorkspace — right-column liquid-glass overlay

[src/deals/BankerDealWorkspace.tsx](../src/deals/BankerDealWorkspace.tsx)
adds a subtle cobalt-tinted vertical gradient + rounded radius
+ small padding to the right column:

```ts
colRight: {
  ...flexColumn,
  background:
    'linear-gradient(180deg, rgba(96, 165, 250, 0.05) 0%, rgba(248, 250, 252, 0.0) 35%)',
  borderRadius: radius.md,
  padding: spacing.sm,
  paddingTop: 0,
},
```

This is intentionally a **column backdrop**, not a wrapper card
— each child card (DealBlockers, DealTasks, DealDocuments,
BorrowerCommunication, Teams handoffs) keeps its own framing.
The gradient gives the attention column dimensional contrast
against the page background so the right rail reads as a
distinct "premium attention surface" without amplifying any
single card.

### 1.6 DealAutopilotPanel — priority chip stripe refresh

[src/deals/DealAutopilotPanel.tsx](../src/deals/DealAutopilotPanel.tsx)
adds `PRIORITY_TO_STRIPE_TOKEN`:

| Priority | Stripe token | Color (light) |
| --- | --- | --- |
| `high` | `var(--cc-at-risk)` | amber-red |
| `medium` | `var(--cc-cobalt)` | cobalt |
| `low` | `var(--cc-teal)` | teal |

Applied as an inline `borderLeft: 3px solid <token>` on the
suggestion row. The existing `PRIORITY_TO_SEVERITY` mapping +
the priority badge text + the Basis line + the
`suggestedActionLabel` button are unchanged. The Phase 125
hook hoist (`useSuggestionLedger()` above every early return)
is preserved verbatim.

### 1.7 What did NOT change

- **No new Dataverse loaders, mutators, or governed writes.** Read-only visual phase.
- **No email-lane edits.** `Office365OutlookService` / `SendEmailV2` / `sendXEmail` callsites untouched. Phase 110 lock honored.
- **No derivation changes.** `deriveStageProgressionEligibility`, `deriveBlockers`, `deriveNextBestActions`, `deriveCreditMemoFreshness`, and every other pure-function derivation is unchanged.
- **No fake data, scores, approval odds, AI claims, or predictive close-date language.**
- **No `Card.tsx` change.** Shared primitive untouched so manager / team / executive workspaces don't shift before Phase 129.
- **Phase 125 hotfix** (`useSuggestionLedger()` hoist) preserved.
- **Phase 121 sparse-seed click path** still renders without crashing — covered by the existing `BankerDealWorkspace.test.tsx` regression + the new Phase 125C custom-stage rail case.

---

## 2. Test surface

### 2.1 New test files

[src/deals/phase125CCockpitVisuals.test.tsx](../src/deals/phase125CCockpitVisuals.test.tsx)
— component-level Phase 125C invariants (9 cases):

| Block | Cases |
| --- | --- |
| **SeverityGlyph** | 4 cases: blocked variant renders the warning-triangle SVG with `data-severity-glyph="blocked"`; atRisk variant renders an SVG circle with `data-severity-glyph="atRisk"`; info variant renders an SVG circle with `data-severity-glyph="info"`; every glyph is `aria-hidden`. |
| **DealStageProgressionCard StageRail** | 3 cases: canonical non-terminal stage labels render in the rail (`Origination` → `Funded`); current stage gets `aria-current="step"`; operator-named custom stage shows the italic "custom stage — not in canonical sequence" footnote AND the canonical landmarks still render. |
| **DealBlockers SignalRow** | 1 case: when at least one blocker fires (overdue task), every signal row carries a `[data-severity-glyph]` chip. |
| **DealAutopilotPanel** | 1 case: a high-priority suggestion's `<li>` carries `--cc-at-risk` in its inline style (the Phase 125C stripe). |

[src/deals/phase125CCockpitLayout.test.tsx](../src/deals/phase125CCockpitLayout.test.tsx)
— workspace-level Phase 125C invariant (1 case):

- **BankerDealWorkspace right-column liquid-glass overlay**: the "Attention and work surfaces" region's inline style contains both `linear-gradient` and the cobalt rgba tuple `96, 165, 250`.

Two separate files because the workspace-level test stubs
every child card as a sentinel, which conflicts with the
component-level tests that mount the real DealStageProgressionCard
/ DealBlockers / DealAutopilotPanel. Splitting keeps the mock
boundaries clean.

### 2.2 Existing tests — outcome

All 47 deals test files (655 tests) pass unchanged after the
Phase 125C edits — including the Phase 125 hotfix regression
cases, the Phase 125B integration tests, every per-card test,
every governance test, every honest-absence assertion. No
existing case had to be modified.

---

## 3. Acceptance criteria

- [x] Richer color palette added without overriding the semantic blocker / at-risk / clear / neutral / info families — implemented (cobalt / teal / cyan / violet are additive accents).
- [x] Stage progression reads as a sequence (rail), not just a status word — implemented with a horizontal pill rail + canonical landmarks.
- [x] Hero band feels dimensional, not flat — implemented via layered `shadow.glow + shadow.hero`.
- [x] Severity reads from shape, not just color (accessibility win) — implemented via `SeverityGlyph` inline-SVG glyphs.
- [x] Right column reads as a distinct premium attention surface — implemented via cobalt liquid-glass gradient backdrop.
- [x] Priority differentiation on autopilot rows beyond a single amber/red — implemented via cobalt (medium) / teal (low) / at-risk (high) stripes.
- [x] No fake data, scores, approval odds, AI claims, predictive close-date language — pinned by every Phase 125B / Phase 125 DOM-scan still passing and Phase 125C adding no such surface.
- [x] React hook order preserved (Phase 125 hotfix unaffected) — both Phase 125 regression cases still pass.
- [x] Phase 110 communication lock honored — `BankerDealWorkspace.tsx` static-source pins still pass.
- [x] All deals tests pass (47 files / 655 tests).
- [x] Build clean.

---

## 4. What Phase 125C explicitly does NOT do

Per the Phase 125 brief's split into 125C (foundation) and 125D
(charts / dashboards):

- **No donut / pie / ring charts.** Reserved for Phase 125D.
- **No readiness meters / progress bars / SVG empty-state illustrations beyond the severity glyph.** Reserved for Phase 125D.
- **No stage timeline animations.** The rail is static; banker reads landmarks at a glance. Animations are Phase 125D's brief.
- **No right-rail dashboard redesign.** Only a column backdrop is added; cards keep their Phase 125 framing.
- **No new Dataverse loaders / mutators / governed writes.**
- **No `Card.tsx` primitive change.**
- **No mobile-collapse breakpoint** beyond Phase 125B's `minmax(0, ...)` rebalance.

---

## 5. Verification

```bash
npm test -- --run src/deals/   # 47 files / 655 tests passed
npm run build                  # clean
```

Visual observation against the seeded `TEST — Deal Phase 121`
deal (after the next `pac code push`):

- Navy hero band renders with a soft cobalt edge glow on top of the Phase 123 outer shadow — slightly more presence than Phase 125B without any geometry change.
- Stage Progression Guard card shows a horizontal pill rail of canonical stages. Because the seeded stage is `TEST — Stage Phase 121`, the rail's pills all read in the muted "future" tone and a small italic footnote reads `Current: TEST — Stage Phase 121 (custom stage — not in canonical sequence)`.
- Deal Blockers signal rows lead with a shape-bearing severity glyph in a tinted halo (warning triangle / alert circle / info circle), not a small color dot.
- Right column ("Attention and work surfaces") reads as a single premium attention surface — a faint top-anchored cobalt wash, rounded corners — with each card keeping its own framing.
- Next Best Actions rows carry priority-coded left stripes: cobalt (medium), teal (low), or at-risk (high). The pill / badge text stays identical to Phase 80.
- The Phase 125 hook hoist still prevents React error #310 on the sparse seed.
- Banker Command Center → click deal → workspace renders with the new polish.

---

## 6. Cross-references

- [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md) — the design-pass-first redesign Phase 125C polishes.
- [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — foundational cockpit + hook-hoist hotfix.
- [PHASE_79_THEME_TOKEN_FOUNDATION.md](PHASE_79_THEME_TOKEN_FOUNDATION.md) — the `--cc-*` token system Phase 125C extends.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — email-lane lock Phase 125C honors.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) — sparse seed exercising the custom-stage rail fallback.
- `src/shared/theme.ts`, `src/index.css` — accent palette + glow shadow.
- `src/shared/SeverityGlyph.tsx` (new) — inline-SVG severity glyph.
- `src/deals/DealStageProgressionCard.tsx` — horizontal stage rail + glyph wiring.
- `src/deals/DealBlockers.tsx` — severity glyph on signal rows.
- `src/deals/DealAutopilotPanel.tsx` — priority-stripe color refresh (hook hoist preserved).
- `src/deals/DealHeader.tsx` — layered hero glow.
- `src/deals/BankerDealWorkspace.tsx` — right-column liquid-glass overlay.
- `src/deals/phase125CCockpitVisuals.test.tsx` (new) — 9 component-level invariants.
- `src/deals/phase125CCockpitLayout.test.tsx` (new) — 1 workspace-level invariant.
