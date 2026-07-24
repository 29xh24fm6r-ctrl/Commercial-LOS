# PR 108 — Boarding / Portfolio Monitoring / Admin Truth Findings

## Origination-to-boarding integration — already fully wired, no work needed

Verified rather than assumed: `src/deals/buildLiveStageAdvanceDeps.ts`'s
`onDealBoarded` callback already calls `boardExistingLoan()` (from
`src/portfolioBoarding/existingLoanEntryAdapter.ts`) with
`buildLiveExistingLoanDeps()` — a LIVE dependency builder, not a mock —
whenever a deal's stage advance target is `BOARDED`. `mapDealToExistingLoanInput.ts`
does the deal → boarding-input translation. This is genuinely live, not a
gap. Separately, `workflow/boardingHandoffReadiness.ts` (which reconciles a
deal's claimed `BOARDED` status against the actual `cr664_portfolioboardedloans`
record) is already loaded live via `src/deals/loadBoardingHandoffForDeal.ts`
and rendered in `DealPortfolioBoardingStatusPanel.tsx`, already mounted in
`BankerDealWorkspace.tsx`.

**No code changes were made for this item — it did not need any.**

## Portfolio monitoring — already mounted, with one confirmed exception

`src/portfolio/PortfolioCommandCenter.tsx` already composes risk-rating
classification, regulatory classification, stress testing, board package,
early warning, exceptions, watchlist, and covenant review — and is already
mounted inside `ManagerWorkspace.tsx` (rendered when `isPortfolio` is
selected), gated by `PORTFOLIO_BOOK_DATA_ENABLED=true` (already live).

**One confirmed exception**: `src/servicing/ServicingLifecyclePanel.tsx`
and `ServicingLifecycleMapperPanel.tsx` are genuinely unmounted — already
correctly tracked as allow-listed orphans in
`src/navigation/intentionallyUnrouted.ts` ("requires a live servicing
snapshot/stage context; standalone read-only preview deferred (WIRE
candidate)", planned Phase 3+). Investigated what mounting it for real
would take: `deriveServicingLifecycleSnapshot()` needs NINE separate
sub-status inputs (stage, obligations, collateral security, insurance,
tickler, covenant reporting, maturity/renewal, exceptions, ownership
transfer), each presumably derived from one of `cr664_portfolioboardedloans`'s
10 child tables. No live loader assembling this snapshot exists yet (only
the pure deriver + presentational panel do) — confirmed via search; this
is a real, multi-file integration task, not a quick mount like PR 105/106/107's
panels.

**Deliberately deferred, not attempted rushed**: building a correct
`loadServicingLifecycleSnapshotForLoan(loanId)` live loader — reading and
correctly interpreting up to 10 related child tables — deserves its own
focused PR with real Dataverse field verification, not a rushed pass
tacked onto this one. Tracked as the next concrete WIRE candidate; not
claimed done here.

## Admin truth consolidation — additive, not destructive

The baseline survey found 6+ overlapping "is this feature live" panels
already in `AdminWorkspace.tsx` (`ReleaseReadinessGate`,
`V1GoLiveReleaseCertificationPanel`, `FullSystemActivationLaunchPanel`,
`EliteCrmLosActivationReadinessPanel`, `OgbCrmWorkflowActivationPanel`,
`V1ActivationReadinessPanel`, `FullSystemLaunchReadinessConsole`), each
independently projecting capability state with no single canonical view
tying them together.

**Retiring, merging, or reinterpreting any of those panels was judged out
of scope for this PR** — they are release-candidate certification
surfaces (several explicitly named "V1 Go-Live" / "Full System Activation
Launch"), and changing what they say or whether they exist is a real
product/compliance decision, not an ordinary refactor.

Instead, this PR adds `AdminCapabilityTruthMatrix.tsx`: one new, additive,
filterable, searchable view over the exact same four `platformInventory.ts`
registries (`GOVERNED_WRITES`, `NOT_WIRED`, `LOCAL_ONLY_FLOWS`,
`DELIBERATELY_BLOCKED`) every existing panel already derives its numbers
from. No existing panel is touched, removed, or reinterpreted — an admin
now has one place to cross-reference all four registries together, in
addition to (not instead of) the existing certified panels.
