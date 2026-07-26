# PR 141 (Phase 10) — New Deal UX and creation feedback (N-26, N-34, N-35, N-36)

## Problem statement

The mission's Phase 10 objective: "Make creation immediate, visible,
deterministic, and honest" — Active Deals stays the Kanban list, `+New Deal`
brings the wizard into viewport, missing-field badges clear immediately on
valid entry, mouse-driven native-select choices commit reliably, and
deal-create success/unconfirmed-readback messaging must not contradict
itself.

## Root cause / Investigation

A full re-derivation of N-26/N-34/N-35/N-36 against current master found
**three of the four already fully remediated** by earlier work in this
session, and **one genuine, reproducible contradiction**. Per this arc's
honesty rule, the already-correct findings are documented here rather than
"fixed" a second time:

- **N-26 — `+New Deal` wizard viewport / Active Deals stays the Kanban
  list: already correct.** `GreetingHeader.tsx`'s "+ New Deal" button calls
  `BankerShell.tsx`'s `openNewDeal`, which switches to the Active Deals tab
  and bumps `newDealFocusNonce`; a `useEffect` on that nonce does
  `scrollIntoView({behavior:'smooth', block:'start'})` against
  `[data-header-new-deal-target]` and focuses the deal-name input, and a
  second effect expands the collapsed New Deal panel. `PersonalPipeline`
  (the Kanban board) renders unconditionally first, with the New Deal panel
  appended below it, collapsed by default — the wizard never replaces or
  hijacks the Active Deals view. Confirmed by
  `BankerShellDealCreateConfirmation.test.tsx`'s existing Phase 7 regression
  test.
- **N-34 — missing-field badges clearing on valid entry: already
  correct.** `BankerNewDealCreate.tsx`'s `amountValid` and the client-required
  hint are computed inline on every render directly from `amount`/
  `selectedClient` state — no `useMemo`, no blur-gating. Both hints
  re-evaluate on every keystroke via plain `onChange` handlers and clear the
  instant the field becomes valid. Confirmed by the file's existing test
  "Create stays disabled with no amount typed, and an honest hint appears
  only for an invalid non-blank value."
- **N-35 — mouse-driven native `<select>` commit reliability: already
  correct.** Every native `<select>` in the wizard (product type, loan
  structure, pricing type, guarantor structure) is a plain controlled
  `value`/`onChange` pair with no debounce or reference-identity comparison.
  An existing test drives a real Testing-Library `user.selectOptions(...)`
  (dispatching genuine pointer events, not a raw `fireEvent.change`) and
  confirms the value commits into the submitted create patch.
- **N-36 — deal-create success / unconfirmed-readback messaging: a real,
  reproducible contradiction.** `BankerNewDealCreate.tsx`'s success banner
  renders immediately on a successful create — before the parent's
  confirm-then-navigate readback resolves — and unconditionally asserts "✓
  Deal created… **It now appears in your Active Deals and Loan Workflow.**"
  Meanwhile `BankerShell.tsx`'s `onDealCreated` runs a bounded readback
  retry; if it never confirms the created id, it sets
  `dealCreateConfirm: { kind: 'timed-out' }` and renders, in the same tab,
  "The deal (id …) was created but **could not yet be confirmed in your
  pipeline**. Refresh to check again — it is not lost." Both banners can be
  visible simultaneously for the same deal id, one flatly asserting
  placement, the other saying the opposite. No existing test exercised both
  banners together: `BankerShellDealCreateConfirmation.test.tsx` stubs
  `BankerNewDealCreate` entirely, and `BankerNewDealCreate.test.tsx` only
  unit-tests the child in isolation.

## Files changed

