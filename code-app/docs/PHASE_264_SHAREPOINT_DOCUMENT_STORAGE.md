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

## Operator activation runbook (LIVE SharePoint uploads)

**This implementation phase did NOT perform any of the steps below.** It prepared the code only:
DRY_RUN is the default, no connector was registered/provisioned, no live network call was made, and
no feature flag or launch gate was enabled. Activating LIVE uploads is an operator task:

1. Open the Code App in **Power Apps Studio**.
2. Open the **Data** pane.
3. **Add** the `SharePoint Online` data source.
4. Point it at the bank's intended SharePoint **site and document library**.
5. Confirm the intended **library root**. The application default is `Portfolio Loans`; pass a
   different `libraryRootPath` to `createLiveSharePointDocumentAdapter` if the bank uses another name.
6. **Regenerate the Code App SDK** using the repository's normal generated-data-source workflow (the
   same step that produced `Office365OutlookService.ts` for email).
7. Confirm the generated **SharePoint service and models** appear under `src/generated/`.
8. **Inspect the actual generated operations and signatures.** The connector's real action names may
   differ from the illustrative `createFolderIfNotExists` / `createFile` / `listFolder` shape used by
   `PortfolioSharePointConnectorPort` — do NOT assume names like `CreateFolderIfNotExists`,
   `CreateFile`, or `ListFolder`. Base the wrapper on the ACTUAL generated SDK.
9. Implement a thin, repository-owned `PortfolioSharePointConnectorPort` wrapper around the generated
   service (mapping the real generated actions to `createFolderIfNotExists`/`createFile`/`listFolder`).
10. **Do not edit the generated service itself** (`src/generated/` is generated; never hand-edit).
11. Wire that wrapper into `createLiveSharePointDocumentAdapter(connector)` (a one-line construction
    change at the adapter-selection site — the logic is already written and tested).
12. Configure:
    - `VITE_SHAREPOINT_MODE=LIVE` (only the EXACT literal `LIVE` selects LIVE; lowercase/typos stay DRY_RUN)
    - resolved `documentSharePointUploadEnabled: true` in the feature-flag config
13. Confirm **document-metadata persistence** configuration SEPARATELY
    (`documentMetadataEnabled` is an independent flag — SharePoint upload does not enable it).
14. Rebuild.
15. Run the targeted tests (schema-plan, mode, adapters, hook, panel, feature flags).
16. Run the typecheck (`npx tsc -b`).
17. Run the full suite.
18. Deploy through the normal controlled release process.
19. Perform an authorized operator smoke test using a **non-production or approved test loan**.
20. Verify:
    - exactly ONE per-loan folder is used;
    - the folder name is sanitized correctly (forbidden characters neutralized, no traversal);
    - the file exists in SharePoint;
    - the returned URL is genuine;
    - the metadata row stores the genuine URL in `cr664_filereference` when metadata persistence is enabled;
    - the DRY_RUN wording ("Recorded (dry-run) — no file was actually stored") is ABSENT during a LIVE success;
    - no duplicate file was created (ensure-folder + create-file each ran once).
21. **Record evidence** before any production gate or launch certification is changed.

## Field mapping confirmation

- File reference field: `cr664_filereference` on `cr664_portfolioboardedloandocuments` — a **String**
  column that can hold the real returned SharePoint URL. **No schema migration** is required.
- DRY_RUN never populates `cr664_filereference` and never creates a "stored" metadata row.

No step above was performed by this phase — the code is prepared and fully tested against a mock
connector; only an operator can register the real connector and flip the configuration.
