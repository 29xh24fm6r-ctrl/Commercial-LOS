# PA-2 Power Automate SharePoint Activation AAR

## Outcome

PA-2 implements the largest production-safe source boundary possible without inventing Power Platform artifacts. The application now has a strict v2 generated-flow seam for `ensureFolder`, binary `upload`, `verifyFolder`, and `verifyFile`; deterministic request identity; cross-deal response isolation; strict response parsing; partial-failure/orphan handling; and fail-closed configuration selection.

No tenant operation, solution import, publish, connector binding, application deployment, SharePoint mutation, or LIVE enablement occurred. `VITE_DEAL_DOCUMENT_STORAGE_MODE` and the Power Platform source default remain `DRY_RUN`.

## Implemented

- Added `activationContract.ts` with governed path containment, request validation, canonical fingerprint material, SHA-256 support, trusted-actor authorization decisions, v2 error taxonomy, and strict response parsing.
- Added a generated-service runner seam that maps platform-generated `Run` output to `DealSharePointDocumentPort` without guessing a generated service or operation name.
- Enforced immutable site/library targets, deterministic folder/upload keys, binary base64 mapping, response correlation/deal/idempotency equality, exact returned IDs/URLs, and fail-closed malformed response handling.
- Added authorization rules based only on trusted runtime facts: exactly one active `cr664_platformuser`, exactly one active `cr664_banker`, an active `cr664_loandeal`, and equality with `cr664_assignedbanker`. No caller-supplied identity and no inferred admin override are accepted.
- Defined the additive `new_ogbsharepointtransportledger` state model, unique idempotency key, required evidence fields, failure states, and reconciliation behavior in the curated PA-owned activation manifest.
- Corrected stale UI text: the SharePoint Documents list data source is registered, but live folder/binary transport is not yet configured.
- Replaced the generic flow blocker with `ACTOR_IDENTITY_CONTEXT_UNAVAILABLE`. The checked-in flow still makes no SharePoint mutation.
- Reworked the operator script so Export is read-only, Import/Publish require `-Apply`, the environment is locked to Developer, the repository overlay is allowlisted, pack uses a fresh full solution export in a temporary directory, and platform-generated component source is mandatory.

## Curated overlay boundary

The repository contains only the two PA-owned workflows and `PowerAutomateOwned/activation-manifest.json`. It does not contain a copied full solution tree. The manifest is validation source, not fabricated importable Dataverse XML.

Pack intentionally refuses without `-PlatformGeneratedComponentFolder`. That folder must contain reviewed artifacts exported by Power Platform for the environment-variable definitions/values, additive ledger table and choices/key, authenticated Power Apps V2 caller extraction, Dataverse authorization and ledger actions, exact SharePoint operations, and reconciliation actions.

## Exact external operator steps before LIVE

1. In Developer `https://org3a57b8d4.crm.dynamics.com`, create the ten environment-variable definitions declared in the activation manifest. Keep transport mode `DRY_RUN`.
2. Create additive table `new_ogbsharepointtransportledger` with every declared column, declared statuses, and a unique key on `new_idempotencykey`. Enable audit and grant only the flow service identity the required least-privilege create/read/update access.
3. Edit workflow `9448ac11-f490-f111-8076-7ced8d3bafd4` in Power Automate. Use the authenticated Power Apps V2 runtime context to derive the caller UPN; do not accept identity or authorization in trigger payload.
4. Add exact Dataverse queries for active `cr664_platformuser`, active `cr664_banker`, active `cr664_loandeal`, and `cr664_assignedbanker` equality. Require unique identity rows and deny every ambiguous/missing/mismatched case.
5. Implement transactional ledger create/read/update. On duplicate key, compare the immutable request fingerprint. Return completed evidence for an exact completed replay; reject a different fingerprint; never repeat a possible SharePoint create until reconciliation resolves the prior attempt.
6. Use the Microsoft SharePoint connector actions selected in the designer and emitted by the platform. Configure the fixed Business Lending site, Documents library, and `/(a) Loans` root through environment values. Do not paste guessed connector action JSON into source.
7. Implement exact-name folder lookup/create and binary file upload with overwrite disabled and no auto-rename. Reject cross-deal ownership/collision.
8. Read back exact parent, object type, item ID, unique ID, ETag, web URL, and file size before recording `COMPLETED`. Sanitize connector errors. If creation may have occurred but readback fails, set `fileMayExist=true`, `reconciliationRequired=true`, and ledger status `RECONCILIATION_REQUIRED`.
9. Implement reconciliation workflow `f4637494-69f5-4d79-9f8b-0be46a36e71f` against unresolved ledger rows. Keep its 2099 schedule/disabled posture until separately certified.
10. Save, export, and unpack the solution using platform tooling. Copy only the reviewed PA-owned generated components into a dedicated operator folder.
11. Run `Invoke-CommercialLosPowerAutomateSolution.ps1 -Action Validate`, then `-Action Pack -PlatformGeneratedComponentFolder <reviewed-export-folder>`. Review the package contents and SHA-256.
12. Import to a non-production certification environment, bind both connection references, regenerate the Power Apps flow data source, inspect the exact generated service/`Run` signature, and inject that runner into `createGeneratedPowerAutomateDocumentPort`.
13. Certify success, duplicate replay, idempotency collision, concurrent writes, cross-deal isolation, unauthorized actor, malformed response, connector failure, readback mismatch, and orphan reconciliation. Verify ledger and SharePoint evidence.
14. Only after separate release approval may the environment value and app storage mode be changed to LIVE and deployed. Roll back to DRY_RUN on any mandatory failure.

## Verification

- Focused Power Automate and adapter tests: 17/17 passed.
- TypeScript project build: passed.
- Scoped ESLint: passed.
- PowerShell parse and curated-overlay validation: passed; reports DRY_RUN, two workflows, and all platform-generated dependencies.
- Production build: passed.
- Git diff check: passed.
- Full repository suite: executed to completion; non-green with 214 unrelated legacy launch/feature-flag/snapshot failures and two Vitest worker RPC timeouts. No PA-2 focused test failed. The failures include stale assertions expecting activated feature flags to be false and old generated-connector absence assumptions; they are outside this branch and were not changed.

## Remaining blocker

LIVE remains blocked until reviewed platform-generated artifacts exist and are certified. The available exported Power Apps V2 workflow source does not prove a supported authenticated caller claim mapping, and the repository contains no safe example of generated environment-variable or additive entity XML. Generating those components in the platform and exporting them is the only honest next step.

## Safety state

`DRY_RUN`; no deployment; no tenant changes; no SharePoint writes; no fabricated connector operations, URLs, item IDs, identities, or successful responses.
