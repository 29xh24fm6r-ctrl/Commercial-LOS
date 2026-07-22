# OGB Commercial LOS — Release Inventory (Launch Candidate)

**Branch = release candidate:** `claude/ogb-lending-e2e-cert-9oi9us` @ `01844f0`. Confirmed superset
of `fix/full-post-audit-remediation` (0 commits behind it, 6 ahead) — **no merge/integration work
was needed; this branch IS the integrated release.**

**Automated suite (this run):** `npx tsc -b` clean · `npx vitest run` **858 files / 12,788 tests
passed, 0 failed** · `npm run build` succeeds (cosmetic Rollup warnings only) · `git diff --check`
clean (no whitespace errors) vs `origin/master`.

## 1. Application commits in this release (20, from `origin/master`)

**Post-audit remediation (14, P0–P2 batch, already on `fix/full-post-audit-remediation`):**
`ca9dfb0` credit-memo Save-Draft crash+errors, `1e4d789` legacy receive/review status, `b68d36c`
timeline actor from EventBy lookup, `fa5281a` CRM linked-deals via bridged relationship, `f143dbd`
remove banker-facing Dataverse names from UI, `f178e98`/`e61a77e` nav router fixes, `2764bb1`
exclude test deals from operational counts, `f2ab829` team/manager visibility fallback, `075a8d8`
deal-industry refresh, `d992677` DealProfileEditModal save recovery, `5824140` My Alerts scope,
`75b9768` Unmapped ratings drill-through, `392e793` dropdown integrity, `186fa8f` document-upload
operator dependency doc, `6ecd16d` PowerShell ASCII-safety fix.

