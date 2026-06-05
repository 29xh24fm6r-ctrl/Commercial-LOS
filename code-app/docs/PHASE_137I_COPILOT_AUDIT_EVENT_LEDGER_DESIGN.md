# Phase 137I — Copilot audit / event ledger design

> **Audit / event ledger design only.** This phase designs the audit
> contract the server-side Copilot handler must satisfy **before** any live
> model call can be enabled. It creates **no** Dataverse table, migration,
> plugin, Azure Function, Custom API, connector, secret, token, schema, or
> live traffic. The runtime Copilot connector stays **`not_configured`**
> and no client/cockpit behavior changes.

## A. Purpose and status

- **This is audit / event ledger design only.**
- **Nothing is created here:** no Dataverse table, no migration, no plugin,
  no Azure Function, no Custom API, no connector, no secret, no token, no
  schema, no live traffic.
- **Runtime remains `not_configured`.** The Phase 137D resolver still
  resolves `not_configured` by default; the Phase 137E transport stub still
  fails closed; no concrete transport is wired.

The design fixes the audit ledger so a future server handler (Phase 137H
spec) can be built with the audit-before-model rule already pinned.

## B. Audit-before-model rule

This is the core invariant of the whole Copilot live runway:

- The server handler **MUST write an `audit_start` event before any Azure
  OpenAI / model call**.
- If the `audit_start` event **cannot be written**, the handler returns a
  fail-closed response with **`failClosedCode: audit_unavailable`** — and
  makes **no model call**.
- **No model call may occur before `audit_start` succeeds.**
- An **`audit_completion`** event MUST be written after the response (or
  after a fail-closed path, as `audit_fail_closed`).
- If `audit_completion` **fails after** the model response, the handler
  returns **fail closed** (recommended) until governance explicitly
  approves a degraded "response-with-warning" mode. Default: **fail
  closed**, do not surface model output that could not be fully audited.

## C. Ledger / table ownership decision

The repo already has a canonical governed-write audit table,
**`cr664_AuditEvent`** (Phase 107 communication-activity ledger:
`cr664_correlationid`, `cr664_eventcategory`, `cr664_eventtype`,
`cr664_outcomestatus`, `cr664_notes`). That table is purpose-built for
**deal-scoped governed writes** and its column set does not carry the
model-call fields a Copilot audit needs (prompt/context hashes, model
deployment/version, proposals JSON, fail-closed code).

**Decision:** define a **future dedicated Dataverse table**
**`cr664_copilotauditevent`** for Copilot model-call audit events, reusing
the existing `cr664_correlationid` correlation discipline so a confirmed
proposal's eventual governed write (logged in `cr664_AuditEvent`) can be
cross-referenced by `correlationId`.

> **No table is created in Phase 137I.** This is the proposed contract
> only. A future guarded metadata script (Phase 137J) would plan/create it
> dry-run-first.

## D. Proposed Dataverse table / field contract

