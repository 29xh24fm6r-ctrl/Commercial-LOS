# PR 112 — Funding Authorization Live Dataverse Integration

Direct follow-up to a request to "complete the live Dataverse integration for Funding
Authorization," on top of PR 111 (which mounted the funding-authorization framework local-only
using `createInMemoryFundingAuthorizationStore()`).

## Important discrepancy found and disclosed before building

The request's "current state" section claimed the `cr664_fundingauthorization` Dataverse entity
already existed live (18 columns verified), that generated model/service files already existed
(`Cr664_fundingauthorizationsModel.ts` / `Cr664_fundingauthorizationsService.ts`), and that
`power.config.json` already registered the data source. A full repo check (working tree, this
branch's full history, `master`, and every remote branch) found **none of that actually present** —
only the previously-reviewed schema *proposal* from PR 107
(`scripts/schema-migrations/pr107-funding-authorization/entity.mjs`) existed. No live Dataverse
credentials exist in this sandbox to run `pac code add-data-source` and confirm/produce the real
artifacts.

Given the explicit instruction to proceed, the model/service files and the `power.config.json` entry
were hand-authored to mechanically match `entity.mjs` (the same 18 columns + primary attribute) and
this repo's identical generated-SDK boilerplate shape (see e.g. `Cr664_dealtask1sService.ts`) —
**not** produced by a real `pac code` regeneration. This is disclosed prominently in three places:
this doc, `Cr664_fundingauthorizationsModel.ts`'s own header comment, and
`DealFundingAuthorizationPanel.tsx`'s doc comment. The field-level contract should not differ from a
real regeneration (both are derived from the same `entity.mjs`), but a genuine operator-run
regeneration should be diffed against these files once live credentials are available, rather than
assumed identical. Because of this residual uncertainty, every write/read path fails closed with a
visible error — never a silent fallback to the in-memory store — if a live call doesn't behave as
expected.

## What was built

1. **`power.config.json`** — added the `fundingauthorizations` data source
   (`cr664_fundingauthorizations` / `cr664_fundingauthorization`), matching every other entry's shape.
2. **`src/generated/models/Cr664_fundingauthorizationsModel.ts`** /
   **`src/generated/services/Cr664_fundingauthorizationsService.ts`** — hand-authored, disclosed (see
   above), following this repo's exact generated-file boilerplate. Added to `src/generated/index.ts`'s
   barrel exports alongside every other generated pair.
3. **`src/funding/fundingAuthorizationDataverseStore.ts`** (new) — `createDataverseFundingAuthorizationStore()`,
   a durable `FundingAuthorizationStorageDeps` implementation:
   - Every `FundingAuthorizationRecord` field maps 1:1 onto the table's 18 columns + primary
     `cr664_recordid`.
   - `exceptions` / `supportingDocumentIds` / `auditEventIds` round-trip through JSON text columns,
     decoded fail-closed — a malformed JSON column (or an entry missing a required field) fails the
     *entire* `getCurrentRecordForDeal` read rather than silently dropping or fabricating a value,
     since an incomplete picture of a deal's authorization history could misidentify which record is
     actually "current."
   - `createRecord` always performs a genuine Dataverse CREATE (never an upsert). `updateRecord`
     always re-resolves the target row by querying `cr664_recordid eq '<id>'` fresh on every call —
     no in-memory id cache — so a fresh adapter instance after a component remount behaves identically
     to one that has been running the whole session. This is what makes durable history preservation
     automatic: when the domain layer supersedes a prior REVOKED/REJECTED/CANCELLED record (see
     `fundingRequestAdapter.ts`), it creates a brand-new record with a new `recordId` and a
     `supersedesRecordId` pointer — this adapter has no code path that would ever touch or overwrite
     the row being superseded.
   - `getCurrentRecordForDeal` filters by `cr664_dealid eq '<escaped dealId>'` (OData single-quote
     escaping via a local `escapeOData` helper, matching this repo's established convention in e.g.
     `src/team/teamQueries.ts`), then applies the identical "latest non-superseded record" selection
     rule `createInMemoryFundingAuthorizationStore()` already used, so callers see the same result
     regardless of which backend is wired in.
   - Every SDK call is wrapped in try/catch; every failure path returns an honest
     `{ success: false, error }` rather than throwing past the adapter boundary.
4. **`DealFundingAuthorizationPanel.tsx`** — replaced `createInMemoryFundingAuthorizationStore()` with
   `createDataverseFundingAuthorizationStore()`. Added:
   - A real loading state (`role="status"`) while the initial durable read is in flight.
   - A visible error state (`role="alert"`) if that initial read fails or rejects.
   - A visible action-error message for any failed write outcome from approve/reject/revoke/confirm
     (previously these outcomes were silently ignored on anything other than success — a real gap
     this pass closed, not something newly introduced).
   - Removed the "session-only, not yet saved" disclosure note, since it is no longer true.
5. **`platformInventory.ts`** — updated the `funding-authorization-persistence` `NOT_WIRED` entry's
   reason text to describe the durable store and the hand-authored-SDK caveat (still `blockerKind:
   'schema'`, since the honest caveat is schema-verification, not a missing capability).
6. **`intentionallyUnrouted.ts`** — no change needed beyond a comment refresh; the two Workstream 7
   files that stay allow-listed (`fundingTimeline.ts`, `fundingFeatureFlags.ts`) are still genuinely
   unconsumed by the new adapter.
7. Dual-control policy is unchanged and unweakened: `FundingAuthorizationPanel.tsx`'s own
   `isSelfApprovalRisk` check and the policy engine's `self_approval_not_permitted` denial still
   correctly block one actor from completing both sides of approval — now durably, not merely within
   a session.
8. Retained the `BankerShell` post-create lifecycle fix from the prior pass (mounted-ref guard around
   the post-create readback retry, `Array.isArray` fail-closed `isSatisfied` check, try/catch around
   the retry) — untouched by this pass, still in place.

## Tests

- `src/funding/fundingAuthorizationDataverseStore.test.ts` (new, 23 tests): row↔record mapping
  (well-formed row, JSON-array decoding, malformed-JSON fail-closed, malformed-entry fail-closed,
  unrecognized-status fail-closed, missing-required-field fail-closed), `createRecord` (payload
  shape, honest failure, thrown-call caught), `updateRecord` (approval/rejection/revocation all use
  the same lookup-then-update path; zero-match fail-closed; ambiguous-match fail-closed; honest
  failure surfacing), `getCurrentRecordForDeal` (exact deal-id scoping, OData-escaping, 3-deep
  supersession-chain resolution, honest read-failure surfacing, thrown-call caught, single-malformed-
  row fails the whole read).
- `src/deals/DealFundingAuthorizationPanel.test.tsx` (rewritten, 9 tests): loading state, honest load-
  failure state (both a `{success:false}` result and a thrown rejection), request persists through
  the durable store, self-approval still blocked, a distinct approver reaches APPROVED, a failed
  write surfaces a visible action error without silently advancing status, **records survive a
  component unmount+remount** via a hand-rolled fake store whose backing map lives at module scope
  (proving durability across remounts, not merely React state), and the request form stays disabled
  for an unauthorized actor.

## Validation

`npx tsc -b` clean. `npm run build` clean. `npm run audit:reachability`: 0 unexpected orphans — the
two new generated files are genuinely reachable through `fundingAuthorizationDataverseStore.ts`, not
allow-listed. Full suite passes (see commit for exact counts).

## What did NOT change

- No weakening of dual-control, self-approval prevention, or terminal-state protection — all enforced
  identically to before, in the same pure policy module (`fundingAuthorizationPolicy.ts`), untouched.
- `FundingReadinessFacts` fields with no live source still hard-code to their fail-closed blocking
  value; a session can now durably reach `APPROVED` but still correctly shows blocked at disbursement
  confirmation.
- No Teams/Outlook/SharePoint wiring — out of scope.
