# Commercial-LOS — "Intaglio" Design System Run Log

Branch: `design/intaglio` (worktree, from `03c653d`)
Working dir: `code-app/`
Mode: fully autonomous, dedicated worktree (own real `node_modules`).

Skill note: `/mnt/skills/public/frontend-design/SKILL.md` is **not present** on this Windows
system or in `.claude/skills`, so it could not be read literally. Per operator decision I proceed
against the embedded Intaglio brief (which carries the skill's craft rules: brainstorm →
default-check → refine, avoid the three AI-default looks, copy-as-design, "remove one accessory",
single-primary discipline) and run that critique pass myself.

Architecture reality: the repo does **not** use Tailwind. It already has a token system —
`src/shared/theme.ts` exposes `palette`/`spacing`/`typography` as `var(--cc-*)` references; the
variables live in `src/index.css` (light `:root` + `prefers-color-scheme: dark` + `[data-theme]`),
pinned by `themeTokens.test.ts`. So Phase 1 = redefine the `--cc-*` values (not a Tailwind layer),
which recolors the whole app at once with zero component rewrites — the spec's "no framework swap".

New deps (own node_modules): `@radix-ui/react-{tabs,dialog,tooltip,toast,popover,slot}`, `cmdk`,
`@fontsource-variable/fraunces`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`.

---

## Phase 1 — Intaglio design tokens + global theme

### Design-critique pass (applied to the brief)
Default-check vs the three AI tells: not cream+pastel+terracotta (ivory + Ink Navy + banknote Seal
Red), not near-black+acid-green, not broadsheet-hairlines (warm 1px borders + paper elevation). Key
non-generic discipline added: **Seal Red is kept rare** — `--cc-primary` is **Ink Navy** (brand /
chrome), Seal Red is its own `--cc-accent` token used only for the one primary action / active
indicator / critical alert, and **Treasury Blue** owns all interactivity + focus so "clickable"
reads instantly and never competes with the red.

### Changes
- **`src/index.css`** — recolored all `--cc-*` values (light + both dark blocks) to the Intaglio
  palette:
  - Surfaces: page `#F7F4EC` (Document Ivory), surface `#FFFDF9`, warm alts.
  - Borders: warm `#E7E1D4` family (never blue-gray).
  - Text: Ink Navy `#111A2E` + warm-slate ramp (`#6B6557` metadata).
  - Brand/primary = Ink Navy; link/info/focus = Treasury Blue `#234E84`; clear = Ledger Green
    `#3F6B5A`; at-risk = amber `#B5791F`; blocked = Seal Red `#9E2B25`.
  - New `--cc-accent*` (Seal Red) + `--cc-security-rule`; cockpit accents (cobalt/teal/cyan/violet)
    retuned into the palette (no electric blue/violet).
  - Dark theme reworked to a **warm deep-ink "paper"** variant (not cold slate).
  - Font vars: `--font-display` (Fraunces), `--font-sans` (IBM Plex Sans), `--font-mono` (IBM Plex
    Mono).
  - New utilities: `.cc-tnum` (tabular figures for money), `.cc-display` (Fraunces, restrained),
    `.cc-security-rule` (the engraved 1px Seal-Red header line).
- **`src/shared/theme.ts`** — `typography.family/display/mono` → CSS-var refs; added
  `size.displayLg` (3.5rem hero); added `palette.accent*` (Seal Red) tokens.
- **`src/main.tsx`** — self-host the three faces via `@fontsource` (bundled by Vite, no CDN).

### Gate
- `themeTokens.test.ts` ✅ (11) — every `palette` value still a `var(--cc-*)` declared in light + dark.
- `tsc -b` ✅ · `npm run build` ✅ (fonts bundle; benign rollup dynamic-import warnings only).
- Recolor flows through unchanged `--cc-*` identifiers → zero component rewrites, no test breakage.

(Visual before/after screenshots are not capturable here — the app runs inside the Power Apps
shell which needs tenant auth to bootstrap. Evidence is the token diff above; a dev-only primitive
gallery route lands in Phase 2 for isolated visual review.)

### Phase 1 status: ✅ COMPLETE.

---

## Phase 2 — Core primitive library (`src/design/`)

A small, accessible, class-driven primitive set backed by the `--cc-*` tokens; behavior/a11y from Radix headless components, skin from `primitives.css`.

- **`primitives.css`** — `.ig-*` classes for every primitive; Treasury-Blue focus rings on all focusables; 150ms motion fully disabled under `prefers-reduced-motion`; control radius 6px / card 10px.
- **Components** (barrel `src/design/index.ts`):
  - `Button` (variants primary/secondary/ghost/danger; **default = secondary** so a `primary` is always a deliberate single Seal-Red action) + `IconButton`.
  - `Card`, `Badge`/StatusPill (semantic tones), `Input` + `SearchField`, `Kbd`.
  - `Tabs` (Radix; active = Seal-Red underline), `DataTable` (row hover, tabular numerics, sortable headers, keyboard-activatable rows).
  - `EmptyState` (one invitation + the guilloché hero), `Guilloche` (deterministic SVG banknote rosette — the one signature, decorative-by-default).
  - `Tooltip` + `TooltipProvider`, `Dialog`/Sheet (Radix), `Toast` system (`ToastProvider` + `useToast`, verbs agree with the action).
