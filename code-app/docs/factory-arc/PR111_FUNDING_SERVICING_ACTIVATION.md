# PR 111 — Funding Authorization Mount + Live Servicing Lifecycle Loader

Direct follow-up to the user's explicit request ("complete the funding process along with the
servicing life cycle work") after PR 110 landed the full PR 104-109 chain on master. Two previously
deferred capabilities:

1. **Funding Authorization** — PR 107 built the full framework (`src/funding/*`, 61+ tests) but
   deliberately left it entirely unmounted, reasoning that real two-person dual control couldn't be
   honestly simulated in a single browser session.
2. **Servicing Lifecycle** — PR 108 confirmed `ServicingLifecyclePanel.tsx` and its 7 pure derivers
   were a genuine orphan: no live loader existed to feed `deriveServicingLifecycleSnapshot()`'s nine
   sub-status inputs from real Dataverse data, and building one was scoped out of PR 108 as a
   multi-file integration task.

Both are completed here.

## 1. Funding Authorization — mounted local-only

Re-examined the PR 107 judgment and reversed it: `FundingAuthorizationPanel.tsx` already contains
its own `isSelfApprovalRisk` check (case-insensitive email comparison against `record.requestedBy`),
and `fundingAuthorizationPolicy.ts`'s `evaluateFundingApproval()` independently enforces
`self_approval_not_permitted` at the policy layer, before any UI gate. A single banker session
genuinely cannot complete both sides of dual-control approval — the self-approval prohibition holds
correctly and automatically. Mounting this local-only is therefore an honest reference
implementation, not a fabricated demo.

- **New**: `src/deals/DealFundingAuthorizationPanel.tsx` — wraps `FundingAuthorizationPanel` with
  `createInMemoryFundingAuthorizationStore()` (session-scoped; the module's own documented reference
  implementation), a "Request funding" mini-form, and wiring to `requestFunding` /
  `approveFunding`/`rejectFunding`/`revokeFunding` / `confirmFundingDisbursement`. A no-op audit
  emitter is used (auditing a non-durable record would be a false signal), matching the
  `DealClosingDocumentsPanel.tsx` (PR 107) convention exactly.
- `FundingReadinessFacts` fields with no live source (`requiredDocumentsComplete`,
  `conditionsPrecedentResolved`, `exceptionsAllResolved`, `destinationVerified`, `approvalExpired`)
  are hard-coded to their fail-closed BLOCKING value — never fabricated as ready. `dealTerminalStatus`
  is the one real fact, derived via the existing fail-closed `recognizeCanonicalStatus(deal.status)`
  (falling back to the blocking `'DECLINED'` for an unrecognized status string, never the
  affirmative `'OPEN'`). The session therefore genuinely progresses request → approval but always
  correctly shows blocked at disbursement confirmation — this is correct behavior, not a bug.
- Mounted in `BankerDealWorkspace.tsx` alongside the other deal-cockpit cards.
- `FUNDING_AUTHORIZATION_ENABLED` flipped to `true` (tracking constant only — no code path in this
  app consumes a capability flag as a mount gate; the closing-document / risk-rating panels mount
  unconditionally too).
- `src/navigation/intentionallyUnrouted.ts`: 9 of 11 Workstream 7 entries dropped as genuinely
  reachable. `fundingTimeline.ts` (no live timeline caller) and `fundingFeatureFlags.ts` (unconsumed
  tracking constant) remain allow-listed.
- `platformInventory.ts`'s `funding-authorization-persistence` `NOT_WIRED` entry updated to describe
  the new local-only mount (same disclosed pattern as risk-rating / closing-documents) — the
  persistence gap itself is unchanged; no cr664_fundingauthorization table exists.

## 2. Servicing Lifecycle — live loader + mount

Unlike funding, this required no schema decision — every child table
`deriveServicingLifecycleSnapshot()` needs already exists as a generated, registered data source
(`Cr664_portfolioboardedloan{covenants,insurances,ticklers,collaterals,exceptions}Service.ts`). The
gap was purely the missing live loader.

- **New**: `src/deals/loadServicingLifecycleSnapshotForLoan.ts` — the SDK-touching loader (kept in
  `src/deals` so `src/servicing` stays SDK-free, same convention `loadBoardingHandoffForDeal.ts`
  documents). Reuses `evaluateBoardingHandoff()` (the same pure reconciliation
  `DealPortfolioBoardingStatusPanel` already uses) so "is this loan really boarded" is answered
  identically everywhere — never a second, drifting definition. Reads the parent
  `cr664_portfolioboardedloans` row plus five child tables (covenants, insurance, ticklers,
  collateral, exceptions) in parallel, each failing closed independently (a failed/thrown read
  reports `null`/`unknown`, never a fabricated healthy default — same discipline as
  `loadBoardedLoanRecordCounts.ts`). `ownershipTransferStatus` is left undefined: no
  transferor/transferee/effective-date fields exist on any generated servicing table, so the pure
  snapshot deriver's own documented `'no_transfer'` fallback applies — an honest gap, not a guess.
- **Fix**: `deriveServicingLifecycleSnapshot.ts`'s `statusSeverity()` treated the exception status's
  `'unknown'` value as severity 0 (healthy) — a real defect once a live "the exceptions table
  couldn't be read" signal exists. Fixed to carry the same severity-3 weight as
  `'unknown_missing_data'` elsewhere, so an unreadable exception source surfaces as
  `review_required`, never as a silently clean snapshot. Covered by a new test.
- **New**: `src/deals/DealServicingLifecyclePanel.tsx` — mounts `ServicingLifecyclePanel` (fully
  live, read-only; no persistence gap to disclose, unlike the funding/closing-document mounts).
  Fetch is gated on the deal's stage claiming BOARDED (same efficiency-conscious convention
  `DealPortfolioBoardingStatusPanel` already uses, to avoid an extra query on every non-boarded
  deal); the loader itself still verifies against the real handoff record, so a genuinely boarded
  loan is found even with a stale/premature stage claim.
- Mounted in `BankerDealWorkspace.tsx` next to `DealPortfolioBoardingStatusPanel`.
- `src/navigation/intentionallyUnrouted.ts`: `ServicingLifecyclePanel.tsx`, its 7 derivers, the
  snapshot deriver, and `servicingLifecycleTypes.ts` dropped as genuinely reachable.
  `servicingLifecycleMapper.ts` / `ServicingLifecycleMapperPanel.tsx` remain allow-listed — confirmed
  (per PR 108's own investigation) to be a different, unrelated PRE-boarding readiness projection,
  not part of this POST-boarding lifecycle-snapshot family.

## Validation

`npx tsc -b` clean. Full suite: 905 test files / 13,200 tests passed, 2 pre-existing skips, 0
failures. `npm run build` clean. `npm run audit:reachability`: 0 unexpected orphans.

## What did NOT change

- No new Dataverse schema applied for funding authorization — the PR 107 proposal remains
  unapplied; this pass only mounts the existing session-scoped reference implementation.
- No requirement-engine gate flips (`tracked: false` stays `false` for anything this pass touches).
- No live Teams/Outlook/SharePoint wiring — out of scope, unrelated to this pass.
