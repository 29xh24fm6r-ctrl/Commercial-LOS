# Phase 121 — Operator Seed Checklist (Click-by-Click)

**Status:** Operator runbook. Documentation only. No production
code change.

This is the streamlined entry point for Phase 121. The full
reference runbook ([PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md))
documents the filter contracts and design rationale; this doc is
the concise click-through with **pre-verified live values** from
the deployed environment.

---

## 0. Audit findings (pre-flight, already done)

This checklist was written after running `pac env fetch` against
the deployed environment. The following live values are already
confirmed:

| Item | Live value |
| --- | --- |
| Environment ID | `5f2d77a5-de50-edeb-9d74-5b2400a2320d` |
| Org URL | `https://org3a57b8d4.crm.dynamics.com/` |
| Signed-in PAC user | `mpaller@oldglorybank.com` |
| Matt's `cr664_banker` row id | `d7975960-0d59-f111-bec7-70a8a59be491` |
| Matt's banker `cr664_fullname` | `Matthew Paller` |
| Matt's `systemuser` id (the Assigned To target for Step 5) | `e056f0e7-4a13-f111-8406-6045bd07ee56` |
| Matt's `cr664_platformuser` id | `e20d1fcd-4fbc-4439-962e-975c1db08aeb` |
| `cr664_dealstagereference` table | **EMPTY** — must seed reference row first |
| `cr664_dealstatusreference` table | **EMPTY** — must seed reference row first |
| `cr664_loandeal` table | empty (no existing deals) |
| `cr664_borrower` table | one pre-existing row (`Woodsons Wood Shop`) — NOT test data, just legacy |
| `cr664_user` table | **EMPTY by design** (Phase 115 bootstrap shifted to `cr664_platformuser`) — do NOT seed here |

**Why no automation:** `pac` CLI does not expose a row-create
command. `pac data` only supports `bulk-delete`, `retention`,
`export`, `import` — none useful for a 4-row seed without
writing a custom schema package. The repo has no Node /
PowerShell helper, no `.env` for Dataverse URL, no service-
principal credentials. `pac env fetch` (used above) is the only
out-of-the-box authenticated path and is **read-only**. A
custom MSAL + Web API seed utility could be built as a separate
phase if the manual process proves error-prone in practice.

**Consequence:** this checklist is the safe path. The §2.3
fallback in the main runbook is now mandatory — you must create
one stage-reference row + one status-reference row before the
loan deal will save.

---

## 1. Pre-flight (you already did this)

✅ Phase 119 + 120 deployed.
✅ App launches; 7 sidebar items; 7 tab bar items render.
✅ Workspace footer shows `Banker Workspace · Current`.
✅ All KPI tiles read `0` / `$0`.

If any of those drifted, stop. The seed will not change those
behaviors — only populate them with real data.

---

## 2. Open the maker portal at the right environment

In a terminal:

```powershell
pac tool maker
```

