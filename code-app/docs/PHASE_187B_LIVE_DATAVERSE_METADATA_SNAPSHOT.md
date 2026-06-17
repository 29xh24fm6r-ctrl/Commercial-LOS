# Phase 187B — Live Dataverse Metadata Snapshot

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Mode:** READ-ONLY. Live Web API `GET /EntityDefinitions` metadata + local `.power` snapshots. No writes.
- **Environment:** `org3a57b8d4.crm.dynamics.com` (env id `5f2d77a5-de50-edeb-9d74-5b2400a2320d`).
- **Token:** cached device-code token (valid window 2026-06-17, scope `org3a57b8d4.crm.dynamics.com`).
- **Source captures:** `.phase122/187-captures/table-*.txt` (per-table `--inspect-table` output).
- **Spec:** Phase 187B.

## Method

For every write-path table from Phase 187A, the live `RequiredLevel`, lookup `Targets`, and
OptionSet values were read from `EntityDefinitions`. Required lookup targets were resolved
recursively (CoreUser → WorkspaceType → WorkspaceContext picklist; CoreUser → UserRole).
"Data source registered" = present in `.power/schemas/appschemas/dataSourcesInfo.ts`.
"SDK model" = a generated model under `src/generated/models/`.

Legend for required-for-create: **App** = ApplicationRequired (caller must supply),
**Sys** = SystemRequired and server-defaulted (owner/state/PK — do not send).

---

## Identity / governance sub-graph

### cr664_loandeal — EntitySet `cr664_loandeals` · PK `cr664_loandealid` · Name `cr664_dealname`
- Total attrs 122; required-for-create 8.
- **App-required:** `cr664_assignedbanker` (Lookup → **cr664_banker**), `cr664_dealname` (String),
  `cr664_stageentrydate` (DateTime), `cr664_stagereference` (Lookup → **cr664_dealstagereference**),
  `cr664_statusreference` (Lookup → **cr664_dealstatusreference**).
- **Sys:** `cr664_loandealid`, `ownerid`, `owneridtype`.
- Data source: **registered** (`cr664_loandeals`). SDK model: **yes**. Status: **HEALTHY** (Loan Deal create works).

### cr664_auditevent — EntitySet `cr664_auditevents` · PK `cr664_auditeventid` · Name `cr664_auditeventname`
- Total attrs 66; required-for-create 11.
- **App-required:** `cr664_auditeventname` (String); `cr664_changedby` (Lookup → **cr664_user**) ⬅ key;
  `cr664_changeddate` (DateTime); `cr664_entityid` (String); `cr664_entitytype` (Picklist);
  `cr664_eventcategory` (Picklist); `cr664_eventtype` (Picklist); `cr664_outcomestatus` (Picklist).
- **Sys:** `cr664_auditeventid`, `ownerid`, `owneridtype`.
- **OptionSets (live):**
  - `cr664_entitytype` (6): 788190003 User · 788190000 Loan Deal · 788190001 Portfolio Loan · 788190002 Annual Review · 788190004 Role · 788190005 Configuration.
  - `cr664_eventcategory` (9): 788190000 Authentication · …001 Authorization · …002 Lifecycle · …003 Alert · …004 Profitability · …005 Configuration · …006 Override · …007 Exception · …008 EXECUTIVE_LIVE_DATA_BLOCKED.
  - `cr664_eventtype` (11): 788190010 EXECUTIVE_LIVE_DATA_BLOCKED · 788190000 Stage Change · …001 Status Change · …002 Assignment Change · …003 Amount Change · …004 Risk Rating Change · …005 Exception Created · …006 Exception Resolved · …007 Admin Configuration Change · …008 User Access Change · …009 Permission Change.
  - `cr664_outcomestatus` (4): 788190000 Succeeded · 788190001 Failed · 788190002 Blocked · 788190003 Denied.
- Data source: **registered** (`cr664_auditevents`). SDK model: **yes**.
- **Recursive resolution of `cr664_changedby` → `cr664_user`:** see below. **The audit's required actor lookup terminates in the BLOCKED identity sub-graph.**

### cr664_user (CoreUser) — EntitySet `cr664_users` · PK `cr664_userid` · Name `cr664_username`
- Total attrs 42; required-for-create 6.
- **App-required:** `cr664_primaryworkspace` (Lookup → **cr664_workspacetype**),
  `cr664_role` (Lookup → **cr664_userrole**), `cr664_username` (String).
- **Sys:** `cr664_userid`, `ownerid`, `owneridtype`.
- Data source: **NOT registered** (`cr664_users` is absent from `dataSourcesInfo.ts`).
  SDK model: **yes** (`Cr664_usersModel` / `Cr664_usersService` — service points at unregistered source).
