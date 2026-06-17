# Phase 187H — Master Remediation Implementation

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Spec:** SPEC-DATAVERSE-SYSTEMS-INTEGRITY-MASTER-REMEDIATION-187H-1 (approved).
- **Status:** Code remediation COMPLETE and verified green. The live-data step
  (G-1) is now **COMPLETE** — the CoreUser bridge was provisioned and verified
  `GRAPH STATUS: READY`, and the final banker New Deal proof succeeded (create +
  audit). See [Phase 187I certification](./PHASE_187I_V1_SYSTEMS_INTEGRITY_CERTIFICATION.md).

## Approved policy applied

- Do NOT reuse System Super Admin for banker audit identity. ✅ (classifier already rejects it; unchanged)
- Seed/reuse a production-safe Banker role. ✅ (provisioner policy retained: `cr664_userrole` seed "Banker")
- Seed/reuse production-safe Banker Workspace identity rows. ✅ (`cr664_workspacetype` seed "Banker Workspace")
- Treat `cr664_workspacecontext` as a Picklist on `cr664_workspacetype`, not a table dependency. ✅ (G-2)
- Fix the identity-graph provisioner accordingly. ✅ (G-2)
- Then provision Matthew's CoreUser bridge. ✅ (G-1 — COMPLETE; see below)
- Then back-port the New Deal audit actor resolver to the 12 other live governed audit emitters. ✅ (G-5/G-6)

## What was implemented

### G-2 — Identity-graph provisioner fix (`scripts/phase122-lookup-repair.mjs`)
- Removed the `cr664_workspacecontext` entry from `IDENTITY_NODE_POLICY` (it was modelled as a
  table node; live metadata proves it is a required **Picklist** on `cr664_workspacetype`, and the
  LookupAttributeMetadata cast 404s for it, so the "walk it as a lookup" path never worked).
- Added `IDENTITY_REQUIRED_PICKLIST_SEED` = `{ cr664_workspacetype: { cr664_workspacecontext: { value: 788190001, label: 'OPERATIONAL_CONTEXT' } } }`
  (metadata-backed value; OPERATIONAL_CONTEXT is the Banker Workspace context — never a hardcoded GUID).
- New classification `ALLOWLISTED_PICKLIST` in `classifyRequiredFieldForGraph` (short-circuits before
  the lookup probe). The seeded picklist is added to `payloadKeys` and set on the WorkspaceType
  create body. WorkspaceType create is therefore no longer blocked by `REJECTED_MISSING_REQUIRED_FIELD`.
- Contract tests updated to pin the corrected model: `phase186…`, `phase187…WorkspaceContext`,
  `phase188…ProbeTrace`.

### G-6 — Shared audit-actor bind guard (`src/shared/governance/auditActorBind.ts` + test)
- `assertChangedByCoreUserBind(bind)` throws unless the value targets `/cr664_users(…)`; calls out the
  systemuser regression explicitly; id-free error messages. Pure, SDK-free. 6 unit tests.

### G-5 — Resolver back-port to the 12 governed audit emitters
Every in-app audit emitter now resolves the actor's `cr664_user` id fail-closed via
`createActorChangedByResolver()` (the proven New Deal pattern), binds `cr664_ChangedBy = /cr664_users(<id>)`,
calls the G-6 guard, and **drops** the redundant `cr664_ActorUser@odata.bind` and the server-defaulted
`ownerid` / `owneridtype` / `statecode` from the **audit** payload. On an unresolved actor the audit is
**not** POSTed and the existing partial status (`governance-partial` / `audit-failed`) is returned — no
fake success, no systemuser id ever bound. Timeline (`cr664_dealtimelineevents`) and primary writes were
intentionally left unchanged (out of approved scope).

