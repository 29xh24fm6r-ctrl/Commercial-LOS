# Phase 242B — Operator Environment Activation Script Pack

Read-only verification helpers + step-by-step operator guide for the remaining
blocked live domains. **This pack flips no live gates and performs no writes.**
It tells you, per domain, whether the environment prerequisites are present
(PASS / BLOCKED / UNKNOWN), the exact next portal/PAC action, and a copy/paste
evidence line for the final, separately-governed gate-flip commit.

## Safety posture

Every script in this folder is **read-only**: it only inspects repository
artifacts (generated services, the `.power` data-source manifest, source
modules) and prints. No script performs a Dataverse create/update/delete, sends
email, flips a feature flag, deploys (`pac code push`), or changes routes or
permissions. None of these scripts touches New Deal create activation flags or
any Phase 242A file.

## How to run

From `code-app/`:

```powershell
# individual checks
powershell -File scripts/activation/verify-crm-schema.ps1
powershell -File scripts/activation/verify-checklist-rules.ps1
powershell -File scripts/activation/verify-outlook-connector.ps1
powershell -File scripts/activation/verify-stage-advancement-sinks.ps1
powershell -File scripts/activation/verify-portfolio-boarding-schema.ps1

# run all + print one copy/paste evidence block
powershell -File scripts/activation/collect-activation-evidence.ps1
# save it yourself if you like:
powershell -File scripts/activation/collect-activation-evidence.ps1 > activation-evidence.txt
```

`STATUS` legend: **PASS** = prerequisites present; **BLOCKED** = required
artifact missing (do the portal/PAC step); **UNKNOWN** = partial / a manual
signoff is still pending.

## Domains

### 1. CRM schema (`verify-crm-schema.ps1`)
Checks the `cr664_crm*` spine generated services + data-source registration.

Next action when not PASS:
1. In the Power Apps maker portal, create the `cr664_crm*` tables (organization,
   person, relationship, role assignment, timeline event) with columns +
   relationships.
2. Register each as an app data source:
   `pac code add-data-source -a dataverse -t cr664_crmorganizations` (repeat per table).
3. Regenerate the typed SDK and rebuild.
4. Re-run the script until STATUS=PASS.

### 2. Document checklist rule-set signoff (`verify-checklist-rules.ps1`)
Checks the deterministic generator modules + `cr664_documentchecklists` data
source. The rule-set **signoff is a manual approval**: a Super-Admin / lending
owner reviews the active product/stage checklist rules and records signoff. The
script reports UNKNOWN until that approval is captured in the evidence block.

### 3. Outlook connector + SDK (`verify-outlook-connector.ps1`)
Checks the generated `Office365OutlookService` + connector registration. It does
**not** send mail. Next action when not PASS: add/authorize the Office 365
Outlook connector in the portal, register it as a data source, regenerate the
SDK, re-run.

### 4. Stage advancement sinks (`verify-stage-advancement-sinks.ps1`)
Checks the three sinks a governed Advance Stage write depends on: stage
reference, audit, and timeline services + their data sources. When PASS, a
controlled single-record Advance Stage smoke (separately governed) can be
scheduled.

### 5. Portfolio boarding schema (`verify-portfolio-boarding-schema.ps1`)
Checks the portfolio boarded-loan generated service + data source. Child group
tables (borrower, collateral, guarantor, covenant, tickler, insurance,
document-reference, exception/review) are verified by operator portal review.

## Final gate-flip (NOT part of this pack)

Only after the relevant evidence reads `STATUS=PASS` and manual signoffs are
recorded does an operator perform the separate, governed gate-flip + deploy
(`pac code push`) in its own change. That step is intentionally outside this
read-only pack and is owned by the production-cutover runbook
(`docs/PHASE_241_*`). This pack just produces the evidence that the flip is
justified.

## Relationship to Phase 242A

Phase 242A runs separately in the original working tree and may modify New Deal
create gates. This pack is confined to `scripts/activation/`, the 242B doc, and
an optional read-only governance test — it changes no New Deal create flag and no
242A file.
