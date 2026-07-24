# PR 113 — Phase 1: Credit Memo SEV-1 Persistence Remediation

Baseline: `master` @ `8bd6176` (Merge PR #111) — confirmed via `git log`/`git status` before any
code change, matching the mission brief's stated current-merged-baseline exactly.

## Investigation (required before code changes)

**Schema / SDK / write path located:**
- `cr664_memotext` — a field on `cr664_creditmemo1` (`src/generated/models/Cr664_creditmemo1sModel.ts`,
  line 30: `cr664_memotext?: string`). The generated model carries no `maxLength` metadata (this repo's
  generated files never embed attribute-level constraints in comments), and no schema-migration
  script exists for this table — it predates the `scripts/schema-migrations/` convention established
  starting PR 105. No live Dataverse credentials exist in this sandbox to query the real attribute
  metadata directly. The July 24 adversarial audit's finding — a live save failing once the memo body
  exceeds `cr664_memotext`'s ~2,000-character ceiling — is treated as a confirmed, already-diagnosed
  fact (reported by an operator with live access), not re-guessed.
- Generated Credit Memo model/service: `Cr664_creditmemo1sModel.ts` / `Cr664_creditmemo1sService.ts`,
  plus the ALREADY-EXISTING normalized sibling table `Cr664_creditmemodraftsectionsModel.ts` /
  `Cr664_creditmemodraftsectionsService.ts` (`cr664_creditmemodraftsection`, one row per memo section,
  each with its own `cr664_drafttext` field — no reported length problem on this table).
- Save adapter: `src/deals/creditMemoActions.ts`'s `saveCreditMemoDraft()` — previously wrote
  `input.memoBody` (the FULL, unbounded memo body) verbatim into `cr664_memotext` on the parent
  `cr664_creditmemo1` create, with no client-side length validation at all.
- Readback path: `src/deals/creditMemoQueries.ts`'s `loadDealCreditMemo()` — reads both tables scoped
  by `_cr664_deal_value eq {dealId} and statecode eq 0`, and (critically) only ever exposes a 240-char
  `preview()` of `cr664_memotext` / `cr664_drafttext` to the UI — **nothing in this app reads the full,
  untruncated `cr664_memotext` value anywhere.**
- Stage-gate evidence loader: `src/workflow/creditReadiness.ts`'s `deriveCreditReadiness()` — checks
  only that at least one `cr664_creditmemo1` row exists (`hasMemo`) and that section LABELS (derived
  from `cr664_creditmemodraftsection.cr664_sectionkey`) include "Executive Summary" / "Repayment
  Analysis". **It never inspects `cr664_memotext`'s content or length.**
- UI error handling: `src/deals/CreditMemoDraftModal.tsx`'s `OutcomeBlock()` — the `memo-failed` case
  rendered `outcome.memoError` **verbatim** (a prior "D-02" fix had deliberately made this render the
  real service error string, to fix an earlier bug where a hardcoded generic message discarded the
  real error entirely). This is the source of the "raw Dataverse/plugin errors are shown to bankers"
  finding.
- Tests currently accepting short memo text: `src/deals/creditMemoActions.test.ts` (`'Memo body
  content'`, `'A very specific body  '`) and `CreditMemoDraftModal.test.tsx`'s two "D-02" tests
  (construct a `memo-failed` outcome directly with a raw, technical-looking error string and assert it
  renders verbatim).

**Recommended schema remedy — Option C (no schema change required for the actual fix), with Option B
proposed-but-not-applied for completeness:**

The normalized `cr664_creditmemodraftsection` table is ALREADY the correct source of truth for
full-fidelity per-section text, and nothing downstream reads `cr664_memotext` expecting the full body
back. So: stop writing the unbounded full body into the PARENT row's `cr664_memotext`; write a short,
safely-bounded manifest there instead (well under the reported ~2,000-char ceiling), while the
full-fidelity text continues to be written, verbatim and untruncated, into the per-section rows this
action already creates. This requires **zero live schema changes** and is immediately effective. Full
memo content is never lost — Option C is explicit that retaining "only a summary or manifest in the
parent memo row" while sections hold full text is an acceptable, non-lossy design.

Option A (widen the existing attribute) was not attempted: it requires live metadata inspection and a
live metadata PATCH, neither of which is possible without live Dataverse credentials in this sandbox,
and per this project's established discipline, schema mutations are proposed/scripted, never applied
blind from this sandbox.

Option B (a new `cr664_memotextlong` Memo column) is proposed as a fully-scripted,
**NOT-applied** migration (`scripts/schema-migrations/pr113-credit-memo-fulltext/`) for a possible
future enhancement if the business later wants the parent row itself to carry one full-fidelity blob
— but it is explicitly not needed for, and not wired into, this fix.

## What was built

1. **`src/deals/creditMemoActions.ts`**:
   - `buildSafeMemoTextSummary(memoBody)` (exported) — identity for any body at or under
     `MEMO_TEXT_SAFE_MAX_CHARS` (500, chosen with a wide safety margin under the reported ~2,000-char
     live ceiling); truncates with a clear, non-technical suffix
     (`"… (full memo text preserved in this draft’s saved sections)"`) only when the body would
     overflow. `cr664_memotext`'s create payload now uses this instead of the raw body.
   - `mapCreditMemoSaveErrorForBanker(rawError, correlationId)` (exported) — maps any raw
     Dataverse/plugin error string to a safe, actionable, non-technical message (a specific
     "too long" message when the raw error mentions the memo-text field + a length problem; a generic
     "system error, try again" message otherwise), always including the run's own `correlationId` so
     support can look up the real diagnostic detail. The RAW error is never discarded — it still flows
     to the best-effort Failed audit event's `cr664_failurereason` exactly as before; only the
     banker-facing `memo-failed.memoError` is now sanitized at the source, before it ever reaches the
     UI layer.
2. **`CreditMemoDraftModal.tsx`** — unchanged (it still renders `outcome.memoError` verbatim, which
   remains correct: the modal's job is to render the outcome it's given faithfully; sanitization now
   happens once, upstream, in the action layer). Its two "D-02" tests' comments were updated to
   reflect this layering (assertions unchanged — they still correctly pin the modal's own
   rendering-fidelity contract).
3. **New tests**:
   - `creditMemoActions.test.ts`: a memo body >2,000 chars now saves successfully; the sent
     `cr664_memotext` payload is bounded and well under 2,000 chars; the section's `cr664_drafttext`
     carries the full, untruncated 3,000-char text verbatim; a body already within the safe ceiling is
     unchanged byte-for-byte (including whitespace); `buildSafeMemoTextSummary` unit tests (identity,
     truncation, boundary, huge-input); `mapCreditMemoSaveErrorForBanker` unit tests (never leaks raw
     table/attribute names or the raw message, correct branch selection, always includes the
     correlation id); the pre-existing memo-failed test updated to assert the message is no longer the
     raw string and matches the safe generic pattern.
   - **New file** `src/deals/creditMemoQueries.test.ts` (this table had no test file before this pass)
     — exact deal-id scoping of both reads, correct field mapping, 240-char preview truncation, fail-
     closed on either read failing (throws, never returns a fabricated/partial result), and a dedicated
     **durability proof**: a memo saved with the new bounded parent summary still round-trips its full
     section content on reload — nothing is lost by the fix.
4. **Proposed, NOT applied schema migration** (Option B):
   `scripts/schema-migrations/pr113-credit-memo-fulltext/{columns.mjs, create-columns.mjs,
   verify-columns.mjs, rollback-columns.mjs}` — a single additive `cr664_memotextlong` Memo column on
   `cr664_creditmemo1`, following the identical pattern established in
   `scripts/schema-migrations/pr105-loan-structure/` and `pr107-funding-authorization/`. Not executed,
   not wired into any read/write path, no feature flag added for it (none is needed since nothing
   consumes it).

## What did NOT change

- `creditReadiness.ts` (the stage gate) — untouched. It already never depended on `cr664_memotext`'s
  content/length, so the fix required no change here; "stage gate must recognize the successfully
  persisted memo" is satisfied because the memo row + section rows are created exactly as before.
- No schema was actually applied. `cr664_memotextlong` does not exist live; the proposed migration
  above is disclosed as proposed-only.
- Dual-write shape, audit/timeline emission, section creation, self-consistent correlation-id
  threading — all unchanged.

## Tests

`npx vitest run src/deals/creditMemoActions.test.ts src/deals/creditMemoQueries.test.ts
src/deals/CreditMemoDraftModal.test.tsx src/deals/CreditMemo.test.tsx` — 55 tests passing (26 + 6 + 17
+ 6).

## Validation

`npx tsc -b` clean. `npm run build` clean. `npm run audit:reachability`: 0 unexpected orphans (no new
production source files were added outside the migration-scripts folder, which is not part of the
`src/` reachability graph). Full suite: see PR description for exact counts.
