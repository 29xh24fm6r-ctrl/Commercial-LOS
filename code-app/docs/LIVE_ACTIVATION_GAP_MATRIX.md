# Live-Activation Gap Matrix & Gate-Flip Runbook

_Branch: `full-los-activation-burn-down`. Produced 2026-07-08 from a full evidence-grounded
audit of the six activation domains. No gate is flipped by this document or this branch._

## What "the six blockers" actually are

Every one of the six domains is already built, pure, fail-closed, and green (all activation
tests pass). The Admin Diagnostics show blockers because a domain resolves **enabled only
when all three hold**:

```
enabled = certified && gateFlagOn && evidenceHigh
```

(`src/admin/productionEnvironmentVerification.ts` — the single launch truth source.)

- **certified** — operator certification toggle (`PRODUCTION_ENVIRONMENT_CERTIFICATION`). All six are `true`.
- **gateFlagOn** — the real feature-flag constant read live (`readLiveGateFlags()`).
- **evidenceHigh** — the committed `docs/operator-evidence/final-launch/<cap>.json` is `accepted` at `HIGH`
  confidence per `deriveEvidenceIntegrity` (`src/access/finalLaunchSmokeEvidence.ts`): shape-GO +
  attributable operator UPN (no sentinels) + class machine proof (AUTOMATED_CRUD → `affectedRecordIds`;
  EXTERNAL_SEND → `deliveryReceiptId` + `approvedRecipient` + `approverUpn`) + non-synthetic timestamp.

**Current integrated posture: `enabledCount = 1 / 6`, `fullLaunchReady = false`.** Only
`newDealCreate` resolves enabled (via the approved pilot switch `BANKER_CREATE_PILOT_ENABLED`).
The dashboard is honest — there is no code path that can force `fullLaunchReady` true without every
real gate clearing (pinned by `productionEnvironmentVerification.test.ts`, `controlledLiveCutoverReadiness.test.ts`,
`crossPanelLaunchCoherence.test.ts`).

**Nothing below can be truthfully flipped by an engineer from the repo alone.** Live schema currency,
runtime live-transport injection, and authentic smoke capture are all operator-side and
operator-verifiable-only. This document is the exact, safe path — it never fabricates evidence,
hardcodes green, or bypasses a flag.

---

## The matrix

| Domain | Code / tests | Dataverse schema | Seed / reference | Smoke evidence (committed) | Feature flag (false unless noted) | Can flip now? | Primary remaining blocker |
|---|---|---|---|---|---|---|---|
| **CRM writeback** | ✅ pure seam + gate; 11 tests | ✅ hydrated 10/10 (147 cols, 0 conflicts) `runtimeVerifiedSchemaBridge.CURRENT_CRM_VERIFICATION_EVIDENCE` | none required (`crmDataverseSchemaPlan`: "No record data is ever seeded") | **✅ accepted HIGH** `crmLivePersistence.json` (real record id, sub-second ts, attributable UPN) | `CRM_LIVE_PERSISTENCE_ENABLED=false` (`crmFeatureFlags.ts:26,59`; `crmActivation.ts:20`) | **No — eligible, operator-gated** | Flag off **and** live Dataverse transport not injected at runtime (`crmLiveDataverseTransport` "never wired by default") |
| **Portfolio boarding** | ✅ seam (now 10 child groups + dup/readback guards); 10 tests | ✅ hydrated 13/13 (219 cols, 12/12 req rel) `CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE` | none required (option sets stored as TEXT) | ❌ **NONE** `portfolioBoarding.json` — `operatorUpn:"unknown-operator"` (sentinel) | `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED=false` + `_ROUTE_ENABLED=false` (`portfolioLoanBoardingFeatureFlags.ts:43,44`) | **No** | Re-capture the boarding smoke with a real attributable operator (then flip 2 flags) |
| **Stage advancement** | ✅ seam + legal transition graph (`canonicalStageTransition`); 17+ tests | ⚠️ `cr664_sequence` column is a **manual maker add** (no create script); SDK already carries the field | `scripts/seed-stage-references.mjs` (7 stages 10..70 + 5 statuses) — must `--commit` then `--verify` | ❌ **NONE** `stageAdvancement.json` — `outcome:"failed"`, empty `affectedRecordIds` (self-corrected placeholder) | `AUTO_STAGE_ADVANCE_ENABLED=true` (**already on** — `dealOriginationFeatureFlags.ts:25`) | **No** | Evidence artifact is `failed`; add column + seed + re-capture a machine-proven smoke |
| **Document checklist** | ✅ seam + deterministic rules; 10 tests | table pre-exists (registered via SDK regen, not created) | rule set = static `DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES` + **owner signoff ✅ APPROVED** (`operator-evidence/DOCUMENT_CHECKLIST_LENDING_OWNER_SIGNOFF_2026-06-25.md`) | ❌ **NONE** `documentChecklist.json` — empty `affectedRecordIds` + synthetic ts | `DOCUMENT_CHECKLIST_GENERATION_ENABLED=false` (`dealOriginationFeatureFlags.ts:29`) | **No** | Re-capture an in-app checklist smoke with real record ids + real clock, then flip flag |
| **Borrower send** | ✅ transport abstraction (DRY_RUN/LIVE) + dry-run evidence mode; 17 tests, none send live | connector **already registered** (`power.config.json` `shared_office365`); SDK has `Office365OutlookService.SendEmailV2` | none | ❌ **NONE** `borrowerSend.json` — missing `deliveryReceiptId`/`approvedRecipient`/`approverUpn` | `BORROWER_MESSAGING_ENABLED=false` **and** `BORROWER_EMAIL_TRANSPORT_ENABLED=false` (`dealOriginationFeatureFlags.ts:34,36`); `EMAIL_MODE` not LIVE | **No (highest risk)** | Deploy `VITE_EMAIL_MODE=LIVE`, capture an audited diagnostic-mailbox send with the 3 proof fields, flip 2 flags |
| **New Deal create** | ✅ governed create + pilot | pre-existing | Intake/Open refs seeded + verified (Phase 227/228A) | pilot track (no final-launch smoke) | pilot on (`BANKER_CREATE_PILOT_ENABLED=true`) | **Already live (pilot)** | — |

