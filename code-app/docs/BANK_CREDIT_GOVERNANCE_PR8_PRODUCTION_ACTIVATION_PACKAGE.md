# PR 8 — Production activation and final evidence package

## Current decision

**NO-GO. Preparation is complete only when every committed hash and executable
test in this package is verified. Production execution requires one separate
written approval covering all actions in the final checklist.**

## Package contents

| Item | Source of truth |
|---|---|
| Additive schema plan | `deployment/bank-credit-governance/dataverse-schema-plan.json` |
| Plug-in assembly | `deployment/bank-credit-governance/CommercialLendingLOS.Plugins.zip` |
| Registration manifest | `dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernanceRegistration.json` |
| Proposed initial policy | `deployment/bank-credit-governance/initial-ogb-policy-v1.proposed-active.json` |
| Authority provisioning plan | `deployment/bank-credit-governance/authority-profile-provisioning-plan.json` |
| Hash manifest | `deployment/bank-credit-governance/activation-manifest.json` |
| OGB interpretation | `docs/BANK_CREDIT_GOVERNANCE_PR8_OGB_OVERRIDE_RATIFICATION.md` |
| Shadow evidence | `docs/BANK_CREDIT_GOVERNANCE_PR6_OGB_SHADOW_CERTIFICATION.md` |
| Multi-profile evidence | `docs/BANK_CREDIT_GOVERNANCE_PR7_MULTI_PROFILE_CERTIFICATION.md` |

The proposed policy artifact contains no users, grants, votes, approvals, or
committee memberships. Its `ACTIVE` status describes the exact snapshot whose
hash is presented for approval; committing the file does not activate it.

Exact proposed policy SHA-256:
`8c47221a9191405364f06c0f128a57b124f7b67ca09ed3dad30c34406ace1a92`.

## C# executable evidence

The complete Release suite passes 83 of 83 tests with zero failures or skips.
Required production concerns are pinned to these executable tests:

| Concern | Test evidence |
|---|---|
| Governance evaluation | `BankCreditGovernanceEngineTests` |
| Lifecycle enforcement | `BankCreditGovernanceLifecycleEnforcerTests` |
| Direct-write bypass prevention | `DurableRecordGovernancePluginTests` and `LoanDealGovernedTransitionPluginTests` |
| Authority limits | `CreditApprovalToCommitment_AmountExceedsIndividualLimit_IsDenied`, `CommitteeHonorsQuorumAbstentionRecusalAndAuthorityLimit` |
| Role combination | `SingleOfficerIsPermittedWhenPolicyAllowsCombination`, `IndependentApprovalBlocksTheOriginatingUnderwriter` |
| Duplicate identity | `DuplicateVotesNeverSatisfyDistinctPersonCount`, `Create_CreditDecision_BlocksBankerLinkedToDifferentCoreIdentity` |
| Committee quorum and voting | `CommitteeHonorsQuorumAbstentionRecusalAndAuthorityLimit` |
| Stale policy | `AtomicPersistenceRejectsStalePolicyAndConcurrentCaseUpdates(stale-policy)` |
| Concurrent update | `AtomicPersistenceRejectsStalePolicyAndConcurrentCaseUpdates(concurrent-update)` |
| Audit/evaluation persistence | `EvaluationPersistenceCarriesAuditCorrelationPolicyAndSourceVersions`, `PreValidationRejection_WritesADurableAuditRow_WhenTheActorResolves` |

The package verifier checks all committed hashes and reruns this suite. A hash
mismatch or test failure stops the process before any production command.

## Reproducible build

From the repository root:

```powershell
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
.\.tmp-dotnet-sdk\dotnet.exe restore dataverse-plugins\CommercialLendingLOS.Plugins.Tests\CommercialLendingLOS.Plugins.Tests.csproj
.\.tmp-dotnet-sdk\dotnet.exe test dataverse-plugins\CommercialLendingLOS.Plugins.Tests\CommercialLendingLOS.Plugins.Tests.csproj --configuration Release --no-restore
.\.tmp-dotnet-sdk\dotnet.exe build dataverse-plugins\CommercialLendingLOS.Plugins\CommercialLendingLOS.Plugins.csproj --configuration Release --no-restore
```