- **Runtime availability: NOT available to the app.** Reachable only via the platform-user bridge
  (`_cr664_coreuser_value`) and operator scripts. See Phase 187C / 187D.

### cr664_workspacetype — EntitySet `cr664_workspacetypes` · PK `cr664_workspacetypeid` · Name `cr664_workspacename`
- Total attrs 36; required-for-create 5.
- **App-required:** `cr664_workspacecontext` (**Picklist**, ApplicationRequired) ⬅ key,
  `cr664_workspacename` (String).
- **Sys:** `cr664_workspacetypeid`, `ownerid`, `owneridtype`.
- **`cr664_workspacecontext` OptionSet (3):** 788190000 EXECUTIVE_CONTEXT · 788190001 OPERATIONAL_CONTEXT · 788190002 ADMIN_CONTEXT.
- Data source: **NOT registered**. SDK model: **none**.

### cr664_userrole — EntitySet `cr664_userroles` · PK `cr664_userroleid` · Name `cr664_rolename`
- Total attrs 34; required-for-create 4.
- **App-required:** `cr664_rolename` (String). **Sys:** `cr664_userroleid`, `ownerid`, `owneridtype`.
- Schema is trivially createable; the blocker is **policy** (no production-safe banker role row exists — see 187D/187E).
- Data source: **NOT registered**. SDK model: **none**.

### cr664_workspacecontext — **NOT A TABLE**
- `GET EntityDefinitions(LogicalName='cr664_workspacecontext')` → **table not found**.
- It is the required **Picklist column `cr664_workspacecontext` on `cr664_workspacetype`** (values above).
- The generated `cr664_auditevent` model also exposes an optional `cr664_WorkspaceContext@odata.bind`
  lookup → `cr664_workspacetype` (a lookup *to the type table*, not to a context table).
- Treating WorkspaceContext as a standalone dependency node (recent commit `ad2192f`) is a
  **schema-assumption mismatch** — see 187C / 187D / 187G.

### cr664_platformuser — EntitySet `cr664_platformusers` · PK `cr664_platformuserid`
- App-required: `cr664_activestatus`, `cr664_createdat`, `cr664_email`, `cr664_fullname`,
  `cr664_identitystatus` (Picklist), `cr664_primaryworkspace` (Lookup → cr664_workspacetype).
- Optional lookups: `cr664_coreuser` (→ **cr664_user**, exposes `_cr664_coreuser_value`),
  `cr664_role` (→ cr664_userrole), `cr664_team`.
- Data source: **registered**. SDK model: **yes**. This is the **bridge** the app uses to resolve the audit actor.

### systemuser — EntitySet `systemusers`
- Standard table; registered (`systemusers`). SDK service `SystemusersService`.
- **Not** a valid target for `cr664_changedby` / `cr664_actoruser` (those target `cr664_user`).

---

## Reference tables

### cr664_dealstagereference — EntitySet `cr664_dealstagereferences` · Name `cr664_name`
- Required-for-create 6: **App** `cr664_activeflag` (Boolean), `cr664_code` (String), `cr664_name` (String); **Sys** id/owner/owneridtype.
- Data source: **registered**. SDK model: **yes**. Live rows: see 187E.

### cr664_dealstatusreference — EntitySet `cr664_dealstatusreferences` · Name `cr664_name`
- Required-for-create 6: identical shape to stage reference.
- Data source: **registered**. SDK model: **yes**. Live rows: see 187E.

---

## Write-side business tables

### cr664_dealtask1 — EntitySet `cr664_dealtask1s` · Name `cr664_taskname`
- Required-for-create 4: **App** `cr664_taskname`; **Sys** id/owner/owneridtype.
- Optional lookups: `cr664_assignedto` (→ systemuser/owner), `cr664_deal` (→ cr664_loandeal).
- Data source: **registered**. SDK model: **yes**.

### cr664_documentchecklist — EntitySet `cr664_documentchecklists` · Name `cr664_documentname`
- Required-for-create 4: **App** `cr664_documentname`; `cr664_deal` (Lookup → cr664_loandeal) per SDK; **Sys** id/owner/owneridtype.
- Data source: **registered**. SDK model: **yes**.

### cr664_dealtimelineevent — EntitySet `cr664_dealtimelineevents` · Name `cr664_title`
- Required-for-create 8: **App** `cr664_eventat` (DateTime), `cr664_eventtype` (Picklist, 15 vals),
  `cr664_issystemgenerated` (Boolean), `cr664_title` (String), `cr664_visibilityscope` (Picklist, 4 vals); **Sys** id/owner/owneridtype.
- `cr664_eventtype` (15): 788190000 CallLogged … 788190014 BorrowerUpdateSent (incl TaskCreated 788190004, TaskCompleted 788190005, StageChanged 788190006, DocumentRequested 788190009, DocumentUploaded 788190010, EmailLogged 788190001, NoteLogged 788190002).
- `cr664_visibilityscope` (4): 788190000 BankerAndManager · 788190001 Team · 788190002 ExecutiveSafe · 788190003 AdminOnly.
- Data source: **registered**. SDK model: **yes**.