Legend: "Can flip now?" = whether the flip is justified by in-repo proof alone. **No domain is
flippable by an engineer** — every "eligible" one still needs operator-side steps that cannot be
verified from the repo.

---

## Per-domain detail & exact operator commands

All PowerShell scripts are **dry-run by default**; `-Apply` mutates. Create scripts are
create-missing-only/additive. Run from `code-app/`.

### 1. CRM writeback — closest to flippable (eligible, operator-gated)

The only domain with schema **hydrated** and smoke **accepted HIGH**. Two things still gate it:
the flag, and runtime injection of a live Dataverse transport (the seam fails closed to
`schema_not_verified` without an injected `transport`+`auditSink`).

```powershell
# (schema already applied+verified in-repo evidence; re-verify against the live env before flipping)
powershell -File scripts/dataverse/verify-full-crm-schema.ps1          # expect STATUS=PASS 10/147/28
powershell -File scripts/dataverse/export-runtime-schema-evidence.ps1  # refresh runtime evidence
# flip (source edit — all three copies must move together):
#   src/crm/crmFeatureFlags.ts:26  CRM_LIVE_PERSISTENCE_ENABLED = true
#   src/crm/crmFeatureFlags.ts:59  CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED = true
#   src/activation/crmActivation.ts:20  CRM_LIVE_PERSISTENCE_ENABLED = true
npm run build   ;   # then: pac code push
```
Remaining engineering (operator/dev): wire the live Dataverse client into the injected
`CrmWriteTransport` (the generated services exist; nothing binds them by default). Internal
Dataverse only — no Salesforce/nCino dependency.

### 2. Portfolio boarding — schema good, evidence is a sentinel placeholder

```powershell
powershell -File scripts/dataverse/verify-full-portfolio-runtime-schema.ps1   # expect PASS 13/219/12
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding
#   ^ re-captures portfolioBoarding.json with a REAL attributable operatorUpn (WhoAmI), not "unknown-operator"
# then flip (src/portfolioBoarding/portfolioLoanBoardingFeatureFlags.ts:43,44):
#   PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = true ; PORTFOLIO_BOARDING_ROUTE_ENABLED = true
npm run build   ;   # pac code push
```
Note: this branch extended the boarding seam to the full 8-group handoff (adds document/evidence
and exception/review) plus duplicate + readback guards — so single-record boarding now writes the
complete package before the gate is ever flipped.

### 3. Stage advancement — flag already on, evidence is `failed`

`AUTO_STAGE_ADVANCE_ENABLED` is already `true`; the domain is held not-enabled purely because
`stageAdvancement.json` is `outcome:"failed"` with no machine proof. (Do not conflate with
`ADVANCE_STAGE_WRITE_ENABLED=false`, a separate seam-only gate that `readLiveGateFlags` does not read.)

