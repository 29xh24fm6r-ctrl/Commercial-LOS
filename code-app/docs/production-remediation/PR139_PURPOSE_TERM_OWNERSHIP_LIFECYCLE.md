# PR 139 — Purpose, Term, and Ownership Through New Deal and Downstream Lifecycle

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 8
**Findings addressed:** N-25
**Branch:** `phase8-purpose-term-ownership-lifecycle`

## Problem statement

The July 25 audit found that loan purpose, loan term, and ownership structure were absent from the
New Deal creation wizard and the credit memo, despite being persistable via Deal Profile editing.
Phase 8's objective: ensure these three facts are not limited to profile editing — capture them at
creation, and display them across the deal's downstream lifecycle (Summary, Profile, Credit Memo,
Approval Request, Closing, Boarding, Portfolio).

## Investigation

A dedicated investigation confirmed the finding and located the exact gap:

- `loanPurpose` / `loanTermMonths` / `ownershipStructure` already exist on `DealDetail` (Factory Arc
  Phase 3) and already have real `DEAL_PROFILE_FIELD_SPECS` entries in `updateDealProfile.ts`
  (`kind: 'text'`/`'integer'`, no invented enum for ownership) — persistence was never the gap.
- The New Deal wizard's Step 3 (`BankerNewDealCreate.tsx`) literally said, in a UI-visible hint: *"Loan
  purpose, term, and ownership status are not yet captured here — they need a new Dataverse field
  this environment does not have yet."* This was stale and false — the fields have existed since
  Phase 3. The wizard simply never grew inputs for them.
- `creditMemoDraft.ts` never referenced any of the three fields (confirmed by grep — zero hits) — a
  genuine display gap in the memo the audit called out directly.
- `DealSummary.tsx` — the read-only summary card — likewise never rendered any of the three fields,
  even though they were already in `DealDetail`. This is a second, independent display gap beyond the
  wizard.
- `amortizationMonths` (a separate, pre-existing field/column, `cr664_amortizationmonths`) is
  confirmed genuinely distinct from `loanTermMonths` (`cr664_loantermmonths`) — two separate
  Dataverse columns, never conflated in the schema or the write-path spec.
- `NEW_DEAL_CREATE_ALLOWED_FIELDS` (the create-payload allow-list) is a locked governance contract
  (`phase194ControlledLiveNewDealCreateEnablementContract.test.ts` pins its exact contents) — adding
  the three fields there would be a bigger, separately-reviewed schema-contract change. The correct,
  already-established integration point is the existing governed **post-create follow-up write**
  (`runProfileFollowUp`, reusing `updateDealProfile.ts` unchanged) already used for
  `targetCloseDate`/`collateralSummary`/`guarantorStructure`/`amortizationMonths` — none of which are
  in the create allow-list either.
- Boarding (`mapDealToExistingLoanInput.ts`) already targets an `ExistingLoanInput` type that has its
  own `termMonths`/`purpose` fields (`existingLoanEntryAdapter.ts`) — but the mapper never wired the
  deal's `loanTermMonths`/`loanPurpose` into them. No equivalent target field exists on the
  boarded-loan schema for ownership structure.
- Closing (`ClosingDocumentFactModel`) had no fact keys for any of the three; none of the five pilot
  closing-document templates require them, so adding them is purely additive and never changes any
  template's eligibility.
- Portfolio does not read `DealDetail` at all — it is entirely downstream of the *boarded loan*
  Dataverse table, reached only through Boarding. There is also no existing per-loan display of ANY
  structural loan fact (not even amount/product) anywhere in Portfolio's own components today.
- "Approval request" has no existing UI surface that displays loan facts at all (the closest analog,
  the credit-committee package queue, is a pure readiness/evidence dashboard with no amount/product
  fields either) — committee review reads the credit memo, so the memo fix satisfies this transitively.

## Fixes in this PR

### Wizard capture (Step 3 "Deal Details")
`BankerNewDealCreate.tsx` gained three new optional inputs — loan purpose (text, 200-char cap), loan
term in months (text + `inputMode="numeric"`, matching `DealProfileEditModal.tsx`'s existing
convention for this exact field), and ownership structure (text, 100-char cap, illustrative
placeholder — never a fabricated dropdown enum, matching the schema's genuine free-text shape). The
stale disclaimer paragraph is removed. All three follow the exact `targetCloseDate`/
`collateralSummary`/`guarantorStructure` pattern: plain `useState`, sent only if filled in, via the
existing governed follow-up write (validate → write → readback → audit) with **exact readback**
already enforced by `updateDealProfile.ts`'s existing integer-field validation (positive whole number,
implausible-value ceiling) for `loanTermMonths` — no new validation code needed, it already applies
to any field sharing `kind: 'integer'`. Because no submit path in this component ever resets any field
state, a failed create/retry preserves everything the banker already typed, for free — proven by a
new test.

### Display
- **Deal Summary** — three new `Fact` entries, following the existing "Not provided" honest-fallback
  convention exactly.
- **Credit memo** — `loanRequest()` gained Loan purpose and Loan term lines; `borrowerOverview()`
  gained an Ownership structure line — both via the same `valOrMissing`/`trackMissing` convention
  every other memo field already uses (never a special case).
