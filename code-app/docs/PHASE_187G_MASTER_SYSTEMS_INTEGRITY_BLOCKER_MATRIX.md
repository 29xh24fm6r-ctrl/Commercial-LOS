# Phase 187G — Master Systems-Integrity Blocker Matrix & Remediation Plan

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Status:** **FOR REVIEW.** No remediation (187H) until this matrix is approved.
- **Inputs:** Phases 187A–187F (this branch). Live env `org3a57b8d4.crm.dynamics.com`.
- **Spec:** Phase 187G.

## Executive summary

The pilot exposed **two independent failure classes**, both metadata-confirmed:

1. **Identity graph not provisioned (data).** The audit actor lookup `cr664_auditevent.cr664_changedby`
   targets `cr664_user` (CoreUser). The pilot banker has **no CoreUser row** (PlatformUser.CoreUser
   empty), and the canonical provisioner is itself blocked on two upstream dependencies
   (`workspacetype.cr664_workspacecontext` picklist; no production-safe `cr664_userrole`). Result:
   **audit fails closed (`audit_failed_partial`) for the pilot.**
2. **Audit actor bind defect in code (runtime).** Twelve in-app governed writes (task, document,
   borrower comm, credit memo, alert, DQ) bind `/systemusers(<id>)` into the `cr664_user` lookup — the
   same defect New Deal create already fixed but **never back-ported**. These domains are **LIVE**
   today, so their audits already fail closed (`governance-partial`).

Loan Deal create and New Deal create payloads themselves are healthy. Stage/Status reference data is
production-safe (INTAKE/Intake, OPEN/Open). The fix pattern (`newDealAuditActorResolver`) already
exists and is proven.

**System graph status: BLOCKED. Do not run another live proof or enable additional write domains until
the identity graph reaches READY and the actor-bind defect is remediated.**

## Severity legend

`BLOCKS_V1` · `BLOCKS_WRITE_DOMAIN` · `BLOCKS_AUDIT_ONLY` · `BLOCKS_DOWNSTREAM_AUTOMATION` ·
`WARNING` · `CLEAN`. Fix type: `data` · `script` · `runtime` · `schema` · `decision`.

## Blocker matrix

| ID | domain | severity | table / field | root cause | evidence | required fix | fix type | deploy? | operator? | prod risk | blocks V1? | test coverage required |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **G-1** | identity / audit | **BLOCKS_V1** | `cr664_platformuser.cr664_CoreUser` → `cr664_user` | CoreUser bridge empty for banker; audit actor unresolvable | 187D D-1; `verify-identity-audit-graph`: CoreUser NO → BLOCKED | Provision CoreUser + populate bridge via one canonical provisioner, after G-2..G-4 | data (script) | no | maybe (approve rows) | medium | **yes** | `verify-identity-audit-graph` READY; new-deal audit emits (no `audit_failed_partial`) |
| **G-2** | identity provisioning | **BLOCKS_V1** | `cr664_workspacetype.cr664_workspacecontext` (Picklist) | provisioner allow-list does not set the required workspacecontext picklist on workspacetype create; commit `ad2192f` modeled it as a node, but it is a picklist column | 187B B-3; 187D D-2; identity-graph capture line 72/83 | Fix canonical provisioner to set `cr664_workspacecontext` (e.g. 788190001 OPERATIONAL_CONTEXT, confirm) on workspacetype create; drop the "WorkspaceContext node" model | script (+schema-assumption) | no | confirm context value | low | **yes** | provisioner dry-run shows workspacetype CREATE not REJECTED_MISSING_REQUIRED_FIELD |
| **G-3** | reference data | **BLOCKS_V1** | `cr664_userrole` (no banker role) | only `System Super Admin` exists (admin-only/rejected) | 187D D-3; 187E E-3; coreuser-deps capture | Seed one production-safe banker `cr664_userrole` (allow-listed; `cr664_rolename` only) | data (script) | no | confirm role name | low | **yes** | provisioner shows an APPROVED Role candidate |
| **G-4** | identity provisioning | **BLOCKS_V1** | `cr664_workspacetype` / `cr664_userrole` reuse | existing rows the PlatformUser points at (`13433690…`, `0fe822e1…`) are not surfaced as APPROVED candidates | 187D D-4; coreuser-deps "0 approved" | Decide: reuse existing rows if production-safe, else seed new; align candidate classifier to the decision | decision (+script) | no | **yes** (policy) | low | **yes** | classifier returns ≥1 APPROVED PrimaryWorkspace + Role |
| **G-5** | governed writes (audit) | **BLOCKS_WRITE_DOMAIN** (×12) | `cr664_auditevent.cr664_changedby` | 12 emitters bind `/systemusers(id)` into the `cr664_user` lookup; no resolver; owner/state over-sent | 187F; 187A ⚠ rows | Back-port `newDealAuditActorResolver` to all emitters (ideally consolidate behind `buildNewDealAuditPayload`); drop `cr664_ActorUser`→systemusers and owner/state | runtime | **yes** (pac code push) | no | medium (live domains) | **yes** | target-assertion test across all emitters; `npm test` green |
| **G-6** | SDK / type safety | **BLOCKS_WRITE_DOMAIN** (systemic) | all `@odata.bind` keys | generated SDK types binds as bare `string` (no target enforcement) — let G-5 compile | 187C C-10 | Add a metadata-backed bind guard (assert target entity set per lookup) at payload-builder layer + regression test; do NOT hand-edit generated code | runtime + test | yes (with G-5) | no | low | yes (with G-5) | bind-guard unit test; rejects `/systemusers` into `cr664_changedby` |
| **G-7** | identity tooling | **WARNING** | three inspect/seed modes, divergent allow-lists | "one level at a time" discovery; modes disagree | 187D D-5 | Converge on one canonical provisioner + one allow-list; deprecate one-hop modes | script | no | no | low | no | single provisioner path covered by tests |
| **G-8** | reference data hygiene | **WARNING** | `cr664_dealstagereferences` / `cr664_dealstatusreferences` | `PHASE121_STAGE` / `PHASE121_STATUS` TEST rows active in prod tables | 187E E-1/E-2 | Deactivate the two TEST rows (guarded script or operator) | data | no | maybe | low | no | inspect shows 1 prod-safe active each, 0 active TEST |
| **G-9** | SDK / data source | **WARNING** | `Cr664_usersService` → `cr664_users` (unregistered) | generated service points at a data source absent from `dataSourcesInfo.ts` | 187C C-1/C-9 | Do not wire `Cr664_usersService` at runtime; keep using the bridge resolver; document the trap | runtime (guard/doc) | no | no | low | no | test asserting no runtime import of `Cr664_usersService` (exists: `bootstrapFlow.test.ts`) |
| **G-10** | downstream automation | **BLOCKS_DOWNSTREAM_AUTOMATION** | CRM/stage/checklist/portfolio adapters | emit no `cr664_auditevent` when enabled | 187F; 187A DEAD/DISABLED | When enabling any downstream adapter, add audit emission via the canonical resolver | runtime | future | no | n/a (disabled) | no (V1 ships with automation disabled) | per-adapter audit test at enable-time |
| **G-11** | schema assumption | **CLEAN (resolved)** | audit OptionSets | suspected option-value drift | 187C (cleared) | none — generated enums match live | — | no | no | none | no | n/a |