```powershell
# 1) add column cr664_sequence (Whole Number, required) to cr664_dealstagereferences in make.powerapps.com; Publish
# 2) seed + verify ordered active rows:
$env:DATAVERSE_BEARER_TOKEN = "<token>"
node scripts/seed-stage-references.mjs            # dry-run
node scripts/seed-stage-references.mjs --commit   # INTAKE=10 … BOARDED=70 + 5 statuses
node scripts/seed-stage-references.mjs --verify   # ordering smoke (unique, gap-free)
# 3) capture a machine-proven advance smoke (in-app), then record it:
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence path\to\stageAdvancement.json
#   the JSON MUST be outcome=passed with live/readback true and a non-empty affectedRecordIds
```
The tightened recorder (this branch) will now REJECT a `passed` stage artifact that lacks
`affectedRecordIds`, so the placeholder cannot recur silently.

### 4. Document checklist — signoff + schema done, evidence is a placeholder

```powershell
powershell -File scripts/activation/verify-checklist-rules.ps1   # read-only rule-set + datasource check
# capture the controlled in-app checklist smoke (create/readback/cleanup), then:
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence path\to\documentChecklist.json
#   MUST carry real affectedRecordIds and a real (non-synthetic) completedAtIso
# flip: src/deals/dealOriginationFeatureFlags.ts:29  DOCUMENT_CHECKLIST_GENERATION_ENABLED = true
npm run build   ;   # pac code push
```
Runtime still requires an injected live checklist write transport + audit sink + duplicate
protection (`checklistWriteDependency`), independent of the flag.

### 5. Borrower send — last, irreversible (live email)

Connector is registered and the SDK binds `SendEmailV2`; the blockers are LIVE mode, authentic
evidence, and two flags.

```powershell
powershell -File scripts/activation/verify-outlook-connector.ps1   # expect STATUS=PASS
# deploy LIVE, then perform ONE audited send to an APPROVED non-borrower diagnostic mailbox:
#   VITE_EMAIL_MODE=LIVE npm run build   ;   pac code push
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence path\to\borrowerSend.json -TestRecipient <approved@diagnostic>
#   the JSON MUST include deliveryReceiptId + approvedRecipient + a valid approverUpn (now enforced)
# flip BOTH: src/deals/dealOriginationFeatureFlags.ts:34,36
#   BORROWER_MESSAGING_ENABLED = true ; BORROWER_EMAIL_TRANSPORT_ENABLED = true
```
Delivery is never claimed — connector acceptance ≠ delivery. Recipient is never inferred from a name.

---

## Recommended gate-flip sequence

Flip **one domain at a time**, verify the dashboard moves that domain (and only that domain) to
`enabled`, then proceed. Each flip is one-line-rollbackable. Order chosen by reversibility and risk
(internal, reversible domains first; irreversible live email last):

1. **CRM writeback** — internal-only, schema+evidence already green; needs the live transport wired. Lowest risk, highest readiness.
2. **Portfolio boarding** — internal-only, schema green; re-capture attributable evidence.
3. **Document checklist** — internal-only, signoff+schema done; re-capture evidence.
4. **Stage advancement** — internal-only; add column + seed + re-capture (flag already on).
5. **Borrower send** — LAST. Live outbound email is irreversible; only after 1–4 are stable and a real audited diagnostic-mailbox send is evidenced.

`fullLaunchReady` becomes true only after all five clear (newDealCreate already live). Do **not**
set any certification toggle, flag, or evidence value to make the dashboard green — every green must
be earned by the real gate condition.

## What this branch changed (real gaps only — no recertification)

| Commit | Gap closed |
|---|---|
| Complete portfolio boarding child-group handoff, duplicate + readback guards | Seam boarded only 6 of the schema's child groups (omitted documents/evidence, exceptions/reviews); no duplicate or readback guard |
| Align final-launch smoke recorder with the evidence-integrity gate | PowerShell recorder accepted "passed" artifacts the TypeScript gate rejects → gate-flip trap |
| Add isolated per-gate negative tests for borrower-send activation | Ten live-email gates were only tested in aggregate |
| Correct the stale certification comment in the launch truth source | Comment claimed a 2-way gate + "both now hold for all six" (false) |

Everything else the six workstreams asked for already existed, is fail-closed, and is tested —
so it was intentionally **not** re-touched.
