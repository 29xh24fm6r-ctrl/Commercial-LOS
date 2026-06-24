# Phase 244 — Post-Schema PASS Evidence and Final Cutover Readiness

## Outcome

**Full launch is NOT achieved. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`.**

Starting from commit `0d5f303` (CRM + portfolio Dataverse generated services
registered), the CRM and portfolio **technical prerequisites now read PASS**, but their
live gates remain controlled (not flipped). Document checklist and Outlook remain
UNKNOWN. No live gate was changed, no `pac code push` was performed, and no signoff or
connector registration was faked.

## Recorded environment evidence

Recorded read-only verification run at commit `0d5f303`
(`scripts/dataverse/run-full-activation-verification.ps1`):

```text
[243][verify-crm-spine]        STATUS=PASS    services=5/5   datasources=5/5   live=5/5
[243][verify-portfolio-boarding] STATUS=PASS  services=13/13 datasources=13/13 live=13/13
[242B][crm-schema]             STATUS=PASS    present=5/5 datasource=True
[242B][stage-sinks]            STATUS=PASS    sinks=3/3
[242B][portfolio-boarding]     STATUS=PASS    service=True datasource=True
[242B][checklist-rules]        STATUS=UNKNOWN modules=3/3 datasource=True signoff=pending-operator
[242B][outlook-connector]      STATUS=UNKNOWN service=True registered=False
ALL-PASS: False
fullLaunchAchieved: false
```

Note: the `live=N/N` counts reflect the live Dataverse `EntityDefinitions` confirmation
when a `pac` org token is available; on a repo-only run the orchestrator reports
`live=0/0` (not checked) while services/datasources read full. Either way, ALL-PASS is
False because checklist + Outlook are UNKNOWN.

## Six-domain state

| Domain | Environment evidence | Live gate | Live now? |
| --- | --- | --- | --- |
| New Deal create | PASS (Phase 227/228A pilot) | controlled (pilot on) | **enabled** |
| CRM writeback | **PASS** — services 5/5, datasources 5/5, live 5/5 | controlled (false) | not live |
| Portfolio boarding | **PASS** — services 13/13, datasources 13/13, live 13/13 | controlled (false) | not live |
| Stage advancement | PASS — sinks 3/3 | controlled (false) | not live |
| Document checklist | UNKNOWN — lending-owner signoff pending | controlled (false) | blocked |
| Borrower send | UNKNOWN — Outlook connector not registered | controlled (false) | blocked |

`enabledCount = 1` (only New Deal create). Environment PASS is a prerequisite, not
activation: CRM, portfolio, and stage have PASS environments but their governed gate
flips + controlled smokes are still pending.

## Script fixes

1. **`scripts/dataverse/run-full-activation-verification.ps1`** — the orchestrator
   captured only the success stream (`$out = & $s`) while the child verifiers emit via
   `Write-Host`, so `$evidence` was empty and `ALL-PASS` was vacuously `True`. Fixed to
   merge all streams (`$out = & $s *>&1`) and require **at least one** evidence line with
   **zero** non-PASS lines: `$allPass = ($evidence.Count -gt 0) -and ($nonPass.Count -eq 0)`.
   `ALL-PASS` is now `False` whenever any child reports BLOCKED or UNKNOWN.
2. **`scripts/dataverse/regenerate-powerapps-sdk.ps1`** — registered data sources using
   the plural **entity-set** names (`cr664_crmorganizations`). Fixed to use the singular
   **logical** table names (`cr664_crmorganization`), which is what
   `pac code add-data-source -t` expects.

## No live gates changed; no deploy performed

- The six live feature gates are unchanged (CRM, portfolio, checklist, borrower, stage
  all stay false; New Deal create stays pilot-controlled).
- Only `PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate` is true (Phase 227/228A).
- `pac code push` was **not performed**. A deploy is only justified after the governed
  gate cutover, which has not occurred.

## Remaining operator actions

To progress toward full launch, in order:

1. **Document checklist** — a Super-Admin / lending owner reviews and records signoff of
   the active checklist rule-set, then inject the live checklist write transport and flip
   `DOCUMENT_CHECKLIST_GENERATION_ENABLED` + the UI action gate.
2. **Borrower send** — register/authorize the Office 365 Outlook connector in the maker
   portal, regenerate the SDK, deploy with `VITE_EMAIL_MODE=LIVE`, and certify the
   explicit banker-action audited send. No auto-send.
3. **CRM writeback** — inject the `VerifiedCrmSchemaState`, flip
   `CRM_LIVE_PERSISTENCE_ENABLED`, record success / disallowed-field / rollback smoke.
4. **Portfolio boarding** — inject the `VerifiedBoardingSchemaState`, enable the route for
   an authorized operator, flip `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`, record
   single-record boarding + failure smoke.
5. **Stage advancement** — inject the live stage/audit/timeline sinks into
   `AdvanceWorkflowStageButton`, record controlled advancement / blocked-transition /
   update-failed smokes, then flip the governed explicit-advancement gate.

Re-run `scripts/dataverse/run-full-activation-verification.ps1` until `ALL-PASS: True`
before any governed gate cutover.

## Rollback plan

Per-domain one-line disable (unchanged):

- New Deal create — set `BANKER_CREATE_PILOT_ENABLED` to false.
- CRM writeback — set `CRM_LIVE_PERSISTENCE_ENABLED` to false.
- Document checklist — set `DOCUMENT_CHECKLIST_GENERATION_ENABLED` to false.
- Borrower send — set `BORROWER_MESSAGING_ENABLED` + `BORROWER_EMAIL_TRANSPORT_ENABLED`
  to false; deploy with `VITE_EMAIL_MODE=DRY_RUN`.
- Stage advancement — set `AUTO_STAGE_ADVANCE_ENABLED` to false.
- Portfolio boarding — set `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + route to false.

This commit changes only scripts, the read-only evidence model, the doc, and tests — it
flips no live gate, so `git revert <commit>` is operationally a no-op.
