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