### cr664_clientrelationship — EntitySet `cr664_clientrelationships`
- Required-for-create: **App** `cr664_borrowertype` (Picklist), `cr664_clientname`; **Sys** id/owner.
- Data source: **registered**. SDK model: **yes**.

### cr664_banker — EntitySet `cr664_bankers`
- Required-for-create: **App** `cr664_fullname`, `cr664_roletype` (Picklist); **Sys** id/owner.
- Data source: **registered**. SDK model: **yes**. Target of `cr664_loandeal.cr664_assignedbanker`.

### cr664_creditmemo1 / cr664_creditmemodraftsection / cr664_alertqueue / cr664_dataqualityflag / cr664_dealreadinesssnapshot / cr664_losuserprofile / cr664_team
- Captured live (`.phase122/187-captures/table-*.txt`). All registered + SDK model present.
  No App-required lookup terminates in the unregistered identity sub-graph; the audit/timeline
  rows they emit do (via `cr664_auditevent.cr664_changedby`).

---

## Required-lookup recursive resolution (the critical chain)

```
cr664_auditevent.cr664_changedby   (App-required Lookup)
  └─→ cr664_user (CoreUser)         [DATA SOURCE NOT REGISTERED; runtime-unavailable to app]
        ├─ cr664_role (App-required Lookup) ─→ cr664_userrole   [no prod-safe row; not registered]
        └─ cr664_primaryworkspace (App-required Lookup) ─→ cr664_workspacetype  [not registered]
              └─ cr664_workspacecontext (App-required PICKLIST, NOT a table)
                    values: 788190000 EXECUTIVE_CONTEXT / 788190001 OPERATIONAL_CONTEXT / 788190002 ADMIN_CONTEXT
```

**Consequence:** every governed-write audit row depends on a `cr664_user` row existing for the actor.
For the pilot banker that row does **not** exist (PlatformUser.CoreUser empty), and the canonical
provisioner cannot create it because `cr664_workspacetype` create is blocked on the
`cr664_workspacecontext` picklist and `cr664_userrole` has no production-safe candidate. See 187D.

## Data-source / SDK availability matrix

| table | live table? | data source registered | generated SDK model | generated SDK service | runtime-writable by app |
|---|---|---|---|---|---|
| cr664_loandeal | yes | ✅ | ✅ | ✅ | ✅ |
| cr664_auditevent | yes | ✅ | ✅ | ✅ | ✅ |
| cr664_dealtask1 | yes | ✅ | ✅ | ✅ | ✅ |
| cr664_documentchecklist | yes | ✅ | ✅ | ✅ | ✅ |
| cr664_dealtimelineevent | yes | ✅ | ✅ | ✅ | ✅ |
| cr664_dealstagereference | yes | ✅ | ✅ | ✅ | ✅ (read) |
| cr664_dealstatusreference | yes | ✅ | ✅ | ✅ | ✅ (read) |
| cr664_platformuser | yes | ✅ | ✅ | ✅ | ✅ (read bridge) |
| cr664_banker / clientrelationship / creditmemo1 / alertqueue / dataqualityflag | yes | ✅ | ✅ | ✅ | ✅ |
| systemuser | yes | ✅ | ✅ (snapshot `users.Schema.json`) | ✅ | ✅ |
| **cr664_user (CoreUser)** | yes | ❌ | ✅ | ✅ (points at unregistered source) | ❌ |
| **cr664_workspacetype** | yes | ❌ | ❌ | ❌ | ❌ |
| **cr664_userrole** | yes | ❌ | ❌ | ❌ | ❌ |
| **cr664_workspacecontext** | ❌ (picklist on workspacetype) | n/a | ❌ | ❌ | n/a |

## Findings carried forward

- **B-1:** `cr664_changedby` (audit) targets `cr664_user`, confirming the original New Deal bug class.
- **B-2:** The entire identity sub-graph (`cr664_user`, `cr664_workspacetype`, `cr664_userrole`) is
  **not registered as Power Apps data sources** and cannot be created/read by the app at runtime — only
  by operator scripts. → 187C `DATA_SOURCE_NOT_REGISTERED` / `RUNTIME_DEPENDENCY_NOT_AVAILABLE`.
- **B-3:** `cr664_workspacecontext` is a **required Picklist on `cr664_workspacetype`**, not a table —
  contradicts the "WorkspaceContext node" provisioning model. → 187D / 187G.
- **B-4:** All four audit picklists' live values **match** the generated SDK enums exactly (see 187C) —
  no `OPTION_VALUE_MISMATCH` for the audit table.
