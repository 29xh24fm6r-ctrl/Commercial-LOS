# Phase 122B — Automated Dataverse Lookup Repair

**Status:** **Dry-run script delivered + audit re-confirmed.** This phase
replaces the error-prone Maker Portal click-path from Phase 122 §10
with a Node script that audits the live environment, prints a full
plan with exact Web API payloads, and refuses to execute live writes
unless every safety gate passes.

**No app code change. No live writes performed in this commit.**

Related canonical sources:
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — the parent phase; §10 documents the publisher-prefix finding that motivated this script.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) — the seed runbook whose Steps 5 + 6 unblock once the script's plan executes.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — email-lane lock honored.

---

## 1. Why manual Maker Portal was stopped

Phase 122 §10 documented that the `CommercialLendingLOS` solution's
publisher prefix is `new`, not `cr664`. Manually adding a column from
inside that solution would create a `new_Deal` column — which would
not satisfy the React contract (`cr664_Deal@odata.bind` +
`_cr664_deal_value`) and would leave junk in the schema that someone
later has to clean up.

Additionally, all 5 candidate child tables already carry a
pre-existing non-standard `cr664_deal` (lowercase d) pseudo-column
that would collide case-insensitively with a new standard
`cr664_Deal` Lookup. The manual path requires multiple deletes +
multiple lookup creations from the correct (cr664-prefix) solution
context — a dozen-plus clicks each with a different stop condition.

The script automates the audit + plan + (optional) execution with
guardrails on every step.

---

## 2. The script

[scripts/phase122-lookup-repair.mjs](../scripts/phase122-lookup-repair.mjs)
is an ESM Node script that depends only on the Node 20+ standard
library and the `pac` CLI (already authenticated against the target
environment). It has three modes:

