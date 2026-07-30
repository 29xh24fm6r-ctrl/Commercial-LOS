# PR 3 — Server-Side Policy Enforcement

PR 3 adds a pure C# evaluator and fail-closed server orchestration contract under
`dataverse-plugins/CommercialLendingLOS.Plugins`.

The server path:

1. rejects unsupported contract versions;
2. resolves exactly one active immutable policy snapshot;
3. resolves an atomic case, actor, prior-action, and approval snapshot;
4. evaluates every matching rule restrictively;
5. appends the complete evaluation with policy snapshot and source-version
   tokens;
6. permits the calling operation only after persistence succeeds and the
   recorded decision is `Permit`.

Missing/ambiguous policy, unresolved facts or actor, invalid policy, unsatisfied
authority/separation/approval controls, and evaluation persistence failure all
deny.

This PR does not register a plug-in step and does not replace
`LoanDealGovernedTransitionPlugin` or `DurableRecordGovernancePlugin`. Those
legacy controls therefore remain fully active. Wiring a Dataverse repository
adapter requires the PR 2 schema to be provisioned in an authorized environment;
production schema provisioning and production plug-in registration remain
explicit pause points. Runtime lifecycle adoption occurs in PR 5 only after
non-production server parity is available.