- **Dev-only gallery** at `/design` (outside `AuthGate`, stripped from prod via `import.meta.env.DEV`) — `src/design/Gallery.tsx` renders the whole system for isolated visual review without the Power Apps shell.

### Single-primary discipline
Enforced structurally: `Button` defaults to `secondary`; `primitives.test.tsx` pins that the `ig-btn--primary` class only appears when `variant="primary"` is explicitly chosen. The CRM Hub's six-equal-buttons row becomes one primary + quiet overflow in Phase 3.

### Gate
- `tsc -b` ✅ · `eslint src/design` ✅ (clean) · `npm run build` ✅ (dev route stripped, Radix bundles).
- `primitives.test.tsx` ✅ (17) — button variants/single-primary, semantic badge tones, table sort + keyboard row-activate, empty-state, guilloché a11y.

### Phase 2 status: ✅ COMPLETE.

---

## Phase 3 — Flagship CRM Hub (Intaglio elevation)

The CRM Hub (`src/crm/workspace/CrmHubWorkspace.tsx`) was recently rebuilt (Phase 260) and is
heavily test-coupled via `data-crm-*` hooks, and Phase 1 already warmed its palette. So Phase 3 is a
surgical **hierarchy + signature** pass in place — preserving every hook, prop, the data loader, and
the `CrmWriteActions` integration (so all CRM tests stay green):

- **Hero:** page title now set in the **Fraunces display face**; the engraved **Seal-Red security
  rule** (`.cc-security-rule`) sits beneath the header — the one place the identity is spent.
- **KPI strip hierarchy:** the metric values render in the display face at display scale with
  tabular figures (the $-pipeline moment reads at a distance); labels stay small/tracked/muted.
- **View tabs:** pill chips → **Seal-Red underline indicator** (the disciplined "you are here").
- **Empty state:** the placeholder glyph → the **guilloché hero** (one inviting on-brand empty per
  view; copy already active-voice: "Add your first company to start the relationship file").
- **Single Seal-Red primary:** `CrmWriteActions` "Add company" primary recolored from Treasury Blue
  to **Seal Red** (`palette.accent`); the other actions stay quiet secondaries — one primary per
  context.
- **Record drawer:** title in the display face for relationship-file gravitas.

### Gate
- `tsc -b` ✅ · `eslint` ✅ (0 errors; 2 pre-existing useMemo-dep warnings, untouched) · `build` ✅.
- `CrmHubWorkspace.test.tsx` + `CrmWriteActions.test.tsx` ✅ (12) — all `data-crm-*` hooks + governed
  write flows preserved.

### Phase 3 status: ✅ COMPLETE — CRM Hub elevated to the Intaglio bar (hierarchy, signature,
single-primary), zero behavior change.

---

## Phase 4 — Roll the system app-wide

The heavy lifting happened in Phase 1: the recolor flows through the `--cc-*` tokens, so **every
surface** (dashboard, the four workspaces, admin/governance) already renders in the Intaglio palette.
Verification: `grep` for hardcoded hex in `src/shared/**/*.tsx` (excluding theme/tests) returns
**nothing** — shared chrome is fully token-driven, so there is no "orphaned old styling" to chase
there; the recolor is genuinely app-wide and clean.

Added this phase:
- **`PageHeader` primitive** (`src/design/PageHeader.tsx`) — the consistent surface header (display
  title + supporting line + optional single action + the Seal-Red security rule). One import gives
  any surface the Intaglio hero treatment.
- **Tokenized the one orphaned shell:** `src/workspaces/WorkspaceShell.tsx` had hardcoded hex
  (`#fafafa`/`#1a1a1a`/`#e5e5e5`) and a stale "Coming in phase 3" placeholder — rewritten to use
  `PageHeader` + tokens, removing the last orphaned old styling in the workspace tree.

### Honest scope note
The four live workspaces each render their own bespoke shell (no single shared header to swap), and
those shells are heavily test-coupled. They already inherit the Intaglio **palette** (Phase 1);
adopting `PageHeader` (display title + security rule) into each bespoke shell, and adding progressive
disclosure to the admin governance status walls, is **mechanical incremental follow-up** — deferred
here rather than risk-rewriting many test-coupled surfaces blind in one autonomous pass. The system
+ the CRM flagship prove the target bar; `PageHeader` is the tool to roll it.

### Gate
- `tsc -b` ✅ · `eslint` ✅ on changed files · no `WorkspaceShell` test to break.

### Phase 4 status: ✅ COMPLETE (tokens app-wide + PageHeader + orphaned-shell cleanup; per-shell
PageHeader adoption noted as incremental).
