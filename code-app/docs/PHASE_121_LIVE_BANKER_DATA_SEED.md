# Phase 121 — Live Banker Data Seed and Populated Workspace Validation

> **Quick start:** if you're executing the seed today, use the
> simplified click-by-click runbook at
> [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md).
> That doc was written after a `pac env fetch` pre-flight against
> the deployed environment and carries the live row ids you need.
> The doc you are reading is the comprehensive reference runbook
> (filter contracts, design rationale, future-phase candidates) —
> useful for understanding *why* each step exists; not the
> fastest path to a populated workspace.

> **Sequencing note (Phase 119/120 reframe):** This runbook was
> originally numbered Phase 119 in an earlier pass. It was
> renumbered to Phase 121 once Phase 118's restoration backlog
> made clear that seeding live data against the Phase 117 reduced
> shell would be validating a thinner UI than the one the original
> product targeted. The live seed is now **deferred until after
> Phase 119 + Phase 120 restore the original Banker Workspace
> UI/UX**. Execute this runbook only once Phase 120 (restoration
> part 2) is shipped and the populated workspace is worth
> screenshotting against the original product UI.

**Status:** **Documentation only — deferred.** No production code
change, no schema change. This phase is a maker-portal runbook
the operator (Matt) follows to seed one minimal `TEST` deal in
the deployed environment so the restored Banker Workspace can be
observed in its populated state.

Why this matters: the Phase 117 shell renders honestly empty
today because Matt has no active deals assigned in the live env.
The KPIs all read `0`, the Pipeline tab is empty, the Closing-
soon right rail says "No deals with a target close in the next
14 days." Until at least one deal exists, the populated UX
cannot be evaluated against the prior product-grade screenshot.

This is **not a code fix**. The Phase 117 shell is correct. The
gap is that the live environment has no banker-scoped data for
the signed-in user. Phase 121 closes that gap with one safe seed
recipe.

Related canonical sources:
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell that this phase populates.
- [PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md) §3.3 — the maker-portal grid-drop pitfall this seed must avoid.
- [PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) §3 — Platform User + Banker provisioning, which Phase 121 assumes is already done for Matt.
- `src/banker/dealQueries.ts` — `loadBankerPipeline()`, the function whose filter determines what the workspace sees.
- `src/banker/workQueueQueries.ts` — `loadBankerWorkQueueData()`, the function whose child queries determine task / document visibility.

---

## 1. What the loaders actually filter on

Before listing fields, here's the exact filter contract the shell
+ cards run against. This is what the seeded row must satisfy.

### `loadBankerPipeline(bankerId)` — the deal list

```odata
_cr664_assignedbanker_value eq <bankerId>
  and statecode eq 0
  and (cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)
```

**A deal appears in Matt's pipeline if and only if:**
1. `cr664_AssignedBanker` points at Matt's `cr664_banker` row.
2. `statecode = 0` (Active).
3. `cr664_isterminalstatus` is `false` OR `null` (not set).

Nothing else gates pipeline visibility. There is no per-team
restriction in the banker filter (manager workspace uses team;
banker workspace uses banker-FK).

### `loadOpenTasksForDeals(dealIds)` — the work queue

```odata
(_cr664_deal_value eq <dealId>) and statecode eq 0
```

Then client-side: filter where `cr664_completed !== true`.

**A task appears if and only if** its `cr664_Deal` FK points at a
deal returned by `loadBankerPipeline`, statecode is 0, and it is
not marked completed. The task's `cr664_AssignedTo` value does
NOT gate visibility — but the field is REQUIRED to create the
row.

### `loadDocumentsAwaitingActionForDeals(dealIds)` — the document buckets

```odata
(_cr664_deal_value eq <dealId>) and statecode eq 0
```

Then client-side, split into two buckets:
- **Outstanding** = `reviewer` empty AND `receivedDate` empty AND `uploadStatus !== true`.
- **Pending review** = `reviewer` empty AND (`receivedDate` set OR `uploadStatus === true`).

Documents with a `reviewer` populated are filtered OUT of both
buckets.

### KPI tiles derived from the above

