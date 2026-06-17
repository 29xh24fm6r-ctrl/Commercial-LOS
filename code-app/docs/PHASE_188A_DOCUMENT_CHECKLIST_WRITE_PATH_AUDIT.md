# Phase 188A — Document checklist write-path audit (read-only)

- **Date:** 2026-06-17
- **Spec:** SPEC-DOWNSTREAM-DOCUMENT-CHECKLIST-GENERATION-PILOT-1.
- **Baseline:** master `d6dfa76` — Banker New Deal create certified
  `PILOT_LIVE_CONTROLLED`; identity audit graph `READY`; runtime audit-actor
  remediation deployed (Phase 187H/G-5). See
  [Phase 187I certification](./PHASE_187I_V1_SYSTEMS_INTEGRITY_CERTIFICATION.md).
- **Scope of this phase:** READ-ONLY audit. No Dataverse writes, no runtime
  change, no borrower communication, no email/SMS, no New Deal proof.

This audit picks the next-safest downstream domain — **document checklist
generation** — and answers every readiness question before any runtime change.

## 1. Which document tables exist?

| Table | Registered data source? | Role |
| --- | --- | --- |
| `cr664_documentchecklists` | **Yes** (`cr664_documentchecklists`) | The document-requirement / checklist rows (one row per required document on a deal). |
| `cr664_auditevents` | Yes | Governed audit ledger. `cr664_ChangedBy` → `cr664_user` (required). |
| `cr664_dealtimelineevents` | Yes | Activity ledger used by the **email/handoff** paths (not by checklist generation). |

There is **no checklist template / reference table.** The "template" is a
caller-supplied approved list of document names (`templateDocumentNames`).
`cr664_documenttype` is a **file-type** picklist (788190000 PDF / 788190001 Word
/ 788190002 Excel / 788190003 Image) — NOT a requirement category — and is
optional on create.

## 2. Which document write paths are live vs disabled?

| Path | File / action | State | Contacts borrower? |
| --- | --- | --- | --- |
| Request a document (status update on existing row) | `documentActions.ts` `requestDocument` | LIVE | No |
| Mark received / reviewed (status update) | `documentActions.ts` `markDocumentReceived`, `markDocumentReviewed` | LIVE | No |
| Send document-request **email** | `sendDocumentRequestEmail.ts` | LIVE (Outlook adapter; LIVE adapter returns "connector not registered"; DRY_RUN synthesizes accepted — **audit + timeline fire either way**) | **YES (email)** |
| Prepare email **handoff** (mailto / clipboard) | `prepareDocumentRequestHandoff.ts` | LIVE (app does NOT send; banker sends from their own Outlook; audit + timeline fire) | **YES (borrower-request intent)** |
| **Generate** checklist rows for a deal | `newDealChecklistGenerationAdapter.ts` `runNewDealChecklistGeneration` | **DISABLED** (`DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`; orchestrator wires it but banker create passes no template/transport) | **No** |

The three `documentActions` paths are **update** paths (status transitions on
existing rows), not generation. The two email/handoff paths are the only
borrower-contacting document paths. Generation is fully disabled/unreachable at
runtime today.

## 3. Which checklist/template/reference rows exist?

None as Dataverse reference data — there is no template table. Checklist
generation consumes an **approved, deterministic, caller-supplied document-name
list** (`templateDocumentNames`) and writes one `cr664_documentchecklists` row
per fresh name. The approved pilot template list must be pinned in code/config
in Phase 188C (not invented at runtime).

## 4. Which write paths already use the fixed cr664_user audit actor resolver?

Per Phase 187H/G-5, **all live document audit emitters** were back-ported:
- `documentActions.ts` (`requestDocument`, `markDocumentReceived`,
  `markDocumentReviewed`), `sendDocumentRequestEmail.ts`,
  `prepareDocumentRequestHandoff.ts` each take an injected `resolveActorChangedBy`
  (live default `createActorChangedByResolver()`), bind
  `cr664_ChangedBy@odata.bind = opts.actor.changedByBind` (always
  `/cr664_users(<CoreUser>)`), and call `assertChangedByCoreUserBind`. A
  systemuser id is **never** bound into `cr664_ChangedBy`.

**Gap:** `newDealChecklistGenerationAdapter.ts` (the generation path) emits **no
audit event at all** today — it only creates rows via an injected
`runCreateChecklistRow`. Phase 188C must add an audit emit that reuses the same
`createActorChangedByResolver` + `assertChangedByCoreUserBind` + canonical audit
payload, emitting **only after** rows are created, fail-closed (no fake success).

