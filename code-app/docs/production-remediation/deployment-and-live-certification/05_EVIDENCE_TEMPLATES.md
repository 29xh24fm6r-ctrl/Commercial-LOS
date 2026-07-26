# Evidence Templates — Post-PR143 Remediation Arc

## Relationship to the existing strict evidence harness

`src/access/finalLaunchSmokeEvidence.ts` + `docs/operator-evidence/final-launch/` is this
codebase's existing, code-validated evidence system — but it is scoped to a fixed TypeScript enum
of 5 capabilities (`crmLivePersistence`, `portfolioBoarding`, `documentChecklist`,
`stageAdvancement`, `borrowerSend`). Extending that enum to cover this remediation arc's new items
would be a code change (touching `FinalLaunchCapability`, `EVIDENCE_CLASS_BY_CAPABILITY`, etc.) —
out of scope for a docs-only PR. If a future phase wants this arc's items to gate a real launch
switch the way those 5 already do, that extension should be its own small, reviewed PR.

The templates below follow the **same non-negotiable rules** that harness already enforces, without
requiring the code change:
- An outcome is never recorded as "passed" without the actual verification described.
- A failed or partial result is recorded honestly, not omitted.
- Every entry names the operator, the timestamp (UTC), and the specific record/correlation id
  touched, so it can be independently audited later.

## Template A — Schema migration evidence (one per migration, `01_MIGRATION_RUNBOOK.md`)

```json
{
  "migration": "pr138-crm-industry-projection",
  "operatorUpn": "<operator email>",
  "timestampUtc": "<ISO 8601>",
  "environment": "org3a57b8d4.crm.dynamics.com",
  "verifyBeforeExitCode": null,
  "createRanOutput": "<paste console output verbatim>",
  "verifyAfterExitCode": 0,
  "publishCustomizationsConfirmed": true,
  "sdkRegenerationRequired": false,
  "sdkRegenerationRanAndConfirmed": null,
  "outcome": "applied"
}
```

`outcome` must be one of: `applied` (verified present after create), `already_present` (verify
before create already showed present — no create ran), `failed` (create ran but verify after still
fails — do not proceed to deployment).

## Template B — Deployment evidence

```json
{
  "step": "pac code push",
  "operatorUpn": "<operator email>",
  "timestampUtc": "<ISO 8601>",
  "environment": "5f2d77a5-de50-edeb-9d74-5b2400a2320d",
  "solutionName": "CommercialLendingLOS",
  "buildOutputConfirmedClean": true,
  "pacCodePushExitCode": null,
  "appLoadsPostDeploy": null,
  "outcome": "not yet executed"
}
```

## Template C — Two-user live test evidence (per test in `03_TWO_USER_TEST_REQUIREMENTS.md`)

```json
{
  "test": "credit-approval-segregation-of-duties",
  "personaA": { "upn": "<persona A email>", "role": "assigned banker" },
  "personaB": { "upn": "<persona B email>", "role": "credit-committee member, distinct from persona A" },
  "testDealId": "<Dataverse GUID>",
  "testDealClassifiedAsTestRecord": true,
  "steps": [
    {
      "stepNumber": 1,
      "actor": "personaA",
      "action": "attempt advance CREDIT_APPROVAL -> COMMITMENT",
      "expectedResult": "blocked",
      "actualResult": null,
      "exactMessageShown": null,
      "timestampUtc": null,
      "screenshotOrExportPath": null
    },
    {
      "stepNumber": 2,
      "actor": "personaB",
      "action": "advance CREDIT_APPROVAL -> COMMITMENT",
      "expectedResult": "succeeds",
      "actualResult": null,
      "correlationId": null,
      "timestampUtc": null,
      "screenshotOrExportPath": null
    }
  ],
  "knownLimitationsAcknowledged": [
    "Client-side enforcement only was tested for document review; server-side (plugin) enforcement of this specific rule does not exist and was not (and cannot be) tested."
  ],
  "outcome": "not yet executed"
}
```

Reuse this shape for all three tests in `03_TWO_USER_TEST_REQUIREMENTS.md` (document review,
credit approval, funding dual control), adjusting `steps` per that document's own step tables.

## Template D — Closing document persistence live-smoke evidence

```json
{
  "capability": "closing-document-persistence",
  "operatorUpn": "<operator email>",
  "timestampUtc": "<ISO 8601>",
  "testDealId": "<Dataverse GUID, test-classified>",
  "steps": {
    "generateDocument": { "templateKey": "closing_checklist", "manifestId": null, "outcome": null },
    "downloadButtonWorked": null,
    "closePanelReopenPage": null,
    "manifestStillListedAfterReload": null,
    "rawDataverseRowConfirmed": { "method": "verify-entity.mjs or Maker Portal data view", "confirmed": null }
  },
  "outcome": "not yet executed"
}
```

`manifestStillListedAfterReload` is the actual proof of persistence — a manifest surviving only
until page reload would mean the migration wasn't really applied, or `dataSourcesInfo.ts`'s local
registration (see `01_MIGRATION_RUNBOOK.md`, Migration 4) is still missing/incorrect.

## Where to store completed evidence

Store completed evidence files under `docs/operator-evidence/post-pr143-remediation/`, one file per
template instance, named `<capability-or-test>-<date>.json`. Do not overwrite a prior evidence
file — each run gets its own timestamped file, so a history of attempts (including failed ones) is
preserved, matching the existing `docs/operator-evidence/final-launch/` convention of one committed
JSON per capability.