| Mode | Command | Behavior |
| --- | --- | --- |
| Default (dry-run) | `node scripts/phase122-lookup-repair.mjs` | Read-only audit + plan emission; nothing is written. |
| Explicit dry-run | `node scripts/phase122-lookup-repair.mjs --dry-run` | Same as default. |
| Inspect dependencies | `node scripts/phase122-lookup-repair.mjs --inspect-dependencies` | Read-only audit + plan + per-pseudo-column `RetrieveDependenciesForDelete` probe. No write. Short-circuits at the first column that has a dependent component. Requires a bearer token (same priority order as `--commit`). |
| Cleanup form (dry-run) | `node scripts/phase122-lookup-repair.mjs --cleanup-form <form-guid> [--attribute <table>.<column>]` | Read-only. Fetches the SystemForm by GUID, prints every `<cell>` in its persisted formxml that references the target column. Default target is `cr664_deal`; `--attribute cr664_dealtask1.cr664_assignedto` (for example) targets the supplied column instead. No write. See §5B. |
| Cleanup form (commit) | `node scripts/phase122-lookup-repair.mjs --cleanup-form <form-guid> [--attribute <table>.<column>] --commit-form-cleanup` | Splices the matched cells out of the formxml, PATCHes the SystemForm, publishes, then re-runs `RetrieveDependenciesForDelete` on the supplied `<table>.<column>` (or the form's parent entity + cr664_deal when no `--attribute`) to confirm the blocker cleared. See §5B. Refuses to write (without `--attribute`) if no direct field cell exists but indirect references are present. |
| Inspect form (read-only) | `node scripts/phase122-lookup-repair.mjs --inspect-form <form-guid> --attribute <table>.<column>` | Read-only broad inspection. Walks the SystemForm's persisted XML and groups every reference to the qualified attribute into per-category findings (direct cell / subgrid / quick-view / TargetEntityType / RelationshipName / NavBar / bare logical name). No write. See §5C. |
| Cleanup subgrid (dry-run) | `node scripts/phase122-lookup-repair.mjs --cleanup-subgrid <form-guid> --control-id <id>` | Read-only. Validates that exactly one `<cell>` on the form contains a `<control id="<id>">`, that it is a subgrid (classid match), that its `<TargetEntityType>` is in `CANDIDATE_CHILD_TABLES`, and that its `<RelationshipName>` references `cr664_deal`. Prints the enclosing `<cell>` snippet. No write. See §5D. |
| Cleanup subgrid (commit) | `node scripts/phase122-lookup-repair.mjs --cleanup-subgrid <form-guid> --control-id <id> --commit-subgrid-cleanup` | Same validation as above; on success splices ONLY the matched `<cell>` from the formxml, PATCHes the SystemForm, publishes, then re-fetches and exits non-zero if any residual reference to the validated target table remains on the form. See §5D. |
| Inspect view (read-only) | `node scripts/phase122-lookup-repair.mjs --inspect-view <view-guid> --attribute <table>.<column>` | Read-only. Reads one SavedQuery, parses fetchxml + layoutxml, classifies every reference to the attribute into per-category findings, reports overall safety as `no-references` / `safe` / `unsafe`. No write. See §5E. |
| Cleanup view (dry-run) | `node scripts/phase122-lookup-repair.mjs --cleanup-view <view-guid> --attribute <table>.<column>` | Read-only preview. Same parsing as inspect-view, plus a "what would be removed" report for safely-removable references (layout cells + top-level fetch attributes only). Refuses non-write-classification (filter/sort/link-entity → manual remediation). No write. See §5E. |
| Cleanup view (commit) | `node scripts/phase122-lookup-repair.mjs --cleanup-view <view-guid> --attribute <table>.<column> --commit-view-cleanup` | Splices the safe references out of fetchxml + layoutxml, PATCHes the SavedQuery, publishes, then re-runs `RetrieveDependenciesForDelete` on `<table>.<column>`. Refuses any unsafe view. See §5E. |
| Commit | `node scripts/phase122-lookup-repair.mjs --commit` | Refuses to run unless every safety gate passes (publisher prefix, rollback artifacts, dependency inspection clear, zero non-NULL pseudo-column rows, no stop conditions in plan). |

### 2.1 Hard-pinned constants

The script reads these from `phase122-lookup-repair.mjs` directly:

```text
TARGET_ENVIRONMENT_ID         = 5f2d77a5-de50-edeb-9d74-5b2400a2320d
SOLUTION_FOR_CR664            = LoanOpsExport
SOLUTION_FOR_REFERENCE        = CommercialLendingLOS
CR664_PUBLISHER_UNIQUE_NAME   = Crc0077
CR664_PUBLISHER_PREFIX        = cr664
FORBIDDEN_PUBLISHER_PREFIX    = new

CANDIDATE_CHILD_TABLES        = cr664_documentchecklist
                                cr664_dealtask1
                                cr664_creditmemo1
                                cr664_creditmemodraftsection
                                cr664_dealtimelineevent

LOOKUP_TARGET_LOAN_DEAL       = cr664_loandeal
LOOKUP_TARGET_SYSTEMUSER      = systemuser

PSEUDO_DEAL_COLUMN            = cr664_deal          (lowercase d)
PSEUDO_ASSIGNEDTO_COLUMN      = cr664_assignedto
NEW_DEAL_COLUMN_SCHEMA_NAME   = cr664_Deal          (capital D)
NEW_ASSIGNEDTO_COLUMN_SCHEMA  = cr664_AssignedTo
```

### 2.2 What the script does in each phase

1. **Auth sanity check** — verifies `pac auth list` reports an active session.
2. **Phase A — Publisher audit** — single FetchXML query joins the
   `solution` and `publisher` tables, parses out each target
   solution's customization prefix. Refuses to proceed in commit
   mode if `LoanOpsExport`'s prefix is not `cr664`.
3. **Phase B — Table audit** — for each candidate child table,
   probes whether `cr664_deal` (pseudo) exists, whether
   `_cr664_deal_value` (standard FK) exists, and counts the rows
   that have a non-NULL `cr664_deal`. Same shape for
   `cr664_dealtask1.cr664_assignedto`.
4. **Plan emission** — builds an ordered list of steps:
   - Solution exports for rollback (unless `--skip-rollback-export`)
   - Pseudo-column deletions (only where row count is 0)
   - New Lookup column creations via `POST /api/data/v9.2/RelationshipDefinitions`
   - `pac solution publish`
   - Verification `pac env fetch` probes for `_cr664_deal_value` and `_cr664_assignedto_value`
5. **Runbook artifact** — writes the full plan as JSON to
   `.phase122/phase122-runbook.json` so it can be copy/pasted or
   inspected separately.
6. **Commit execution (only if `--commit`)** — walks the plan one
   step at a time. Shells out to `pac` for solution
   exports / publish / verification probes; uses `fetch()` with
   `Bearer ${DATAVERSE_BEARER_TOKEN}` + `MSCRM.SolutionUniqueName:
   LoanOpsExport` header for the Web API metadata writes. Stops
   immediately on the first failure.

### 2.3 Safety gates (commit mode)

The script refuses to write if **any** of these fail:

- `LoanOpsExport` publisher prefix is not `cr664`.
- Rollback artifacts at
  `.phase122/rollback/{CommercialLendingLOS,LoanOpsExport}_PRE_PHASE_122B.zip`
  are missing **when `--skip-rollback-export` is passed**. In the
  default (auto-export) mode the plan's first two steps create these
  zips automatically — the script does not require them to pre-exist.
- Either rollback zip is not on disk **after** the auto-export steps
  run (mid-plan post-condition; protects against pac exiting 0 with
  no file produced).
- **Any pseudo-column scheduled for deletion has at least one dependent
  component** (form, view, workflow, relationship, field-security
  profile, report, etc. — see §5A for the full inspection contract and
  remediation path). The script refuses to attempt a force-delete or
  any bypass.
- A Dataverse bearer token cannot be obtained from any of three sources
  (see §2.4): `DATAVERSE_BEARER_TOKEN` env var → cached device-code
  token → fresh device-code flow.
- Any plan step is a `stop-condition` (e.g. a pseudo-column has
  non-NULL rows).
- Any pseudo-column whose non-NULL row count couldn't be probed.

### 2.4 Bearer-token acquisition (no admin install required)

The operator laptop running this script does **not** need to have
Azure CLI, `@azure/identity`, `@azure/msal-node`, or any other admin-
installed dependency. The script tries these sources in order — the
first that yields a JWT-shaped token wins:

1. **`DATAVERSE_BEARER_TOKEN` env var.** If the operator already has
   a token from any source (Postman, `az` CLI on a different machine,
   browser DevTools), set it before launching the script and it is
   used as-is.
2. **Cached device-code token** at `.phase122/.token-cache.json`. The
   script writes this file (gitignored) at the end of any successful
   device-code login so subsequent runs within ~1 hour don't re-prompt.
3. **Interactive OAuth2 device-code flow.** If the first two are
   unavailable, the script prints a verification URL + user code to
   the terminal. The operator opens the URL in any browser (including
   a phone), enters the code, and signs in with their tenant
   credentials. The script polls the Microsoft identity endpoint
   until the token is issued, then caches it.

The device-code flow uses the well-known Microsoft Azure PowerShell
public client (`1950a258-227b-4e31-a9cf-717495945fc2`) — a multi-tenant
first-party app registration that supports device-code and is accepted
as a Dataverse client. Nothing about it requires admin rights on the
operator's machine.

---

## 3. Dry-run instructions

```text
# Windows PowerShell (the env in this repo)
cd C:\Users\MatthewPaller\projects\powerapp-project\code-app
node scripts/phase122-lookup-repair.mjs --dry-run
```

Expected output, top-to-bottom:

```text
======================================================================
Phase 122B — Dataverse lookup repair script — mode: DRY-RUN
======================================================================
Environment id (pinned):  5f2d77a5-de50-edeb-9d74-5b2400a2320d
Solution for cr664_ work: LoanOpsExport
Cross-list reference:     CommercialLendingLOS
Required prefix:          cr664
Forbidden prefix:         new

Phase A — Auditing publishers + solution → publisher join…
  Publisher join:
    - LoanOpsExport: prefix=cr664
    - CommercialLendingLOS: prefix=new

Phase B — Auditing candidate child tables for column state…
  · cr664_documentchecklist
  · cr664_dealtask1
  · cr664_creditmemo1
  · cr664_creditmemodraftsection
  · cr664_dealtimelineevent

Table audit summary:
  <one block per table>

📋 Plan written to .../.phase122/phase122-runbook.json

Phase C — Planned actions:
  · [1] Rollback export — CommercialLendingLOS
  · [2] Rollback export — LoanOpsExport
  🔧 [3-8] Delete pseudo-column cr664_<table>.cr664_deal
  🔧 [9-13] Create cr664_Deal Lookup on cr664_<table> → cr664_loandeal
  🔧 [14] Create cr664_AssignedTo Lookup on cr664_dealtask1 → systemuser
  · [15] Publish all customizations
  🧪 [16-21] Verify _cr664_deal_value / _cr664_assignedto_value resolves

Dry-run complete. Nothing was written to Dataverse.
```

The runbook JSON at `.phase122/phase122-runbook.json` is the
authoritative artifact — every Web API payload is materialized
there for manual review or copy/paste execution.

---

## 4. Commit instructions

> ⚠ **Read §3's dry-run output carefully before continuing.** Confirm:
> (a) `LoanOpsExport: prefix=cr664`
> (b) every pseudo-column shows `non-NULL row count: 0`
> (c) every planned `Create cr664_Deal Lookup …` step targets `cr664_loandeal`, not `cr664_deal`

### 4.1 Option A — No-admin device-code flow (recommended)

This is the default path for laptops where Azure CLI cannot be
installed (e.g. no local admin rights). Nothing needs to be installed
beyond `pac` (already present) and Node 20+.

```powershell
# Just run the script in commit mode — token is acquired in-process.
node scripts/phase122-lookup-repair.mjs --commit
```

When the script reaches the bearer-token gate it will print:

```text
🔐 Microsoft sign-in required (no admin install needed).

   1. Open this URL in any browser:  https://microsoft.com/devicelogin
   2. Enter this code:               ABCD-EFGH
   3. Sign in as the operator with Dataverse maker rights.

   Code expires in 15 minute(s). Polling…
```

Open the URL in any browser (including a phone), enter the code, sign
in, and the script picks up the token automatically and continues.
The token is then cached under `.phase122/.token-cache.json` (mode
`0600`, gitignored) so subsequent runs within the token lifetime
don't re-prompt.

### 4.2 Option B — Pre-acquired token via env var

If the operator already has a Dataverse access token (from another
machine that has `az` CLI, from Postman, from browser DevTools, etc.),
they can hand it to the script via env var. This skips the device-code
prompt entirely.

```powershell
# 1. Acquire a Dataverse bearer token however you can.
#    (Example below uses az CLI; this is OPTIONAL — Option A works
#    without az.)
$envUrl = (pac org who | Select-String "https://" | ForEach-Object { $_.Matches.Value } | Select-Object -First 1)
$token = az account get-access-token --resource $envUrl --query accessToken -o tsv
$env:DATAVERSE_BEARER_TOKEN = $token

# 2. Run the script in commit mode.
node scripts/phase122-lookup-repair.mjs --commit
```

### 4.3 Manual rollback export (only when using `--skip-rollback-export`)

By default the script auto-exports both rollback zips as the first
two plan steps — the operator does **not** need to run any `pac`
commands beforehand. The `.phase122/rollback/` directory is created
automatically.

The only reason to pre-export manually is if the operator wants to
skip the script's export step (e.g. they have a freshly cut backup
from elsewhere). In that case, supply `--skip-rollback-export` and
pre-populate the two zips at the exact paths the script verifies:

```powershell
# Create the destination dir.
New-Item -ItemType Directory -Path .phase122\rollback -Force | Out-Null

# Export both solutions to the expected file names.
pac solution export `
  --name CommercialLendingLOS `
  --path .phase122/rollback/CommercialLendingLOS_PRE_PHASE_122B.zip `
  --managed false

pac solution export `
  --name LoanOpsExport `
  --path .phase122/rollback/LoanOpsExport_PRE_PHASE_122B.zip `
  --managed false

# Now run commit with the skip flag.
node scripts/phase122-lookup-repair.mjs --commit --skip-rollback-export
```

If either zip is missing the pre-execution gate fires immediately
with the exact path it was looking for, so a typo in the file name
is caught before any destructive step runs.

Execution order matters — the script enforces it:

