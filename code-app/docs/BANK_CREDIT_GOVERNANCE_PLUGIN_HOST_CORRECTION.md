# Configurable governance plug-in host correction

## Decision

This package remains **NO-GO** and `LEGACY_ONLY`. It adds the previously
missing registered host for the configurable evaluator but does not authorize
production registration or enablement.

## Server boundary

`ConfigurableCreditGovernancePlugin` is registered separately from
`DurableRecordGovernancePlugin` and the existing loan-deal transition plug-in.
It never changes, disables, or replaces a legacy step.

For twelve lifecycle actions, the manifest defines:

- a synchronous PreValidation step that re-resolves the authenticated
  `InitiatingUserId`, enabled bank profile, exact active policy snapshot/hash,
  effective roles and grants, relationship exposure, prior actions, and votes;
- a synchronous PreOperation recheck that rejects a stale policy or concurrent
  case version before the write;
- a synchronous PostOperation step that requires the persisted permit and
  appends action evidence only after the governed write succeeds; and
- explicit update filtering attributes and pre-images where two lifecycle
  actions share an entity.

Origination is evaluated synchronously in PostOperation because the required
loan-deal lookup does not exist before a Create. Throwing from synchronous
PostOperation still rolls back an unauthorized direct create. A permitted
origination persists its evaluation and action evidence in that same
transaction.

Missing identity, policy, facts, authority, evaluation persistence, or a stale
policy/case token blocks. The host never derives authority from title,
workspace access, or client-supplied identity.

## Disabled-first registration

After separate approval of the final hashes:

```powershell
powershell -File scripts/dataverse/register-configurable-credit-governance-plugin.ps1 `
  -Apply -RegisterDisabled `
  -ExpectedAssemblySha256 <approved-dll-sha256> `
  -ExpectedManifestSha256 <approved-registration-manifest-sha256>
```

Read back the assembly hash, exact plug-in type, all 37 steps, stage/mode,
filtering attributes, eighteen update pre-images, and confirm every new step is
disabled. Existing legacy steps must remain unchanged.

Enablement is a later, separately controlled action:

```powershell
powershell -File scripts/dataverse/register-configurable-credit-governance-plugin.ps1 `
  -Apply -EnableAfterApproval `
  -ExpectedAssemblySha256 <approved-dll-sha256> `
  -ExpectedManifestSha256 <approved-registration-manifest-sha256>
```

Do not run enablement until alternate keys are Active, policy and authority
readback is exact, the real roster is provisioned, and live MFA certification
is ready.

## Rollback

Rollback does not delete evidence or schema:

1. Keep the application `LEGACY_ONLY`.
2. Set all 37 configurable-host steps to Disabled using the exact manifest.
3. Read back zero enabled configurable-host steps.
4. Verify every legacy transition and durable-record step retains its prior
   state and configuration.
5. Leave policy, grant, vote, evaluation, and action-evidence history intact.
6. Restore the prior approved assembly only if assembly rollback is necessary;
   verify its SHA-256 immediately after upload.

Any hash, step, image, policy, authority, or enforcement mismatch is NO-GO.
