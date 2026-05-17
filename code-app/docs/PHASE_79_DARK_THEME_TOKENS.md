# Phase 79 — Dark Theme Tokens + Accessibility Theme Foundation

## Goal

Establish a CSS-variable-based theme token foundation that supports dark mode (auto via `prefers-color-scheme: dark` and explicit via `:root[data-theme="dark"]`) across the entire operational surface — without changing any product workflow, write surface, schema, or role permission.

## Why this phase

The Microsoft Vibe scope expects accessibility settings, multiple color themes, high-contrast / color-blind-safe support, and WCAG-conscious visual treatment. Phase 74 closed the largest a11y semantics gap (live-region outcomes, `aria-required` linkage, `Badge` `aria-label` forwarding). The remaining a11y axis named there was theme support: every banker-visible color was a hex literal in `src/shared/theme.ts` and a handful of utility classes in `src/index.css`. Phase 79 swaps hex literals for CSS variables in one place and adds the dark-mode declarations alongside the light ones, so the entire surface follows OS theme preference automatically.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` §1.28 (Accessibility / theme support) — current-state advanced from "Partially operational (advanced by Phase 74)" to "Partially operational (advanced by Phase 74 + Phase 79)". The Gap / Blocker / Safe-next-step fields now point at user-selectable theme persistence, high-contrast palette, color-blind-safe palette, and the formal WCAG contrast-ratio static test as the remaining work.

## Token strategy

Two layers:

### 1. CSS variables in `src/index.css`

A single `--cc-*` namespace covers every banker-visible color the app paints:

- Surfaces: `--cc-page-bg`, `--cc-surface`, `--cc-surface-alt`, `--cc-surface-subtle`
- Borders: `--cc-border`, `--cc-border-strong`, `--cc-divider`
- Text: `--cc-text`, `--cc-text-muted`, `--cc-text-subtle`, `--cc-text-inverse`, `--cc-link`
- Primary (navy brand): `--cc-primary`, `--cc-primary-dim`, `--cc-primary-bg`, `--cc-primary-fg`
- Status — blocked (red): `--cc-blocked`, `--cc-blocked-bg`, `--cc-blocked-fg`
- Status — at-risk (amber): `--cc-at-risk`, `--cc-at-risk-bg`, `--cc-at-risk-fg`
- Status — clear (green): `--cc-clear`, `--cc-clear-bg`, `--cc-clear-fg`
- Status — neutral (gray): `--cc-neutral`, `--cc-neutral-bg`, `--cc-neutral-fg`
- Status — info (blue): `--cc-info`, `--cc-info-bg`, `--cc-info-fg`
- Focus ring: `--cc-focus-ring`

Each variable is declared in three places:

- `:root` — light values + `color-scheme: light`.
- `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` — dark values + `color-scheme: dark`. The `:not([data-theme='light'])` clause lets a future explicit light-override beat OS dark preference.
- `:root[data-theme='dark']` — same dark values, applied unconditionally when the attribute is set. Future settings UI will toggle this attribute.

The dark palette **preserves** the semantic color hierarchy: red still red, amber still amber, green still green. Hues are kept; lightness and saturation are tuned for legibility on dark surfaces (e.g. blocked stays red but lifts from `#b22c3a` → `#e87b86` on dark backgrounds; the dark-bg tint shifts from `#fcebed` → `#3a1820` so a "blocked" badge still reads as red-on-dark-red, not red-on-light-red).

### 2. `palette` JS export references the variables

`src/shared/theme.ts` `palette` was previously a record of hex literals consumed by inline styles across every card / modal / row in the app. Phase 79 changes the values from `'#1a1f2e'` to `'var(--cc-text)'` (etc.). The shape and the import path are unchanged, so existing consumers like `style={{ color: palette.text }}` continue to compile and continue to render — but now the browser resolves `var(--cc-text)` against whichever theme is active. **Zero consumer change** was needed to support dark mode beyond this one indirection edit.

