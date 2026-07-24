# PR116 — Global Cash Flow Persistence

Phase 4 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "Global Cash Flow
persistence."

## What this closes

`GlobalCashFlowPanel.tsx`'s banker-entered business/guarantor/debt-service figures — previously
local-only, reset on reload — now persist to `cr664_financialspreadinputs` (a PR105-provisioned
Memo/JSON column on `cr664_loandeal`) through the same governed `updateDealProfile.ts`
authorize → validate → update → readback → audit pipeline used for the deal profile fields, and
load back on mount.

This closes `platformInventory.ts`'s `financial-spread-persistence` NOT_WIRED gap (see
`platformInventory.test.ts`'s `expect(ids.has('financial-spread-persistence')).toBe(false)`).

## Why this didn't wait on Phase 2's SDK regeneration

Same reasoning as Phase 3 (PR115): `cr664_financialspreadinputs` is a plain Memo (long text)
column, not a multi-select or lookup, so it round-trips correctly through
`Cr664_loandealsService.update`/`get` today by raw column name even though the generated
`Cr664_loandealsModel.ts` doesn't declare it yet — the update/get calls pass bodies/rows through
as untyped `Record<string, unknown>`. `updateDealProfile.ts`'s `maxLength` guard (added in Phase 3,
reused here for this field's real 1,048,576-char Memo ceiling) fails the write honestly rather than
letting an oversized payload hit Dataverse's real limit — the same class of bug Phase 1 fixed for
the credit memo.

## What changed

- `src/deals/globalCashFlow.ts` — added `GlobalCashFlowFormState` (the banker-entered figures as
  raw strings, not parsed numbers, so a reload restores exactly what was typed) plus
  `serializeGlobalCashFlowFormState` / `parseGlobalCashFlowFormState`. The parse is fail-closed:
  missing, corrupt, or wrong-shaped JSON returns the empty state — a blank panel, never a crash —
  and per-field junk (wrong type, `null`) is dropped rather than propagated.
- `src/deals/write/updateDealProfile.ts` — added `globalCashFlowInputs` (text, maxLength
  1,048,576 → `cr664_financialspreadinputs`) to `DealProfileField` / `DEAL_PROFILE_FIELD_SPECS` /
  `VerifiedProfilePatch`. The adapter treats the JSON payload as an opaque bounded string; it
  doesn't parse or understand it.
- `src/deals/dealQueries.ts` — added `financialSpreadInputsJson` to `DealDetail` (optional, same
  Phase 189D-precedent convention) and `mapDealDetail`, read off the raw retrieve row.
- `src/deals/GlobalCashFlowPanel.tsx` — now takes `{ deal, authorized, actorEmail,
  actorSystemUserId }` as props (mirroring the existing `DealClosingDocumentsPanel` /
  `DealFundingAuthorizationPanel` convention — props, not context, so the panel stays trivially
  testable without a provider wrapper). Initializes all fields (including guarantor rows) from the
  deal's saved JSON on mount. Added an explicit "Save Global Cash Flow" button (not autosave —
  Dataverse writes are deliberate actions) with an inline saved/error outcome note. When
  unauthorized, the Save button is disabled and the panel says plainly that figures cannot be
  saved — the DSCR calculation itself still works either way.
- `src/deals/BankerDealWorkspace.tsx` — passes `deal`, `authorized={Boolean(systemUserId)}`,
  `actorEmail={email}`, `actorSystemUserId={systemUserId}` into the panel, matching the sibling
  panels mounted right below it.
- `src/shared/governance/platformInventory.ts` — removed the now-resolved
  `financial-spread-persistence` NOT_WIRED entry.
- Updated the NOT_WIRED count and doc citations in `docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md`,
  `docs/PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md`, `releaseCandidateSnapshot.test.ts`, and
  `phase129AMicrosoftVibeScopeAudit.test.ts` to keep the doc/code snapshot pins in sync (this
  branch's base predates PR115/Phase 3's merge, so its own count edit lands separately; whichever
  of the two merges second will need a one-line rebase on this shared count, same as any other
  parallel-branch edit to a shared counter).

## What did NOT change

- No generated SDK file was touched.
- `cr664_loanpurpose` / `cr664_loantermmonths` / `cr664_ownershipstructure` (Phase 3) and
  `cr664_riskratinginputs` / `cr664_underwritingrecommendationinputs` (Phase 5) are untouched —
  separate PR105/PR106 columns, out of scope for this phase.

## Validation

- `npx tsc -b` — 0 errors
- `npx vitest run` — 907 test files, 13260 passed / 2 skipped (pre-existing), 0 failed
- `npm run audit:reachability` — 0 unexpected orphans (1065 non-test sources / 778 reachable / 287
  allow-listed, both counts up slightly from PRs 112–114 merging into master ahead of this branch)
- `npm run build` — succeeds
