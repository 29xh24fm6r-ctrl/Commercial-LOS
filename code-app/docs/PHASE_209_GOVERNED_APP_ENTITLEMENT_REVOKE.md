# Phase 209 / Lane A3 — Governed App-Level Entitlement Revoke/Deactivate

**Status:** Complete. The governed path to safely remove app-level access.
Disabled by default; **deactivates** (never deletes) exactly one entitlement only
when every hard gate passes; requires a reason; audits the revocation.

**Branch:** `phase209-governed-app-entitlement-revoke`.
**Depends on:** Phase 208 / A2 (branched from its tip; reuses the
`AdminEntitlementActor` type and the same gated/audited pattern).

## Delivered

- `src/access/adminEntitlementRevokeAdapter.ts` — `revokeAppEntitlement(input)`.

## Behavior

- **Deactivate, not delete** — sets the entitlement inactive via an injected
  revoke transport; the row is preserved for audit, so there is **no orphaned
  access state** and no delete path exists.
- Requires Super Admin, the revoke flag, single-record smoke mode, a transport,
  an audit sink, a deterministic correlation id, and a **reason**.
- **Fails closed on ambiguity:** `target_not_found` (no active match) or
  `ambiguous_target` (more than one active match) — never a guessed target.
- **Last-Admin self-revoke guard:** refuses to revoke the actor's own last active
  Admin entitlement (`last_admin_protected`) unless `emergencyOverrideEnabled` is
  explicitly set — and the override is recorded in the audit
  (`emergencyOverrideUsed: true`).

## Outcomes

`deactivated` · `dry_run_only` · `blocked_gate_not_satisfied` ·
`skipped_missing_required_data` · `target_not_found` · `ambiguous_target` ·
`last_admin_protected` · `failed_dataverse` · `audit_failed_partial_success`.

A deactivate that succeeds but whose audit write fails returns
`audit_failed_partial_success` (never a clean success).

## Safety

Disabled by default · fail-closed · single-record only · deactivate-not-delete ·
reason required · last-Admin protection · no SDK/fetch · no fabricated data/PII ·
LOS app-level access only (no tenant/security-role/Entra change). In `src/access/`
so the `readOnlySurfaceGuard` admin contract is untouched.

## Rollback

Set the injected revoke flag (or single-record smoke mode) to anything other than
`true` — every revoke fails closed. Deactivation is reversible by a subsequent
governed grant (Phase 208).

## Validation

- `npm test -- adminEntitlementRevoke phase209 access entitlement` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData readOnlySurfaceGuard releaseCandidateSnapshot` — green.