## Dependency-ordered remediation plan (187H scope, pending approval)

Each step is **dry-run by default**, commit-flag gated, allow-listed, metadata-backed.

1. **G-4 (decision):** confirm whether to reuse the existing workspacetype/userrole rows the
   PlatformUser references, or seed fresh production-safe rows. *Operator/owner decision — blocks 2–4.*
2. **G-2 (script):** fix the canonical provisioner to set `cr664_workspacecontext` on workspacetype
   create; remove the WorkspaceContext-as-node model. Verify dry-run unblocks workspacetype create.
3. **G-3 (data/script):** seed one production-safe banker `cr664_userrole`. Verify an APPROVED Role
   candidate appears.
4. **G-1 (data/script):** with G-2/G-3/G-4 satisfied, provision the CoreUser row and populate
   `cr664_platformuser.cr664_CoreUser`. Verify `verify-identity-audit-graph` → **READY**.
5. **G-5 + G-6 (runtime):** back-port the cr664_user resolver to the 12 emitters (consolidate behind
   the canonical builder), add the bind-target guard, remove `cr664_ActorUser`→systemusers and
   owner/state over-send. Add target-assertion tests across all emitters. *Requires pac code push.*
6. **G-7 (script):** converge the identity tooling on one provisioner/allow-list; deprecate one-hop modes.
7. **G-8 (data):** deactivate the `PHASE121_*` TEST reference rows.
8. **G-9 (runtime/doc):** keep `Cr664_usersService` unwired; document the trap; keep the no-import test.
9. **G-10 (future):** defer — only when a downstream adapter is enabled, add its audit emission.

**Ordering rationale:** 1→4 is the identity graph (data; the only path to READY and clean audit). 5–6
is the code defect that otherwise re-breaks audit for every governed write even after the graph is
READY. 7–9 are hardening. 10 is out of V1 scope (automation ships disabled).

## What is explicitly NOT in this plan

- No Loan Deal create, no New Deal proof, no audit write, no public-create enablement, no downstream
  automation enablement, no schema changes, no hardcoded GUIDs, no bypass/force headers, no fake
  success, no hidden seed writes (per guardrails 1–13).
- No `--apply`/`--commit` of anything until this matrix is approved (187H gate).

## Acceptance check for this phase

- ✅ Master report generated: this document.
- ✅ Every blocker has domain, severity, table/field, root cause, evidence, fix, fix type, deploy,
  operator, prod risk, V1 impact, test coverage.
- ⏸ **Awaiting review before any remediation (187H).**