1. Solution rollback exports.
2. Pseudo-column deletions (zero-row check enforced).
3. Lookup column + relationship creations (each is one POST to
   `RelationshipDefinitions` with `MSCRM.SolutionUniqueName:
   LoanOpsExport` header → the column lands under the `cr664_`
   publisher).
4. `pac solution publish`.
5. Verification probes — `pac env fetch` for each new
   `_cr664_deal_value` / `_cr664_assignedto_value`.

Any failure halts the script with exit code 4 and prints the failing
step. The runbook JSON remains on disk for forensics.

---

## 5. Rollback

If something goes wrong in commit mode (incomplete columns,
partial relationship registrations, etc.):

1. **Import the rollback solutions back over the broken state.** The
   script wrote `.phase122/rollback/CommercialLendingLOS_PRE_PHASE_122B.zip`
   and `.phase122/rollback/LoanOpsExport_PRE_PHASE_122B.zip` in
   Step 1 of commit mode. Re-import either solution via
   `pac solution import --path <zip>` to restore the pre-122B
   schema state.
2. **Delete any TEST rows seeded after the script ran** — Advanced
   Find by `cr664_dealname` starts-with `TEST —` and created-on
   after the script's `generatedAt` timestamp in the runbook JSON.
3. **Re-run the dry-run** to confirm the env is back to the
   pre-122B baseline.

---

## 5A. Pseudo-column dependency inspection

The operator's 2026-05-29 commit attempt against the live env failed
at the first destructive step:

```text
DELETE cr664_documentchecklist.cr664_deal
  → 0x8004f01f
  → "The Attribute component cannot be deleted because it is
     referenced by 1 other components."
```

Dataverse refuses to delete an Attribute that any other component
(form, view, workflow, relationship, field-security profile, report,
etc.) still references. The remediation Microsoft documents is to
call `RetrieveDependenciesForDeleteRequest`, identify the dependent
component, remove or repoint that reference, and only then re-attempt
the delete.

### 5A.1 What the script does

In both `--commit` mode and the read-only `--inspect-dependencies`
mode, the script:

1. For every plan step that would `DELETE` a pseudo-column, resolves
   the attribute's `MetadataId` via
   `GET /api/data/v9.2/EntityDefinitions(LogicalName='<table>')/Attributes(LogicalName='<attribute>')?$select=MetadataId`.
2. Calls the read-only dependency probe
   `GET /api/data/v9.2/RetrieveDependenciesForDelete(ComponentType=@p1,ObjectId=@p2)?@p1=2&@p2=<MetadataId>`
   (component type `2` = Attribute).
3. Prints every dependent component with:
   - human-readable component type (`SystemForm`, `SavedQuery (View)`,
     `EntityRelationship`, `Workflow`, `FieldSecurityProfile`,
     `Report`, …),
   - `dependentcomponentobjectid` GUID,
   - `dependentcomponentbasesolutionid` GUID,
   - a concrete remediation hint specific to the component type.
4. **Short-circuits** at the first column with a dependency — the
   script does **not** continue to inspect later tables (per the
   safety requirement: do not proceed past the first blocker).
5. In `--commit` mode, exits **before** any destructive step runs
   (exit code `5`). No DELETE, no POST, no force-delete attempt.

### 5A.2 Remediation by component type

| Reported type | Where to fix it |
| --- | --- |
| `SystemForm` (24 / 60) | Maker Portal → table → Forms → open each form, remove the field reference, save + publish. |
| `SavedQuery (View)` (26) | Maker Portal → table → Views → open each view, remove the column, save + publish. |
| `EntityRelationship` (10) | Maker Portal → table → Relationships → delete the relationship pointing at the pseudo-column (the new `cr664_Deal` Lookup replaces it). |
| `Workflow` / `ConvertRule` / `HierarchyRule` (20 / 35 / 36) | Maker Portal → Process / Business Rules → edit the definition to drop the pseudo-column reference, then activate the new version. |
| `FieldSecurityProfile` (95) | Maker Portal → Security → Field Security Profiles → remove the column from the profile. |
| `Report` / `ReportEntity` / `ReportCategory` / `ReportVisibility` (90 / 91 / 92 / 93) | Open the report definition → remove the field reference → re-publish. |
| Anything else | Open Maker Portal solution explorer, search the component by id, repoint or remove its reference to the pseudo-column. |

### 5A.3 How to run inspection by itself

```powershell
node scripts/phase122-lookup-repair.mjs --inspect-dependencies
```

This mode acquires a bearer token via the same three-source priority
order as `--commit` (env var → cached device-code → fresh device-code),
runs the audit + plan, then runs the dependency probe and prints the
result. No write of any kind to Dataverse. Exits `0` if every pseudo-
column is dependency-free, exits `5` if any dependency exists.

A typical loop on a freshly-built env is:

```text
node scripts/phase122-lookup-repair.mjs --inspect-dependencies
   ✗ cr664_documentchecklist.cr664_deal has 1 dependent component
       - SystemForm  (componentobjectid: <guid>)
         remediation: open the form designer → remove the field reference.

# operator opens form designer, removes the field, saves + publishes

node scripts/phase122-lookup-repair.mjs --inspect-dependencies
   ✓ cr664_documentchecklist.cr664_deal — no dependent components
   ✓ cr664_dealtask1.cr664_deal — no dependent components
   ... etc

node scripts/phase122-lookup-repair.mjs --commit
```

### 5A.4 What this does NOT do

- The script does **not** attempt a force-delete. There is no header
  or query parameter (`BypassBusinessLogicExecution`, `?Force=true`,
  `SuppressDuplicateDetection`, etc.) anywhere in the source — pinned
  by `phase122BScriptContract` static-source tests.
- The script does **not** edit the dependent components on the
  operator's behalf. Removing a field from a form, view, workflow,
  etc. is a deliberate decision the operator makes in Maker Portal.
- The script does **not** continue to inspect later tables after the
  first blocker — the operator gets the first actionable blocker and
  fixes it before re-running.

---

## 5B. Targeted SystemForm cleanup

The form designer in Maker Portal does not always expose a clear
"Remove" affordance for a field — especially when the column on the
form is a non-standard pre-existing pseudo-column rather than a
freshly-bound Lookup. The operator's 2026-06-01 attempt to clean form
`653f9d5e-767f-4363-9eb8-13b2b1f24ceb` ran into exactly this: the
right-hand panel showed `Table column: Deal / Label: Deal` but no
delete control surfaced.

The script's `--cleanup-form` mode performs the cleanup directly
against the Dataverse Web API. It is targeted, opt-in, and dry-run by
default — the operator passes the form GUID they want cleaned, and a
second explicit flag is required before any write happens.

### 5B.1 Dry-run preview

```powershell
node scripts/phase122-lookup-repair.mjs --cleanup-form 653f9d5e-767f-4363-9eb8-13b2b1f24ceb
```

The script:

1. Acquires a bearer token (same priority order as `--commit`: env var
   → cached → device-code).
2. GETs `systemforms(<id>)?$select=formxml,name,objecttypecode,type`.
3. Prints the form's name, parent entity (`objecttypecode`), form type
   code, and formxml length.
4. Locates every `<cell>…</cell>` whose inner `<control>` has
   `datafieldname="cr664_deal"` (case-insensitive) or `id="cr664_deal"`,
   and prints each match with its character offset and a compact
   single-line snippet.
5. Stops there — **no write**. The output ends with `Dry-run only —
   no PATCH or PublishXml issued.`

The dry-run is what to run first. The snippet shows exactly what the
script would remove; the operator can sanity-check the cell content
before authorising the write.

### 5B.2 Commit

```powershell
node scripts/phase122-lookup-repair.mjs --cleanup-form 653f9d5e-767f-4363-9eb8-13b2b1f24ceb --commit-form-cleanup
```

This re-reads the form, splices each matched `<cell>` out of the
formxml (the whole cell, not just the inner `<control>` — otherwise
Dataverse renders an orphan slot), then:

1. `PATCH systemforms(<id>)` with `{ formxml: <newxml> }`.
2. `POST PublishXml` with
   `<importexportxml><entities><entity>{objecttypecode}</entity></entities><systemforms><systemform>{<id>}</systemform></systemforms></importexportxml>`.
