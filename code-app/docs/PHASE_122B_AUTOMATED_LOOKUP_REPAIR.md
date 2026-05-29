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