- `src/banker/BankerNewDealCreate.tsx` — added an optional
  `dealPlacementConfirmation?: 'confirming' | 'timed-out'` prop, threaded
  through `ResultBanner` into `OutcomeBanner`. When the parent reports
  `'timed-out'`, the success banner's placement sentence changes from the
  flat "It now appears in your Active Deals and Loan Workflow." to "Its
  appearance in your Active Deals list could not yet be confirmed
  automatically — see the notice above. You can still open it directly." —
  matching, rather than contradicting, the parent's own notice. The deal id,
  stage, status, and "Open deal →" link are unchanged and still shown (those
  facts are true regardless of pipeline-list confirmation status). When the
  prop is omitted or `'confirming'`, the original wording is unchanged —
  isolated/unit usage of the component is unaffected.
- `src/banker/BankerShell.tsx` — passes
  `dealPlacementConfirmation={dealCreateConfirm.kind === 'confirming' ||
  dealCreateConfirm.kind === 'timed-out' ? dealCreateConfirm.kind :
  undefined}` into `<BankerNewDealCreate>`, so the child's banner reflects
  the exact same state the parent's own timeout notice is driven from — no
  new state, no duplicated confirmation logic.
- `src/banker/BankerNewDealCreate.test.tsx` — widened `renderCreate`'s prop
  type to accept `dealPlacementConfirmation`; added a new describe block
  with 2 tests: the default/`'confirming'` case keeps the original wording,
  and the `'timed-out'` case (via a `rerender` that flips only the new prop,
  mirroring how `BankerShell` re-renders the still-mounted child when its
  own `dealCreateConfirm` state changes) shows the non-contradictory text
  and never shows the old "it now appears" sentence, while the deal id/open
  link remain present.

## Schema impact

None. Purely a client-side prop/state threading and copy change.

## Runtime behavior before/after

- **Before:** a banker whose readback confirmation times out could see, in
  the same tab, "✓ Deal created… it now appears in your Active Deals" right
  next to "…could not yet be confirmed in your pipeline" — an outright
  contradiction with no way to tell which statement to trust.
- **After:** the success banner and the parent's timeout notice agree: both
  state the deal was created and both state that its appearance in the
  pipeline list is not yet confirmed. The banker can still open the deal
  directly via the unaffected "Open deal →" link.

## Tests added

- `src/banker/BankerNewDealCreate.test.tsx` — 2 new tests (33 total in the
  file, all pass): default wording preserved; timed-out wording replaces the
  contradiction and the deal id/open-link facts remain visible.
- Existing regression coverage re-run and confirmed passing unchanged:
  `BankerShellDealCreateConfirmation.test.tsx` (7 tests — Phase 7 viewport
  regression, navigate-on-confirm, retry-then-confirm, honest timeout
  message), `BankerShell.test.tsx` (39 tests).

## Validation results

- `npx tsc -b` — 0 errors.
- `npx vitest run` (full suite) — 914 test files passed, 13,390 tests
  passed, 2 skipped, 0 failed.
- `npm run build` — succeeded (pre-existing dynamic-import chunking
  warnings only, unrelated to this change).
- `npm run audit:reachability` — 785 reachable / 285 allow-listed orphans /
  0 unexpected orphans.
- `git diff --check` — clean.

## Operator steps

None required — client-side UI-copy/prop-threading fix only.

## Rollback considerations

Safe to revert independently. The new prop is optional and additive; a
revert restores the prior (contradiction-capable) banner text with no data
or schema impact.

## Remaining limitations

- N-26/N-34/N-35 required no code change in this PR — they were already
  correct on master. No regression tests were added for them beyond the
  existing ones already covering that behavior, since there was no defect
  to pin.
- The fix addresses the specific two-banner contradiction. It does not add
  a dedicated route/modal for the New Deal wizard (N-26's scroll-into-view +
  auto-expand pattern was confirmed already sufficient and was left
  untouched) and does not change the underlying bounded-retry readback
  timing/thresholds (`DEAL_CREATE_READBACK_MAX_ATTEMPTS` /
  `DEAL_CREATE_READBACK_DELAY_MS`) — only the messaging shown once a timeout
  occurs.