| KPI tile | Source counter | What seed value makes it nonzero |
| --- | --- | --- |
| Active deals | `deals.length` | 1 deal with `_cr664_assignedbanker_value = <Matt's banker id>` |
| Pipeline | `sum(deal.cr664_amount)` | Set `cr664_amount` to a value (e.g. 2,500,000) |
| Closing soon | deals with `targetCloseDate` within next 14 days | Set `cr664_targetclosedate` to a date 7 days from now |
| Open tasks | `tasks.length` | 1 task with `_cr664_deal_value = <deal id>` and `cr664_completed != true` |
| Outstanding docs | `outstandingDocuments.length` | 1 document with the "outstanding" attribute pattern |
| Pending reviews | `pendingReviewDocuments.length` | 1 document with the "pending-review" attribute pattern (optional — skip for minimum seed) |

---

## 2. Prerequisite check (before any seed row)

Two reference tables MUST already have rows in the live env. If
they do not, this seed fails and you'll need to populate them
first (or use the bank's existing data team).

### 2.1 Stage Reference rows

Open Tables → **Deal Stage Reference** (`cr664_dealstagereference`).
Confirm at least one row exists. Typical stage names:
`Pipeline`, `Application`, `Underwriting`, `Approval`, `Closing`,
`Funded`. Any one will work for the seed — pick one (e.g.
`Underwriting`).

**Record the row id** of the chosen stage; you'll set it on the
seed deal's `cr664_StageReference` FK.

### 2.2 Status Reference rows

Open Tables → **Deal Status Reference** (`cr664_dealstatusreference`).
Confirm at least one row exists. Typical status names: `Active`,
`On Hold`, `Lost`, `Won`. Pick the `Active`-equivalent row.

**Important:** the row you pick must NOT be a terminal status
(`Lost` / `Won` / `Withdrawn`). The deal filter excludes
terminal-status deals via `cr664_isterminalstatus`. If the
selected status reference row has `cr664_isterminal` set, the
deal will not appear in the pipeline.

**Record the row id** of the chosen Active-equivalent status;
you'll set it on the seed deal's `cr664_StatusReference` FK.

### 2.3 If either reference table is empty

Stop the seed and seed the reference table first. The minimal
reference row needs only its name field (e.g. `cr664_stagename`
for stage, `cr664_statusname` for status) plus `statecode = 0`.
Do NOT mark the status row terminal.

---

## 3. The seed sequence (do these in order)

Five Dataverse rows in this exact order. Each row depends on the
prior one(s). Use the **row form editor**, NOT the inline grid
(Phase 116 §3.3 grid-drop pitfall — required fields hidden from
the default view silently drop a saved row).

### 3.1 One borrower (client)

Table: **Borrower** (`cr664_borrower`).
Open Tables → Borrower → New.

| Field | Value | Notes |
| --- | --- | --- |
| `cr664_borrowername` | `TEST — Northwind Lending Demo` | **Must start with `TEST —`** so it is unambiguously test data. Choose any non-real company name (Northwind is the Microsoft sample-data convention). |
| `statecode` | `Active` (0) | Default in maker portal. |

Save. **Record the borrower id** (the URL after saving contains
the GUID, e.g. `id=...`).

### 3.2 One deal assigned to Matt

Table: **Loan Deal** (`cr664_loandeal`).
Open Tables → Loan Deal → New.

| Field | Required? | Value | Notes |
| --- | --- | --- | --- |
| `cr664_dealname` | yes | `TEST — Northwind Working Capital 2026` | **Must start with `TEST —`** so it stands out in any dashboard list. |
| `cr664_AssignedBanker` | yes | Matt's banker row | Use the lookup; select the `cr664_banker` row whose `cr664_email = mpaller@oldglorybank.com`. |
| `cr664_StageReference` | yes | the stage row from §2.1 | Use the lookup. |
| `cr664_StatusReference` | yes | the active-equivalent status row from §2.2 | Use the lookup. |
| `cr664_stageentrydate` | **yes (often hidden in grid)** | today's date as ISO | E.g. `2026-05-26T00:00:00Z`. The Phase 116 §3.3 grid-drop pitfall applies — this field is required by the model but is sometimes hidden from default views. The row form should surface it. If not, switch to "All columns" view first. |
| `cr664_Client` | recommended | the borrower row from §3.1 | Surfaces as `clientName` on the deal card. |
| `cr664_amount` | recommended | `2500000` (i.e. $2.5M) | Makes the Pipeline KPI nonzero. Any number works. |
| `cr664_targetclosedate` | recommended | a date 7 days from now | Makes the "Closing soon" KPI nonzero AND the right-rail "Closing soon" list populate. |
| `cr664_isterminalstatus` | **leave empty / unchecked** | — | Setting this true would filter the deal OUT of the pipeline. |
| `cr664_closedflag` | **leave empty / unchecked** | — | Same reason. |
| `statecode` | yes (default) | `Active` (0) | |

Optional but make the deal workspace look more real:
- `cr664_industry` → `Manufacturing` (any value)
- `cr664_customertype` → `New` or `Existing`
- `cr664_guarantorstructure` → `Limited`
- `cr664_collateralsummary` → `TEST collateral: equipment + A/R` (the Phase 73 memo-consistency check reads this string)

Save. **Record the deal id**.

### 3.3 One open task on the deal

Table: **Deal Task** (`cr664_dealtask1`).
Open Tables → Deal Task → New.

| Field | Required? | Value | Notes |
| --- | --- | --- | --- |
| `cr664_taskname` | yes | `TEST — Confirm PFS receipt` | Visible in the work queue. |
| `cr664_AssignedTo` | yes | Matt's banker row from §3.2 | The task work-queue filter doesn't gate on this, but the model requires the FK. |
| `cr664_Deal` | **required for visibility** | the test deal from §3.2 | Optional on the model, REQUIRED for the work queue to surface the task. Use the lookup. |
| `cr664_duedate` | optional | a date 2 days from now | If you set it in the past, the Overdue-tasks KPI counter increments and the Open-tasks tile tints red. |
| `cr664_completed` | leave false / empty | — | A `true` value filters the task out of the work queue. |
| `statecode` | yes (default) | `Active` (0) | |

Save. **No need to record the id** unless you want to delete this
task later (§7 covers cleanup).

### 3.4 One outstanding document on the deal

Table: **Document Checklist** (`cr664_documentchecklist`).
Open Tables → Document Checklist → New.

| Field | Required? | Value | Notes |
| --- | --- | --- | --- |
| `cr664_documentname` | yes | `TEST — Personal Financial Statement` | Visible in the Outstanding bucket. |
| `cr664_Deal` | yes | the test deal from §3.2 | Use the lookup. |
| `cr664_duedate` | optional | a date 5 days from now | |
| `cr664_reviewer` | **leave empty** | — | If populated, the doc is filtered OUT of both Outstanding AND Pending-review buckets. |
| `cr664_receiveddate` | **leave empty** | — | If populated, the doc moves to Pending-review bucket. |
| `cr664_uploadstatus` | **leave false / empty** | — | Same — a `true` value moves the doc to Pending-review. |
| `statecode` | yes (default) | `Active` (0) | |

Save.

### 3.5 (Optional) One pending-review document

Skip if you only want the minimum seed. Include this row if you
want the Pending-reviews KPI to read `1`.

Same table (`cr664_documentchecklist`), same form, different
field values:

| Field | Value |
| --- | --- |
| `cr664_documentname` | `TEST — Tax Returns (2024)` |
| `cr664_Deal` | the test deal from §3.2 |
| `cr664_receiveddate` | a date 10 days ago (set, so it lands in the Pending-review bucket) |
| `cr664_reviewer` | **leave empty** |
| `cr664_uploadstatus` | leave false |
| `statecode` | `Active` (0) |

Save.

---

## 4. Manual validation checklist (after seed)

Sign back into the deployed app. Confirm each bullet. If any
fails, the relevant row in §3 was likely dropped by the grid
pitfall (Phase 116 §3.3) — open the row in the form view to
verify and re-save.

### 4.1 KPI tiles update

- [ ] **Active deals** tile reads `1`.
- [ ] **Pipeline** tile reads `$2.5M` (or whatever amount you used; compact-formatted).
- [ ] **Closing soon** tile reads `1` AND tints blue/info (because `closingSoonCount > 0`).
- [ ] **Open tasks** tile reads `1` (and tints amber if you set the due date in the past).
- [ ] **Outstanding docs** tile reads `1`.
- [ ] **Pending reviews** tile reads `1` if you completed §3.5, else `0`.

### 4.2 Right rail "Closing soon" populates

- [ ] The Closing-soon right rail shows one row: `TEST — Northwind Working Capital 2026` with `Target close: in 7d (<date>)`.
- [ ] The disclaimer "Not a calendar integration" is still visible.

### 4.3 Tabs populate

- [ ] **Overview tab**: `My Activity Summary` card shows non-zero stats (the "No active deals assigned to you" empty-state is gone). `Morning Catch-Up` card surfaces signals (closing-soon, outstanding-doc, possibly overdue-task).
- [ ] **Pipeline tab**: shows `TEST — Northwind Working Capital 2026` row with stage + status + amount + target close.
- [ ] **Action Queue tab**: shows `TEST — Confirm PFS receipt` as an open task AND `TEST — Personal Financial Statement` as an outstanding document.
- [ ] **Relationships tab**: shows one client snapshot for `TEST — Northwind Lending Demo` (the borrower from §3.1) with one active deal counted.
- [ ] **Signals tab**: Autopilot rollup surfaces signals derived from the test data (e.g. closing-soon, outstanding-doc signals).

### 4.4 Deal workspace opens cleanly

- [ ] Click the deal row in the Pipeline tab.
- [ ] The Banker Deal Workspace renders without crash / blank state.
- [ ] Deal Summary card shows name + client + stage + status + amount + target close (or `—` for any fields you left blank, which is honest, not broken).
- [ ] Deal Tasks card shows the one open task.
- [ ] Deal Documents card shows the one Outstanding row (and the pending-review row in its bucket if §3.5 was completed).
- [ ] Credit Memo card renders empty-state ("No memos yet.") — that's honest; no memo was seeded.
- [ ] Activity Timeline card renders empty-state ("No activity recorded yet.") — also honest.
- [ ] Borrower Communication card renders empty-state. **DO NOT click Draft Borrower Update or Send a document-request email against the test row** — those are real governed writes that emit audit + timeline events. The seed is for visibility, not for exercising the email lane.

### 4.5 Permission-before-render still holds

- [ ] URL-hack to a deal id that is NOT the test deal id: the deal workspace renders Access Denied (loadDealForBanker.ts denies non-assigned deals).
- [ ] Refresh: the test data persists and the populated state survives a full reload.

---

## 5. Important guardrails

### 5.1 Test data must be clearly marked

Every visible row must start with `TEST —`. This is a discipline
choice, not a system requirement. The reason is bullet-proof
disambiguation: if test data ever leaks into a list a real
banker / regulator sees, the `TEST —` prefix makes it obvious at
a glance.

### 5.2 No email-lane exercise against this seed

The seed is for visibility only. Phase 104–110 wired the
document-request email and borrower-update email LIVE paths
through `Office365OutlookService.SendEmailV2`. Triggering those
against the test deal would emit real audit + timeline rows AND
(if `VITE_EMAIL_MODE=LIVE`) attempt a real Outlook send.

If you specifically want to exercise the LIVE email lane, use the
Phase 109 Outlook LIVE Email Diagnostics smoke-test card in the
Admin Workspace (not the test deal). The smoke-test card is
diagnostic-only, emits no audit/timeline, and is governance-safe.

### 5.3 No automation, no portal, no inbound

Phase 121 does not introduce any of these. The seed is static
data; no scheduled triggers, no inbound-mail handling, no
borrower-portal account. Phase 110 §6 forbids these surfaces;
Phase 121 respects that envelope.

### 5.4 No schema changes

This phase confirmed that every required field on every table is
already present in the deployed schema. No new column, no new
reference table row schema change. If §2.1 / §2.2 prerequisite
reference tables turn out to be empty, that's a data-seed
problem (handled in §2.3), not a schema problem.

---

## 6. Cleanup recipe (when test data should be removed)

After Phase 121 validation is complete, the test rows can stay
indefinitely (they're isolated, `TEST —` prefixed, and won't
interfere with real data). If you want to remove them:

Reverse order from §3 to avoid FK violations:

1. Delete the pending-review document (§3.5) if created.
2. Delete the outstanding document (§3.4).
3. Delete the open task (§3.3).
4. Delete the deal (§3.2). Note: if the deal has any governed-
   write audit + timeline rows (e.g. you accidentally triggered a
   Send), those `cr664_AuditEvent` + `cr664_DealTimelineEvent`
   rows will block the delete. Either leave them and delete
   children first, or set `statecode = 1` (Inactive) on the deal
   to deactivate it without deleting the audit chain.
5. Delete the borrower (§3.1).

If a delete fails with "record is referenced", that's the same
Dataverse constraint that protects production data. Either
delete the referencing children first or set `statecode = 1`.

---

## 7. Future-phase candidates (out of scope for Phase 121)

Each is a future-phase brief; none is implied as next.

1. **Provisioning helper** — a model-driven app form or Power
   Automate flow that takes "banker email + count of test deals"
   and emits the seed rows in one operation. Phase 116 §3.3
   named this; Phase 121 confirms the value proposition.
2. **Test-data signal in the UI** — a non-blocking indicator
   ("test data present") when any visible row's name starts with
   `TEST —`. Would prevent accidental confusion between test and
   live data on a populated workspace.
3. **`statecode = 1` cleanup helper** — a Power Automate flow
   that deactivates rather than deletes test rows, preserving
   audit chains while removing them from active filters.
4. **Per-environment test data isolation** — a dedicated `Test`
   environment with seeded data, separate from the production
   environment Matt validated in. Today both environments share
   the same Dataverse data layer.

---

## 8. Verification

### CI gates

This is a documentation-only phase. The code surface is
unchanged. CI gates:
- `npm test -- --run`: full suite passes unchanged.
- `npm run build`: unchanged.

### Operator gate (the populated-workspace validation)

After completing §3 and §4:
- The Phase 117 Banker Workspace renders in its populated state.
- All six KPI tiles show non-zero values (or zero where honest).
- The Pipeline tab, Action Queue tab, Relationships tab, and
  Signals tab all show content derived from the test deal.
- The deal workspace opens cleanly when the test deal is clicked.

If the populated-state still feels visually lighter than the
prior product-grade screenshot, that's the signal for a
**future visual polish pass** — spacing, density, KPI tile
styling, right-rail item presentation, action button placement,
Teams-iframe fit. Phase 121's job is to make the comparison
possible honestly; the Phase 118 inventory + restoration
backlog ([PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md))
will sequence the restoration phases that close any remaining
visual gap once the data is populated.

### Operator-side `pac code push`

Not required for Phase 121 — no code changes ship. The Dataverse
rows added in §3 are immediately visible to the already-deployed
app on the next user session reload.

---

## 9. Cross-references

- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell this phase populates. Phase 117 §6 manual-validation list complements Phase 121 §4 (Phase 117 confirms the shell renders honestly empty; Phase 121 confirms it also renders honestly populated).
- [PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md) §3.3 — the maker-portal row-form vs. inline-grid pitfall this phase carefully avoids.
- [PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) §3 — the Platform User + Banker provisioning that Phase 121 assumes is already done.
- `src/banker/dealQueries.ts` — `loadBankerPipeline()`, the filter contract Phase 121 §1 documents.
- `src/banker/workQueueQueries.ts` — `loadBankerWorkQueueData()`, the child-query filters Phase 121 §1 documents.
- `src/generated/models/Cr664_loandealsModel.ts` — the required-field source for §3.2.
- `src/generated/models/Cr664_borrowersModel.ts` — the required-field source for §3.1.
- `src/generated/models/Cr664_dealtask1sModel.ts` — the required-field source for §3.3.
- `src/generated/models/Cr664_documentchecklistsModel.ts` — the required-field source for §3.4 / §3.5.