Files: `dealTaskActions.ts` (completeTask, createDocumentReviewTask), `documentActions.ts`
(request/receive/review), `creditMemoActions.ts`, `logActivityActions.ts`, `sendBorrowerUpdateEmail.ts`,
`sendDocumentRequestEmail.ts`, `prepareDocumentRequestHandoff.ts`, `admin/alertActions.ts`,
`admin/dataQualityActions.ts`. Each action takes an injected `resolveActorChangedBy` (live default).
An `actorEmail` field was added to each action input and wired at every UI call site
(banker = `banker.email`; admin = `admin.upn`).

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` (full suite) → **8465 passed / 490 files**.
- `npm run build` → **green** (exit 0).
- ESLint on all 11 changed source files → **clean** (the repo's 115 other lint findings are
  pre-existing in untouched files and are not part of this change).
- No `check:routes` script exists in this project.

## Guardrails honored

No New Deal proof, no Loan Deal create, no audit write, no public-create enablement, no downstream
automation enablement, no hardcoded GUIDs, no fake audit success, no schema change. **No Dataverse
writes were performed** — the provisioner was not run (it is dry-run/commit-gated and needs a token).
No `pac code push` performed (runtime app code DID change for G-5, so a pac push + deploy will be
required to ship it — staged, not executed).

## G-1 — live CoreUser bridge provisioning — ✅ COMPLETE

Provisioned and verified `GRAPH STATUS: READY`. Created/bound rows (production-safe,
allow-listed; PlatformUser patched on `cr664_CoreUser` only):

| Row | Id |
| --- | --- |
| WorkspaceType (Banker Workspace, `OPERATIONAL_CONTEXT`) | `920a202e-756a-f111-ab0c-70a8a59be491` |
| UserRole (Banker) | `930a202e-756a-f111-ab0c-70a8a59be491` |
| CoreUser (`cr664_user`) | `940a202e-756a-f111-ab0c-70a8a59be491` |
| PlatformUser (patched `cr664_CoreUser`) | `e20d1fcd-4fbc-4439-962e-975c1db08aeb` |

Verify result: **`GRAPH STATUS: READY`**. The subsequent banker New Deal proof
(`V1 Banker Create Proof - 2026-06-16 8`, deal
`1a10a165-756a-f111-ab0c-70a8a59be491`) created the deal AND wrote the audit
cleanly — no `audit_failed_partial`. Certified in
[Phase 187I](./PHASE_187I_V1_SYSTEMS_INTEGRITY_CERTIFICATION.md).

### Runbook used (for the record)

The cached Dataverse token expired at 2026-06-17T16:19Z; provisioning ran with a
fresh token via:

```
# fresh token required (env var or device-code)
$env:DATAVERSE_BEARER_TOKEN="<jwt>"

# 1. Dry-run the corrected provisioner — expect READY_TO_COMMIT (no longer blocked on workspacecontext)
node scripts/phase122-lookup-repair.mjs --provision-identity-audit-graph --upn mpaller@oldglorybank.com

# 2. Commit (creates production-safe Banker role + Banker Workspace w/ OPERATIONAL_CONTEXT,
#    creates CoreUser, patches cr664_platformuser.cr664_CoreUser ONLY)
node scripts/phase122-lookup-repair.mjs --provision-identity-audit-graph --commit-provision-identity-audit-graph --upn mpaller@oldglorybank.com

# 3. Verify READY
node scripts/phase122-lookup-repair.mjs --verify-identity-audit-graph --upn mpaller@oldglorybank.com
```

**No new New Deal proof until step 3 reports GRAPH STATUS: READY.** Once READY, the back-ported
emitters (G-5) will resolve `cr664_ChangedBy` to the banker's CoreUser and governed-write audits will
succeed across all domains. A `pac code push` + deploy is required to ship the G-5 runtime changes.

## Deferred (from 187G, not in this remediation)

- G-7 (converge the divergent identity tooling), G-8 (deactivate `PHASE121_*` TEST reference rows),
  G-9 (document the unregistered `Cr664_usersService` trap), G-10 (downstream-automation audit at
  enable-time). Tracked in `docs/PHASE_187G_MASTER_SYSTEMS_INTEGRITY_BLOCKER_MATRIX.md`.
