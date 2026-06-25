# Phase 249 — Checklist Signoff and Outlook Connector Operator Unblock Pack

## Outcome

**Both remaining UNKNOWN blockers are packaged for the operator but remain UNKNOWN — no
signoff or connector registration was fabricated. No live gate changed.
`enabledCount = 1 / 6`. `fullLaunchAchieved = false`. `pac code push` NOT performed.**

- **Checklist signoff status:** **UNKNOWN** — no lending-owner signoff recorded.
- **Outlook connector status:** **PASS** (updated Phase 250) — generated service present AND
  the connector is registered in `power.config.json` (`apis/shared_office365` /
  `new_Office365OutlookCommercialLOS`). Live send is still gated (email mode not LIVE,
  borrower-send flags false, explicit-send certification pending).
- **CRM/portfolio hydration status:** unchanged — still NOT hydrated (Web API metadata
  unmeasured); the bridge was not touched.

> **Phase 250 update — Outlook connector verifier:** PAC writes the connector registration
> to `power.config.json` (the `/providers/Microsoft.PowerApps/apis/shared_office365` entry),
> and `.power/schemas/appschemas/dataSourcesInfo.ts` may NOT contain the connector string.
> `scripts/activation/verify-outlook-connector.ps1` now inspects BOTH sources and treats the
> connector as registered if either matches `shared_office365` / `office 365` /
> `new_Office365Outlook`. Result: `STATUS=PASS` (source: `power.config.json`). The generated
> service alone is still UNKNOWN and registration alone (no service) is still BLOCKED.

## Document checklist signoff pack

The technical prerequisites are present (generator modules + `cr664_documentchecklists`
data source). Production use requires a **manual lending-owner / Super-Admin signoff** of
the active rule-set. That signoff is operator-owned and fail-closed: until a complete
`ChecklistRulesetSignoff` is recorded, `deriveChecklistSignoffReadiness()` returns
`UNKNOWN` and no gate may flip.

**Active rule-set modules to review:**
- `src/activation/checklistGenerationActivation.ts` (deterministic rules + governed write seam)
- `src/deals/newDealChecklistGenerationAdapter.ts`
- `src/deals/documentChecklistPilotViewModel.ts`
- `src/deals/documentChecklistUiEnableReadiness.ts`

**Lending-owner review checklist (rule categories):** product coverage, stage coverage,
deterministic rules (no AI / no fabrication; preview equals written items), required-document
completeness, duplicate handling (regeneration blocked without explicit override), rollback.

**Required signoff fields (all mandatory):** `approvedBy`, `approverRole`, `signedAtIso`,
`scope` (products/stages), `rulesetVersion`, `rollback`, `evidenceRef`. Record them in
`CHECKLIST_RULESET_SIGNOFF` (currently `null`).

## Outlook connector registration runbook

The generated `Office365OutlookService` typed client exists, but the connector is **not
registered** in the app data-source manifest, so live send cannot be certified. The
generated service ALONE is not enough — registration is the gating step.

**Operator steps (maker portal):**
1. In the Power Apps maker portal, add and **authorize** the Office 365 Outlook connector
   for the app.
2. Register the connector as an app data source and **regenerate the typed SDK** so the
   manifest includes `Office365Outlook` (`Office365OutlookService.ts` is already generated).
3. Deploy with `VITE_EMAIL_MODE=LIVE` and certify the **explicit banker-action**, audited
   send path (connector acceptance is not delivery; no auto-send, no background sends).

## Verification commands

Rerun these read-only verifiers after each step until `STATUS=PASS`:

```powershell
powershell -File scripts/activation/verify-checklist-rules.ps1     # signoff is a manual record; stays UNKNOWN until captured
powershell -File scripts/activation/verify-outlook-connector.ps1   # STATUS=PASS only once the connector is registered
```

Current recorded results:

```text
[242B][checklist-rules]   STATUS=UNKNOWN modules=3/3 datasource=True signoff=pending-operator
[250][outlook-connector]  STATUS=PASS service=True registered=True source=power.config.json
```

## Launch evidence ledger

```text
New Deal create      : enabled (Phase 242A pilot)
CRM writeback        : PAC reachability 5/5 + SDK PASS; runtime NOT hydrated
Portfolio boarding   : PAC reachability 13/13 + SDK PASS; runtime NOT hydrated
Stage advancement    : sinks PASS; controlled smoke pending
Document checklist   : UNKNOWN — lending-owner signoff pending
Borrower send        : PASS (connector registered in power.config.json); live send gated — VITE_EMAIL_MODE=LIVE + cert pending
fullLaunchAchieved   : false   (enabledCount 1/6)
```

The ledger now DERIVES the checklist + borrower statuses from the signoff / connector
evidence models (UNKNOWN until real evidence), not from hardcoded constants.

## Gates / deployment

```text
DOCUMENT_CHECKLIST_GENERATION_ENABLED / CHECKLIST_WRITE_ENABLED = false (unchanged)
BORROWER_MESSAGING_ENABLED / BORROWER_EMAIL_TRANSPORT_ENABLED   = false (unchanged)
CRM / portfolio / stage gates                                   = false (unchanged)
PRODUCTION_ENVIRONMENT_CERTIFICATION                            = only newDealCreate true
```

`pac code push` was **not performed**.

## Exact operator actions remaining

1. **Checklist:** a Super-Admin / lending owner reviews the active rule-set against the
   review categories and records a complete `ChecklistRulesetSignoff`; re-run
   `verify-checklist-rules.ps1`; then the governed `DOCUMENT_CHECKLIST_GENERATION_ENABLED`
   gate flip may be considered (separate governed step).
2. **Borrower send:** connector is registered (`power.config.json`) and `verify-outlook-connector.ps1`
   reads `STATUS=PASS`. Remaining: deploy `VITE_EMAIL_MODE=LIVE`, certify the explicit audited
   send (no auto-send); then the governed borrower-send gate
   flip may be considered.
3. CRM/portfolio still need a Dataverse-authorized token to measure Web API metadata and
   hydrate; stage still needs a controlled production smoke. These are independent of the
   two blockers above.

## Safety

No live gate flipped, no `pac code push`, no fabricated signoff, no fabricated Outlook
registration, no change to CRM/portfolio hydration logic, and no weakening of
`runtimeVerifiedSchemaBridge`.
