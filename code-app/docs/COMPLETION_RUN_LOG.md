# Path-to-Completion Run Log

Branch: `completion/flag-truthup-20260629` · Base: `master` (`1b9807a`)

Continues the launch-readiness arc. Prime directive: **flags gate DOWN, never assert UP** —
every live-write domain defaults off and is armed deliberately, per domain, only on authentic
evidence. One source of truth across all surfaces. Branch only; not pushed until approved.

## Phase A — Reset live-write flags to safe defaults ✅ (commit pending)

The five live-write flag constants were pre-flipped ON (Phase 256B), contradicting the honest
1/6 certification and removing the first safety layer. Reset to their **safe default (off)**;
the runtime schema/transport gates remain the second layer. No runtime behavior changes today
(the schema gates already blocked the writes), but the defaults are now honest and
defense-in-depth is restored.

Source flags reset (off):
- `CRM_LIVE_PERSISTENCE_ENABLED` + `CRM_FEATURE_FLAG_DEFAULTS.*` — `src/crm/crmFeatureFlags.ts`
- `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + `..._ROUTE_ENABLED` —
  `src/portfolioBoarding/portfolioLoanBoardingFeatureFlags.ts`
- `AUTO_STAGE_ADVANCE_ENABLED`, `DOCUMENT_CHECKLIST_GENERATION_ENABLED`,
  `BORROWER_MESSAGING_ENABLED`, `BORROWER_EMAIL_TRANSPORT_ENABLED` —
  `src/deals/dealOriginationFeatureFlags.ts`

**Preserved:** `BANKER_CREATE_PILOT_ENABLED` (real, evidenced) untouched; the three global New
Deal create gates stay false. Certification authority unchanged at **1/6** (New Deal pilot
only); `enabledCount=1`, `fullLaunchReady=false`.

**Tests flipped toward the safe default (off/gated)** across deals/CRM/portfolio/admin/governance
clusters (~75 test files, via parallel workers + core models done directly) — every changed
expectation moved toward "safe off", never re-asserting the unsafe `true`; fail-closed,
governed-adapter, audit, source-text, and pilot assertions preserved.

Gate (commit `57c7170`): tsc 0 · full vitest **685 files / 10,402 passed / 2 skipped** ·
reachability 0 · build 0 · `verify:launch-evidence` exit 1 (unchanged).

> Side effect (positive): because the admin/operating panel + readiness tests were flipped to
> expect the gated reality and now PASS, those panels already render coherently off the shared
> flag/verification state — i.e., Phase B's split-brain is largely closed in practice by this
> reset. What remains for Phase B is the **enforcing cross-panel coherence test** (a guard that
> fails if any panel reports a domain "enabled" while the certification authority reports it
> not-enabled) so the contradiction cannot recur.

## Phase B — Cross-panel coherence guard ✅ (commit pending)

`src/shared/governance/crossPanelLaunchCoherence.test.ts`. Mapped (via a read-only audit) every
panel/model that reports a per-domain live/enabled status: 3 derive from the authority
(`deriveProductionEnvironmentVerification`); **8 compute it independently from feature-flag
constants** (V1 readiness, OGB CRM activation, elite CRM/LOS, banker/manager operating centers,
the two admin-onboarding panels). They are coherent now only because Phase A reset the flags —
but the authority also requires HIGH evidence, which they ignore.

The guard asserts, for each of the five live-write domains, **equality**:
`panelReportsLive(domain) === authority.enabled[domain]` — failing in **both directions**:
- a panel reporting LIVE while the authority says not-enabled (the original split-brain), AND
- a panel reporting gated while the authority says enabled.

Because the authority requires HIGH evidence, this permanently catches the dangerous case "a flag
re-armed without authentic evidence" (the flag-reading panel flips to live while the authority
stays not-enabled). A self-verification test proves the comparison detects both directions (not
vacuous). Plus: every live-write domain is not-enabled across all panels (1/6 posture), and New
Deal create is enabled with the pilot-reading surfaces agreeing.

> Note: a *by-construction* refactor (the 8 flag-reading models deriving `enabled` from the
> authority) was considered but deferred — the banker/manager/executive operating models are
> deliberately role-isolated (Phase 48), so importing the admin authority risks a layering
> violation. The guard provides the enforcement (drift → CI red) without that risk.

Gate: tsc 0 · coherence guard 4/4 green.

## Phase D — `KPI_BASELINE_DATE` data-quality fix ✅ (commit pending)

`KPI_BASELINE_DATE` is single-valued but the live environment holds 5 active system-setting rows
with conflicting baseline dates. (Audit finding: in code, `kpiBaselineDate` is consumed only for
display in `ConfigurationOverview` — no KPI math silently reads it — so the risk is an ambiguous
display, but the fix is still to surface the conflict and fail closed by contract.)

- `src/admin/kpiBaselineResolution.ts` — pure, deterministic `resolveKpiBaselineDate(rows)` →
  `resolved` (exactly one distinct value), `absent`, or `ambiguous` (a result with **no `value`
  field** — a consumer literally cannot read a baseline when it's ambiguous → fail-closed by
  construction). Plus `deriveKpiBaselineDataQualityFlag` (a warning DQ flag listing the conflicts).
- `ConfigurationOverview` now renders a visible ambiguity warning
  (`data-kpi-baseline-ambiguous`, "N conflicting values … treated as unresolved") instead of
  silently listing the rows; a single clean value renders as `data-kpi-baseline-resolved`.
- Operator-owned (runbook): dedupe `KPI_BASELINE_DATE` to one approved row.

Tests (7): resolver resolved/absent/ambiguous(5-row), DQ-flag derivation, and the UI surfacing
both states. Gate: tsc 0 · 7/7 green.

## Phase C — Banker/manager dashboard label honesty ✅ (commit pending)

The banker and manager Operating Command Center cards derive each live-write domain's label from
the feature-flag constant directly. The off (gated) labels were already honest after Phase A, but
the **armed** branch read a bare `'Send enabled'` / `'Generation enabled'` / `'Writeback enabled'`
/ `'Boarding persistence enabled'` — an over-assertion: these role surfaces read only the FLAG
(the first gate) and, by role isolation (Phase 48 — `src/banker`/`src/manager` may not import
`src/admin`), cannot see the launch authority's certification/evidence. A flag-on alone does not
mean the live write is certified.

Fix (one shared helper per model, `liveWriteValue`): a live-write domain now reads
`'<noun> armed — pending certification'` when armed and `'<noun> gated'` when off — the word
**"enabled" never appears** for a gated live-write domain. `"enabled"` is reserved for the
genuinely-live, evidenced New Deal create pilot (rendered on its own surface). Borrower
communications was done first, then document checklist, then portfolio boarding (+ manager CRM
writeback). The off-branch labels are unchanged, so the existing model/state tests are untouched.

Why a label fix and not a by-construction refactor to the authority: the same role-isolation that
blocked Phase B's refactor applies. The cross-panel coherence guard (Phase B) already fails CI if
a card's `state` ever disagrees with the authority; this phase additionally hardens the rendered
`value` so it cannot flash a false "enabled" even transiently.

Render surfaces got a `data-domain-value` hook; a render test **per card** asserts each gated
live-write value reads its gated label and never matches `/enabled/i` (banker: 3 live-write cards +
New Deal gate posture; manager: 4 live-write cards).

Files: `src/banker/bankerOperatingCommandCenterModel.ts`,
`src/banker/BankerOperatingCommandCenter.tsx` (+ `.test.tsx`),
`src/manager/managerOperatingCommandCenterModel.ts`,
`src/manager/ManagerOperatingCommandCenter.tsx` (+ `.test.tsx`).
Gate: tsc 0 · full vitest **688 files / 10,421 passed / 2 skipped** · reachability 0 · build 0 ·
changed files eslint 0 · `verify:launch-evidence` exit 1 (unchanged, honest-red).

## Phase E — Lint baseline ✅ (commit pending)

`eslint .` was failing on **162 pre-existing errors across 105 files** — legacy debt predating
this arc (every file changed this arc lints clean). Baselined them with ESLint v10's **native bulk
suppressions** (`eslint-suppressions.json`) rather than a custom allowlist script. Result:
`npm run lint` exits 0 on the known set; a NEW violation — in a new file or beyond the recorded
count — still fails (verified with a throwaway probe → exit 1). 5 warnings are intentionally left
unsuppressed (warnings don't fail the gate) as a visible burn-down signal.

Top rules baselined: `set-state-in-effect` (38), `no-explicit-any` (32), `no-unused-vars` (28),
`react-refresh/only-export-components` (24), `no-irregular-whitespace` (16). Owner + burn-down
policy in `docs/LINT_BASELINE.md` — burn down with `eslint . --prune-suppressions`; never
`--suppress-all` to green a build (that would re-hide new debt, the dishonesty this arc removes).

Files: `eslint-suppressions.json` (new), `docs/LINT_BASELINE.md` (new). The `lint` script is
unchanged (`eslint .` auto-reads the suppressions file). Gate: tsc 0 · reachability 0 · build 0 ·
`npm run lint` 0 · `verify:launch-evidence` exit 1 (unchanged, honest-red). Test suite unchanged
from the Phase C full-green run (no `.ts/.tsx` source/test files modified).

## Phase F — Whole-system verification ✅ (commit pending)

Final authoritative gate over the full branch:

| gate | result |
|------|--------|
| `tsc -b` | 0 |
| `npm run lint` | 0 (162 legacy errors baselined; new lint still fails) |
| `npm run audit:reachability` | 0 |
| `npm run build` | 0 |
| full `vitest run` | **688 files · 10,421 passed · 2 skipped** |
| `npm run verify:launch-evidence` | **exit 1 — honest-red, by design** |

The launch-evidence verifier remains intentionally red: no authentic GO evidence exists yet, so
the system must not claim launch readiness. That red is the truth, not a regression.

### Posture after Section A

Defense-in-depth and surface coherence are restored; the system is honestly **fail-closed at
1/6**:

- **A** — all five live-write flags reset to safe-off; the runtime schema/transport gates remain
  the second layer; defaults are honest. Pilot (`BANKER_CREATE_PILOT_ENABLED`) and the three
  global create gates are untouched.
- **B** — a cross-panel coherence guard fails CI (both directions) if any panel's per-domain
  status diverges from the single launch authority — permanently catching "a flag re-armed without
  authentic evidence."
- **C** — banker & manager dashboards never render a bare "enabled" for a gated live-write domain;
  "enabled" is reserved for the genuinely-live New Deal pilot.
- **D** — `KPI_BASELINE_DATE` reads deterministically and fails closed on conflicting rows
  (visible DQ warning, never a fabricated baseline).
- **E** — legacy lint baselined honestly; new code must lint clean.

No evidence, identity, schema state, receipt, or ledger row was fabricated or rewritten; every
change is additive and stricter. **The branch is NOT pushed — deploy is operator-owned and
human-approved.**

### Commits (branch `completion/flag-truthup-20260629`, base `master 1b9807a`)

`57c7170` A · `cb924b8` log · `f8681a5` B · `8783e65` D · `065eb3d` C · `097577b` E · (this) F.

## Section B — operator runbook (environment-owned, NOT done in repo)

Production environment, Dataverse schema state, authentic per-domain GO evidence, the Outlook
connector, and deliberate per-domain arming remain owned by the operator. Nothing here is faked;
arming a domain is an evidence-backed operator act, never a repo source default.
- **Section B** — operator runbook (production environment, schema state, authentic evidence,
  Outlook connector, per-domain arming) — unchanged, environment-owned.

Branch `completion/flag-truthup-20260629` not pushed (deploy is operator-owned, human-approved).