The approved SDK is Microsoft .NET SDK 8.0.423. The deployable assembly remains
strong-name-signed and targets `net462`, as required by the Dataverse plug-in
host. The `net8.0` test host produces compatibility warnings because it directly
references the `net462` plug-in assembly; compilation and all tests must still
pass.

## Production execution order

These commands are prepared but **must not be run without the consolidated
approval**:

```powershell
# 1. Provision the reviewed create-missing-only schema plan.
# Operator applies deployment/bank-credit-governance/dataverse-schema-plan.json
# using the tenant's approved solution-import/change process, then exports and
# reconciles live metadata against the same manifest.

# 2. Register the exact hashed assembly disabled for inspection.
powershell -File scripts/dataverse/register-durable-record-governance-plugin.ps1 `
  -Apply -RegisterDisabled `
  -ExpectedSha256 <assemblySha256>

# 3. Import the exact hashed proposed policy as non-active administrative data,
# verify its persisted snapshot hash, and import only Matthew-approved authority
# rows. Empty assignment plans are a hard block.

# 4. Enable plug-in steps and activate policy only after read-only reconciliation.
powershell -File scripts/dataverse/register-durable-record-governance-plugin.ps1 `
  -Apply `
  -ExpectedSha256 <assemblySha256>

# 5. Deploy the application build only after schema, registration, policy, and
# authority evidence reconcile. Runtime mode remains LEGACY_ONLY until the final
# live certification step.
```

No command may echo a bearer token. Existing Dataverse helpers acquire tokens
in memory and clear their local token variable in `finally`.

## Live acceptance plan

Use institution-approved real users and controlled production test deals. Do
not fabricate officers, votes, or approvals.

1. Confirm exactly one enabled OGB profile and one effective active policy whose
   persisted snapshot SHA-256 equals the approved policy hash.
2. Confirm every officer, role, grant, committee membership, and temporary
   delegation against the signed authority roster.
3. Confirm duplicate identities and expired grants deny.
4. Exercise one permitted and one prohibited action at each of the 13 lifecycle
   points.
5. Attempt direct Web API writes for governed records and confirm synchronous
   server denial when authority or evidence is absent.
6. Exercise amount, relationship exposure, product, risk, exception,
   geography, industry, self-approval, committee quorum, abstention, recusal,
   and duplicate-voter cases.
7. Confirm each result has one immutable evaluation record, matching policy
   version, source-version tokens, correlation ID, audit event, and timeline
   event.
8. Force a stale-policy and concurrent-deal update and confirm both deny.
9. Compare live configurable and legacy results. Any weaker or unexplained
   result restores `LEGACY_ONLY` and is a NO-GO.
10. Only after all evidence passes may the runtime move from shadow to enforced
    mode.

## Rollback

Rollback is fail-closed and does not delete history:

1. Set runtime mode to `LEGACY_ONLY`.
2. Disable configurable governance plug-in steps; keep existing legacy
   `LoanDealGovernedTransitionPlugin` and `DurableRecordGovernancePlugin`
   controls enabled.
3. Supersede or retire the configurable active policy; never edit or delete it.
4. Revoke grants through append-only superseding records; never delete grants,
   votes, evaluations, action evidence, or audit rows.
5. Do not remove additive schema during an incident. Retain it for evidence and
   recovery.
6. Reconcile all transactions since activation and open a controlled corrective
   change before another activation attempt.

## Final GO/NO-GO checklist

Every item must be affirmatively approved or proven:

- [ ] OGB override interpretation approved.
- [ ] Exact schema manifest approved for production provisioning.
- [ ] Exact assembly and registration hashes approved.
- [ ] Initial OGB policy snapshot and hash approved.
- [ ] Named authority roster and every real assignment approved.
- [ ] Production deployment approved.
- [ ] Schema reconciliation passes with no destructive difference.
- [ ] Plug-in steps are registered synchronously and first inspected disabled.
- [ ] Active policy and authority rows reconcile exactly.
- [ ] Legacy controls remain enabled and conjunctive.
- [ ] Live MFA-authenticated acceptance is complete.
- [ ] Direct-write bypass attempts deny.
- [ ] Shadow comparison contains no weaker or unexplained result.
- [ ] Durable evaluation, audit, and timeline evidence reconcile.
- [ ] Rollback drill succeeds.

Any unchecked item means **NO-GO**.
