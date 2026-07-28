# PR F — Deferred capabilities completion

Date: 2026-07-28

Target environment: `5f2d77a5-de50-edeb-9d74-5b2400a2320d`

Target organization: `https://org3a57b8d4.crm.dynamics.com/`

## Binary document upload

- `cr664_documentchecklist.cr664_documentfile` is a live Dataverse File
  column (`FileType`, 25 MB).
- The original filename, MIME type, file size, upload timestamp, and uploader
  relationship are present and verified by
  `scripts/dataverse/create-document-checklist-file-columns.ps1`.
- The banker document modal uses the existing governed
  `documentUploadAction` and `documentUploadLiveDeps` path.
- Upload writes remain fail-closed: metadata, audit, and timeline evidence are
  not reported as successful when the binary write fails.
- `document-upload` is retired from `NOT_WIRED` and registered as
  `GOVERNED_WRITES.deal-document-upload`.

## Annual-review completion

- The manager annual-review route reads the live boarded-loan population.
- Review packages are upserted into
  `cr664_portfolioboardedloanreviews`; searchable review fields remain
  first-class columns and the versioned aggregate is stored in `cr664_notes`.
- Every mutation appends a
  `cr664_portfolioboardedloanauditentries` row attributed to the authenticated
  Power Apps user.
- Completion is exposed only when the deterministic readiness engine reports
  `annualReviewReady`; otherwise it fails closed with the specific blockers.
- An audit failure is surfaced as partial success and is never reported as a
  completed governed operation.
- `annual-review-persistence` is retired from `NOT_WIRED` and registered as
  `GOVERNED_WRITES.portfolio-annual-review-complete`.

## Borrower portal

Private Power Pages site:

- Name: Commercial LOS Borrower Portal
- Website ID: `8f2bc1b5-43af-48ed-b2d2-90231fde6d48`
- URL: `https://commercial-los-borrower-prod.powerappsportals.com`

Live Dataverse/security foundation:

- `cr664_clientrelationship_portalcontact_contact` links a borrower
  relationship to the standard Contact table.
- Open registration is disabled.
- Authenticated Users receive a contact-scoped, read-only parent permission on
  `cr664_clientrelationship`.
- Loan access inherits through
  `cr664_LoanDeal_cr664_Client_cr664_ClientRelationship`.
- Document access inherits through
  `cr664_documentchecklist_cr664_loandeal_Deal` and permits read/write without
  anonymous, create, or delete permission.
- The home page filters relationships by `cr664_portalcontact = user.id` and
  does not expose a global borrower query.
- Requested documents now expose a contact-scoped binary upload control. It
  uses the authenticated Power Pages anti-forgery token, the Dataverse File
  column endpoint, a 16 MB single-request limit, and a narrow Web API field
  allowlist.
- A failed binary request never marks the document received. If the binary
  succeeds but metadata fails, the portal reports partial completion and
  leaves an explicit banker-review message.

## Remaining inventory reconciliation

- Executive and admin `/deals/:id` routes now use one security-trimmed,
  read-only Dataverse workspace. It loads one record and exposes no mutation
  controls.
- Closing document generation now writes its existing durable
  `cr664_closingdocumentmanifest` row plus governed audit/timeline evidence.
- `cr664_fundingauthorization` and all 18 expected columns are live and the
  generated Power Apps service is refreshed.
- Canonical deal stages have live unique `cr664_sequence` values for all seven
  active rows; the unused separate-stage-table proposal remains historical
  only.
- Portfolio migration reconciliation now has a live
  `cr664_portfoliomigrationcontrol` table, nine control fields, a
  `cr664_migrationbatchid` boarded-loan field, generated Power Apps services,
  and a fail-closed live tie-out panel.
- The redundant disabled public/admin New Deal surface is no longer reported
  as a product gap; banker New Deal creation remains the governed live path.
- Current `NOT_WIRED` count is zero. AI model execution, production-browser CI
  execution, and borrower external-identity activation are represented as
  deliberate trust-boundary blocks rather than falsely reported missing code.

## External ID activation blocker

The Entra External ID tenant and identity-provider binding are not activated.
The authenticated Old Glory Bank account currently has no visible Azure
subscription, and Conditional Access rejects Azure Management / Entra admin
device-code sign-in because this device is not managed by Old Glory Bank.

No policy bypass, anonymous portal permission, internal-workforce identity
substitution, or invented client secret was used. Activation requires either:

1. an Old Glory Bank-managed device and an account with an active Azure
   subscription plus Tenant Creator rights, or
2. an approved Conditional Access exception that permits the same scoped
   provisioning session.

Until that prerequisite is satisfied, the site remains private and open
registration remains disabled.
