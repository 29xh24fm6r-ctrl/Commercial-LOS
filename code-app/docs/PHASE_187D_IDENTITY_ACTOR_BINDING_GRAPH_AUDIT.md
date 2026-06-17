# Phase 187D — Identity & Actor Binding Graph Audit

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Mode:** READ-ONLY. Live `--inspect-identity-audit-graph` / `--verify-identity-audit-graph` /
  `--inspect-coreuser-create-dependencies` / `--inspect-audit-actor-bridge` for the pilot banker, plus
  metadata (187B) and source analysis (187A/187F).
- **Actor under test:** `mpaller@oldglorybank.com` (pilot banker).
- **Captures:** `.phase122/187-captures/inspect-identity-audit-graph.txt`,
  `verify-identity-audit-graph.txt`, `inspect-coreuser-create-deps.txt`, `inspect-audit-actor-bridge.txt`.
- **Spec:** Phase 187D.

## Headline

**GRAPH STATUS: BLOCKED.** The audit actor identity graph is not fully provisioned. The pilot banker's
PlatformUser is active but has **no CoreUser** (`cr664_user`) row, and the canonical provisioner
cannot create one because two upstream dependencies are blocked.

## The graph (live)

```
systemuser (Entra OID → systemuserid)            ← resolved by currentUserLookup; WRONG target for audit
   │
cr664_platformuser  e20d1fcd-4fbc-4439-962e-975c1db08aeb  (ACTIVE: statecode=0, cr664_activestatus=true)
   │  cr664_email = mpaller@oldglorybank.com ; cr664_fullname = Matthew Paller
   │  _cr664_primaryworkspace_value = 13433690-3b7f-4eb1-ac56-37e18fdaa86e
   │  _cr664_role_value             = 0fe822e1-55fb-4083-9621-f07d7a948c33
   │  cr664_CoreUser = (EMPTY)   ◀── BRIDGE MISSING
   ▼
cr664_user (CoreUser)  — DOES NOT EXIST for this actor
   ├─ cr664_role (App-required) ──────────→ cr664_userrole   [BLOCKED: no prod-safe role]
   └─ cr664_primaryworkspace (App-req) ───→ cr664_workspacetype  [BLOCKED: workspacecontext picklist]
                                                  └─ cr664_workspacecontext  (Picklist, App-required)

cr664_auditevent.cr664_changedby (App-required) ──→ cr664_user   ← terminates in the missing node
```

`cr664_platformuser.cr664_CoreUser` correctly targets `["cr664_user"]` (verified live).

## Per-question answers (governed write domains)

| question | answer | evidence |
|---|---|---|
| Does audit `cr664_changedby` target `cr664_user` or `systemuser`? | **`cr664_user`** | live: `cr664_auditevent.cr664_changedby` Lookup Targets `["cr664_user"]` (187B) |
| Does any governed write bind a `systemuser` directly into that lookup? | **Yes — 12 emitters** | Phase 187A/187F: task/document/borrower/memo/alert/DQ all bind `/systemusers(id)` into `cr664_ChangedBy` |
| Does the write require a CoreUser? | **Yes** — required ApplicationRequired lookup | 187B |
| Is CoreUser linked for the pilot banker? | **No** — `cr664_CoreUser` empty | `verify-identity-audit-graph`: "CoreUser populated: NO" → GRAPH STATUS: BLOCKED |
| Does the acting user have all required bridge rows? | **No** | CoreUser missing; its role/workspace deps blocked |
| Multiple / ambiguous user rows? | **No** — exactly 1 PlatformUser matches the UPN | `inspect-coreuser-create-deps`: "Platform users matching … : 1" |
| Are required role/workspace/context rows present? | **No production-safe rows** | see blockers below |

## Blockers (root-caused)

### D-1 — CoreUser bridge missing (BLOCKS_AUDIT for every governed write)
`cr664_platformuser.cr664_CoreUser` is empty for the banker. The audit `cr664_changedby` cannot be
resolved → the New Deal create audit fails closed (`audit_failed_partial`), and any other governed
write that reaches its audit step would too (once they go live). This is THE production blocker.