3. Re-runs `RetrieveDependenciesForDelete` against the form's parent
   table's `cr664_deal` pseudo-column. Reports the post-cleanup
   dependent-component count.

If the count is zero, the script confirms the form is no longer
blocking the pseudo-column delete. If there are still dependencies
(other forms / views / workflows / etc.), the script points the
operator at `--inspect-dependencies` for the full breakdown.

### 5B.3 What the cleanup mode does NOT do

- Does **not** delete the pseudo-column itself. That happens in the
  main `--commit` flow once `--inspect-dependencies` reports clean.
- Does **not** touch any field other than the one whose `datafieldname`
  is `cr664_deal`. The remove pattern is bounded to the matching
  `<cell>` element.
- Does **not** pick a form. The operator supplies the GUID. The script
  refuses any non-GUID argument.
- Does **not** attempt a force-delete or any bypass. No
  `BypassBusinessLogicExecution`, `BypassCustomPluginExecution`,
  `SuppressDuplicateDetection`, or `?Force=true` anywhere in the
  source — pinned by negative static-source tests.
- Does **not** modify the React app. Same Phase 122 hard non-goal.

### 5B.4 Typical full sequence

```powershell
# 1. Inspect dependencies for every pseudo-column the plan would delete.
node scripts/phase122-lookup-repair.mjs --inspect-dependencies
#  → ✗ cr664_documentchecklist.cr664_deal has 1 dependent SystemForm
#       (componentobjectid: 653f9d5e-767f-4363-9eb8-13b2b1f24ceb)

# 2. Preview the form cleanup. No write.
node scripts/phase122-lookup-repair.mjs --cleanup-form 653f9d5e-767f-4363-9eb8-13b2b1f24ceb

# 3. Execute the cleanup. Splices the cell, patches the form, publishes,
#    re-probes the pseudo-column.
node scripts/phase122-lookup-repair.mjs --cleanup-form 653f9d5e-767f-4363-9eb8-13b2b1f24ceb --commit-form-cleanup

# 4. Re-inspect to confirm no other blockers remain.
node scripts/phase122-lookup-repair.mjs --inspect-dependencies

# 5. Finally run the main plan.
node scripts/phase122-lookup-repair.mjs --commit
```

### 5B.5 Cleaning a sibling attribute (e.g. cr664_assignedto)

After the cr664_deal cleanup loop closes, the dependency probe may
surface a sibling-attribute blocker — e.g. on `cr664_dealtask1.cr664_assignedto`
the operator's 2026-06-08 run reported a form blocker at
`9ac369d2-3faa-471b-acb8-15659bd5d886`. The cleanup mode now takes
an optional `--attribute <table>.<column>` flag to target any column,
with identical safety semantics.

```powershell
# 1. Confirm the form has a direct field control for the column.
node scripts/phase122-lookup-repair.mjs `
  --inspect-form 9ac369d2-3faa-471b-acb8-15659bd5d886 `
  --attribute cr664_dealtask1.cr664_assignedto

# 2. Preview the surgical removal.
node scripts/phase122-lookup-repair.mjs `
  --cleanup-form 9ac369d2-3faa-471b-acb8-15659bd5d886 `
  --attribute cr664_dealtask1.cr664_assignedto

# 3. Execute. PATCH + publish + re-probe RetrieveDependenciesForDelete
#    on cr664_dealtask1.cr664_assignedto (NOT the default cr664_deal).
node scripts/phase122-lookup-repair.mjs `
  --cleanup-form 9ac369d2-3faa-471b-acb8-15659bd5d886 `
  --attribute cr664_dealtask1.cr664_assignedto `
  --commit-form-cleanup
```

Differences from the default cr664_deal path:

- Cleanup removes only `<cell>` elements whose control id or
  `datafieldname` equals the supplied column logical name. Sibling
  fields are untouched.
- Post-commit `RetrieveDependenciesForDelete` runs against the
  supplied `<table>.<column>` — the script does not assume the form's
  parent entity is the same as the attribute's table.
- The cr664_deal-specific **indirect-refs diagnostic** (subgrid /
  NavBar / relationship-name scan across `CANDIDATE_CHILD_TABLES`)
  is **skipped** when `--attribute` is supplied. For indirect refs
  on a sibling attribute, use `--inspect-form` separately — it
  already takes a qualified `--attribute` argument.
- All other safety properties are unchanged: dry-run by default,
  explicit `--commit-form-cleanup` required for writes, splice
  bounded to matched cells, no force-delete / bypass headers, no
  React-app changes.

---

## 5C. Indirect SystemForm dependencies (`--inspect-form`)

The operator's 2026-06-01 cleanup dry-run against form
`653f9d5e-767f-4363-9eb8-13b2b1f24ceb` revealed a mismatch:

```text
Dependency inspection says:
  cr664_documentchecklist.cr664_deal  →  blocked by SystemForm 653f9d5e-…

Cleanup-form dry-run on that form says:
  Form name:           Information
  Entity (objecttype): cr664_deal     ← legacy Loan Deal form, NOT a Document Checklist form
  Form type code:      2
  No cr664_deal references found in this form XML.
```

The dependency is **not** a direct field control named `cr664_deal` on
a Document Checklist form. It is a legacy `cr664_deal` form referencing
`cr664_documentchecklist.cr664_deal` indirectly — most likely via a
subgrid showing related Document Checklist records, a NavBar pane that
surfaces related-records navigation, or a relationship-bound
parameter.

The cleanup path cannot safely auto-remove subgrids / NavBar / quick-
view / relationship-bound elements because removing them often removes
legitimate UX. The script therefore:

1. **Refuses to write** in `--cleanup-form --commit-form-cleanup` mode
   when no direct field cell exists but indirect references do.
2. Prints the exact form name / entity / type code so the operator
   knows which form to open in Maker Portal.
3. Exposes a separate read-only mode for the comprehensive per-
   category breakdown.

### 5C.1 The read-only mode

```powershell
node scripts/phase122-lookup-repair.mjs `
  --inspect-form 653f9d5e-767f-4363-9eb8-13b2b1f24ceb `
  --attribute cr664_documentchecklist.cr664_deal
