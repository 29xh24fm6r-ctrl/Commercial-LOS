# Intaglio v2 — "Dark, Dimensional, One Hero Moment"

Branch `design/intaglio-v2` (off `integration/all-work-20260630`). Takes the v1 discipline (single
primary action, honest labels, the guilloché signature) and makes it **bold where it counts, calm
where it should be.**

## The identity (and how it avoids the AI-default dark look)

| Default "AI dark" | Intaglio v2 |
|---|---|
| pure / cold near-black | **warm Ink-Navy `#0C1322`** + a faint vertical wash to `#0F1A2E` |
| one bright neon accent | **deep muted Seal-Red `#C23B34`** (wax-seal / banknote red), used *rarely* |
| generic, subject-less | **guilloché intaglio** atmosphere, **warm ivory `#F4EFE3`** document token, **Ledger-Green** positive, **Treasury-Blue `#5B8FD9`** interactive — grounded in OGB's world of currency, ledgers, seals |
| glow sprinkled everywhere | glow on **exactly** the one primary button, the active tab, and the single hero "urgent" accent |

## The system (by phase)

1. **Foundation** — deep warm shell + vertical wash; surfaces float on theme-aware elevation tokens
   (a 1px top highlight + a real `0 8px 24px rgba(0,0,0,.35)` drop shadow on dark); warm text ramp
   `#EDE8DC / #9BA6B8 / #6F7A8E`; the color spine. Dark is the default (`data-theme="dark"`).
2. **Depth & accents** — the single Seal-Red primary-button glow; a soft active-tab underline glow;
   a restrained card hover bloom (edge-brighten, *not* glow); dark-legible badges with a stamped
   severity hairline; Treasury-Blue focus rings.
3. **Hero moment** — the dashboard band: the pipeline figure huge (`clamp(3.4rem,6vw,5rem)`) and
   luminous, tabular, with a small tracked label; the guilloché elevated to atmosphere behind it;
   a sheen across the band; the one Seal-Red "urgent" accent. Everything below stays quiet.
4. **KPI hierarchy** — live metrics float with their accent edge; the four not-wired empties recede
   (flat, sunken surface, hairline top, dimmed) — never the weight of a real number.
5. **Motion** — hero count-up; KPI rise-in stagger (~200ms); command-palette spring; slow guilloché
   drift. All gated behind `prefers-reduced-motion: no-preference`; the count-up treats reduced
   motion (or a missing `matchMedia`) as instant, so the figure is always the honest final value.

## Non-negotiables — held

- **Governance honesty intact and legible on dark.** GATED / Read-only / DRY_RUN / "Not available"
  / the 1-of-6 truth all still show, restyled (stamped severity hairline) — never hidden or softened
  toward looking "live." The four KPI empties keep their "not yet wired" tooltips + PHASE_118
  bucket-C citations. Optimistic inline edit still routes through the governed write path. The
  launch-evidence verifier stays honestly red.
- **Accessibility.** Body text ≈12.7:1, secondary ≈6:1 on the elevated surface (clear AA); focus
  rings visible on dark; full reduced-motion off-switch; the hero figure clamps responsively.
- **No heavy new deps.** Extends the existing `--cc-*` token system + the v1 dark variant only.

## Gate (Phase 6)

`tsc 0 · vitest 695 files / 10,505 passed / 2 skipped · lint 0 · reachability 0 · build 0 ·
verify:launch-evidence exit 1 (honest-red, by design)`. Branch **not pushed.**

## Eyes-on (expected next step)

Per the spec, v2 needs its own eyes-on tightening in the live Power Apps shell — deploy `design/
intaglio-v2` to the dev environment and look again. Things to check on real pixels: the guilloché
opacity/scale behind the band, the hero figure size at laptop widths, the Seal-Red saturation on the
actual panel, and whether the active-tab glow wants to be even subtler. The font impact (Fraunces
display) depends on what loads in the shell; the scale + weight carry it if the face doesn't.
