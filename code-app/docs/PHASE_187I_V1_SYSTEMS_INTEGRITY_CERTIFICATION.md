# Phase 187I — V1 systems-integrity certification

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Supersedes the open blocker in:** [Phase 187H master remediation](./PHASE_187H_MASTER_REMEDIATION_IMPLEMENTATION.md) (G-1 now complete).

## Certification status

- **Overall release language:** `V1_READY_WITH_DISABLED_AUTOMATION`.
- **Banker New Deal create:** certified **`PILOT_LIVE_CONTROLLED`** — live for the
  controlled banker pilot, **not** unrestricted GA.

## Systems-integrity evidence

- **Identity audit graph: READY.** The canonical provisioner
  (`--verify-identity-audit-graph`) reports `GRAPH STATUS: READY` for the acting
  banker: PlatformUser active, CoreUser populated, `cr664_user` active, Role
  active+approved (Banker), PrimaryWorkspace active+approved (Banker Workspace
  with `OPERATIONAL_CONTEXT`).
- **Runtime audit actor remediation: deployed.** The New Deal audit actor
  resolver (and the back-ported governed-write emitters) ship the
  `cr664_ChangedBy = /cr664_users(<CoreUser>)` resolution; the runtime change was
  deployed via `pac code push` before the proof.
- **Audit binds cleanly.** `cr664_auditevents.cr664_ChangedBy` resolves to the
  banker's `cr664_user` row; no `audit_failed_partial` was observed on the final
  proof.

## Final proof

| Field | Value |
| --- | --- |
| Proof name | **V1 Banker Create Proof - 2026-06-16 8** |
| Deal id | **1a10a165-756a-f111-ab0c-70a8a59be491** |
| Stage | Intake |
| Status | Open |
| UI banner | Deal created |
| Audit outcome | success — **no `audit_failed_partial` observed** |

The proof created the Loan Deal **and** wrote the governed audit event cleanly,
end to end, after the identity-graph remediation (Phase 187H G-1/G-2).

## What remains DISABLED (unchanged by this certification)

- **Public create remains disabled.**
- **Downstream automation remains disabled.**
- Borrower automation remains disabled.
- CRM automation remains disabled.
- Portfolio side effects remain disabled.

This certification covers ONLY the governed banker New Deal create + its audit.
It does not enable any downstream/public path.

## Historical partial proofs do not block certification

Earlier proof deals returned `audit_failed_partial` because the audit actor
identity graph was not yet provisioned (CoreUser bridge empty). Those are
historical and **do not block this certification**: the final proof
(`V1 Banker Create Proof - 2026-06-16 8`, deal
`1a10a165-756a-f111-ab0c-70a8a59be491`) succeeded — create **and** audit — after
the graph remediation reached `GRAPH STATUS: READY`. The historical partial
deals remain documentation-only (reconcile per
[Phase 182](./PHASE_182_AUDIT_PARTIAL_RECONCILIATION.md) if desired); no new
proof deal was created for this certification.

## Remaining recommendation

Continue the **one-domain-at-a-time** rollout for downstream automation, using
the same systems-integrity audit pattern proven here: map the full dependency /
audit graph first, provision fail-closed, verify `GRAPH STATUS: READY`, then run
exactly one controlled proof per domain before certifying it. Public create and
the remaining automations stay disabled until each is certified the same way.
