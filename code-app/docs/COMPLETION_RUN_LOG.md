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

## Remaining Section A phases (not yet done this turn)

- **Phase E** — lint baseline for the legacy `react-hooks`/`eslint-10` debt (162 errors / 5
  warnings, all pre-existing — every file changed this arc lints clean). CI fails on NEW lint,
  tolerates the baselined set; new code stays clean.
- **Section B** — operator runbook (production environment, schema state, authentic evidence,
  Outlook connector, per-domain arming) — unchanged, environment-owned.

Branch `completion/flag-truthup-20260629` not pushed (deploy is operator-owned, human-approved).