### D-2 — WorkspaceType create blocked on the WorkspaceContext picklist
`cr664_user.cr664_primaryworkspace` → `cr664_workspacetype`. Creating a `cr664_workspacetype` row
requires the **`cr664_workspacecontext` Picklist** (ApplicationRequired). The canonical walker reports:

> `WorkspaceType [cr664_workspacetype] : BLOCKED (REJECTED_MISSING_REQUIRED_FIELD) — required field(s) not covered by allow-list: cr664_workspacecontext`

The provisioner's create allow-list does not set the picklist, so it cannot satisfy the requirement.
The recent commit `ad2192f` "Add WorkspaceContext node to identity audit graph" modeled WorkspaceContext
as a **dependency node**, but live metadata shows it is a **required picklist column on workspacetype**
(values 788190000 EXECUTIVE_CONTEXT / 788190001 OPERATIONAL_CONTEXT / 788190002 ADMIN_CONTEXT). The
provisioner must set the picklist value on workspacetype create, not resolve a separate node.

### D-3 — No production-safe UserRole candidate
`cr664_user.cr664_role` → `cr664_userrole`. The only existing role row is **System Super Admin**
(`5595e063-8d55-4068-95b8-ac2a979c2ae9`), rejected as `REJECTED_ADMIN_ONLY` / `REJECTED_UNSUPPORTED`.
There is no approved banker role. `cr664_userrole` is trivially createable (only `cr664_rolename`
required), so a production-safe role row can be seeded — but it does not yet exist.

### D-4 — Existing reuse candidates on the PlatformUser are rejected by the tooling
The PlatformUser already references a workspacetype (`13433690-…`) and a userrole (`0fe822e1-…`) via
`_cr664_primaryworkspace_value` / `_cr664_role_value`. But `inspect-coreuser-create-deps` reports
**0 approved PrimaryWorkspace candidates** and the role candidate list contains only System Super Admin.
The existing rows the PlatformUser points at are **not surfaced/approved** as CoreUser create inputs.
Either those rows are not production-safe, or the candidate classifier is over-strict and is not
reusing them. This must be resolved before seeding (reuse the existing rows if safe; otherwise seed
new production-safe rows) — see 187G remediation ordering.

### D-5 — Divergent identity tooling (process risk, not a data blocker)
Three read-only modes give subtly different verdicts on the same actor because they carry **different
create allow-lists**:
- `--inspect-coreuser-create-dependencies` allow-list includes `cr664_primaryworkspace`, `cr664_role`
  (sources them from the PlatformUser) and reports "blocking required fields beyond allow-list: NONE".
- `--inspect-audit-actor-bridge` allow-list is `cr664_username, cr664_email, cr664_activeaccessflag`
  only, and reports "blocking required fields beyond allow-list: cr664_primaryworkspace, cr664_role —
  a safe minimal create is NOT possible".
- `--inspect-identity-audit-graph` (canonical walker) recursively tries to CREATE workspacetype +
  userrole and blocks on the workspacecontext picklist + admin-only role.

This is the "scripts discovered dependencies one level at a time" pattern the spec calls out. The
remediation must converge on **one** canonical provisioner with **one** allow-list, not three.

## Actor resolution in code (187A/187F cross-check)

- **Correct path:** `newDealAuditActorResolver.ts` resolves actor email → ACTIVE `cr664_platformusers`
  → `_cr664_coreuser_value` → `/cr664_users(<id>)`, fail-closed. This is the only correct resolver.
- **Incorrect path (12 emitters):** consume a `systemUserId` (from `currentUserLookup.ts`, an Entra-OID
  → systemuserid lookup) and bind `/systemusers(id)` directly into `cr664_changedby` — wrong identity,
  wrong target table.

## Status

- **Identity graph status: BLOCKED** (not READY).
- **Banker New Deal create:** create succeeds; **audit fails closed** → `audit_failed_partial` until D-1 cleared.
- **Required before READY:** clear D-2 (workspacecontext picklist on workspacetype create), D-3 (seed
  production-safe banker role), D-4 (decide reuse vs seed for the existing workspace/role rows), then
  populate D-1 (CoreUser + bridge), via one canonical provisioner (D-5). No writes performed in this audit.
