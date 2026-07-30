# PR 2 — Dataverse Governance Schema

The canonical additive schema contract is
`src/governance/bankCreditGovernanceDataverseSchemaPlan.ts`.

It defines ten organization-owned tables:

1. governance profile;
2. immutable policy version;
3. immutable policy rule;
4. effective-dated governance role assignment;
5. effective-dated delegated authority grant;
6. committee;
7. effective-dated committee membership;
8. governed lifecycle action evidence;
9. approval/vote evidence;
10. immutable evaluation evidence.

Every record type has an alternate key. All relationships use restrict-delete.
Published policy versions/rules are immutable. Assignments, grants, memberships,
action evidence, votes, and evaluations are append-only; revocation is a new
superseding event rather than mutation of authority history. Evaluation rows require the policy, case,
actor, contract version, action, decision, timestamp, request/result snapshots,
source version tokens, SHA-256 hashes, and correlation ID.

The schema intentionally contains no institution seed, active policy, authority
assignment, amount limit, environment host, feature flag, or runtime import.
`BANK_CREDIT_GOVERNANCE_ACTIVATION_STATE` remains `NO_GO`.

Production provisioning is explicitly outside PR 2 execution. When authorized,
the schema must be generated into solution metadata, imported into a non-
production environment first, inspected for logical-name/type/relationship/key
parity, and only then presented for a separate production-provisioning approval.
No profile or authority data is part of metadata provisioning.
