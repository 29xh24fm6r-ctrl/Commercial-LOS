# Phase 210 / Lane A4 — Operator Launch Console

**Status:** Complete. A read-only operator console showing, per capability, what
is on/off/blocked and why, the latest smoke result, and the rollback
instruction. Observe-only — it flips no gate and performs no write.

**Branch:** `phase210-operator-launch-console`. **Depends on:** A2/A3 (stacked
for Lane-A ordering; the model is generic — capabilities are injected — so it has
no hard import on 208/209 and can be reviewed independently).

## Delivered

- `src/access/operatorLaunchConsoleModel.ts` — `deriveOperatorLaunchConsole`.
- `src/access/OperatorLaunchConsole.tsx` — the read-only console.

## What it shows

Per capability: gate flags (with required markers) → computed `enabled` /
`disabled` / `blocked` state **and the reason** (which required flag is off, or
which blocker applies); the latest recorded smoke result (outcome, actor,
correlation id, timestamp) or "none"; and a rollback instruction. Plus
on/off/blocked counts.

## Relationship to existing readiness

This complements (does not duplicate) `fullSystemLaunchReadinessModel` — that is
a release-decision domain rollup (GO / CONDITIONAL_GO / NO_GO). A4 is the
capability-level operational control plane (gate flags + smoke evidence +
rollback) the spec's Lane A4 calls for, and is the natural home for the Lane I2
capability-gate-registry / I3 smoke-evidence concerns.

## Safety

Observe-only: `canFlipFromUi: false`, no write control / button / input, no
write verb, no fetch/SDK. No fabricated state — a capability with no recorded
smoke shows "none"; nothing is reported as ready/synced without evidence. Gate
values and smoke results are injected (operator-recorded), never invented.
"Do not flip gates from UI unless a governed config write exists" — none exists,
so no flip control is rendered.

## Validation

- `npm test -- phase210 operator launch console access` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData readOnlySurfaceGuard releaseCandidateSnapshot` — green.
