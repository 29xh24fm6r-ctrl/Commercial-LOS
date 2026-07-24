# PR128 — Factory Arc Phase 16: Plugin/Connector Deployment

## Scope constraint

Actual Dataverse plugin registration and connector authentication/consent are explicit stop
conditions in this arc's standing rules — they require a live operator with real Dataverse/Power
Platform admin credentials, which this sandbox does not have. This phase cannot deploy anything; it
can only get the deployment *artifacts* (compiled code, registration docs, CI, runbooks) into the best
possible ready-for-operator state, and fix any staleness or gaps found in them.

## Investigation

Confirmed already in good shape, no action needed:

- The Dataverse plugin (`LoanDealGovernedTransitionPlugin.cs`) builds cleanly, has 41 passing unit
  tests, a GitHub Actions CI workflow (`.github/workflows/build-dataverse-plugin.yml`) that builds,
  tests, and uploads the compiled assembly on every relevant PR, and a thorough, internally consistent
  deployment doc (`PLUGIN_DEPLOYMENT.md`, updated 2026-07-23) — its `TODO CONFIRM` markers are still
  present in the `.cs` file and still genuinely needed; `RequireReasonFieldToEnforce` is still `false`,
  matching the doc's "once provisioned" framing.
- The Outlook connector IS registered (`power.config.json` → `apis/shared_office365` /
  `new_Office365OutlookCommercialLOS`), verified by `scripts/activation/verify-outlook-connector.ps1`
  (`STATUS=PASS`) and documented in
  `docs/PHASE_249_CHECKLIST_SIGNOFF_AND_OUTLOOK_CONNECTOR_UNBLOCK.md` — genuinely nothing left except
  the separate operator decision to flip `VITE_EMAIL_MODE=LIVE` plus certification.
- The SharePoint connector genuinely is NOT registered (no `SharePointOnlineService` exists under
  `src/generated/services/`, only `Office365OutlookService.ts` does) — `emailMode.ts` and
  `portfolioSharePointDocumentMode.ts` are both fail-closed, well-documented, and match this state
  honestly.
- No stale references to the deleted `LoanDealStageAuthorityPlugin` outside `dataverse-plugins/`
  (only in `LoanDealGovernedTransitionPlugin.cs` and `PLUGIN_DEPLOYMENT.md`, both correctly noting
  supersession).
- `dataverse-plugins/CommercialLendingLOS.Plugins.csproj`'s `Microsoft.CrmSdk.CoreAssemblies` NuGet
  version already self-flags as "illustrative... could not be verified against NuGet" — genuinely
  unverifiable from this sandbox, not a new gap.

**Genuine gap found**: `docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md` bills itself as the
master operator sequencer for this release's deployment (plugin + app push + certification), and its
companion-document list names the plugin runbook, the rollback plan, and the certification scripts —
but never named either connector runbook. Step 5 only said "confirm the app loads with no
console/connector errors," giving an operator no pointer to `verify-outlook-connector.ps1` or the
SharePoint activation runbook if something *did* go wrong, or even to know those verifications exist.
(Checked the sibling `docs/remediation/FINAL_PRODUCTION_COMPLETION_OPERATOR_RUNBOOKS_2026-07-22.md` too
— confirmed it is correctly scoped to stage-advancement/document-checklist/borrower-send only, and
already correctly states portfolioBoarding/crmLivePersistence need no further action; SharePoint is
genuinely out of its scope, not a gap there.)

## What changed

- `docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md`:
  - Added `docs/PHASE_249_CHECKLIST_SIGNOFF_AND_OUTLOOK_CONNECTOR_UNBLOCK.md` and
    `docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md` to the companion-documents list.
  - Added a new **Step 5a** naming both connector verifications explicitly: run
    `verify-outlook-connector.ps1` and expect `STATUS=PASS` (with a pointer to the Outlook runbook if
    it fails); for SharePoint, follow the PHASE_264 activation runbook only if this release intends to
    enable live uploads, otherwise confirm the flag stays off and skip it.

## What did NOT change

- No plugin code, no connector registration, no feature flag. Purely additive documentation —
  connecting existing, accurate runbooks that were already correct individually but not
  cross-referenced from the one doc that claims to sequence the whole release.
- `FINAL_PRODUCTION_COMPLETION_OPERATOR_RUNBOOKS_2026-07-22.md` left untouched — confirmed its scope
  genuinely excludes SharePoint/portfolio-boarding (already HIGH confidence, no action needed there).

## Test plan

- `npx tsc -b` — 0 errors (no `src/` file touched).
- No test references this doc by path; a full-repo grep confirmed no test pins its content.
- Full `vitest run` / `npm run build` / `npm run audit:reachability` deferred to a later batched
  checkpoint per the current speed-up directive; this phase touched only one markdown file, so no
  regression is expected.