```

Walks the form's persisted XML and groups every reference to
`cr664_documentchecklist.cr664_deal` into:

| Category | What it means | XML pattern |
| --- | --- | --- |
| `Direct <cell>` | A field control bound directly to the attribute. | `<cell>…<control datafieldname="cr664_deal" …></cell>` |
| Subgrid control | A subgrid showing related records of the table. | `<control classid="{E7A81278-…}">…<TargetEntityType>{table}</TargetEntityType>…</control>` |
| Quick-view control | A read-only embedded form pulling data from the table. | `<control classid="{069810AB-…}">…<TargetEntityType>{table}</TargetEntityType>…</control>` |
| `<TargetEntityType>` | An element pointing at the table (component of subgrids / quick-views / navigation). | `<TargetEntityType>{table}</TargetEntityType>` |
| `<RelationshipName>` | A relationship binding whose name mentions the table or attribute. | `<RelationshipName>…{table}…</RelationshipName>` |
| `<NavBar*>` | A side-nav item that surfaces records via a relationship. | `<NavBarByRelationshipItem RelationshipName="…" …/>` |
| Bare logical-name | Catch-all: any other occurrence of the attribute logical name. | `\bcr664_deal\b` anywhere not already covered above |

The mode also flags the parent-entity-vs-attribute-table mismatch
explicitly when the form's `objecttypecode` differs from the supplied
`<table>` — that mismatch is the signal that the dependency is
indirect.

### 5C.2 Read-only contract

`--inspect-form` is bounded to `GET` operations only:

- `GET /api/data/v9.2/systemforms(<id>)?$select=formxml,name,objecttypecode,type,description`

Never `PATCH`, `POST`, or `PublishXml`. Pinned by a static-source
contract test that the `runFormInspect()` function body contains no
`patchSystemFormXml(`, `publishSystemForm(`, `method: 'PATCH'`,
`method: 'POST'`, or `method: 'DELETE'`.

### 5C.3 When the cleanup path refuses to write

If `--cleanup-form <id>` (with or without `--commit-form-cleanup`)
finds no direct field cell but at least one indirect reference, it
prints:

```text
⚠ No DIRECT field control for cr664_deal was found on this form,
  but N INDIRECT reference(s) were detected:

  - related table "cr664_documentchecklist": K indirect ref(s)
      subgrid control(s):   …
      <TargetEntityType>:   …
      <RelationshipName>:   …
        - cr664_deal_cr664_documentchecklist

  Required operator action — Maker Portal:
    Form name:        Information
    Form entity:      cr664_deal
    Form type code:   2
    Open the form designer for the entity above and remove the
    subgrid / related-records / navigation control that pulls
    in Document Checklist (or whichever child table is named
    in the indirect references above). Save + publish.
```

The script does not retry, force, or fall back to bypass headers. The
operator handles indirect refs in Maker Portal, then re-runs
`--inspect-dependencies` to confirm the form is no longer a blocker.

---

## 5D. Targeted hidden-subgrid cleanup (`--cleanup-subgrid`)

The operator's 2026-06-01 `--inspect-form` against form
`653f9d5e-767f-4363-9eb8-13b2b1f24ceb` surfaced an exact, removable
target:

```text
Subgrid_new_5
  classid:           {E7A81278-8635-4D9E-8D4D-59480B391C5B}
  TargetEntityType:  cr664_documentchecklist
  RelationshipName:  cr664_DocumentChecklist_cr664_Deal_cr664_Deal
```

The form designer in Maker Portal does not expose this subgrid for
direct removal (it's a hidden / legacy element). The script can remove
it surgically by control id — with multi-stage validation that
prevents the same code path from removing anything else.

### 5D.1 Dry-run preview

```powershell
node scripts/phase122-lookup-repair.mjs `
  --cleanup-subgrid 653f9d5e-767f-4363-9eb8-13b2b1f24ceb `
  --control-id Subgrid_new_5
```

The script reads the form, locates the enclosing `<cell>` for the
supplied control id, and runs four validation gates before printing
the snippet that would be removed:

| # | Gate | Reason |
| - | --- | --- |
| 1 | Exactly **one** `<cell>` contains a control with that id. | Zero matches → bail. >1 matches → bail. The script never invents a target. |
| 2 | The control's `classid` is `{E7A81278-8635-4D9E-8D4D-59480B391C5B}` (subgrid). | Refuses to remove any other control kind. |
| 3 | The control's `<TargetEntityType>` is in `CANDIDATE_CHILD_TABLES`. | Refuses subgrids surfacing tables outside Phase 122 scope. |
| 4 | The control's `<RelationshipName>` contains `cr664_deal` (case-insensitive). | Refuses subgrids whose binding doesn't involve the pseudo-column being freed. |

If every gate passes, the script prints the validated facts and the
enclosing-cell snippet. It does **not** write.

### 5D.2 Commit

```powershell
node scripts/phase122-lookup-repair.mjs `
  --cleanup-subgrid 653f9d5e-767f-4363-9eb8-13b2b1f24ceb `
  --control-id Subgrid_new_5 `
  --commit-subgrid-cleanup
```

Validation runs again. On success the script:

1. Splices **only the matched `<cell>`** out of the formxml (bounded
   to `formxml.slice(0, match.start) + formxml.slice(match.end)` —
   no broader removal is possible).
2. `PATCH systemforms(<form-id>)` with the new formxml.
3. `POST PublishXml` scoped to that exact `<systemform>` on its
   parent entity.
4. Re-fetches the form and runs
   `findFormReferences(newFormXml, <validated-target-entity>, cr664_deal)`.
5. If **any** residual indirect reference (subgrid, quick-view,
   TargetEntityType, RelationshipName, NavBar) to the target table
   remains on the form, the script exits non-zero (exit code `8`).
   The operator runs `--cleanup-subgrid` again for each remaining
   control id (or fixes residue in Maker Portal) before the main
   pseudo-column delete can proceed.

### 5D.3 What this mode does NOT do

- Does **not** remove the pseudo-column itself (that happens in
  `--commit`).
- Does **not** remove any cell other than the one matched by the
  exact control id supplied by the operator.
- Does **not** remove non-subgrid controls — gate 2 refuses them.
- Does **not** remove subgrids whose target is outside
  `CANDIDATE_CHILD_TABLES` — gate 3 refuses them.
- Does **not** remove subgrids whose relationship name doesn't
  reference `cr664_deal` — gate 4 refuses them.
- Does **not** use any bypass header (`BypassBusinessLogicExecution`,
  `BypassCustomPluginExecution`, `SuppressDuplicateDetection`,
  `?Force=true`) — pinned by negative static-source tests.
- Does **not** touch React app code.

### 5D.4 Typical sequence

```powershell
# 1. Identify the residual blocker by control id.
node scripts/phase122-lookup-repair.mjs `
  --inspect-form 653f9d5e-767f-4363-9eb8-13b2b1f24ceb `
  --attribute cr664_documentchecklist.cr664_deal

# 2. Preview the surgical removal. No write.
node scripts/phase122-lookup-repair.mjs `
  --cleanup-subgrid 653f9d5e-767f-4363-9eb8-13b2b1f24ceb `
  --control-id Subgrid_new_5

# 3. Execute. PATCH + publish + residual re-check.
node scripts/phase122-lookup-repair.mjs `
  --cleanup-subgrid 653f9d5e-767f-4363-9eb8-13b2b1f24ceb `
  --control-id Subgrid_new_5 `
  --commit-subgrid-cleanup

# 4. Confirm at the dependency layer.
node scripts/phase122-lookup-repair.mjs --inspect-dependencies

# 5. Finally, run the main plan.
node scripts/phase122-lookup-repair.mjs --commit
```

### 5D.5 Residual relationships and the cleanup loop

After the first targeted `--cleanup-subgrid --commit-subgrid-cleanup`
run, the script's post-condition re-fetch on the operator's 2026-06-01
session reported three remaining residual relationships on the same
form:

```text
cr664_VendorPerformance_cr664_Deal_cr664_Deal
cr664_ApprovalTracking_cr664_Deal_cr664_Deal
cr664_DealStageHistory_cr664_Deal_cr664_Deal
```

Each one corresponds to a separate hidden subgrid on the
`cr664_deal` form bound through its own relationship. The script's
`--inspect-form` output now identifies the enclosing control id /
classid / `<TargetEntityType>` for every `<RelationshipName>` hit,
and — when the enclosing control is a removable subgrid pointing at a
table in the allow-list — prints the exact `--cleanup-subgrid` dry-run
command:

```text
- <RelationshipName> values containing "cr664_documentchecklist" or "cr664_deal": 3
  [1] cr664_VendorPerformance_cr664_Deal_cr664_Deal  (chars …-…)
      enclosing cell id:    (none)
      enclosing control id: Subgrid_new_7
      classid:              {E7A81278-8635-4D9E-8D4D-59480B391C5B}  (subgrid)
      TargetEntityType:     cr664_vendorperformance
      ► Safely removable by control id. Dry-run:
          node scripts/phase122-lookup-repair.mjs \
            --cleanup-subgrid 653f9d5e-767f-4363-9eb8-13b2b1f24ceb \
            --control-id Subgrid_new_7
  [2] cr664_ApprovalTracking_cr664_Deal_cr664_Deal …
  [3] cr664_DealStageHistory_cr664_Deal_cr664_Deal  …
```

The allowed-target list is the union of `CANDIDATE_CHILD_TABLES`
(the canonical Phase 122 5-table scope) and a new
`LEGACY_CR664_DEAL_CHILD_TABLES` constant containing the three
operator-surfaced names above. Anything outside both lists is
refused by gate 3 — the cleanup path will never touch a subgrid
pointing at, say, `account` or `cr664_loandeal` (the parent table).

The full operator loop for residual relationships looks like:

```powershell
# Iteration 1 — identify every removable subgrid.
node scripts/phase122-lookup-repair.mjs `
  --inspect-form 653f9d5e-767f-4363-9eb8-13b2b1f24ceb `
  --attribute cr664_documentchecklist.cr664_deal

# Iteration 2..N — for each surfaced control id, dry-run then commit.
node scripts/phase122-lookup-repair.mjs `
  --cleanup-subgrid 653f9d5e-... --control-id Subgrid_new_7
node scripts/phase122-lookup-repair.mjs `
  --cleanup-subgrid 653f9d5e-... --control-id Subgrid_new_7 `
  --commit-subgrid-cleanup

# Repeat for Subgrid_new_8, Subgrid_new_9, … until residual is 0.

# Final confirm.
node scripts/phase122-lookup-repair.mjs --inspect-dependencies
```

### 5D.6 Rollback-export idempotency on repeated `--commit`

A `--commit` re-run after a previous round of cleanup leaves the
rollback zips already on disk. `pac solution export --path X.zip`
fails when X.zip exists, which would crash the script before it
reached any destructive step.

The Phase 1 rollback loop now calls `shouldSkipRollbackExportStep`
before each `pac export` and:

| State on disk | Behavior |
| --- | --- |
| Zip does NOT exist | Run the export normally. |
| Zip exists, size > 0 | Skip the export (log `⏭ Reusing existing rollback artifact …`). The existing checkpoint is treated as valid. The script does **not** overwrite it. |
| Zip exists, size == 0 | Bail with a clear message — the file is almost certainly a corrupt partial export. Operator must delete it (or rename it with a timestamp suffix) before re-running. |

The post-export `ensureRollbackArtifactsExist` verification still runs
after the loop — skip-on-existing only avoids the pac command, not the
mid-plan "both zips on disk" gate.

---

## 5E. SavedQuery (view) dependency cleanup (`--inspect-view` / `--cleanup-view`)

After the form-side cleanup loop on `cr664_dealtask1.cr664_deal` cleared
every SystemForm blocker, the dependency probe surfaced one last
blocker on the operator's 2026-06-04 run:

```text
cr664_dealtask1.cr664_deal
  ✗ 1 dependent component:
    - SavedQuery (View)
    - componentobjectid: a8897de2-8053-4f02-868a-a5f0b8d5629c
```

A Dataverse view (`SavedQuery`) holds two XML payloads — `fetchxml`
(the FetchXML query) and `layoutxml` (the grid column layout). A
reference to the attribute can appear in many ways, only some of which
the script can safely auto-remove.

### 5E.1 The read-only mode

```powershell
node scripts/phase122-lookup-repair.mjs `
  --inspect-view a8897de2-8053-4f02-868a-a5f0b8d5629c `
  --attribute cr664_dealtask1.cr664_deal
```

The script reads the SavedQuery and classifies every reference to the
attribute into six categories:

| Category | Where it lives | Auto-cleanable? |
| --- | --- | --- |
| Displayed `<cell name="…">` | `layoutxml` | ✓ safe |
| Top-level `<attribute name="…">` | `fetchxml` (directly under `<entity>`) | ✓ safe |
| `<attribute name="…">` inside `<link-entity>` | `fetchxml` (nested) | ✗ unsafe |
| `<condition attribute="…">` | `fetchxml` filters | ✗ unsafe |
| `<order attribute="…">` | `fetchxml` sorts | ✗ unsafe |
| `<link-entity from\|to="…">` | `fetchxml` joins | ✗ unsafe |

The overall classification is reported as one of:

- **`no-references`** — nothing to do.
- **`safe`** — only displayed cells and/or top-level fetch attributes;
  the script can auto-remove them.
- **`unsafe`** — at least one filter, sort, link-entity binding, or
  link-entity-nested attribute is present. The script refuses to
  auto-clean and points the operator at the Maker Portal view editor.

When the view is `safe`, the inspector prints the exact `--cleanup-view`
command to run.

### 5E.2 Cleanup (dry-run)

```powershell
node scripts/phase122-lookup-repair.mjs `
  --cleanup-view a8897de2-8053-4f02-868a-a5f0b8d5629c `
  --attribute cr664_dealtask1.cr664_deal
```

Runs the same parse-and-classify logic, plus a "what would be removed"
preview that lists each layout cell and each top-level fetch attribute
the commit step would splice. No write.

### 5E.3 Cleanup (commit)

```powershell
node scripts/phase122-lookup-repair.mjs `
  --cleanup-view a8897de2-8053-4f02-868a-a5f0b8d5629c `
  --attribute cr664_dealtask1.cr664_deal `
  --commit-view-cleanup
```

Reads the view, classifies, then on `safe`:

1. Splices every matched layout `<cell>` and every top-level
   `<attribute>` out of the SavedQuery body (bounded to the matched
   offsets — no broader rewrite, no filter / sort / link-entity
   touched).
2. `PATCH /api/data/v9.2/savedqueries(<id>)` with
   `{ fetchxml: <new>, layoutxml: <new> }`.
3. `POST /api/data/v9.2/PublishXml` with
   `<savedqueries><savedquery>{<id>}</savedquery></savedqueries>`
   (scoped to that exact view + its parent entity).
4. Re-runs `RetrieveDependenciesForDelete` for `<table>.<column>`.
   Reports the post-cleanup dependent-component count.

If the view is `unsafe`, the script refuses to write and prints the
exact Maker Portal action the operator must take instead.

### 5E.4 What this mode does NOT do

- Does **not** remove anything other than the attribute the operator
  named — even in the `safe` path, only `<cell name="<attr>">` and
  top-level `<attribute name="<attr>">` are removed.
- Does **not** rewrite filter conditions / sort clauses / link-entity
  joins. Those carry semantic meaning the operator must judge in
  Maker Portal.
- Does **not** delete the SavedQuery itself.
- Does **not** use any bypass header (`BypassBusinessLogicExecution`,
  `BypassCustomPluginExecution`, `SuppressDuplicateDetection`,
  `?Force=true`) — pinned by negative static-source tests.
- Does **not** touch the React app.

### 5E.5 Typical full sequence

```powershell
# 1. Inspect dependencies. If a SavedQuery is named, jump to step 2.
node scripts/phase122-lookup-repair.mjs --inspect-dependencies

# 2. Inspect the view to classify the references.
node scripts/phase122-lookup-repair.mjs `
  --inspect-view a8897de2-… `
  --attribute cr664_dealtask1.cr664_deal

# 3a. If 'safe' — preview, then commit.
node scripts/phase122-lookup-repair.mjs `
  --cleanup-view a8897de2-… `
  --attribute cr664_dealtask1.cr664_deal

node scripts/phase122-lookup-repair.mjs `
  --cleanup-view a8897de2-… `
  --attribute cr664_dealtask1.cr664_deal `
  --commit-view-cleanup

# 3b. If 'unsafe' — open Maker Portal → table → Views → the named
#     view → remove the filter/sort/link in the editor → save+publish.

# 4. Confirm the dependency cleared.
node scripts/phase122-lookup-repair.mjs --inspect-dependencies

# 5. Finally, the main commit.
node scripts/phase122-lookup-repair.mjs --commit
```

The main `--commit` continues to fail closed until the dependency
probe reports zero blockers — the SavedQuery cleanup mode does not
relax any other safety gate.

---

## 5F. Lookup-relationship payload shape + partial-commit resume

The operator's 2026-06-08 `--commit` run succeeded through all six
pseudo-column DELETE steps and stopped on the first
RelationshipDefinitions POST with:

```text
Step "Create cr664_Deal Lookup on cr664_documentchecklist → cr664_loandeal" failed:
  Web API POST /api/data/v9.2/RelationshipDefinitions → 400
  InnerException:
    ODataException: An unexpected 'StartObject' node was found for
    property named 'IsCustomizable'. A 'PrimitiveValue' node was
    expected.
```

### 5F.1 The payload bug

`buildLookupRelationshipPayload` was nesting `IsCustomizable` inside
`AssociatedMenuConfiguration` as the `BooleanManagedProperty` object
shape (`{ Value: true, CanBeChanged: true, ManagedPropertyLogicalName:
'iscustomizable' }`). Per the Dataverse Web API docs, `IsCustomizable`
is **not a property of `AssociatedMenuConfiguration`** at all — it
belongs at the top-level relationship metadata as a primitive boolean
(or omitted, which is what Microsoft's quickstart sample does). The
fix removes it from `AssociatedMenuConfiguration` entirely.

The rest of the payload is unchanged. In particular:
- `Lookup.RequiredLevel` remains an `AttributeRequiredLevelManagedProperty`
  object — that one is correctly typed and accepted.
- `CascadeConfiguration` keeps its primitive-string `Behavior` values
  (`'NoCascade'` / `'RemoveLink'`).
- Schema-naming and target-entity invariants (`cr664_loandeal`,
  `cr664_Deal`, `cr664_AssignedTo`) are unchanged.

### 5F.2 Partial-commit resume — already idempotent

The operator's session left this state:

- 5 cr664_deal pseudo-columns deleted across the 5 candidate tables.
- 1 cr664_assignedto pseudo-column deleted on cr664_dealtask1.
- 6 corresponding standard FKs **not yet created** (the first POST
  failed and the script halted before the rest).
- Rollback zips on disk.

`buildPlan` is audit-driven — every step it emits is conditioned on
what the live env reports. Re-running `--commit` against the partial
state produces a smaller plan:

| Live state on re-run | Plan step emitted |
| --- | --- |
| `pseudoDealColumnExists: false` | **No DELETE step.** Loop continues. |
| `pseudoAssignedToColumnExists: false` | **No AssignedTo DELETE step.** Whole branch skipped. |
| `standardLookupFkExists: false` | CREATE step emitted normally. |
| `standardLookupFkExists: true` | Emits a `kind: 'noop'` step labelled `Already correct — <table>._cr664_deal_value exists; cr664_Deal Lookup is present.` |
| `standardAssignedToFkExists: true` | Skips the AssignedTo CREATE entirely. |

So the operator's resume is:

```powershell
# 1. Re-run the dry-run to confirm the live state.
node scripts/phase122-lookup-repair.mjs --dry-run
#  → audit shows pseudo cr664_deal exists: false (all 6 already deleted)
#  → plan emits only CREATE + publish + verify steps

# 2. Re-run commit. Rollback zips already on disk are reused (Phase 1
#    idempotency); dependency inspection passes (no DELETE steps so
#    nothing to inspect); CREATE steps run with the fixed payload.
node scripts/phase122-lookup-repair.mjs --commit
```

### 5F.3 What this fix does NOT do

- Does **not** restore the pseudo-columns. The operator's first round
  of DELETEs is preserved verbatim — the audit simply reflects the
  new live state.
- Does **not** weaken any safety gate. `refuseIfForbiddenPrefix`,
  `inspectPseudoColumnDependencies`, `ensureRollbackArtifactsExist`,
  and the stop-condition refusal all still fire on every commit run.
- Does **not** add a force-delete / bypass header anywhere
  (`BypassBusinessLogicExecution`, `BypassCustomPluginExecution`,
  `SuppressDuplicateDetection`, `?Force=true`) — pinned by negative
  static-source tests.
- Does **not** touch React app code.

### 5F.4 Inspecting the payload before re-running

Two complementary paths.

**1. The dedicated diagnostic mode** (added 2026-06-08 after the
operator's payload incident):

```powershell
node scripts/phase122-lookup-repair.mjs --print-relationship-payload
```

Prints the exact JSON body the script would POST to
`/api/data/v9.2/RelationshipDefinitions` for every planned
cr664_Deal + cr664_AssignedTo Lookup — five bodies for the canonical
child tables plus one for the AssignedTo lookup on cr664_dealtask1.
No pac call, no Web API call, no write. The print handler runs at
the top of `main()` before `assertPacAuth()` so the operator doesn't
need to be logged in to preview.

**2. The runbook JSON** written on every dry-run
(`.phase122/phase122-runbook.json`) contains the full materialized
POST body for each `kind: 'webapi'` step in plan order. Useful when
the operator wants to see the payloads alongside the rest of the
plan context:

```powershell
node scripts/phase122-lookup-repair.mjs --dry-run
type .phase122\phase122-runbook.json | findstr /n IsCustomizable
# (expected: zero matches — the fix removed it)
```

### 5F.5 Current-state vs partial-state resume

The operator's 2026-06-08 dry-run reported pseudo cr664_deal columns
present **again** after the first failed `--commit` round. The script
must never assume the previous run's DELETEs persisted; `buildPlan`
re-audits the live env on every invocation and emits whichever subset
of steps the current state requires.

| Audit reports | Plan step emitted |
| --- | --- |
| `pseudoDealColumnExists: true` + zero rows | DELETE the pseudo-column. |
| `pseudoDealColumnExists: true` + non-zero rows | `kind: 'stop-condition'` — refuse to commit. |
| `pseudoDealColumnExists: false` | No DELETE step — loop continues. |
| `pseudoAssignedToColumnExists: true` + zero rows | DELETE the AssignedTo pseudo-column. |
| `pseudoAssignedToColumnExists: false` | AssignedTo DELETE branch skipped entirely. |
| `standardLookupFkExists: false` | CREATE step emitted with the fixed payload. |
| `standardLookupFkExists: true` | `kind: 'noop'` — "Already correct" step (no double-create). |
| `standardAssignedToFkExists: true` | AssignedTo CREATE step skipped. |

The dependency inspection gate fires on every commit invocation —
when pseudo columns are present (e.g. the current-state resume) the
inspector re-queries Dataverse to make sure no SystemForm / SavedQuery
blocker has reappeared since the previous round. Rollback zips that
already exist on disk are reused (Phase 1 idempotency), so the
resumed run does not re-export them.

Everything that prevented junk columns in earlier rounds remains in
force: `refuseIfForbiddenPrefix` still bails on a `new` prefix,
`LOOKUP_TARGET_LOAN_DEAL = 'cr664_loandeal'` is unchanged, and no
bypass header (`BypassBusinessLogicExecution`,
`BypassCustomPluginExecution`, `SuppressDuplicateDetection`,
`?Force=true`) appears anywhere — pinned by negative static-source
tests.

---

## 5G. Web API metadata verification (`--verify-lookups`)

The operator's 2026-06-08 commit log reported successful DELETE +
CREATE + publish for all six target attributes — but the dry-run that
ran moments later said the pseudo cr664_deal columns were still
present and the standard `_cr664_deal_value` FKs were missing. The
root cause was the script trusting **pac env fetch** for the post-
commit verify step. Pac was returning a stale-looking answer (the
pseudo column shares a logical name with the new Lookup, and pac's
client-side metadata cache hadn't fully refreshed). The fix replaces
every authoritative lookup-existence check with a Dataverse Web API
metadata query.

### 5G.1 The standalone diagnostic mode

```powershell
node scripts/phase122-lookup-repair.mjs --verify-lookups
```

For every Phase 122 target attribute (five `cr664_deal` lookups on
the candidate child tables, plus `cr664_dealtask1.cr664_assignedto`)
the script:

1. **GET** `/api/data/v9.2/EntityDefinitions(LogicalName='<table>')/Attributes(LogicalName='<attribute>')?$select=AttributeType,SchemaName,MetadataId,LogicalName`
   → tells us whether the attribute exists, and what kind it is
   (`Lookup`, `Uniqueidentifier`, `String`, …).
2. **GET** the same path + `/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets,SchemaName,MetadataId`
   → 200 confirms it's a true Lookup and exposes the resolved
   `Targets[]` array. 404 means the attribute is not a lookup (i.e.
   the legacy pseudo scalar is still present).
3. **GET** `/api/data/v9.2/EntityDefinitions(LogicalName='<table>')/ManyToOneRelationships?$filter=ReferencingAttribute eq '<attribute>'&$select=SchemaName,ReferencedEntity,ReferencingAttribute`
   → reports the ManyToOne relationship SchemaName + ReferencedEntity
   (or `(none)` when no relationship exists yet).

Per-target output:

```text
-- cr664_documentchecklist.cr664_deal  (expected target: cr664_loandeal)
     classification:           real-lookup
     AttributeType:            Lookup
     SchemaName:               cr664_Deal
     MetadataId:               <guid>
     LookupAttributeMetadata:  YES
     Targets[]:                ["cr664_loandeal"]
     Targets includes cr664_loandeal: YES ✓
     OData FK projection:      _cr664_deal_value
     M:1 relationship name:    cr664_documentchecklist_cr664_loandeal_Deal
     M:1 referenced entity:    cr664_loandeal
```

Six facts per attribute — the exact list the user asked for:

1. Attribute existence (`classification`).
2. LookupAttributeMetadata cast (YES / NO).
3. Resolved `Targets[]` and whether the expected entity appears.
4. The OData FK projection name (`_<attribute>_value`).
5. ManyToOne relationship SchemaName.
6. Whether the legacy pseudo scalar is still present.

Read-only, no PATCH / POST / DELETE / PublishXml call. Same metadata
endpoint the post-commit verify plan steps now use, so the operator
can sanity-check before and after `--commit` with the same source of
truth.

### 5G.2 Audit + verify steps now bypass pac

Two related changes shipped alongside the standalone mode:

1. **`auditTable` no longer uses `pac env fetch`** for the
   pseudo-vs-real-lookup distinction. It calls `classifyAttribute(table,
   attribute, token, envUrl)` which returns one of
   `'missing'` / `'pseudo-scalar'` / `'real-lookup'` based on
   `AttributeType`. The dry-run "Table audit summary" now surfaces
   the classification + Targets verbatim. Row-count probes still use
   pac (FetchXML is the right tool for that and the issue pac had was
   metadata, not row data).
2. **The post-commit verify plan steps changed from `kind: 'verify'`
   to `kind: 'webapi-verify'`**. Each verify step does the same
   `/Attributes(…)/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets,…`
   GET that `--verify-lookups` uses, and asserts that `Targets[]`
   contains the expected referenced entity. No more pac env fetch in
   the critical commit path.

The Web API metadata source is authoritative for all of these
checks. The pac CLI is still used for solution exports + publish
(those are write operations that pac handles cleanly) but is no
longer trusted for read-side metadata inspection.

### 5G.3 What this does NOT do

- Does **not** remove the legacy `attributeExists` helper — it stays
  in the source for any future caller that wants a quick pac-based
  existence probe. It's just no longer wired into the audit.
- Does **not** introduce any new write path. `--verify-lookups` is
  read-only.
- Does **not** require `DATAVERSE_BEARER_TOKEN` to be set — the
  device-code flow works the same as for `--commit`.
- Does **not** touch React app code.

### 5G.4 Typical sequence after this commit

```powershell
# 1. Authoritative lookup state (read-only).
node scripts/phase122-lookup-repair.mjs --verify-lookups

# 2. If anything classifies as 'pseudo-scalar' or 'missing', the
#    dry-run + plan emits the right DELETE / CREATE steps.
node scripts/phase122-lookup-repair.mjs --dry-run

# 3. Run commit. The post-commit verify plan steps use the same
#    metadata endpoint as --verify-lookups, so the script will
#    fail closed at the verify gate if (and only if) the create
#    didn't actually produce a real LookupAttributeMetadata with
#    Targets[] containing the expected entity.
node scripts/phase122-lookup-repair.mjs --commit

# 4. Final confirmation.
node scripts/phase122-lookup-repair.mjs --verify-lookups
```

---

## 6. Expected output (full example)

The latest dry-run run produced exactly this against the live env
on 2026-05-29 (truncated for brevity):

```text
Publisher join:
  - LoanOpsExport: prefix=cr664
  - CommercialLendingLOS: prefix=new

Table audit summary:
  cr664_documentchecklist:
    pseudo cr664_deal exists:       true
    standard _cr664_deal_value:     false
    non-NULL row count:             0
  cr664_dealtask1:
    pseudo cr664_deal exists:       true
    standard _cr664_deal_value:     false
    non-NULL row count:             0
    pseudo cr664_assignedto:        true
    standard _cr664_assignedto_v:   false
    AssignedTo non-NULL count:      0
  ... (3 more tables, same shape)
```

The plan deterministically emits 21 steps (2 rollback exports, 6
pseudo-column deletes, 6 Lookup column creations, 1 publish, 6
verifications).

---

## 7. Stop conditions

The script refuses to commit if any of the following holds. Each is
also marked in the runbook JSON with `kind: "stop-condition"`:

| Condition | Cause | Operator action |
| --- | --- | --- |
| `LoanOpsExport: prefix != cr664` | Publisher join changed since §10 audit; or wrong env. | Re-audit publisher state via §10.2 of Phase 122. |
| `<table>.cr664_deal has N non-NULL row(s)` (N > 0) | Someone populated the pseudo-column after §10 audit. | Export the populated rows to CSV; explicitly decide whether the data should be migrated to the new column or dropped. Re-run dry-run after deciding. |
| `non-NULL row count could not be probed` | FetchXML returned unexpected output. | Investigate manually; do not let the script delete an unverified column. |
| `could not acquire bearer token` | All three token sources failed (env var empty/malformed, no valid cache, device-code prompt declined or timed out). | Re-run and complete the device-code prompt in §4.1, or pre-set `DATAVERSE_BEARER_TOKEN` per §4.2, then retry. |
| Rollback artifact missing (pre-execution) | `--skip-rollback-export` was passed but at least one zip is not at the expected path. | Re-run without `--skip-rollback-export` to let the script export automatically, OR run the `pac solution export` commands in §4.3 first. |
| Rollback artifact missing (post-export) | Auto-export step exited cleanly but no zip landed on disk. | Investigate the pac output for the export step; rerun once the export reliably produces a file. No destructive step has run yet. |
| `<table>.<attribute> has N dependent component(s)` | Maker-Portal-visible component (form / view / workflow / relationship / field-security profile / report) still references the pseudo-column. Dataverse error `0x8004f01f` would fire on the DELETE. | Follow the per-type remediation in §5A.2 (typically: remove the field reference in the form/view designer, save + publish). Re-run `--inspect-dependencies` to confirm clean, then `--commit`. |

---

## 8. Post-repair seed steps

After the script reports `Commit execution complete`, resume the
Phase 121 seed at Step 5 + Step 6:

- **TEST — Outstanding Document Phase 122**, linked to `TEST — Deal Phase 121`
  via the new `cr664_Deal` lookup. `cr664_uploadstatus = false`,
  no `cr664_receiveddate`, no `cr664_reviewer`.
- **TEST — Pending Review Document Phase 122**, linked similarly.
  `cr664_uploadstatus = true`, `cr664_receiveddate = <today>`,
  no `cr664_reviewer`.
- **TEST — Task Phase 122**, linked via the new `cr664_AssignedTo`
  → Matthew Paller, `cr664_completed = false`, `cr664_duedate =
  <today + 7d>`.

Then validate in the deployed cockpit per Phase 122 §10.5.9
(Outstanding Docs tile = 1, Tasks Open tile = 1, Documents widget =
1 outstanding, etc.).

---

## 9. Hard non-goals (pinned by tests + script defaults)

| Non-goal | Where pinned |
| --- | --- |
| Default to dry-run | `FLAGS.dryRun = true` initial value + static-source test |
| `--commit` required for writes | Conditional plan execution guarded by `FLAGS.commit` + static-source test |
| Never create a `new_`-prefixed column | `refuseIfForbiddenPrefix` safety gate + `FORBIDDEN_PUBLISHER_PREFIX` constant + static-source test |
| Never bind to legacy `/cr664_deals(<id>)` | `LOOKUP_TARGET_LOAN_DEAL = 'cr664_loandeal'` constant + static-source test |
| Never delete a column with non-NULL rows | `populated > 0` → `kind: stop-condition` branch + static-source test |
| Include AssignedTo systemuser repair | `LOOKUP_TARGET_SYSTEMUSER` constant + `NEW_ASSIGNEDTO_COLUMN_SCHEMA_NAME` step + static-source test |
| No React code change | Script is `scripts/*.mjs`; the Phase 122 React-side contract pin (22 cases) still asserts `/cr664_loandeals(…)` everywhere in `src/` |

---

## 10. Cross-references

- `scripts/phase122-lookup-repair.mjs` (new) — the script.
- `src/shared/governance/phase122BScriptContract.test.ts` (new) — static-source pins on the script's safety guards + constants (including the no-admin bearer-token gate).
- `docs/PHASE_122_RETARGET_DEAL_LOOKUPS.md` §10 — the publisher-prefix finding this script implements the remediation for.
- `docs/PHASE_121_OPERATOR_SEED_CHECKLIST.md` — the seed checklist whose Steps 5 + 6 unblock after the script's plan executes.
- `.phase122/phase122-runbook.json` — generated artifact (gitignored); the authoritative plan for whichever run last produced it.
- `.phase122/.token-cache.json` — gitignored device-code token cache (mode `0600`); written by the script after a successful device-code login so subsequent commit-mode runs don't re-prompt within the token lifetime.