This opens [make.powerapps.com](https://make.powerapps.com)
already scoped to environment `5f2d77a5-de50-edeb-9d74-5b2400a2320d`
("Matthew Paller's Environment"). If a different environment is
loaded in the top-right env selector, switch it back to this one
before any save.

📷 **Screenshot checkpoint:** the env selector shows `Matthew
Paller's Environment` before you proceed.

Then navigate: **Tables** → **All** → filter the list to the
`cr664_` tables (or search the table name in the search bar).

---

## 3. Seed sequence — six rows, in this exact order

> **Use the row form editor, not the inline grid.** The
> [PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md)
> §3.3 grid-drop pitfall: required fields hidden from the
> default column view silently drop a saved row.
>
> For each row below: open the table → click `+ New` → fill the
> form → click `Save & Close`. Do NOT use the inline grid.

### Step 1 — Stage Reference (the §2.3 prerequisite)

Table display name: **Deal Stage Reference**
Schema name: `cr664_dealstagereference`

| Form field label | Schema name | Value |
| --- | --- | --- |
| Name | `cr664_name` | `TEST — Underwriting Phase 121` |
| Status | `statecode` | `Active` (default) |

Click **Save & Close**.

📷 **Screenshot checkpoint:** the row appears in the Deal Stage
Reference grid with status `Active`.

**Record the row id** (open the saved row again; the GUID is in
the URL after `id=`). You'll need it in Step 4 for the deal's
Stage lookup.

---

### Step 2 — Status Reference (the §2.3 prerequisite)

Table display name: **Deal Status Reference**
Schema name: `cr664_dealstatusreference`

| Form field label | Schema name | Value |
| --- | --- | --- |
| Name | `cr664_name` | `TEST — Active Phase 121` |
| Status | `statecode` | `Active` (default) |

Click **Save & Close**.

📷 **Screenshot checkpoint:** the row appears in the Deal Status
Reference grid with status `Active`.

**Record the row id.** You'll need it in Step 4 for the deal's
Status lookup.

> **Why not a terminal status?** The pipeline loader filters on
> `cr664_isterminalstatus eq false or null` on the deal row
> itself. The status-reference table does not carry a terminal
> flag in this env (verified via `pac env fetch` — no
> `cr664_isterminal` attribute exists on the table). So any
> active row works.

---

### Step 3 — Borrower

Table display name: **Borrower**
Schema name: `cr664_borrower`

| Form field label | Schema name | Value | Required? |
| --- | --- | --- | --- |
| Borrower Name | `cr664_borrowername` | `TEST — Borrower Phase 121` | yes |
| Status | `statecode` | `Active` (default) | yes (auto) |
| Owner | `ownerid` | auto-fills to you | yes (auto) |

Click **Save & Close**.

📷 **Screenshot checkpoint:** the row appears in the Borrower
grid; the URL after save contains the borrower GUID.

**Record the borrower id.** Step 4 needs it for the deal's
Client lookup.

---

### Step 4 — Loan Deal (the load-bearing row)

Table display name: **Loan Deal**
Schema name: `cr664_loandeal`

This row has the most required fields. **All five FK lookups
must be set before save, or the row will fail/drop.**

| Form field label | Schema name | Value | Required? |
| --- | --- | --- | --- |
| Deal Name | `cr664_dealname` | `TEST — Deal Phase 121` | yes |
| Assigned Banker | `cr664_AssignedBanker` | Lookup → search `Matthew Paller` (banker id `d7975960-0d59-f111-bec7-70a8a59be491`) | yes |
| Stage Reference | `cr664_StageReference` | Lookup → select the row from Step 1 (`TEST — Underwriting Phase 121`) | yes |
| Status Reference | `cr664_StatusReference` | Lookup → select the row from Step 2 (`TEST — Active Phase 121`) | yes |
| Stage Entry Date | `cr664_stageentrydate` | today's date | **yes — and frequently hidden from default views; if you don't see it on the form, switch the form view to "All columns" / "Show all"** |
| Status | `statecode` | `Active` (default) | yes (auto) |
| Owner | `ownerid` | auto-fills to you | yes (auto) |
| Client | `cr664_Client` | Lookup → select the row from Step 3 (`TEST — Borrower Phase 121`) | **recommended** — surfaces as the deal's client name on the pipeline card |
| Amount | `cr664_amount` | `2500000` (US$2.5M) | recommended — makes the Pipeline KPI tile non-zero |
| Target Close Date | `cr664_targetclosedate` | 7 days from today | recommended — makes the Closing-soon tile + right-rail panel non-empty |
| Is Terminal Status | `cr664_isterminalstatus` | **leave unchecked / empty** | required NOT set — `true` filters the deal OUT of the pipeline |
| Closed Flag | `cr664_closedflag` | **leave unchecked / empty** | required NOT set — same |

Click **Save & Close**.

📷 **Screenshot checkpoint:** the row appears in the Loan Deal
grid with the four lookup-name columns populated (Assigned
Banker, Stage, Status, Client). If any lookup shows blank, that
field was not set during the form fill — re-open the row and
set it.

**Record the deal id.** Steps 5 and 6 need it.

---

### Step 5 — Task

Table display name: **Deal Task**
Schema name: `cr664_dealtask1`

> **Lookup target correction (post-execution finding).** Earlier
> drafts of this checklist labeled `cr664_AssignedTo` as a
> "Banker" lookup. **It is a `systemuser` lookup, NOT a `cr664_banker`
> lookup.** Production code confirms this at
> [src/deals/dealTaskActions.ts:401](../src/deals/dealTaskActions.ts#L401):
> `'cr664_AssignedTo@odata.bind': '/systemusers(...)'`.
> Matt's `systemuser` row id (verified via `pac env fetch`):
> `e056f0e7-4a13-f111-8406-6045bd07ee56`.

| Form field label | Schema name | Value | Required? |
| --- | --- | --- | --- |
| Task Name | `cr664_taskname` | `TEST — Task Phase 121` | yes |
| Assigned To | `cr664_AssignedTo` | Lookup → **systemuser** `Matthew Paller` (systemuserid `e056f0e7-4a13-f111-8406-6045bd07ee56`, internalemailaddress `mpaller@oldglorybank.com`) | yes |
| Deal | `cr664_Deal` | Lookup → the deal from Step 4 | **optional on the model BUT required for visibility** — the banker work-queue loader filters by `_cr664_deal_value`; a task without a deal FK does not surface |
| Due Date | `cr664_duedate` | 2 days from today | optional — past-due makes the "Open tasks" tile tint amber |
| Completed | `cr664_completed` | **leave unchecked / empty** | required NOT set — `true` filters the task out of the queue |
| Status | `statecode` | `Active` (default) | yes (auto) |

Click **Save & Close**.

📷 **Screenshot checkpoint:** the row appears in the Deal Task
grid with the Deal column populated.

#### Step 5 troubleshooting — if the form is broken

The model-driven form for `cr664_dealtask1` has been observed to
misbehave in the deployed env:
- The Assigned To lookup returns no results for "Matthew
  Paller" / "Matt" / `mpaller@oldglorybank.com` even though
  Matt's systemuser is enabled and visible to default user
  lookup views.
- "Edit row using form" → Dynamics legacy UI → "Record Is
  Unavailable — The requested record was not found."

The lookup target itself is fine (production code uses it
correctly); the broken behavior is in the maker-portal **form
or quick-find view** configuration for `cr664_dealtask1`. Fixing
that form is a Dataverse-config task outside the code-app scope.

**Try these alternative paths in order:**

##### Path A (recommended) — Inline grid with Assigned To column visible

1. Tables → **Deal Task** → click the table name to enter the data view.
2. Click the **column-editor / "Edit columns" icon** (usually a gear or pencil on the grid header). Add **Assigned To** to the visible columns and Save.
3. Click **+ New** to add a row inline.
4. Fill the inline row:
   - Task Name → `TEST — Task Phase 121`
   - Deal → lookup to your test deal from Step 4
   - Assigned To → lookup. The inline lookup uses the default systemuser quick-find view, which should match `Matthew Paller`. If the default view fails, click the chevron / "Show More" / "Advanced Lookup" inside the lookup popup and switch to the `Enabled Users` view.
   - Due Date → 2 days from today (optional)
5. Save the row in place.

Phase 116 §3.3 grid-drop pitfall applies — verify by re-opening
the row that **all four columns** (Task Name, Deal, Assigned To,
Status) saved. If Assigned To is blank after save, the inline
grid dropped it; re-edit and re-save.

##### Path B — Direct URL row creation (legacy Dynamics UI)

If Path A's lookup also fails, paste this URL into the address
bar (replace `<env-url>` with `https://org3a57b8d4.crm.dynamics.com`):

```
<env-url>/main.aspx?etn=cr664_dealtask1&pagetype=entityrecord
```

This opens the legacy create-record form. The legacy UI's
lookup widget is more permissive and exposes the underlying
Advanced Lookup directly.

##### Path C (fallback) — Skip the Task seed entirely

The app's work-queue loader does NOT require a task for the
Action Queue tab to populate. The loader surfaces tasks AND
documents AND blocked-deal signals AND closing-soon signals
from independent data primitives.

Skipping Step 5 means:
- ✅ Action Queue tab still populates — your outstanding document from Step 6 surfaces there.
- ✅ Due Diligence tab still shows the document.
- ✅ All other KPI tiles still light up.
- ⚠️ "Open tasks" KPI tile stays at `0` — **honest empty, not a regression.**
- ⚠️ "My Tasks" right-rail panel stays in its empty-state copy ("No open tasks on your active deals.") — also honest.

Document the gap in your validation pass and move on. The app's
honest-empty-state behavior is the point of Phases 117–120; the
seed validates that real data renders. Two of nine KPI tiles
staying at zero because a row wasn't created is exactly the
behavior the architecture targets.

##### What NOT to do

- **Do NOT create a `cr664_banker` row for Matt as a workaround.** His banker row already exists (id `d7975960-0d59-f111-bec7-70a8a59be491`). A second one would break the Banker Provider's `top: 1` lookup or surface confusing duplicate identity.
- **Do NOT create a `cr664_user` row for Matt as a workaround.** The bootstrap chain uses `cr664_platformuser`, not `cr664_user` (per Phase 115). `cr664_user` is empty by design.
- **Do NOT modify the React app code** to drop `cr664_AssignedTo` from `dealTaskActions.ts`. The field is required by the live schema; the app's binding is correct. The form misconfiguration is the bug, not the app.

---

### Step 6 — Outstanding Document — **SKIPPED (deferred to Phase 122)**

Table display name: **Document Checklist**
Schema name: `cr664_documentchecklist`

> **Schema/code mismatch finding (read-only investigation).** The
> live `cr664_documentchecklist.cr664_Deal` lookup **targets the
> legacy `cr664_deal` table, not the modern `cr664_loandeal` table
> the app expects.** Evidence:
>
> - The maker-portal Deal lookup on this table offers only the
>   single legacy `cr664_deal` row (display name `Woody Woodson`).
>   It does NOT offer `TEST — Deal Phase 121` (which lives in
>   `cr664_loandeal` with id `d3d46688-3259-f111-bec7-70a8a59be491`).
> - Production code [src/deals/documentActions.ts:131](../src/deals/documentActions.ts#L131)
>   (and lines :337, :551) binds the FK as
>   `'cr664_Deal@odata.bind': '/cr664_loandeals(...)'` — assuming
>   the modern target.
> - The loader [src/banker/workQueueQueries.ts:140-145](../src/banker/workQueueQueries.ts#L140-L145)
>   filters by `_cr664_deal_value eq <cr664_loandealid>` — so even
>   if a doc were force-bound to a legacy `cr664_deal` row, it
>   would never surface in Action Queue / Due Diligence / KPI
>   tile counts.
> - This is a real production bug, latent because no end-user has
>   exercised the in-app document-create surfaces against the
>   live env yet. The Phase 121 seed surfaced it.
>
> **Decision: skip the document seed.** Three things explicitly
> ruled out:
>
> 1. ❌ **Do NOT link the TEST document to the legacy `Woody
>    Woodson` row.** It would pollute the legacy table with TEST
>    data AND would not surface in the restored Banker Workspace
>    (the loader filters by `cr664_loandeal` IDs — orphan).
> 2. ❌ **Do NOT modify `documentActions.ts` to bind to
>    `/cr664_deals(...)`.** The legacy table has a different
>    shape (no `cr664_StageReference`, no `cr664_StatusReference`,
>    `cr664_borrowername` as primary name); the loader filter
>    contract assumes the modern shape via `loadBankerPipeline`.
> 3. ❌ **Do NOT create a `cr664_loandeal` row to match the
>    legacy GUID** as a workaround. GUIDs are not user-assignable
>    in maker portal, and forcing a collision would corrupt both
>    tables.
>
> **Phase 122 — Retarget Modern Operational Child-Table Deal
> Lookups to cr664_loandeal** captures the fix. Until that ships,
> the Outstanding / Pending-review / My-Tasks / Action-Queue
> document surfaces stay in their honest-empty state. See §4.4 /
> §4.5 / §4.7 below — they have been updated to reflect this.

The original Step 6 row creation (`TEST — Outstanding Document
Phase 121`) is **not attempted** as part of this Phase 121
operator pass. Skip directly to §4.

---

### Step 7 — (Optional) Pending Review Document — **SKIPPED (deferred to Phase 122)**

Same root cause as Step 6: the `cr664_documentchecklist.cr664_Deal`
lookup targets the legacy `cr664_deal` table; no maker-portal
path links the row to `TEST — Deal Phase 121` in the modern
`cr664_loandeal` table.

The original Step 7 row creation (`TEST — Pending Review
Document Phase 121`) is **not attempted** as part of this Phase
121 operator pass. The Pending reviews KPI tile stays at `0`
(honest empty) until Phase 122 ships.

---

## 4. App validation checklist

Sign back into the deployed app (https://make.powerapps.com →
Apps → Banker Workspace, or wherever your launcher is). Confirm
each bullet. If any fails on a non-skipped surface, the relevant
row was likely dropped by the grid pitfall — open the row in its
form view and verify the required fields are populated.

> **Reduced-seed scope (per Steps 5–7 skip):** because Step 5
> (Task) and Steps 6–7 (Documents) were skipped, several surfaces
> below validate as **honestly empty**, not as broken. These are
> annotated explicitly. The architecture's empty-state behavior
> IS the validation — Phases 117 / 119 / 120 promised that
> empty Dataverse returns an honest empty UI, never fabricated
> rows. The reduced seed validates exactly that promise for the
> Task / Document surfaces.

### 4.1 Sidebar + header

- [ ] Sidebar shows 7 nav items (Overview / Pipeline / Action Queue / Due Diligence / Activity / Relationships / Signals).
- [ ] Sidebar footer "Workspace" block shows `Banker Workspace · Current` with the single-workspace hint.
- [ ] Header shows `Banker Command Center` with email-mode badge.
- [ ] No "Read-only mode" banner (you have a systemuser provisioned).

### 4.2 Overview tab — KPI grid (9 tiles)

- [ ] **Active deals**: `1`
- [ ] **Pipeline**: `$2.5M` (or whatever amount you set; compact-formatted)
- [ ] **Closing soon**: `1` (blue tint if > 0)
- [ ] **Open tasks**: `0` (**honest empty** — Step 5 skipped per the AssignedTo blocker)
- [ ] **Outstanding docs**: `0` (**honest empty** — Step 6 skipped pending Phase 122)
- [ ] **Pending reviews**: `0` (**honest empty** — Step 7 skipped pending Phase 122)
- [ ] **Urgent items**: `1` if you set the target close date in the past, else `0` (the deal alone contributes; Task / Doc contributions are honest-empty pending Phase 122)
- [ ] **In underwriting**: `1` (because the Stage Reference row label contains `Underwriting`)
- [ ] **Stale 14d+**: `0` (the deal was just created — `modifiedon` is fresh)

Below the tiles:
- [ ] `My Activity Summary` card shows non-zero pipeline-shape stats (Active deals + Pipeline total) and zero document/task counts — replaces the "No active deals assigned to you" empty state.
- [ ] `Morning Catch-Up` card surfaces signals from the test deal (closing-soon if applicable). Task / document signals are honestly empty.

### 4.3 Pipeline tab — stage-grouped layout (Phase 119)

- [ ] One stage section appears, labeled `TEST — Stage Phase 121 · 1 deal` (or whatever stage name you used).
- [ ] Inside that section, one row: `TEST — Deal Phase 121`.
- [ ] Row shows client `TEST — Borrower Phase 121`, status `TEST — Status Phase 121`, amount `$2,500,000`, target close date.
- [ ] **No** "Stale 14d+" badge on the deal row (the deal was just created).

### 4.4 Action Queue tab — My Work Queue — **honest empty (Phase 122 dependency)**

- [ ] Tab renders. Card-level empty state shows because no tasks
      (Step 5 skipped) and no documents (Steps 6–7 skipped) are
      linked to a `cr664_loandeal` row Matt owns.
- [ ] **NO** task row labeled `TEST — Task Phase 121` (Step 5
      skipped — the AssignedTo lookup-config bug blocks creation).
- [ ] **NO** document row labeled `TEST — Outstanding Document
      Phase 121` (Step 6 skipped — the
      `cr664_documentchecklist.cr664_Deal` lookup targets legacy
      `cr664_deal`, not `cr664_loandeal`; Phase 122 retarget
      required).
- [ ] No fabricated rows. This is the architecture working — the
      banker work-queue derivation honestly reports "no overdue
      tasks, no outstanding documents" against the current data.

### 4.5 Due Diligence tab (Phase 120) — **honest empty (Phase 122 dependency)**

- [ ] Tab renders.
- [ ] `Outstanding` section: `0 documents` + the empty-state copy.
- [ ] `Pending review` section: `0 documents` + the empty-state copy.
- [ ] **NO** `TEST — Outstanding Document Phase 121` row visible
      (Step 6 skipped pending Phase 122).
- [ ] **NO** `TEST — Pending Review Document Phase 121` row
      visible (Step 7 skipped pending Phase 122).
- [ ] **NO** Request / Mark Received / Mark Reviewed buttons
      surface — by design (this tab is read-only per Phase 120).

### 4.6 Activity tab (Phase 120)

- [ ] Tab renders one or more rows derived from `modifiedon` on
      the seeded deal, the seeded stage reference, the seeded
      status reference, and the seeded borrower (whatever rows
      Matt's work-queue load actually pulls).
- [ ] Each row shows the type badge (`Deal` / others) + the
      title + an "Open deal" link.
- [ ] The card subtitle says **"Not the per-deal Activity
      Timeline"** — that's correct; the operator goes to the
      per-deal workspace for the canonical event history.
- [ ] No fabricated rows. Task / Document `modifiedon` rows are
      legitimately absent because no tasks / docs were seeded.

### 4.7 Right rail

- [ ] `Closing soon` panel shows `TEST — Deal Phase 121` with
      `Target close: in 7d (...)` if you set target close date
      within 14 days.
- [ ] `Closing soon` disclaimer "Not a calendar integration" is
      still visible.
- [ ] `My Tasks` panel shows the **empty-state copy** ("No open
      tasks on your active deals.") — honest, Step 5 was skipped.

### 4.8 Deal workspace (click the deal row)

- [ ] Clicking the deal row in the Pipeline tab opens the Banker
      Deal Workspace at `/deals/<id>`.
- [ ] Deal Summary card shows the deal facts (name, client,
      stage, status, amount, target close).
- [ ] Deal Tasks card renders the **empty-state copy** — honest,
      no tasks seeded.
- [ ] Deal Documents card renders the **empty-state copy** —
      honest, no documents seeded (Phase 122 dependency).
- [ ] Credit Memo card renders empty-state ("No memos yet") —
      honest.
- [ ] Activity Timeline card renders empty-state — honest, no
      timeline events seeded.
- [ ] Borrower Communication card renders. **DO NOT click `Draft
      Borrower Update` or `Request Document` — those are real
      governed writes against the live email lane** (Phase 104–
      105). Seed validation does not exercise them.

### 4.9 Governance invariants still hold

- [ ] **No fabricated/sample rows visible anywhere.** Only your
      `TEST — *` Phase 121 rows (Borrower, Deal, Stage Reference,
      Status Reference) + the pre-existing legacy artifacts
      (`Woodsons Wood Shop` borrower, `Woody Woodson` legacy
      deal, the 5 pre-existing `Memo for Deal #*` credit memos
      with null deal FKs, the 2 pre-existing `Paller Holdings *`
      document checklists with null deal FKs).
- [ ] **No unauthorized workspace** in the sidebar switcher —
      footer still shows the single-workspace state.
- [ ] **No live communication action triggered** by rendering
      any tab. (You did not click `Draft Borrower Update` or
      `Request Document` per §5.)
- [ ] URL-hack to a deal id you do NOT own → renders "Access
      Denied" (`loadDealForBanker` filter).

---

## 5. Hard rules during this checklist

These are non-negotiable; the brief is explicit.

1. **Do NOT click `Draft Borrower Update`** — real governed write against the live Outlook lane.
2. **Do NOT click `Request Document`** — same.
3. **Do NOT send any borrower email / SMS / Teams notification** through any card.
4. **Do NOT create a second banker row for Matt** — his row already exists (id above). The Step 4 lookup must reuse the existing row.
5. **Do NOT introduce sample data** — only the 4 TEST — Phase 121 rows actually created (Stage Reference, Status Reference, Borrower, Deal). Steps 5–7 are skipped, not "filled with placeholder data."
6. **Do NOT link the TEST document to `Woody Woodson`** as a workaround for Step 6 — pollutes legacy data + won't surface in the loader.
7. **Prefix every seeded record with `TEST —`** so it is unambiguously test data on every grid.
8. **Use the row form editor, not the inline grid** for every save (Phase 116 §3.3 pitfall).

---

## 6. Cleanup (when you want to remove the seed)

Reverse order from §3 to avoid FK violations. Skipped rows are
omitted:

```
3. Loan deal                 (Step 4)
2. Borrower                  (Step 3)
1. Status reference          (Step 2)
0. Stage reference           (Step 1)
```

Steps 5 (Task), 6 (Outstanding Doc), 7 (Pending-review Doc) were
skipped, so there is nothing to delete for those.

If a delete fails with "record is referenced", that's the same
Dataverse constraint that protects production data. Either
delete the referencing children first or set `statecode = 1`
(Inactive) on the parent. The Inactive state preserves the
audit chain while removing the row from active filters.

---

## 7. If a save fails or a tile stays zero

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| Deal save errors with "field is required" | A required FK lookup was empty (Step 4 has 5 required FKs) | Re-open the row in form view, set the missing lookup, Save & Close again |
| Deal saves but does not appear on the pipeline | `cr664_isterminalstatus` set to `true`, or `statecode` not Active | Open the row, uncheck `Is Terminal Status`, set `Status` to Active |
| `In underwriting` tile stays `0` | The Stage Reference name does not contain "Underwriting" (case-insensitive) | Rename the Stage Reference row to include the literal word `Underwriting` |
| `Stale 14d+` tile stays `0` and a row should be stale | The deal's `modifiedon` is fresh because you just saved it | Wait 14d, OR manually backdate `modifiedon` via a dataflow (not available in default maker portal — leave as `0` for the seed validation) |
| `Closing soon` tile stays `0` | `cr664_targetclosedate` is empty or > 14d away | Edit the deal, set Target Close Date to 7 days from today |
| Task does not appear in Action Queue | Step 5 was skipped (AssignedTo lookup blocker) | Honest empty — no action needed. Phase 122 will not change this; the AssignedTo blocker is a maker-portal form/view config issue separate from Phase 122 |
| Document does not appear in Outstanding / Due Diligence / Action Queue | Steps 6–7 were skipped — `cr664_documentchecklist.cr664_Deal` lookup targets legacy `cr664_deal`, not modern `cr664_loandeal` | Honest empty until Phase 122 ships the retarget |

📷 **Screenshot for support:** if you get stuck, capture the row
form editor showing the failed/dropped field with its red
required-field indicator. The Phase 116 §3.3 grid-drop pitfall
is the single most common cause of "saved but invisible" rows.

---

## 8. Phase 122 — Retarget Modern Operational Child-Table Deal Lookups

Out of scope for Phase 121; flagged here as the next phase the
operator/admin will need.

### 8.1 Scope

**Confirmed broken (operator-verified during Phase 121 seed):**

- `cr664_documentchecklist.cr664_Deal` → currently targets legacy
  `cr664_deal`; must retarget to `cr664_loandeal`.

**Candidates worth re-inspecting** (production code binds them to
`/cr664_loandeals(...)` so the same legacy-target pattern may
exist; live Dataverse evidence is inconclusive because none of
these tables have rows with the Deal FK populated, so neither
inner-join nor `<all-attributes/>` confirmed the target):

- `cr664_dealtask1.cr664_Deal` — bound by [src/deals/dealTaskActions.ts:133](../src/deals/dealTaskActions.ts#L133), :354. (Phase 121 Step 5 was blocked by the AssignedTo lookup before reaching the Deal lookup; the Deal target was not visually confirmed.)
- `cr664_creditmemo1.cr664_Deal` — bound by [src/deals/creditMemoActions.ts:168](../src/deals/creditMemoActions.ts#L168), :202, :257. (5 pre-existing memo rows in this env all have null Deal FK.)
- `cr664_creditmemodraftsection.cr664_Deal` — bound by `creditMemoActions.ts`. (No rows in this env.)
- `cr664_dealtimelineevent.cr664_Deal` — bound by activity timeline + every governed write. (No rows in this env.)

### 8.2 Recommended fix path

In the maker-portal Solution view for `CommercialLendingLOS`:

1. For each table above, open the `cr664_Deal` (or per-table FK)
   column in the table designer.
2. Confirm the current target entity (delete + recreate the
   lookup is the simplest way to retarget — Dataverse does not
   support retargeting an existing lookup column).
3. Recreate the lookup with target `cr664_loandeal` and
   relationship name matching the existing alias (or update the
   generated TypeScript model to match if the name changes).
4. Republish the solution.

### 8.3 Knock-on tasks

- After retargeting, regenerate the TypeScript models so the
  bind-target metadata is captured at compile time (`pac
  modelbuilder` or its successor).
- Re-run the Phase 121 operator pass to seed `TEST —
  Outstanding Document Phase 121` + `TEST — Pending Review
  Document Phase 121` against `TEST — Deal Phase 121`.
- Re-run §4 validation; the four `honest empty` annotations
  above (§4.2 Open tasks / Outstanding docs / Pending reviews,
  §4.4 Action Queue, §4.5 Due Diligence, §4.7 My Tasks) should
  now light up with the seeded rows. **Note:** the `Open tasks`
  tile + My Tasks rail still depend on the separate AssignedTo
  lookup-config issue surfaced during Phase 121 Step 5 — Phase
  122 fixes the Deal lookup but does not address that bug.
- The legacy `cr664_deal` table (containing the single `Woody
  Woodson` row) can be evaluated for deletion in a follow-on
  phase if no other consumer references it.

### 8.4 What Phase 122 explicitly does NOT do

- Does NOT modify React app code. The bind format `/cr664_loandeals(...)` is correct; the schema is wrong.
- Does NOT modify the cr664_loandeal / banker / borrower schema.
- Does NOT change the email lane.
- Does NOT extend the AssignedTo form/view fix (that is a
  separate Dataverse-config phase if it ever ships).

---

## 9. Cross-references

- [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) — the full reference runbook (filter contracts, design rationale, future-phase candidates).
- [PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md) §3.3 — the row form vs. inline grid pitfall this checklist routes around.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) — the 3 new KPI tiles + stage-grouped pipeline + My Tasks rail validated in §4.2 / §4.3 / §4.7.
- [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — the Activity + Due Diligence tabs + stale badge + workspace switcher validated in §4.6 + the honestly-empty surfaces in §4.4 / §4.5.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants the §5 hard rules protect.
- `src/banker/dealQueries.ts` — `loadBankerPipeline` filter; explains why §3 Step 4 requires the Assigned Banker + statecode + not-terminal-status combination.
- `src/banker/workQueueQueries.ts` — `loadBankerWorkQueueData` two-step loader; the `_cr664_deal_value` filter against `cr664_loandeal` IDs is exactly what the Phase 122 scope is gated on.
- `src/banker/BankerProvider.tsx` — banker resolution by `cr664_email = UPN`; explains why §0's "Matt's banker row" lookup uses the email field.
- `src/deals/documentActions.ts` — production code that assumes `cr664_loandeals(...)` target for `cr664_documentchecklist.cr664_Deal`; Phase 122 makes the live schema match.
- `src/deals/dealTaskActions.ts` — same pattern for `cr664_dealtask1.cr664_Deal`; Phase 122 candidate.
- `src/deals/creditMemoActions.ts` — same pattern for `cr664_creditmemo1.cr664_Deal` and `cr664_creditmemodraftsection.cr664_Deal`; Phase 122 candidates.
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — Dataverse-config phase that retargets the modern operational child-table Deal lookups to `cr664_loandeal`. Explicitly NOT a React phase.

---

## 10. Phase 121 result

**Status:** ✅ **Validated 2026-05-27 by Matt Paller.** Reduced-
scope Phase 121 walk passed in the deployed app. The completion
record below is the canonical evidence; no stop-conditions
fired during validation.

```
Phase 121 result:
Completed with reduced live seed scope.

Created rows:
- TEST — Stage Phase 121
- TEST — Status Phase 121
- TEST — Borrower Phase 121
- TEST — Deal Phase 121

Skipped rows:
- TEST — Task Phase 121
- TEST — Outstanding Document Phase 121
- TEST — Pending Review Document Phase 121

Reason for skip:
Dataverse lookup/config mismatch:
- Deal Task Assigned To lookup cannot resolve valid Matthew
  Paller systemuser (systemuserid e056f0e7-4a13-f111-8406-
  6045bd07ee56) even though the production code at
  src/deals/dealTaskActions.ts:401 correctly binds to
  /systemusers(...). Form / quick-find view config issue,
  separate from Phase 122 scope.
- Document Checklist Deal lookup points at legacy cr664_deal
  (single existing row Woody Woodson) while the app expects
  cr664_loandeal. Production code at
  src/deals/documentActions.ts:131 / :337 / :551 correctly
  binds to /cr664_loandeals(...). Live schema retarget required
  → Phase 122.

Validation:
Restored Banker Workspace validated against the real
cr664_loandeal row (TEST — Deal Phase 121, id
d3d46688-3259-f111-bec7-70a8a59be491). Task / document surfaces
validated as honest empty states pending Phase 122. No fabricated
rows surfaced anywhere. No live communication action triggered
during validation. Closing-soon disclaimer remained visible.

Validated on: 2026-05-27
Validated by: Matt Paller
```

### 10.1 Walk-through report

If validation passed cleanly, the operator reports a single line
back ("Phase 121 walk passed"); the doc gets updated to flip the
stamp and date the record (2026-05-27).

If any stop-condition fired:
- App errors / read-only banner unexpectedly → check
  `BankerProvider` + bootstrap chain status, not this checklist
- Active deals stays 0 → re-verify Step 4's Assigned Banker FK
  points at Matt's banker row (`d7975960-0d59-f111-bec7-70a8a59be491`)
- TEST — Deal Phase 121 missing from Pipeline → check the deal
  row's `cr664_isterminalstatus` (must be unchecked) and
  `statecode` (must be Active)
- Any fabricated operational row appears → stop, capture
  screenshot, this would be a Phase 117–120 architectural
  regression and needs investigation before Phase 122

The §7 troubleshooting table covers the per-symptom diagnoses.
