# Intaglio v3 — targeted polish run log

Branch: `design/intaglio-v3` (worktree, from `integration/all-work-20260630b`)
Mode: fully autonomous, dedicated worktree. Polish only — minimal diffs; the working set
(hero composition, KPI live-card hierarchy, primary-button discipline, Ink-Navy shell) untouched.

---

## FIX 1 — Lift dark secondary/muted text contrast (tokens)

Raised the dark-theme text ramp in BOTH dark blocks (`prefers-color-scheme: dark` + `[data-theme='dark']`).
Contrast verified against the real card surface `--cc-surface #16223a` (relative luminance ≈ 0.0162):

| token | role | before | after | contrast on card |
|---|---|---|---|---|
| `--cc-text` | primary | `#ede8dc` | (kept) | ~13:1 |
| `--cc-text-muted` | secondary | `#9ba6b8` (6.4:1) | `#aab5c4` | **~7.6:1** |
| `--cc-text-subtle` | muted | `#6f7a8e` (3.6:1) | `#7e8799` | **~4.3:1** |

Three-step ramp now clearly separated and all comfortably AA on dark (secondary ≥4.5, muted ≥3 with
margin; even higher on the darker panel/page surfaces). Token-driven → propagates to every KPI title,
card sub-label, "Not available", and form helper at once. Uppercase tracked labels (which use the
subtle tier) jump from 3.6:1 → 4.3:1, so they read at a clearly-legible level.

Gate: `themeTokens.test` ✅ (11) · `tsc -b` ✅. (Light theme untouched.)

### FIX 1 status: ✅

---

## FIX 2 — Float CRM summary tiles like the KPI cards

The CRM Hub's 6 summary tiles used the lightest `shadow.card`; the KPI live cards (`LargeMetricTile`)
use `shadow.elevated` (deep float + 1px top highlight on dark). Matched them:
- CRM tile `card` style: `boxShadow: shadow.card` → **`shadow.elevated`** (same token family as the KPI
  cards — surface bg + 1px top highlight + float, theme-aware).
- Added a theme-aware hover lift utility `.cc-tile-lift` (translateY(-2px) + `--cc-shadow-hero`,
  reduced-motion disables it) applied to the clickable tiles. No bespoke per-tile shadows.
- Bumped the tile label `cardLabel` from the muted tier (`textSubtle`) to **secondary** (`textMuted`),
  per FIX 1's "uppercase tracked labels sit at secondary".

Gate: `tsc -b` ✅ · `CrmHubWorkspace.test.tsx` ✅ (7) · `eslint` ✅ (0 errors).

### FIX 2 status: ✅

---

## FIX 3 — CRM header: one primary + overflow

The 7-action row (Add Company/Contact/Activity/Follow-up/Relationship/Advisor) drifted back toward the
wall-of-equal-buttons problem. Restored the single-primary rule:
- **Visible:** one Seal-Red **+ Add Company** (primary) + one quiet **+ Add Contact** (secondary).
- **Overflow:** Log Activity / New Follow-up / Add Relationship / Add Advisor in a **"More ▾"** menu
  (Radix Popover — already a dep — accessible: focus, Escape, click-outside; disabled when no identity).
- Token-driven `.ig-popover-menu` / `.ig-popover-item` styles (dark-aware) added to `primitives.css`.
- Updated `CrmWriteActions.test.tsx` to open the overflow before the (now-overflowed) Log Activity /
  New Follow-up actions; portal items queried via `screen`.

Gate: `tsc -b` ✅ · `CrmWriteActions.test.tsx` ✅ (5) · `eslint` ✅.

### FIX 3 status: ✅