**E2E certification + governance (6, this session's work):** `8e7a7b0` portfolio-monitoring/
document-lifecycle/closing-blocker honesty fixes, `967af48` E2E certification report, `9a16c71`
governance design (contract/ADR/threat-model/concurrency), `806451b` transition-engine
consolidation + live Return/Decline/Withdraw mount, `13f705d` server-side enforcement plugin +
reason schema + deployment docs, `01844f0` governance certification report.

## 2. Dataverse schema changes required for this release

| Column | Table | Status | Script |
|---|---|---|---|
| `cr664_documentfile` (File, 25MB) + `cr664_originalfilename`/`cr664_mimetype`/`cr664_filesizebytes`/`cr664_uploadedon`/`cr664_uploadedby` | `cr664_documentchecklist` | **NOT present in this branch's generated SDK model — see §4, blocker candidate.** | `create-document-checklist-file-columns.ps1` |
| `cr664_sequence` | `cr664_dealstagereferences` | **Present** in the generated model (`Cr664_dealstagereferencesModel.ts`) — confirmed provisioned + regenerated. | `create-dealstagereference-sequence-column.ps1` (already applied) |
| `cr664_approvallimit`, `cr664_creditcommitteemember`, `cr664_approvaloverrideauthority` | `cr664_banker` | **Present** in the generated model — confirmed provisioned + regenerated. | `create-banker-credit-authority-fields.ps1` (already applied) |
| `cr664_governedactionreason` (String, 2000) | `cr664_loandeal` | **New this release, not yet applied.** Optional for launch — only needed to enforce reasons server-side (Phase 2 of the governance rollout); core enforcement does not need it. | `create-governed-transition-reason-field.ps1` |

## 3. Generated SDK changes

Confirmed present in `src/generated/models/` on this branch: `Cr664_dealstagereferencesModel.ts`
(`cr664_sequence`), `Cr664_bankersModel.ts` (all 3 credit-authority fields). **Not** present:
`Cr664_documentchecklistsModel.ts` has no `cr664_documentfile`/upload-metadata fields — see §4.

## 4. CRITICAL discrepancy — document-upload schema/SDK NOT aligned in this branch

The task brief lists "completed Dataverse document-upload schema" and "regenerated
document-checklist SDK" as release inputs. **Verified against this branch's actual code:**
`src/generated/models/Cr664_documentchecklistsModel.ts` has no `cr664_documentfile` (or any
upload-metadata) field, and `DOCUMENT_FILE_UPLOAD_ENABLED = false` in
`dealOriginationFeatureFlags.ts`. `docs/P0-2_DOCUMENT_UPLOAD_OPERATOR_DEPENDENCY.md` itself says
"stays disabled until an operator provisions one Dataverse File column and regenerates the SDK."

**One of two things is true, and only an operator can say which:**
- **(a)** the schema/SDK work happened in the live environment but was never committed/pushed to
  this branch — in which case, run `pac code add-data-source -a dataverse -t cr664_documentchecklist`
  in a checkout with a live `pac auth` profile against this environment, commit the regenerated
  `src/generated/**` files, and this discrepancy resolves itself; or
- **(b)** it has not actually happened yet — in which case run
  `powershell -File scripts/dataverse/create-document-checklist-file-columns.ps1 -Apply`, then the
  same `pac code add-data-source` regen, then flip `DOCUMENT_FILE_UPLOAD_ENABLED = true`.

**Launch impact:** Phase 6's GO criteria require "the real document upload succeeds." Until (a) or
(b) above is confirmed and this flag is armed, real binary document upload does not work in this
release — document request/receive/review (metadata-only) work today regardless. **This is
classified as a launch blocker for the "real document upload" GO criterion specifically** — not
for the rest of the lifecycle, which does not depend on binary upload.

## 5. Plugin assembly and registrations

- **`LoanDealGovernedTransitionPlugin.cs`** — compiled this session (`dotnet build -c Release`,
  .NET SDK 8.0.129 installed for this build): **0 errors, 0 warnings**, produces
  `dataverse-plugins/CommercialLendingLOS.Plugins/bin/Release/net462/CommercialLendingLOS.Plugins.dll`.
  This is a real, compiled artifact — not merely reviewed-by-inspection C# — though it has never
  been registered against or exercised by a live Dataverse environment.
- Supersedes and deletes `LoanDealStageAuthorityPlugin` (folded in, narrower predecessor).
- **Registration required (not yet done):** two steps on `cr664_loandeal` / `Update`, filtered to
  `cr664_stagereference, cr664_statusreference`, with a `PreImage` — one at **Pre-validation**, one
  at **Pre-operation**. Exact steps: `PLUGIN_DEPLOYMENT.md`.
- **Enforces without new schema:** stage-adjacency, terminal-status lock, CREDIT_APPROVAL→COMMITMENT
  authority. **Enforces only once `cr664_governedactionreason` exists and two flags flip:** reason
  presence for Return/Decline/Withdraw (see §2, §8 rollout order below).

## 6. Configuration and feature flags (current state on this branch)

| Flag | Value | Effect |
|---|---|---|
| `AUTO_STAGE_ADVANCE_ENABLED` | `true` | Forward stage advance is live. |
| `TASK_GENERATION_ENABLED` | `true` | Destination-stage tasks auto-created on advance. |
| `BANKER_NEW_DEAL_CREATE_ENABLED` (base) | `false`, but **`BANKER_CREATE_PILOT_ENABLED = true`** overrides it live | New Deal creation is live via the pilot rollout. |
| `DOCUMENT_CHECKLIST_GENERATION_ENABLED` | `false` | No auto-checklist-generation button; requirement list is still derived and shown. |
| `DOCUMENT_FILE_UPLOAD_ENABLED` | `false` | Real binary upload blocked — see §4. |
| `GOVERNANCE_REASON_FIELD_ENABLED` | `false` | Reason text not yet written to the deal record itself (only to audit notes). |
| `DUPLICATE_DETECTION_ENABLED` | `true` (warning-only; merge never auto-applies) | |
| Return/Decline/Withdraw UI mount | **Live in code** (`DealGovernedTransitionPanel` mounted in `BankerDealWorkspace.tsx`) | Reachable in the deployed app once pushed — not gated by a flag, gated by mounting, which is done. |

**No flag needs to change for core launch** except resolving §4. `GOVERNANCE_REASON_FIELD_ENABLED`
is optional (Phase 2 of the governance rollout, not required for core server-side enforcement).

## 7. Security-role requirements (operator/platform-admin action, outside this repo)

Per `docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md` — **unchanged status, still an open platform-admin
item, not blocking this specific release** since the plugin (once registered) is the actual
backstop regardless of security-role configuration:

- Confirm `cr664_dealstagereferences`/`cr664_dealstatusreferences` (reference tables) are read-only
  to end users.
- Confirm who holds System Administrator / plugin-step registration rights (the one bypass no
  application control can close — see `THREAT_BYPASS_MODEL.md` row 9).

## 8. Deployment order

1. **Schema** — resolve §4 (document-upload columns), regenerate SDK, commit if changed.
2. **Plugin** — register both steps per `PLUGIN_DEPLOYMENT.md` (core enforcement; no new schema
   needed for this part).
3. **App** — `pac code push` (see the operator runbook, next document, for the exact command).
4. **Verify** — live certification script (`LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`).
5. **Optional, later** — Phase 2 of governance rollout (`cr664_governedactionreason` column +
   both reason-enforcement flags) — not required for initial launch.
