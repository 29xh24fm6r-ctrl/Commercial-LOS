# Phase 188F — Document checklist pilot certification

- **Date:** 2026-06-17
- **Worktree:** `C:\Users\MatthewPaller\projects\powerapp-project\code-app-188e` (isolated).
- **Branch:** `phase188e-document-checklist-proof`.
- **Certifies:** the full 188A–188E document checklist generation pilot chain.

## Certification status

**Document checklist generation: `PILOT_LIVE_CONTROLLED`.** One controlled live
proof created the checklist rows and wrote a clean audit for a single pilot deal,
with no borrower contact and the app-runtime generation gate left disabled. This
is a controlled banker pilot, **not** unrestricted GA, and remains opt-in /
script-gated.

## The 188A–188E chain

| Phase | Delivered |
| --- | --- |
| **188A** | Read-only write-path audit; identified the safe **disabled** generator path (`newDealChecklistGenerationAdapter`) and the borrower-contacting paths to exclude. |
| **188B** | Read-only `--inspect-document-checklist-graph` / `--plan-document-checklist-generation` script modes (readiness + idempotency preview). |
| **188C** | Disabled-by-default, runtime-capable **audited** adapter (`generateAuditedDocumentChecklist`) + the `/cr664_users` actor resolver + `assertChangedByCoreUserBind` guard; SDK-bound live deps in a separate file. |
| **188D** | Banker-only, **pilot-disabled** read-only UI panel (`DocumentChecklistPilotPanel`); `canGenerate` always false. |
| **188E** | The one guarded live-write mode `--commit-document-checklist-generation-proof`, and the controlled live proof execution. |

## Live proof facts

- **Environment id:** `5f2d77a5-de50-edeb-9d74-5b2400a2320d`
- **Solution (cr664 work):** `LoanOpsExport`
- **Cross-list reference:** `CommercialLendingLOS`
- **Deal name:** `V1 Banker Create Proof - 2026-06-16 8`
- **Deal id:** `1a10a165-756a-f111-ab0c-70a8a59be491`
- **Actor UPN:** `mpaller@oldglorybank.com`
- **Actor bind:** `/cr664_users(940a202e-756a-f111-ab0c-70a8a59be491)` — a
  `cr664_user` (CoreUser) bind, **never** `/systemusers`.
- **Correlation id:** `phase188e-document-checklist-proof-1a10a165` (audit-only).

### Checklist names + created rows

| Document name | Created row id | Created (UTC) |
| --- | --- | --- |
| 2024 Business Tax Return | `7a674efc-a36a-f111-ab0c-70a8a59be491` | 2026-06-17T23:26:38Z |
| 2025 Interim Financial Statements | `7c674efc-a36a-f111-ab0c-70a8a59be491` | 2026-06-17T23:26:39Z |
| Debt Schedule | `7e674efc-a36a-f111-ab0c-70a8a59be491` | 2026-06-17T23:26:39Z |

### Results

- **Proof status:** `PROOF_CREATED` (3 rows created, then one audit written).
- **Post-proof status:** `ALREADY_GENERATED` — `would_create` after proof = **0**,
  `already_present` after proof = **3** (idempotent re-run created nothing).
- **Audit event written:** **yes** (`Document Checklist Generated`,
  `cr664_ChangedBy = /cr664_users(940a202e-…)`, deal-bound, with created/skipped
  names + correlation id in the audit notes).

## Safety confirmations

- **No new live writes** beyond the three checklist rows + one audit event for
  the single pilot deal (this certification phase adds **zero** Dataverse writes).
- **Checklist row payload excluded `cr664_correlationid`** — the live row payload
  was `cr664_documentname` + `cr664_Deal@odata.bind` only (the column does not
  exist on `cr664_documentchecklists`).
- **Correlation id was audit-only** (on `cr664_auditevents.cr664_correlationid`).
- **`cr664_documenttype` was not used** (no checklist category/template field).
- **`/cr664_users` actor bind, not `/systemusers`** — the audit `cr664_ChangedBy`
  resolved to the actor's `cr664_user` via the platform-user bridge.
- **No borrower communication** — no borrower request, **no email / SMS / Outlook
  / handoff**; the runtime code imports none of those in the generator path.
- **No UI action enabled** — `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED` stays `false`;
  the panel's generate control stays disabled.
- **`DOCUMENT_CHECKLIST_GENERATION_ENABLED` remained `false`** for the app
  runtime (the proof was a script-only override against one deal).
- **No New Deal create / auto-run, no CRM / portfolio / stage automation, no
  route change, no deploy.**

## Follow-up

- **188C adapter `cr664_correlationid` discrepancy — RESOLVED (Phase 188G).** The
  Phase 176A/188C generator row allow-list previously included
  `cr664_correlationid`, which is **not** a column on `cr664_documentchecklists`.
  Phase 188G removed it from the app-runtime row payload + allow-list
  (`DOCUMENT_CHECKLIST_ALLOWED_FIELDS` and `ChecklistRowPayload` are now the two
  metadata-confirmed fields `cr664_documentname` + `cr664_Deal@odata.bind`); the
  correlation id remains on the **audit event** only. The app-runtime generator
  path and the proof mode now use the same correct 2-field row payload.

## Recommendation

Continue the one-domain-at-a-time rollout. Document checklist generation is
certified `PILOT_LIVE_CONTROLLED`; the row-allow-list correction has landed
(Phase 188G), so the remaining step before app-runtime enablement is a controlled
UI-enable phase run with the same systems-integrity pattern. The app-runtime gate
stays disabled until then. Public create, borrower messaging, and
CRM/portfolio/stage automation remain disabled.