`severityPalette` inherits the indirection automatically because it composes `palette.blockedBg` / `palette.atRiskFg` etc. — `Badge` and `StatusDot` follow dark mode without any per-component work.

## Dark-mode behavior

- **Default mode.** Whatever the OS reports via `prefers-color-scheme`. macOS / Windows / iOS / Android all expose this; Power Apps embedding does too as of recent host versions. Bankers do not have to do anything.
- **Explicit override.** A future settings UI can set `document.documentElement.setAttribute('data-theme', 'dark')` (or `'light'`) to override the OS preference. Phase 79 does not ship that UI; the attribute is unset by default.
- **`color-scheme` declared.** Both the light and dark contexts declare `color-scheme` so native form controls (scrollbars, native `<input type="date">` chrome on browsers that style it, etc.) follow.

The theme follows the active context for **every** surface that imports `palette` from `src/shared/theme.ts` — that includes every banker workspace card, every governed-write modal, every analytics surface, every relationship-memory surface, and every release-readiness page. No card-specific work was required.

## Surfaces audited

The Phase 79 brief named the following primary surfaces. Each was verified to consume `palette.*` (and only `palette.*`) for its colors, which means the dark theme tokens flow through automatically:

- **Banker Workspace top-level** (Phase 4) — header chrome via `palette.surface` / `palette.border` / `palette.text` / `palette.primary`.
- **MyWorkQueue** (Phase 32+) — row backgrounds via `palette.surfaceAlt`, severity badges via `severityPalette`, error block via `palette.blockedBg`.
- **Deal Workspace cards:**
  - **DealDocuments** (Phase 22 / 51 / 55 / 70) — outstanding / received / reviewed groups, pending-review badge, Phase 70 review-task button. All flow through `palette` + `severityPalette`.
  - **DealTasks** (Phase 21) — complete-task modal + read-only mode.
  - **CreditMemo** (Phase 24 / 25 / 73) — memo card chrome, Phase 73 consistency review block, freshness block.
  - **BorrowerCommunication** (Phase 23 / 66 / 67) — local-only banner, Outlook handoff buttons, packet modal.
  - **ActivityTimeline** (Phase 25 / 58 / 72) — severity dot, Phase 72 "New" badge, error block.
  - **RelationshipContext** (Phase 77 / 78) — sibling deal pills, attention badges, Draft relationship note button.
- **Banker analytics:**
  - **PersonalActivitySummary** (Phase 75) — stat tiles, gap-hint italics, disclaimer dashed border.
  - **RelationshipMemory** (Phase 76 / 78) — client rows, deal pills, attention badges, Draft relationship note button.
- **Manager / team analytics:**
  - **ManagerActivitySummary** (Phase 71) — stage-aging + pipeline-mix stat tiles.
  - **TeamBankerActivityBreakdown** (Phase 71) — per-banker table, at-risk badge cell.
- **RelationshipNoteDraftModal** (Phase 78) — preview pane, copy outcome, local-only banner.

No surface required a code change. The Phase 79 work is exactly: edit `src/index.css` + edit `src/shared/theme.ts`. Every other file imports `palette` by reference and follows.

## Accessibility / theme fixes made

- **Hex literals retired from `src/shared/theme.ts`.** Every value in `palette` is now a `var(--cc-*)` reference. The `themeTokens.test.ts` static check pins this so future edits can't reintroduce hex literals to the JS palette.
- **Hex literals retired from utility classes in `src/index.css`.** The `.cc-row-hover`, `.cc-link`, `.cc-th`, `.cc-td` rules previously hardcoded light-mode hex values; they now consume `--cc-*` tokens and follow dark mode automatically.
- **Focus ring is now a token.** `--cc-focus-ring` is declared in both themes and consumed by `.cc-row-hover:focus-visible` and `.cc-link:focus-visible`. The dark-mode focus ring lightens to `#7faaf0` so it remains visible against the dark page background.
- **`color-scheme` declared.** Browsers that style native form chrome (scrollbars, native date pickers, etc.) follow the active theme.
- **Severity colors preserved across themes.** Status meaning never depends on color alone (badges always carry visible text); the dark-mode palette adjustments preserve the red/amber/green/blue semantic mapping so a banker switching from a light-mode desktop to a dark-mode laptop sees the same severities, just rendered against a dark background.