## 5. Which audit payloads are required?

The same canonical `cr664_auditevents` shape the certified New Deal create + the
back-ported emitters use:
- `cr664_ChangedBy@odata.bind = /cr664_users(<resolved CoreUser>)` (required;
  never `/systemusers`, never `cr664_ActorUser`),
- `cr664_LoanDeal@odata.bind = /cr664_loandeals(<dealId>)`,
- verified option-sets (event category / type / entity type / outcome status),
  `cr664_correlationid`, `cr664_changeddate`,
- **no** `ownerid` / `owneridtype` / `statecode` (Dataverse defaults them).

## 6. Required-for-create fields (from the generated model; confirm in 188B)

`cr664_documentchecklists` create:
- **Required:** `cr664_Deal@odata.bind` (lookup → `cr664_loandeals`),
  `cr664_documentname` (string).
- **Server-defaulted:** `ownerid`, `owneridtype`, `statecode`.
- **Optional:** `cr664_documenttype` (file-type picklist), `cr664_requestdate`,
  `cr664_duedate`, `cr664_receiveddate`, `cr664_reviewer`, `cr664_uploadstatus`.

The existing adapter already pins a minimal allow-list:
`cr664_documentname`, `cr664_Deal@odata.bind`, `cr664_correlationid`. 188B should
confirm the live `RequiredLevel` via `--inspect-document-checklist-graph` (same
metadata-probe discipline as the identity graph) before any commit.

## 7. Lookup dependencies

- `cr664_documentchecklists.cr664_Deal` → `cr664_loandeals` (the target deal —
  must exist). No deeper required lookup on the checklist row.
- The audit's `cr664_ChangedBy` → `cr664_user`, resolved via the **already-READY**
  identity audit graph (Phase 187H/G-1). No new identity provisioning needed for
  the pilot banker.

## 8. Would any existing document path contact a borrower?

**Yes — two paths**, both excluded from this pilot:
- `sendDocumentRequestEmail.ts` — sends an Outlook email to the borrower.
- `prepareDocumentRequestHandoff.ts` — prepares a borrower-addressed mailto /
  clipboard handoff.

Checklist **generation** (`newDealChecklistGenerationAdapter`) contacts no
borrower: it only writes internal `cr664_documentchecklists` rows. The 188C
generator must import **none** of the email / Outlook / handoff modules, and the
188D UI must not expose any borrower-send action.

## 9. Safe path for checklist-only pilot activation

**Enable `newDealChecklistGenerationAdapter` (Phase 176A), audited, behind a
pilot flag.** It is already the right shape:
- disabled by default (`DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`),
- idempotent (writes only names not already present, lower-cased),
- allow-listed payload (`cr664_documentname`, `cr664_Deal@odata.bind`,
  `cr664_correlationid`),
- IO injected (no document service imported), no borrower contact, distinguishes
  "checklist generated" from "borrower requested".

Remaining work for the pilot (later phases, all fail-closed, disabled-by-default):
- **188B** — read-only `--inspect-document-checklist-graph` / `--plan-…`:
  confirm the deal exists, identity graph `READY`, live required-for-create
  fields + lookup binds, existing checklist rows on the deal (idempotency), and
  emit statuses `READY_TO_COMMIT` / `ALREADY_GENERATED` / `BLOCKED` /
  `UNSAFE_EXTERNAL_COMMUNICATION`.
- **188C** — add: a live `runCreateChecklistRow` (over
  `Cr664_documentchecklistsService.create`), a live existing-names reader
  (`getAll` by `cr664_Deal`), and an **audit emit** reusing
  `createActorChangedByResolver` + `assertChangedByCoreUserBind`, emitting only
  after rows succeed (partial/fail-closed otherwise). Pilot flag stays false by
  default. No email/Outlook/handoff import.
- **188D** — a banker-only, inspection-first UI surface that shows honest
  disabled/not-ready unless graph `READY` and the pilot flag is on; never
  auto-runs on New Deal create.
- **188E/188F** — one controlled proof against deal
  `1a10a165-756a-f111-ab0c-70a8a59be491`, then certification.

## Guardrails honored in 188A

Read-only. No Dataverse writes. No app runtime change. No borrower communication.
No email/SMS. No New Deal proof. No CRM / portfolio / stage automation touched.