**Logical table:** `cr664_copilotauditevent` (display: "Copilot Audit
Event"). Proposed columns:

| Field | Purpose |
| --- | --- |
| `cr664_copilotauditeventid` | Primary key (event id). |
| `cr664_name` | Primary name (human label, e.g. `<eventtype>:<correlationId>`). |
| `cr664_correlationid` | Correlation id shared across an interaction's lifecycle events. |
| `cr664_eventtype` | `audit_start` \| `audit_completion` \| `audit_fail_closed` \| `proposal_confirmed` \| `governed_write_completed`. |
| `cr664_eventtimestamp` | Event time (server clock). |
| `cr664_userupn` | Caller UPN. |
| `cr664_userprofileid` | Caller profile id. |
| `cr664_workspacename` | Caller's primary workspace name. |
| `cr664_workspace` | `banker` \| `manager` \| `portfolio` \| `team` \| `executive`. |
| `cr664_surface` | `deal` \| `workspace`. |
| `cr664_dealid` | Deal id (when surface = deal). |
| `cr664_dealname` | Deal name (when applicable). |
| `cr664_promptkind` | Prompt kind from the allowlist. |
| `cr664_redactedpromptsummary` | Redacted prompt summary (never raw sensitive text). |
| `cr664_prompthash` | Hash of the (pre-redaction) prompt for correlation. |
| `cr664_contextsummary` | Redacted context summary. |
| `cr664_contexthash` | Hash of the context. |
| `cr664_mode` | Requested mode (`live_read_only` \| `proposal_only`). |
| `cr664_policyversion` | Policy version applied. |
| `cr664_modeldeployment` | Azure OpenAI deployment name. |
| `cr664_modelversion` | Model version. |
| `cr664_responsemode` | Resolved response mode (incl. `disabled`/`not_configured`). |
| `cr664_islive` | Whether the response was live. |
| `cr664_failclosedcode` | Fail-closed code when applicable. |
| `cr664_warningsjson` | Warnings (JSON array). |
| `cr664_proposalsjson` | Proposals emitted (JSON; ids + action types + governedWritePath, no secrets). |
| `cr664_proposalcount` | Count of proposals emitted. |
| `cr664_confirmationstatus` | `proposed` \| `confirmed` \| `declined`. |
| `cr664_confirmedproposalid` | Proposal id the user confirmed (later event). |
| `cr664_governedwritepath` | Governed write path a confirmed proposal routes through. |
| `cr664_governedwriteid` | Final governed write id (later event). |
| `cr664_errorclass` | Error class on `connector_exception`. |
| `cr664_errorsummary` | Safe error summary (no secrets / stack with secrets). |
| `cr664_payloadversion` | Audit payload schema version. |

### Required at `audit_start`

`cr664_correlationid`, `cr664_eventtype` (= `audit_start`),
`cr664_eventtimestamp`, `cr664_userupn`, `cr664_userprofileid`,
`cr664_workspacename`, `cr664_workspace`, `cr664_surface`,
`cr664_promptkind`, `cr664_redactedpromptsummary` (or `cr664_prompthash`),
`cr664_contextsummary` (or `cr664_contexthash`), `cr664_mode`,
`cr664_policyversion`, `cr664_payloadversion`. (`cr664_dealid` /
`cr664_dealname` required when surface = deal.)

### Required at `audit_completion`

`cr664_correlationid`, `cr664_eventtype` (= `audit_completion` or
`audit_fail_closed`), `cr664_eventtimestamp`, `cr664_responsemode`,
`cr664_islive`, `cr664_modeldeployment`, `cr664_modelversion`,
`cr664_proposalcount`, `cr664_proposalsjson`, `cr664_warningsjson`, and
`cr664_failclosedcode` (when fail-closed).

### Populated only after confirmation / write completion

`cr664_confirmationstatus`, `cr664_confirmedproposalid`,
`cr664_governedwritepath`, `cr664_governedwriteid` — written on the later
`proposal_confirmed` / `governed_write_completed` events.

### Must NEVER contain raw borrower documents or secrets

`cr664_redactedpromptsummary`, `cr664_contextsummary`,
`cr664_proposalsjson`, `cr664_warningsjson`, `cr664_errorsummary` — these
carry **summaries / hashes only**. **No raw borrower document content, no
secrets, no tokens, no API keys** may ever be written to any field.

## E. Event lifecycle

1. Client builds the request with a `correlationId`.
2. Server validates the request shape (Phase 137B / 137H §D).
3. Server writes **`audit_start`** (fail closed `audit_unavailable` if it
   cannot).
4. Server applies policy / DLP / model gates + the disable switch.
5. Server calls the model **only if** the gates pass.
6. Server validates the model response against the response contract.
7. Server writes **`audit_completion`** (or **`audit_fail_closed`**).
8. The UI receives the response carrying `audit.eventId` and
   `correlationId`.
9. If the user later confirms a proposal, the governed write path logs
   **`proposal_confirmed`** and **`governed_write_completed`**, linked by
   `correlationId` + proposal id.

## F. Required indexes / uniqueness

- **Index on `cr664_correlationid`** (lifecycle correlation — primary query
  path).
- **Index on `cr664_eventtimestamp`** (time-range queries / retention).
- **Index on user / profile / workspace** (`cr664_userupn` /
  `cr664_userprofileid` / `cr664_workspace`).
- **Index on `cr664_dealid`** where applicable.
- **Optional uniqueness on the event id** (`cr664_copilotauditeventid` is
  already unique as the PK; any natural-key uniqueness is optional).
- **No uniqueness on `cr664_correlationid`** — multiple lifecycle events
  (`audit_start`, `audit_completion`, `proposal_confirmed`,
  `governed_write_completed`) intentionally share one correlation id.

## G. Retention and privacy

- Prompt / context stored as **hash / summary only**.
- **No raw borrower documents.**
- **No secrets / tokens / API keys.**
- **No full model prompt** unless governance explicitly approves it.
- **Retention period must be approved** (bank records policy).
- **Export / delete requirements** must follow bank policy (e.g.
  subject-access / right-to-erasure handling on summaries only).

## H. Fail-closed behavior

- **`audit_unavailable`** — `audit_start` cannot be written → fail closed
  **before** any model call.
- **`connector_exception`** — an audit write throws unexpectedly.
- **`policy_blocked` / `dlp_blocked`** — policy / DLP gates fail.
- **`unsafe_output`** — response validation fails.
- Every fail-closed response **MUST attempt to write `audit_fail_closed`**
  if the audit channel is available (so even refusals are auditable).

## I. Proposal linkage

How a proposal links to a future governed write (no write executes from
model output directly):

- **proposal id** (stable id from the response).
- **action type** (allowlisted).
- **`governedWritePath`** (the existing governed write a confirmation
  routes through).
- **`requireConfirmation: true`** (always).
- **confirmation status** (`proposed` / `confirmed` / `declined`).
- **final governed write id** (set on `governed_write_completed`).
- **timestamp / user** of the confirmation.
- **No write executes from model output directly** — a human confirms, and
  the existing governed write path performs (and separately audits via
  `cr664_AuditEvent`) the actual write, cross-referenced by
  `correlationId`.

## J. Out of scope

- **No Dataverse table creation.**
- **No migration.**
- **No server handler.**
- **No Custom API write.**
- **No Azure OpenAI.**
- **No runtime wiring.**
- **No live enablement.**

## K. Future phases

- **137J** — guarded audit-table metadata script / spec, **dry-run first**.
  See [PHASE_137J_COPILOT_AUDIT_TABLE_METADATA_SCRIPT.md](./PHASE_137J_COPILOT_AUDIT_TABLE_METADATA_SCRIPT.md).
- **137K** — server audit-logger interface / skeleton, **disabled**.
- **137L** — server handler skeleton once the audit table is available.
- **137M** — live-transport test harness, **still disabled**.
- **137N** — controlled test-tenant enablement.

## References

- [PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md](./PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md)
- [PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md](./PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md)
- [PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md](./PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md)
- [PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md](./PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md)
  — the existing `cr664_AuditEvent` canonical governed-write audit table.
- `feat/copilot-live-connector-safe-actions @ fea3520` — prior prep. **Not
  merged or implemented in Phase 137I.**