## Limitations

- **No user-selectable theme setting yet.** Phase 79 ships the token foundation; the brief explicitly gated the settings UI / persistence as a future phase. Today, the dark theme follows OS preference automatically; a future phase can wire a settings toggle that flips `[data-theme="dark"]` on the root element + persists the choice (either via a `cr664_userpreference` entity or a LOCAL_ONLY localStorage marker).
- **No high-contrast palette.** A `[data-theme="high-contrast"]` block is the obvious next layer using the same token vocabulary; Phase 79 does not ship it.
- **No color-blind-safe palette.** The current red/amber/green status colors would benefit from a deuteranopia / protanopia / tritanopia audit. The Phase 74 doc named this as a remaining gap; Phase 79 does not close it.
- **No automated WCAG contrast-ratio static test.** Each `--cc-*-fg` / `--cc-*-bg` pair was tuned by eye for legibility; a future phase could add a Vitest that parses `src/index.css`, computes relative luminance for each fg/bg pair declared under each theme block, and asserts WCAG AA at the appropriate text size.
- **No `<picture>`-style theme-conditional image swapping.** The app paints no raster images today, so this is a non-issue. If a logo asset arrives later, it will need a `prefers-color-scheme` `<picture>` fallback.
- **`shadow.card` / `shadow.rise` still use a fixed `rgba(20, 26, 42, ...)` tint.** Shadows on dark surfaces work reasonably because the tint is dark, but a future cleanup could move the shadow recipe into a `--cc-shadow-card` token so dark mode can use a different (e.g. deeper) shadow.
- **Modal overlay backgrounds.** Each modal sets `background: 'rgba(20, 26, 42, 0.45)'` inline — a dark semi-transparent layer that already works in both themes. The literal is acceptable for now; a future phase could tokenize it.
- **No user-typed test for the actual rendered dark theme.** jsdom does not run media queries the way a real browser does, so a programmatic `expect(window.getComputedStyle(...))` round-trip is not meaningful. The Phase 79 tests pin the source artifacts (CSS variable declarations, palette indirection, `prefers-color-scheme` block presence, `color-scheme` declarations) instead. Manual smoke test via OS dark mode toggle is the human-side verification.

## Files created

- `src/shared/themeTokens.test.ts` — 11 static-source assertions: palette → `var(--cc-*)`, light/dark `--cc-*` declarations match, `prefers-color-scheme` block + `[data-theme="dark"]` block both declare every identifier, `color-scheme` declared in both contexts, utility classes use only tokens, severityPalette inherits indirection, no new `GOVERNED_WRITES` or `LOCAL_ONLY_FLOWS` entry was added.
- `docs/PHASE_79_DARK_THEME_TOKENS.md` — this document.

## Files modified

- `src/index.css` — full rewrite around the `--cc-*` token namespace; added light `:root` block, dark `@media (prefers-color-scheme: dark)` block (with `:not([data-theme='light'])` guard), explicit `:root[data-theme='dark']` override; utility classes (`.cc-row-hover`, `.cc-link`, `.cc-th`, `.cc-td`) updated to consume the tokens.
- `src/shared/theme.ts` — `palette` values changed from hex literals to `var(--cc-*)` references. `severityPalette` continues to compose `palette.*` and inherits the indirection.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.28 advanced.

## Token strategy implemented

- 25 light tokens declared in `:root` (every value used by `palette`) plus `--cc-focus-ring` for utility-class outline color.
- Same 25 + 1 declared in the `prefers-color-scheme: dark` media query block (gated on `:not([data-theme='light'])`).
- Same set declared in the explicit `:root[data-theme='dark']` override block.
- `color-scheme: light` in `:root`; `color-scheme: dark` in both dark contexts.
- `palette` JS export: 25 entries, all `var(--cc-*)` references; statically pinned.
- `severityPalette`: 5 severities × 4 slots = 20 values, all inherit token indirection via `palette` composition.