- **Closing** — three new optional keys on `ClosingDocumentFactModel`, wired through the existing
  `buildClosingDocumentFactModel` mapper and rendered conditionally in
  `closingDocumentContentRenderer.ts`, exactly like every other optional fact there. No template's
  `requiredFacts` lists them, so eligibility for any of the five pilot templates is unaffected.
- **Boarding** — `mapDealToExistingLoanInput.ts` now maps `deal.loanTermMonths → input.termMonths` and
  `deal.loanPurpose → input.purpose`, both target fields that already existed on `ExistingLoanInput`
  but were never wired from the deal side.
- **Profile** — already worked (`DealProfileEditModal.tsx` already edits all three); confirmed, no
  change needed.

## Files changed

- `src/banker/BankerNewDealCreate.tsx` / `.test.tsx` — wizard capture + follow-up write + 2 new tests (capture, failed-create preservation)
- `src/deals/DealSummary.tsx` — 3 new Facts
- `src/deals/DealSummary.test.tsx` (new) — first test file for this component
- `src/deals/creditMemoDraft.ts` / `.test.ts` — 2 new memo lines + 2 new tests
- `src/deals/CreditMemoDraftModal.test.tsx` — fixture updated (a fully-populated-deal test now needs all three fields set)
- `src/closing/documents/closingDocumentTypes.ts` — 3 new optional fact keys
- `src/closing/documents/closingDocumentContentRenderer.ts` / `.test.ts` — 3 new conditional lines + 2 new tests
- `src/deals/DealClosingDocumentsPanel.tsx` / `.test.tsx` — mapper wiring + 1 new test
- `src/portfolioBoarding/mapDealToExistingLoanInput.ts` / `.test.ts` — 2 new field mappings + 2 new tests

## Schema impact

None. All three fields already exist as PR105-provisioned columns (`cr664_loanpurpose`,
`cr664_loantermmonths`, `cr664_ownershipstructure`), already governed by `updateDealProfile.ts`'s
existing field specs.

## Runtime behavior before / after

| | Before | After |
|---|---|---|
| New Deal wizard, Step 3 | Stale disclaimer: fields "not yet captured... need a new Dataverse field" | Three real, optional inputs; captured via the existing governed follow-up write |
| A failed create, then retry | (no field ever reset — implicit, untested) | Confirmed, explicitly tested: purpose/term/ownership survive a failed attempt |
| Deal Summary | Fields existed on `DealDetail` but were never rendered | Three new facts, "Not provided" when absent |
| Credit memo | No reference to any of the three fields | Loan purpose + term in Loan Request; ownership structure in Borrower Overview |
| Closing document preview | No purpose/term/ownership line | Included when the deal has them; never blocks eligibility |
| Boarding | `ExistingLoanInput.termMonths`/`.purpose` existed but were never populated from the deal | Populated automatically at auto-boarding time |
| Portfolio | No per-loan structural fact display exists (not even pre-existing ones) | Unchanged — out of scope; see remaining limitations |

## Tests added

- `BankerNewDealCreate.test.tsx` — 2 new tests (capture + follow-up write; preservation across a failed create)
- `DealSummary.test.tsx` — new file, 3 tests
- `creditMemoDraft.test.ts` — 2 new tests (Loan Request purpose/term, Borrower Overview ownership structure — both populated and sparse-deal cases)
- `closingDocumentContentRenderer.test.ts` — 2 new tests (renders when present, omits when absent)
- `DealClosingDocumentsPanel.test.tsx` — 1 new test (preview includes the three facts)
- `mapDealToExistingLoanInput.test.ts` — 2 new tests (maps when present, undefined when absent — never fabricated)

## Validation results

- `npx tsc -b` — 0 errors
- `npx vitest run` — 915 test files, 13400 passed, 2 skipped, 0 failed
- `npm run build` — succeeded (only pre-existing-pattern INEFFECTIVE_DYNAMIC_IMPORT warnings)
- `npm run audit:reachability` — 0 unexpected orphans (1070 total sources, 785 reachable, 285
  allow-listed orphans, consistent with prior phases' baseline)

## Operator steps

None.

## Rollback considerations

Additive UI/display code only; no schema change, no new write surface (reuses `updateDealProfile.ts`
unchanged). A plain revert is safe. Any purpose/term/ownership values already persisted via Deal
Profile editing before this PR are unaffected either way.

## Remaining limitations

- **Ownership structure has no path into Boarding or Portfolio** — the boarded-loan schema
  (`ExistingLoanInput`) has no equivalent field to receive it, unlike term/purpose which already had
  matching target fields. Adding one would be a new schema field on that side, out of scope for this
  PR.
- **Portfolio does not display purpose/term/ownership** — Portfolio reads exclusively from the
  boarded-loan Dataverse table (never `DealDetail` directly), and none of its existing views display
  ANY per-loan structural fact today (not even amount or product). Wiring Boarding's now-populated
  `termMonths`/`purpose` through to a Portfolio display would require adding that display capability
  to Portfolio's own views first — a larger, separate UI addition to a part of the app this finding
  did not otherwise touch.
- **"Approval request" has no dedicated loan-fact display surface** — the closest existing analog
  (the credit-committee package review queue) is a deliberately narrow readiness/evidence dashboard
  with no amount/product/structure fields of its own either. Since committee review is generated from
  the credit memo, this PR's memo fix satisfies the finding's intent transitively rather than adding a
  new display section to a panel whose own design deliberately excludes loan facts.
