# Phase 139A — Copilot final operator commands

> **Operator reference — nothing here enables live Copilot.** All commit
> commands are **future-only / explicitly not implemented** (the repo has no
> proven Dataverse table/Custom-API metadata-creation pattern). The runtime
> Copilot connector stays **`not_configured`**. **Test tenant only;
> production is blocked.**

## ⚠ Warnings (read first)

- **Test-tenant only.** Never run any guarded mode against production.
- **Production is blocked** until external governance gates are approved
  (see [PHASE_139A_COPILOT_FINAL_COMPLETION_CERTIFICATION.md](./PHASE_139A_COPILOT_FINAL_COMPLETION_CERTIFICATION.md)).
- **Rollback / manual cleanup:** table/attribute/Custom-API creation is a
  heavyweight Dataverse metadata operation with **no automated rollback** in
  this repo. If a future approved commit is ever run, undo is **manual**
  (delete via Maker Portal / metadata API in the test tenant).
- Inspect modes are **read-only**; seed modes are **offline dry-run**;
  commit flags are **future-only** (print a not-implemented notice, write
  nothing).

## Audit table (`cr664_copilotauditevent`)

```sh
# Inspect (read-only): does the table exist + which expected fields are present?
node scripts/phase122-lookup-repair.mjs --inspect-copilot-audit-table

# Dry-run plan (OFFLINE): prints the full EntityDefinitions + typed
# AttributeDefinitions payload plan. No auth, no network, no write.
node scripts/phase122-lookup-repair.mjs --seed-copilot-audit-table-metadata

# Commit — FUTURE-ONLY / NOT IMPLEMENTED in 138B/139A. Prints a clear
# notice and writes nothing.
node scripts/phase122-lookup-repair.mjs \
  --seed-copilot-audit-table-metadata \
  --commit-seed-copilot-audit-table-metadata
```

**Expected output markers:**

- Inspect → `cr664_copilotauditevent does NOT exist in this environment.`
  (expected) + a `✓`/`✗` field checklist if it exists.
- Dry-run → `Planned TABLE metadata`, `Planned ATTRIBUTE payloads`,
  `Planned cr664_eventtype option values`, `Recommended indexes`, and
  *"No table is created. No attributes are created. No indexes are created.
  No publish is run. This is a metadata plan only."*
- Commit → `--commit-seed-copilot-audit-table-metadata is NOT IMPLEMENTED in
  Phase 138B; run dry-run only. No write has been or will be issued.`

## Custom API (`cr664_RunLosCopilotAssist`)

```sh
# Inspect (read-only): does the Custom API exist + its request/response params?
node scripts/phase122-lookup-repair.mjs --inspect-copilot-custom-api

# Dry-run plan (OFFLINE): prints the planned CustomAPI + request parameter +
# response property payloads. No auth, no network, no write.
node scripts/phase122-lookup-repair.mjs --seed-copilot-custom-api-metadata

# Commit — FUTURE-ONLY / NOT IMPLEMENTED in 138C/139A. Prints a clear
# notice and writes nothing.
node scripts/phase122-lookup-repair.mjs \
  --seed-copilot-custom-api-metadata \
  --commit-seed-copilot-custom-api-metadata
```

**Expected output markers:**

- Inspect → `cr664_RunLosCopilotAssist does NOT exist in this environment.`
  (expected) + request/response parameter listing if it exists.
- Dry-run → `Planned CustomAPI entity payload`, `Planned
  CustomAPIRequestParameter payloads`, `Planned CustomAPIResponseProperty
  payloads`.
- Commit → `--commit-seed-copilot-custom-api-metadata is NOT IMPLEMENTED in
  Phase 138C; use dry-run plan only. No write has been or will be issued.`

## Default app `not_configured` check

```sh
# The app/runtime Copilot connector defaults to not_configured. Verify via
# the governance suite (no live mode is ever enabled by the app):
npm test -- copilotConnectorSkeleton copilotControlledEnablementBundle
```

`getCopilotConnector().status().mode` resolves **`not_configured`**; the
cockpit Copilot panel shows **"Not configured"**.

## Build / test commands

```sh
node --check scripts/phase122-lookup-repair.mjs
npm test -- phase122BScriptContract copilotFinalCompletion releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

## Verification commands (after any future approved commit)

```sh
# Re-inspect to verify metadata landed as expected (read-only):
node scripts/phase122-lookup-repair.mjs --inspect-copilot-audit-table
node scripts/phase122-lookup-repair.mjs --inspect-copilot-custom-api
```

## Guarded-write contract (when a future commit is approved)

- Dry-run by default; commit only with the explicit `--commit-*` flag.
- Inspect first; **bail on ambiguous / duplicate** existing metadata.
- **Idempotent** — if the table / Custom API already exists with the
  expected contract, verify and skip create.
- Publisher prefix `cr664`; forbidden prefix `new_` is rejected.
- **No `PublishXml`**; no `Bypass*` / `Suppress*` / `Force` headers.
- Creates **only** the audit table + audit fields, or **only** the Custom
  API + request/response metadata — no plugin, no Azure Function, no Azure
  OpenAI, no secret, no runtime config, no UI change.
- Verify by re-reading metadata.
