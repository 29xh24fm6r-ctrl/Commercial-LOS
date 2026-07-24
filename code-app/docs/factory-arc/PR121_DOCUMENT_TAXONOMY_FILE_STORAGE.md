# Factory Arc Phase 9 — Document taxonomy / real file storage

## Audit citation

The July 24 adversarial audit cited "documents are metadata-only with no
real file storage" as an outstanding gap on the commercial-lending LOS.

## Investigation

This phase traced every document-storage surface in the app rather than
trusting the citation at face value, the same way Phases 6–8 did:

1. **Origination documents** (`src/deals/*`) — `documentUploadAction.ts`
   already has a real binary-upload path (`uploadFile({ documentId,
   fileName, content: Uint8Array })`), a two-step governed write (Step 1a
   uploads the binary, Step 1b stamps metadata only after a successful
   upload — it never claims `uploadstatus=true` for a file that didn't
   land). `documentUploadLiveDeps.ts` wires this live via the SDK client's
   `uploadFileToRecord`, and `DealDocuments.tsx` / `ReceiveDocumentModal.tsx`
   expose a real file picker, gated behind `isDocumentFileUploadEnabled()`.
   The genuine blocker is schema-side and already fully diagnosed: the
   `cr664_documentchecklist` table has no `cr664_documentfile` File column
   yet (`documentUploadSchema.ts` pins the exact column names), and a
   ready-to-run operator script
   (`scripts/dataverse/create-document-checklist-file-columns.ps1`) plus
   runbook (`docs/P0-2_DOCUMENT_UPLOAD_OPERATOR_DEPENDENCY.md`) already
   exist. This is the same class of "already diagnosed, already scripted,
   purely operator-gated" blocker found in Phase 2 (SDK regen) and Phase 8
   (CRM org lookup) — no client-side code change can resolve it.

2. **Portfolio boarding documents** (`src/portfolioBoarding/*`) — a fully
   built SharePoint document-storage framework already exists
   (`docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md`):
   `portfolioSharePointDocumentSchemaPlan.ts` (folder-path derivation),
   `portfolioSharePointDocumentPort.ts` / `portfolioSharePointDocumentMode.ts`
   (typed port + `VITE_SHAREPOINT_MODE`, DRY_RUN by default),
   `portfolioSharePointDocumentAdapters.ts` (dryRun / live / not-yet-
   registered adapters, fully tested), and
   `PortfolioLoanBoardingDocumentUploadPanel.tsx` (real UI showing a "DRY
   RUN" banner or a real "Stored at `<url>`" link on success). This is
   already real, working, honestly gated infrastructure — not a gap.

3. **Closing documents** (`src/closing/documents/*`) — generated closing
   documents are genuinely session-only today
   (`createInMemoryClosingDocumentStore()`), explicitly documented as NOT
   persistence in `closingDocumentStorage.ts`'s own header comment. This
   gap is **already tracked** as its own NOT_WIRED entry
   (`closing-document-persistence`, `blockerKind: 'schema'`) in
   `platformInventory.ts`, and is explicitly this arc's own **Phase 11**
   scope — it is not re-litigated here.

4. **Document category taxonomy** — `dealDocumentQueries.ts` documents
   that `cr664_documenttype` is a *file-format* enum (PDF/Word/Excel/Image),
   not a business document category, and deliberately does not surface it
   as one. The actual document taxonomy (which documents are required, for
   which product/stage/collateral/guarantor combination) lives in
   `documentRequirementDerivation.ts` and is derived, not hardcoded — this
   is already correct and was not touched.

## The stale citation found (Phase-8-style fix)

`src/shared/governance/platformInventory.ts`'s `document-upload` NOT_WIRED
entry still read **"No binary file upload pipeline exists"** — text written
2026-07-07 (commit `f7bc5bb`), eight days *before* the P0-2 commit
(`cbdc7f9`, 2026-07-15) that built the real `uploadFile` binary pipeline in
`documentUploadAction.ts`, and before Workstream G (`701283b`, 2026-07-22)
wired it live end-to-end through `documentUploadLiveDeps.ts` and
`ReceiveDocumentModal.tsx`. The governance registry entry was never updated
to reflect that build — an accurate "genuinely not built" statement had
silently become an inaccurate one now that the pipeline is real, tested,
and wired, just fail-closed behind two feature flags pending the schema
column.

This matters because `platformInventory.ts` is the single source of truth
the Release Readiness Gate, the stabilization checklist, and the release
notes all read from — an operator or auditor reading the stale reason would
wrongly conclude no upload code exists at all, rather than "the code is
done and waiting on one schema column."

### Fix

Rewrote the `document-upload` NOT_WIRED reason to accurately state:
- the pipeline is built (names the three files: `documentUploadAction.ts`,
  `documentUploadLiveDeps.ts`, `ReceiveDocumentModal.tsx`);
- it is NOT_WIRED only because it has nothing to target yet (`cr664_documentfile`
  File column absent), so both feature flags stay off and every upload
  attempt fails closed rather than landing a binary;
- the unblock path is unchanged: run the existing provisioning script,
  regenerate the SDK, then flip the flags.

`blockerKind` stays `'schema'` and the entry `id` is unchanged — the
underlying blocker is real and unresolved; only the description of the
current build state was wrong.

Added a regression test
(`platformInventory.test.ts` — `'document-upload reason reflects the P0-2
pipeline that already exists, blocked only on the schema column (Factory
Arc Phase 9)'`) that pins the corrected reason: asserts the stale "no
pipeline exists" phrase is gone and that the reason names the three real
files plus "File column" and "fails closed".

## What was deliberately NOT changed

- No `src/` runtime code changed — the upload pipeline, the SharePoint
  framework, and the closing-document in-memory store were all already
  correct, honest, and fail-closed. This phase only corrected a stale
  governance description.
- `platformOperationsCapabilitySpecs.ts`'s `document-upload` operator-console
  entry was checked and found already accurate (it correctly states "Live
  write adapter wired" and "Gated file picker in ReceiveDocumentModal.tsx")
  — only `platformInventory.ts`'s NOT_WIRED entry had drifted.
- `closing-document-persistence` was left untouched; it is correctly scoped
  to Phase 11 of this arc, not Phase 9.

## Validation

Per the standing speed-up directive, ran targeted checks only (not the full
suite/build):
- `npx tsc -b` — 0 errors.
- `npx vitest run src/shared/governance/platformInventory.test.ts
  src/admin/ReleaseReadinessGate.test.tsx
  src/shared/governance/conservativeCopyGuard.test.ts` — 122 passed, 0
  failed (88/23/12 respectively, including the new regression test).
