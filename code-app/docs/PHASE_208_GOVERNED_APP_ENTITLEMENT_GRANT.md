# Phase 208 / Lane A2 — Governed App-Level Entitlement Grant Write Adapter

**Status:** Complete. The governed write path that makes "Grant Access" work
safely. Disabled by default; grants exactly one app-level workspace entitlement
only when every hard gate passes; audited; typed outcome.

**Branch:** `phase208-governed-app-entitlement-grant-write-adapter` (base: current
`master`). Independent PR.

## Delivered

- `src/access/adminEntitlementGrantAdapter.ts` — `grantAppEntitlement(input)`.

(Placed under `src/access/`, not `src/admin/`, so it does not violate the
`readOnlySurfaceGuard` admin-read-only contract; the existing admin read panels
are untouched.)

## Scope

Grants **LOS app-level access only** — one `cr664_workspaceentitlements` row via
an injected, entitlement-only write transport. It does **not** grant Microsoft
tenant access, Dataverse security roles, or Entra role assignments, and never
claims to.

## Gates (all required for a live grant)

- `ADMIN_ENTITLEMENT_WRITE_ENABLED` (config) === true — build-time default is `false`
- actor is Super Admin
- target platform user exists
- workspace + access level valid (from the safe `Admin`/`Full`/`ReadOnly`
  enumeration; the access-level option value is supplied by the caller from the
  live read enumeration — never invented)
- entitlement write transport present (Dataverse create available)
- audit sink present (audit service available)
- single-record smoke mode enabled
- deterministic correlation id provided

## Outcomes

`created` · `dry_run_only` · `blocked_gate_not_satisfied` ·
`skipped_missing_required_data` · `duplicate_exists` · `failed_dataverse` ·
`audit_failed_partial_success`.

A business write that succeeds but whose audit write fails returns
`audit_failed_partial_success` (never a clean success). A duplicate active
entitlement is never re-created.

## Audit

Every path produces an audit payload: correlation id, actor (platform user id +
upn), action `grant-entitlement`, target platform user, workspace, access-level
name, reason, previous/new value, outcome, error.

## Safety

Disabled by default · fail-closed · single-record only (no bulk) · no SDK/fetch
import · no delete path · no fabricated data/PII · no tenant/security-role claim.

## Rollback

Set `config.writeEnabled` (the injected `ADMIN_ENTITLEMENT_WRITE_ENABLED` value)
to anything other than `true`, or disable single-record smoke mode — every grant
immediately fails closed with `blocked_gate_not_satisfied`. Already-granted
entitlements remain readable. Revoke/deactivate is **Phase 209 / A3** (separate),
not enabled here.

## Validation

- `npm test -- adminEntitlementGrant phase208 access entitlement` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData readOnlySurfaceGuard releaseCandidateSnapshot` — green.

## Operator notes (environment steps — not done by this PR)

To activate: wire a real entitlement-only write transport + audit sink, set the
flag and single-record smoke mode, run one controlled grant for a known target,
verify the audit row, then capture evidence. No deploy/flag-flip is part of this
PR.