## Remaining theme gaps

1. **User-selectable theme setting** — settings UI + a `[data-theme]` attribute writer. Persistence path TBD: schema (`cr664_userpreference`) vs LOCAL_ONLY (localStorage).
2. **High-contrast palette** — a `[data-theme="high-contrast"]` block declaring higher-contrast values for users who need them. Same token surface; new palette block.
3. **Color-blind-safe palette** — audit red/amber/green for deuteranopia / protanopia / tritanopia. If the existing severity hues fail, introduce a `[data-theme="cb-safe"]` block or rework the canonical light/dark palettes.
4. **Formal WCAG contrast-ratio static test** — Vitest that parses `src/index.css`, extracts each `--cc-*-fg` / `--cc-*-bg` pair, computes WCAG luminance contrast, asserts AA at 4.5:1 for small text and 3:1 for large text.
5. **Formal screen-reader path audit** — NVDA / JAWS / VoiceOver runs against the operational surfaces. Out of scope for any single in-repo phase; needs a human pass.
6. **`shadow` tokens** — move `shadow.card` / `shadow.rise` into `--cc-shadow-*` so dark mode can use a different shadow recipe.
7. **Modal overlay token** — move the hardcoded `rgba(20, 26, 42, 0.45)` overlay literal into `--cc-overlay-bg`.

## Confirmation: no writes / schema / workflow changes

- **No new write surface.** No `GOVERNED_WRITES` entry was added. The Phase 79 test asserts the negative explicitly (`theme-preference-save` and `user-preference-save` are NOT in `GOVERNED_WRITES`).
- **No new `LOCAL_ONLY_FLOWS` entry.** Phase 79 does not persist a theme preference anywhere; the dark theme follows OS preference automatically. The test asserts this explicitly.
- **No schema change.** No new Dataverse table or column.
- **No role/permission change.** Every banker / manager / team / executive / admin surface continues to render the same content with the same access rules; only the visual presentation can vary based on OS theme.
- **No workflow behavior change.** Every button, every modal, every governed write, every signal, every disclaimer renders identically (modulo color). Phase 79 is purely visual.
- **Conservative-copy guard remains green.** The Phase 45 phrase guard tests continue to pass without any allowlist addition.

## Test + build counts (at acceptance)

- Full suite: **1303 / 1303 tests passing** (Phase 78 baseline 1292 + Phase 79's 11 theme-token assertions).
- `tsc -b && vite build`: clean.
- CSS bundle: light + dark token declarations + utility classes total ~3.79 kB (gzip ~1.19 kB). Was ~1.26 kB before Phase 79; the +2.5 kB delta is the dark-theme token declarations.

## Recommended next phase

The user named two natural next steps after Phase 79:

1. **Deal Autopilot Lite — Next Best Actions Panel.** A deterministic per-deal panel that surfaces 1–3 next-step suggestions derived from existing signals (overdue tasks, stale documents, pending reviews, closing-soon dates). No AI; pure derivation; no new writes (each suggestion links to an existing action surface). Closer to "cool Vibe"; closer to the AI-autopilot tier the Vibe doc envisions, but ships only the deterministic floor.
2. **Manager / Team Deal Workspace Relationship Context.** Phase 77 sibling on the manager and team Deal Workspaces using their already-authorized deal lists. Pure reuse of the Phase 76 / 77 derivation; no new product capability beyond extending the existing surface to more roles.

Of the two, **Deal Autopilot Lite** advances the Vibe capability map more (new functional surface) and re-uses the relationship-memory work we just finished as one of its input signals. **Manager / Team cross-deal context** is lower-risk and would close out the relationship-memory feature parity across roles.

A third possibility is to continue closing remaining Phase 79 a11y gaps in order: **high-contrast palette** (token foundation already in place, just declare a third block), or **WCAG contrast-ratio static test** (pure Vitest, no rendering work). Either would be a small in-repo phase.
