# PR 6 — OGB Migration and Shadow Certification

## Decision

**NO-GO. The configurable engine is not activated.**

PR 6 provides an executable current-rule inventory, a versioned draft OGB
migration profile, and a fail-closed shadow comparator. The current legacy
controls remain authoritative and conjunctive at every runtime boundary.

## Evidence boundary

- `OGB_LEGACY_RULE_INVENTORY` maps each current authority or separation control
  to a policy rule or an explicitly retained server invariant.
- `INITIAL_OGB_SHADOW_POLICY` is `DRAFT` and contains no users, real authority
  assignments, committee votes, approvals, or activation record.
- Shadow fixtures are labelled `REPOSITORY_CONTROLLED` or
  `REPRESENTATIVE_SYNTHETIC`. They are not represented as production deals or
  real officers.
- The inclusive USD 250,000 funding threshold, distinct approval identities,
  approval limits, missing originator evidence, and self-approval are exercised.
- Missing durable originator evidence is intentionally stricter than the legacy
  client check and is recorded as `CONFIGURABLE_STRONGER`.

## Cutover blockers

1. The source code explicitly labels the meaning of the legacy approval override
   flag as an interpretation call. An OGB policy owner must ratify or correct it.
2. Real users and migrated authority grants must be assigned and certified; none
   are fabricated here.
3. Production policy activation is reserved for PR 8 and requires separate
   authorization.

The comparator makes any configurable-weaker result or unexplained difference a
hard blocker. Retained readiness, append-only, amount, maker/checker, and
disbursement-separation invariants are not policy overrides and cannot be
weakened by this profile.
