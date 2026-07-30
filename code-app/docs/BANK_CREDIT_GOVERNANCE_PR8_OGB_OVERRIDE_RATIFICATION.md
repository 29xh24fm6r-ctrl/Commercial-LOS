# OGB credit-approval override interpretation

## Decision requested

Should an officer with the current `Approval Override Authority` designation be
allowed to approve a credit request without being a credit-committee member and
without being constrained by the officer's ordinary personal approval limit,
provided every control listed below still passes?

## Current legacy behavior

The current application treats `cr664_approvaloverrideauthority = true` as a
credit-approval override. The designation bypasses:

- the requirement that the approving banker be marked as a credit-committee
  member; and
- the comparison of the governed loan amount with the banker's ordinary
  approval limit.

It does not bypass the prohibition on approving one's own request or assigned
deal. It does not bypass identity resolution, banker-record existence, complete
authority-field configuration, durable decision requirements, commitment
readiness, funding maker/checker controls, the funding facility cap,
disbursement separation, append-only history, or any other server invariant.

The stage-transition implementation can bypass a missing or conflicting amount,
but the durable credit-decision plug-in independently requires a deal amount.
The effective end-to-end legacy path therefore still requires an amount.

## Proposed configurable-policy behavior

Replace the mutable boolean's implicit power with both:

1. an explicit `OGB_APPROVAL_OVERRIDE` policy role; and
2. a separately approved, effective-dated delegated-authority grant covering
   `APPROVE` and/or `APPROVE_EXCEPTION`.

The grant may omit an amount ceiling only when the institution expressly
approves unlimited credit-approval override authority for that named officer.
No assignment is inferred from title, workspace access, committee membership,
or the existing boolean. Each real officer must be approved and provisioned
separately.

The configurable route continues to bypass the ordinary committee-role and
personal-limit checks for an approved override holder. It additionally requires
durable originator evidence, a different approving person, a versioned active
policy, an effective grant, complete case facts, and a persisted server
evaluation. Non-overrideable rules and retained lifecycle/funding invariants
remain conjunctive.

## Control effect

This interpretation **preserves the substantive legacy override power and
strengthens its governance evidence**. It does not broaden who receives the
power, and it does not create an override of self-approval, funding controls, or
non-overrideable policy rules.

## Authority affected

Only the current credit-approval override represented by
`cr664_approvaloverrideauthority` is affected. This decision does not authorize
policy-exception approval, funding approval, committee voting, closing,
boarding, servicing, modification, renewal, or any other action unless those
actions appear on a separate approved grant.

## Consequences

If approved:

- the proposed OGB policy interpretation may be used for the initial migration;
- named override holders still require separately approved real assignments;
- the configurable path is stricter when originator evidence, case facts,
  policy version, or evaluation persistence is missing; and
- the legacy boolean remains authoritative until live server certification and
  cutover complete.

If rejected:

- production policy activation remains blocked;
- no current override holder is migrated automatically;
- OGB must specify whether overrides require committee membership, remain
  subject to a ceiling, require a higher committee or board, or are prohibited;
  and
- a revised policy version and new shadow-parity certification are required.

Approval of this interpretation is not approval of any real person's authority
assignment or any production action.
