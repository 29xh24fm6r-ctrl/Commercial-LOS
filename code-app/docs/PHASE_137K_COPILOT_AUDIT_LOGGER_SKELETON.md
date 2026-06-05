# Phase 137K — Copilot audit-logger skeleton (disabled)

> **Skeleton / interface only.** This phase adds a pure, app-side audit
> **logger interface + disabled no-op logger + payload builders + validation**
> that document and test how the future server handler will write Copilot
> audit events. It performs **no IO**: **no Dataverse table write**, **no
> table creation**, **no server handler**, **no plugin / Azure Function**,
> **no Custom API invocation**, **no Azure OpenAI call**, **no live
> connector**. The runtime Copilot connector stays **`not_configured`**.

## Purpose

Encode the Phase 137I audit contract as inert TypeScript so the future
server-side logger has a tested interface to implement — while shipping
**only** the disabled logger, which fails closed. Nothing here writes
anything or enables anything.

## Status

- **Skeleton / interface only.**
- **No Dataverse table write.**
- **No table creation.**
- **No server handler.**
- **No plugin / Azure Function.**
- **No live connector.**
- Runtime Copilot connector remains **`not_configured`**.

## What was added

[src/copilot/copilotAuditLogger.ts](../src/copilot/copilotAuditLogger.ts):

- **Audit event payload contract** — `CopilotAuditEventPayload` (maps to
  the future `cr664_copilotauditevent` columns; prompt/context carried as
  redacted summaries / hashes only).
- **Audit logger interface** — `CopilotAuditLogger.writeEvent(...)` returning
  `CopilotAuditWriteResult`.
- **Disabled logger** — `createDisabledCopilotAuditLogger(reason)` (the only
  logger shipped this phase).
- **Builders** — `buildCopilotAuditStartEvent`,
  `buildCopilotAuditCompletionEvent`, `buildCopilotAuditFailClosedEvent`.
- **Validation** — `validateCopilotAuditEvent(event)`.

Constants: `COPILOT_AUDIT_TABLE_LOGICAL_NAME = 'cr664_copilotauditevent'`,
`COPILOT_AUDIT_PAYLOAD_VERSION`, the `CopilotAuditEventType` union
(`audit_start` | `audit_completion` | `audit_fail_closed` |
`proposal_confirmed` | `governed_write_completed`).

## Audit-before-model rule

The whole reason this logger exists (Phase 137H/137I): the server handler
must write an **`audit_start`** event **before any Azure OpenAI / model
call**. If `audit_start` cannot be written, the handler **fails closed**
with **`audit_unavailable`** and makes **no model call**. The disabled
logger encodes exactly this fail-closed posture.

## Disabled behavior

`createDisabledCopilotAuditLogger(reason).writeEvent(...)`:

- performs **no write** and **no IO**;
- always returns `{ ok: false, failClosedCode: 'audit_unavailable', reason }`;
- **never returns `ok: true`**;
- **never fabricates an `eventId`**.

So a future server handler wired to the disabled logger fails closed on
`audit_start` and never reaches a model call — the safe default.

## Validation rules

`validateCopilotAuditEvent` enforces:

- `correlationId` required; `eventType` required + allowlisted;
  `payloadVersion` required.
- Prompt / context are **summary / hash only** — a **raw borrower-document
  marker** (e.g. `data:…;base64,`, PEM blocks, "raw borrower document")
  fails validation.
- **No secrets / tokens / API keys** in summary / JSON fields (sk- keys,
  bearer tokens, api-key markers, long opaque secrets) — fails validation.
- `audit_start` requires user / workspace / surface / mode / promptKind.
- `audit_completion` requires responseMode / isLive / proposalCount.
- `audit_fail_closed` requires failClosedCode.
- `proposal_confirmed` / `governed_write_completed` require proposal /
  governed-write linkage (`confirmedProposalId`, and for the write also
  `governedWritePath` + `governedWriteId`).

## Future real logger responsibilities

A future (separate, server-side) implementation of `CopilotAuditLogger`
will:

- **write to `cr664_copilotauditevent`** (the table from Phase 137I/137J);
- **return a real event id** (the Dataverse row id) on success;
- **never write raw documents or secrets** — summaries / hashes only;
- **link proposal confirmations / governed writes** via `correlationId` +
  proposal id (cross-referencing the existing `cr664_AuditEvent` governed
  write).

It remains gated behind config + security/DLP approval; the default stays
the disabled logger.

## Guardrails preserved

No live connector implementation · no server-side code deployed · no
plugin/Azure Function project · no real `fetch`/`XMLHttpRequest`/network ·
no Dataverse Custom API invocation · no Dataverse table write · no Azure
OpenAI call · no browser-direct Azure/OpenAI · no client-side secrets · no
token work · no schema/migration · no Graph/Office/Teams/Outlook send · no
autonomous writes · no fake responses · no live connector enabled · default
`not_configured` · no cockpit/workspace/entitlement/route change ·
`feat/copilot-live-connector-safe-actions` not merged.

## Acceptance tests

```
npm test -- copilotAuditLogger copilotAuditLoggerSkeleton copilotAuditEventLedgerDesign phase122BScriptContract releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

- `copilotAuditLogger.test.ts` — constants; disabled logger fails closed
  (no event id fabricated); builders map fields without raw dumps;
  validation (missing correlationId / unknown eventType / raw-doc / secret
  markers / proposal & governed-write linkage); static purity scan.
- `copilotAuditLoggerSkeleton.test.ts` — skeleton-only, no live write, no
  server/plugin/migration source, default not_configured, no `src/copilot`
  drift, prior docs honored.

## Next phase recommendation

**Phase 137L** — the server handler skeleton (separate server project,
disabled) that calls `audit_start` (via the disabled logger) **before** the
model boundary and fails closed on `audit_unavailable` — still default
`not_configured` — followed by a disabled live-transport test harness
(137M) and controlled test-tenant enablement (137N).
