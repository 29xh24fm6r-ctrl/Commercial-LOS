# Phase 264 (P0) — SharePoint Document Storage for Portfolio Loan Boarding

## Outcome

**Replaces the always-fail document-upload stub with a real, tested SharePoint
upload path: DRY_RUN (today's default) validates a file for real and records
the attempt honestly with NO fake link; LIVE calls a real SharePoint connector
once an operator registers one. One folder per boarded loan. No gate was
flipped, no live network call was made, no connector was provisioned.**

## Why SharePoint, and why per-loan folders

The bank asked for individual loan folders in SharePoint so a loan's documents
are as easy to share with the rest of the bank as any other SharePoint folder.
Dataverse's native "Document Management" SharePoint integration
(`sharepointsite`/`sharepointdocumentlocation` system tables) is designed for
the classic model-driven document grid control, not a Code App's generic data
client — so this instead follows the SAME pattern already used for Office 365
Outlook email (`outlookEmailAdapters.ts` / `emailMode.ts`): a typed port, a
DRY_RUN adapter (real validation, zero network), and a LIVE adapter that calls
the standard SharePoint Online Power Platform connector once an operator
registers it as a data source for this Code App and the SDK is regenerated —
the exact same step that already produced `Office365OutlookService.ts`.

## What landed

- **Schema plan** (`portfolioSharePointDocumentSchemaPlan.ts`, pure) —
  `deriveLoanFolderPath(loanNumber, borrowerLegalName, libraryRoot?)` builds
  `{libraryRoot}/{loanNumber} - {borrower}` for every boarded loan, sanitizing
  SharePoint-forbidden characters (`" * : < > ? / \ |`). Falls back to just
  the loan number when no borrower name is available — never fabricates one.
- **Port + mode** (`portfolioSharePointDocumentPort.ts`,
  `portfolioSharePointDocumentMode.ts`) — `PortfolioSharePointDocumentPort`
  (`upload`/`list`, mirroring `OutlookEmailPort`) and `VITE_SHAREPOINT_MODE`
  (DRY_RUN default; only the literal "LIVE" flips it, fail-closed like
  `VITE_EMAIL_MODE`).
- **Adapters** (`portfolioSharePointDocumentAdapters.ts`) —
  `dryRunSharePointDocumentAdapter` (real validation: empty file, >100MB,
  missing loan number all rejected locally; success never carries a link);
  `createLiveSharePointDocumentAdapter(connector)` (real ensure-folder-then-
  upload logic, HTTP-status failure classification, fully tested against a
  mock `PortfolioSharePointConnectorPort` — the shape a registered SharePoint
  Online connector would satisfy); `notYetRegisteredSharePointDocumentAdapter`
  (LIVE mode selected but no connector wired yet — fails closed with a clear
  reason, never crashes, never fakes success).
- **Hook wiring** (`usePortfolioLoanDocumentPersistence.ts`) — new
  `uploadDocument(loanId, upload, doc)`, gated by its OWN feature flag
  (`sharePointUploadEnabled`, independent of `documentMetadataEnabled`).
  `uploadConfigured` now reflects whether that flag is on — no longer
  hardcoded `false`. When document-metadata persistence is ALSO enabled, the
  resulting `fileReference` (a URL — the existing `cr664_filereference` String
  column on `cr664_portfolioboardedloandocument`, no schema migration needed)
  is persisted onto the document's metadata row.
- **Feature flag** — `PORTFOLIO_BOARDING_DOCUMENT_SHAREPOINT_UPLOAD_ENABLED`
  in `portfolioLoanBoardingFeatureFlags.ts`, default off.
- **UI** (`PortfolioLoanBoardingDocumentUploadPanel.tsx`) — replaces the
  "form will render here when section editors are wired" placeholder with a
  real document-type picker + file input. Renders a visible "DRY RUN" banner
  and, on success, either "Stored at `<url>`" (LIVE, a real link) or
  "Recorded (dry-run) — no file was actually stored" (DRY_RUN) — never the
  wrong one for the mode that ran.

## Tests

`portfolioSharePointDocumentSchemaPlan.test.ts` (folder-path derivation +
sanitization), `portfolioSharePointDocumentAdapters.test.ts` (DRY_RUN
validation, LIVE success/failure classification against a mock connector,
not-yet-registered fail-closed behavior), `portfolioSharePointDocumentMode.test.ts`
(env-var default pin), `usePortfolioLoanDocumentPersistence.test.ts` (new —
this hook had no dedicated test file before; covers upload gating, metadata
composition, and honest failure surfacing), and a rewritten
`PortfolioLoanBoardingDocumentUploadPanel.test.tsx` (the real form, both
DRY_RUN and LIVE result rendering, failure rendering).

## Why the agent did not wire a real connector

Building a real SharePoint Online connector call requires an operator to
register the "SharePoint Online" connector as a data source for this Code App
in Power Apps Studio and regenerate the SDK — the exact step that already
produced `Office365OutlookService.ts` for email. No such file exists yet for
SharePoint (confirmed: nothing under `src/generated/services/` references
SharePoint), and hand-writing one would violate the "`src/generated/` is
generated; never hand-edit" rule. `createLiveSharePointDocumentAdapter`
already contains the real, tested upload logic — wiring in a real connector
once one exists is a one-line construction change, not a rewrite.

## Exact operator steps to go LIVE

1. In Power Apps Studio, open this Code App's Data pane → Add data source →
   SharePoint Online. Point it at the bank's document library (the default
   root folder name is "Portfolio Loans"; pass a different `libraryRootPath`
   to `createLiveSharePointDocumentAdapter` if the bank uses another name).
2. Regenerate the SDK (the same step used for every other data source) — this
   produces `src/generated/services/SharePointOnlineService.ts` and its model.
3. Implement a thin `PortfolioSharePointConnectorPort` wrapper around the
   generated service's `CreateFolderIfNotExists`/`CreateFile`/`ListFolder`-
   equivalent actions (names depend on the generated connector's exact
   action set) and pass it to `createLiveSharePointDocumentAdapter`.
4. Set `VITE_SHAREPOINT_MODE=LIVE` and set
   `documentSharePointUploadEnabled: true` in the resolved feature-flag config.
5. Rebuild and redeploy.

No step above was performed by the agent — this phase only prepared the code.
