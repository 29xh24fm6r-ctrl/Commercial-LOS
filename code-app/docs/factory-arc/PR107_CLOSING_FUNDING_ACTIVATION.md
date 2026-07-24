# PR 107 — Closing / Funding / Document-Storage Activation

Covers three previously-inert capabilities the Phase 0 baseline flagged:
closing-document generation, funding authorization, and real document
storage. Each got a different treatment based on what it actually needed.

## 1. Closing documents — mounted, local-only

`src/closing/documents/*` (49 tests) was fully built but never mounted
anywhere (confirmed via `src/navigation/intentionallyUnrouted.ts`). Its own
`closingDocumentStorage.ts` doc comment already explains why: "NO LIVE
DATAVERSE FACTORY EXISTS for this module... building a live factory against
a table that doesn't exist would be exactly the kind of fabrication this
whole initiative exists to avoid."

This PR mounts it anyway, using the module's own documented
`createInMemoryClosingDocumentStore()` — a real, working reference
implementation, explicitly NOT persistence (lost on reload). Unlike the
funding module (below), this is a single-actor tool (a banker generates and
previews documents solo, no multi-party approval), so a local-only session
demo is genuinely useful and not misleading, as long as it's labeled — which
`DealClosingDocumentsPanel.tsx` does plainly.

**Schema needed for real persistence**: an operator-authorized
`cr664_closingdocument`-style table (immutable per-document manifest rows,
not a single deal-level blob — closing documents are generated,
regenerated, and superseded over time). Not specced with scripts in this
PR; tracked as a `NOT_WIRED` follow-up (`closing-document-persistence`).

## 2. Funding authorization — NOT mounted; schema specced instead

`src/funding/*` (61 tests) is also fully built and unmounted.
`FUNDING_AUTHORIZATION_ENABLED=false`.

**Why this one is NOT mounted local-only, unlike closing documents or the
GCF/risk-rating panels from PR 105/106**: funding authorization has real
two-person dual-control semantics (`fundingAuthorizationPolicy.ts`'s
`evaluateFundingApproval` requires the SECOND approver to be a genuinely
different person from the first — see `self_approval_not_permitted`). A
single logged-in banker's browser session cannot meaningfully simulate two
distinct approvers acting at two distinct times; mounting the full
request → approve → disburse UI as a local-only single-session demo would
either be trivially bypassable (same person approves both times) or
would need to fake a second identity, which is exactly the kind of
fabrication this arc exists to avoid. This capability genuinely needs real,
durable, multi-session persistence to mean anything at all — more so than
GCF or risk-rating, which are legitimately useful to a single actor even
before schema lands.

**Schema prepared (not applied)**: `scripts/schema-migrations/
pr107-funding-authorization/{create,verify,rollback}-entity.mjs` — creates
a new `cr664_fundingauthorization` table (not just a column) mirroring
`FundingAuthorizationRecord`'s fields, since a deal can have multiple
funding-authorization records over time (via `supersedesRecordId` chains) —
a single additive JSON column could only hold one record, not a history.

### Table

**New entity**: `cr664_fundingauthorization` ("Funding Authorization")

| Column | Type | Notes |
|---|---|---|
| `cr664_recordid` (primary) | Text | |
| `cr664_dealid` | Text | Not yet a real Lookup to `cr664_loandeal` — see below. |
| `cr664_authorizationstatus` | Text | |
| `cr664_requestedamount` | Decimal | |
| `cr664_approvedamount` | Decimal | |
| `cr664_fundingdate` | Date/Time | |
| `cr664_fundingmethod` | Text | |
| `cr664_destinationverificationstatus` | Text | |
| `cr664_conditionssatisfied` | Boolean | |
| `cr664_exceptionsjson` | Multiline Text | JSON-serialized `FundingException[]` (MVP simplification, not a normalized child table). |
| `cr664_authorizedby` | Text | |
| `cr664_secondapprovedby` | Text | |
| `cr664_requestedby` | Text | |
| `cr664_requestedat` | Date/Time | |
| `cr664_authorizedat` | Date/Time | |
| `cr664_correlationid` | Text | |
| `cr664_supportingdocumentidsjson` | Multiline Text | JSON-serialized `string[]`. |
| `cr664_auditeventidsjson` | Multiline Text | JSON-serialized `string[]`. |
| `cr664_supersedesrecordid` | Text | |

`create-entity.mjs` creates the table with a text `cr664_dealid` column
(not a real Lookup) because creating a Lookup relationship via the Web API
is a separate, more involved metadata call than a plain attribute — the
migration doc directs the operator to add a proper Lookup to
`cr664_loandeal` manually in the Maker Portal after running the script, for
correct relational integrity (cascade behavior, delete rules) that a
scripted attribute-only creation can't set up as safely.

### Verification / rollback

`verify-entity.mjs` confirms the entity and all columns exist.
`rollback-entity.mjs --confirm` deletes the entire entity (destructive —
only safe before any real data is written to it).

### Activation

`FUNDING_AUTHORIZATION_ENABLED` stays `false`. A follow-up PR, once this
migration is applied and verified, wires a real `buildLiveFundingAuthorizationStorageDeps()`
and mounts `FundingAuthorizationPanel.tsx` for real — that is genuinely
useful only once two different bankers, in two different sessions, can
each take their turn.

## 3. Real document storage (SharePoint) — already fully covered, confirmed

`docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md` already contains a complete
operator activation runbook for LIVE SharePoint document uploads:
`createLiveSharePointDocumentAdapter` is already written and tested against
a mock connector; `portfolioSharePointDocumentMode.ts` already implements
the DRY_RUN/LIVE mode switch (fail-closed, strict-literal `VITE_SHAREPOINT_MODE`
comparison). The ONLY remaining action is for an operator to register the
SharePoint Online connector as a Code-Apps data source, regenerate the SDK,
wrap the real generated operations to satisfy `PortfolioSharePointConnectorPort`,
and flip the env var — all documented step-by-step in that doc's "Operator
activation runbook" section. No new code or documentation was needed for
this piece; this PR does not duplicate or replace that runbook.
