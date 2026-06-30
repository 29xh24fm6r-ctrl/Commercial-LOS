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
