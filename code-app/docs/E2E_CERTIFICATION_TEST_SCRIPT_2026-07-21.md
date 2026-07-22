# OGB Commercial LOS — Full End-to-End Certification Test Script (2026-07-21)

**Purpose.** A step-by-step script a banker (or operator, for admin-only steps) can execute in the **live** Power Apps environment to certify one commercial loan's full path: CRM relationship → intake → underwriting → credit approval → commitment → documentation → closing & funding → boarded → ongoing monitoring.

**Why this has to be run live, by a human.** This app is a Power Apps Code App: every screen reads/writes real Dataverse tables through the generated SDK (`src/generated/services/*Service.ts`), and the repo's own engineering rule is "no sample/fake/demo data" (`src/admin/releaseGovernanceSnapshot.ts`). There is no mock/demo mode (confirmed by code inspection — see Companion Findings §0). A sandboxed code-review session cannot click through live screens or create live Dataverse records; only a signed-in operator/banker in the real environment can execute this script. This document, plus the code-level audit and automated test suite (`npx tsc -b && npx vitest run && npm run build`, all green as of this pass), together make up the full certification: **code correctness is machine-verified; live click-through is human-verified using this script.**

**Roles needed:** one Banker with normal approval limits, one Banker/Manager with credit-committee/override authority (to test the approval-authority gate both ways), one Manager, one Executive, one Admin/Operator.

**For every step below, verify the five-part contract:** ① what's done, ② what's blocked, ③ why, ④ what action is required next, ⑤ where to take it. Any step where the screen doesn't answer all five is a defect — record it as: stage · exact repro steps · expected · actual · screenshot · which of the five was missing.

---

## Stage 0 — CRM relationship (banker)

1. Sign in as Banker. Land on `/workspaces/banker`.
2. Open the **CRM Hub** tab inside the Banker workspace (`BankerShell` → CRM Hub tab).
3. Companies list should load real `cr664_crmorganizations` rows. Search for an existing test company; if none exists, create one via **Add Company** (governed live write — verify a success toast, the row appears in the list, and a `cr664_crmauditentries` row would be created for it).
4. Click the company row → its detail drawer opens → scroll to **Linked Deals**.
   - **Expected:** any loan deal whose Client lookup points at a `cr664_clientrelationship` tied to this organization appears here (this is a two-hop resolve: organization → client relationship → loan deal, not a direct organization-id match).
   - **Record a defect if:** a deal you know is linked to this company does NOT appear (check whether its Client lookup actually targets a client-relationship record, not the organization directly, before filing — that distinction is by design).

## Stage 1 — New Deal intake (banker)

1. From the Banker workspace, click **New Deal**.
2. **Step 1 — CRM Client:** search and select the company/relationship from Stage 0. (A client is required by default; there should be no path to submit a deal with a fabricated/no client unless an admin has explicitly flipped `NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT`.)
3. **Step 2 — Owning Team:** optional; select if applicable.
4. **Step 3 — Deal Details:** enter Deal name (required), amount, product type, loan structure, target close date, industry, customer type.
5. Submit.
   - **Expected:** a real `cr664_loandeals` record is created; you land on `/deals/<new-id>`; the deal shows stage **Intake**.
   - **Record a defect if:** submit succeeds with no visible confirmation of what was created or where to find it next, or if a required identity field silently fails to save.

## Stage 2 — Document checklist & upload (banker)

1. On the deal page, look for a way to generate a document checklist.
   - **Known state (not a new bug — confirm it's still true and still clearly explained):** as of this pass, `DOCUMENT_CHECKLIST_GENERATION_ENABLED` is off and there is **no "Generate checklist" button anywhere in the UI** — the requirement list is derived automatically from deal attributes instead. Confirm the screen doesn't leave you hunting for a button that doesn't exist; if there's no explanatory copy at all, record it as a defect (missing "why/next action" for this specific capability).
2. Attempt to upload a document against a required-document row.
   - **Known state to verify live:** file upload is gated on a Dataverse schema column (`cr664_documentfile`) an operator must add; if it hasn't been added yet, the screen should say so plainly (not just fail silently or show a dead control). Record the exact message you see.
3. Use **Request Document** on a required item (`RequestDocumentModal`). Confirm: a request is recorded, and the item's status changes to reflect "requested."
4. Mark a document **Received**.
   - **Verify:** a received date appears.
   - **Known gap to confirm still present:** the received-by person's name may NOT be shown next to the date (only who reviewed it is shown by name). If so this is an already-tracked defect (D8) — confirm whether this pass's fix (see Remediation Log) has landed by the time you run this.
5. Mark a document **Reviewed**.
   - **Verify:** reviewer name + review date both appear.

## Stage 3 — Underwriting / financial review (banker)

1. Upload/attach business financial statements, tax returns, ownership information, collateral support (the four Underwriting-stage required documents).
2. Look for a financial-spread or ratio-calculation screen (DSCR, leverage, global cash flow) at the deal level.
   - **Known gap:** no such screen exists pre-boarding today — derived ratio calculations (DSCR, leverage, current ratio) only exist post-boarding, in Portfolio Monitoring (Stage 9 below), not during underwriting. This is a real functional gap for a commercial underwriter and should be reported as such in the certification (see Defect Register D15) rather than assumed to be "somewhere I haven't found."
3. Attempt to advance the deal from **Intake → Underwriting**.
   - **Verify** the Stage Map / `DealStageProgressionCard` blocks the advance if a required field/document is missing, and that the blocked message names the specific missing item, explains why, and gives a direct action/link (e.g., "Add document" button, or a scroll-to link) — not just the word "blocked."

## Stage 4 — Credit memo & credit approval (banker → committee-authorized banker)

1. Open **Credit Memo** on the deal. Fill in the sections (Executive Summary, Loan Request, Collateral, Guarantor Support, Pricing/Structure, Due Diligence, Open Tasks, Risks, Recommended Next Steps). **Save Draft.**
   - **Verify:** a success confirmation; re-open the deal and confirm the draft persisted (this is a real Dataverse write, not local-only).
   - **Known state:** there is no "finalize/approve the memo" action — memo status stays Draft forever; committee "reviewed/approved" facts are not independently verifiable by the system (D3). Confirm this is still true, and confirm the UI does not claim otherwise.
2. As the **normal-limit** banker (not committee/override-authorized), attempt to advance **Credit Approval → Commitment**.
   - **Expected:** blocked, with a message naming the authority gap (insufficient approval limit / not a committee member), not a generic "blocked."
3. As the **committee/override-authorized** banker or manager, retry the same advance.
   - **Expected:** succeeds; a `StageChange` audit event is recorded with the acting user's identity and a correlation id (check via Admin → audit, if available to your role, or ask an admin to confirm the audit row exists).

## Stage 5 — Commitment → Documentation → Closing & Funding (banker)

1. Advance **Commitment → Documentation**: requires a Commitment Letter document on file; confirm the blocked-state message is specific if missing.
2. Advance **Documentation → Closing & Funding**: requires Loan Agreement + Insurance Evidence documents, and "conditions precedent resolved."
   - **Known imprecision to verify:** the "conditions precedent" and "post-close exceptions" blockers are today derived from whatever document/task happens to be missing for the stage, not from a real, independently tracked condition record — so the reason text may reference "conditions precedent" even when the true gap is an unrelated missing document. Check whether the message you see overstates precision it can't back up; if the message names a wrong-sounding cause, record it (D13).
3. Advance **Closing & Funding → Boarded**: requires the Booking Package document.
   - **Expected:** on success, a real `cr664_portfolioboardedloans` record is created automatically (not just a stage-string flip) — confirm via the deal's **Portfolio Boarding Status** panel, which should show a "Boarded" reconciled status backed by that record, not merely echo the stage name.

## Stage 6 — Manager & Executive visibility (manager, executive)

1. Sign in as Manager → `/workspaces/manager`. Find the same deal in the pipeline / work queue.
   - **Verify:** the blocker/at-risk reason shown for this deal (if any) matches, in substance, what the banker saw — not a generic "blocked status" placeholder.
   - Confirm pipeline counts/exposure include this deal correctly at its current stage.
2. Sign in as Executive → `/workspaces/executive`. Confirm the same deal's stage/amount is reflected in the pipeline-by-stage and closing-forecast views.
   - **Known disclosed risk:** two of the five executive cards (Pipeline by Stage, Monthly Closing Forecast) use a separately-computed "Transitional" fallback and may drift slightly from Manager/Banker numbers — confirm the "Transitional" badge is visibly present on those cards (it is the honesty control for this known gap); if the badge is missing or the numbers are wildly wrong (not just slightly stale), record a defect.

## Stage 7 — Portfolio monitoring & exception management (manager/portfolio role)

1. Open **Portfolio Command Center** (Manager workspace with the "Portfolio Management" name, or `/surfaces/...` per your role).
2. Check **Exception Queue** and **Covenant Review** panels for the newly boarded loan and the rest of the book.
   - **Known gap to verify:** as of this pass, the Exception Queue and covenant breach/at-risk counts may be hardcoded to empty/zero regardless of real data — confirm whether this pass's fix (Remediation Log) has landed; if not, the panel should now say "not available" rather than imply "confirmed clean." If it still silently shows a clean board with no such distinction, record it as an open defect.
3. Check **Watchlist** and **Early Warning** panels reflect real boarded-loan data (not blank/placeholder) for at-risk loans.

## Stage 8 — Admin/audit checks (admin/operator)

1. As Admin, confirm the audit trail for this deal (stage changes, credit memo saves, document actions) shows real actor identities and timestamps, not "unknown."
2. Confirm workspace access boundaries: attempt to reach `/workspaces/admin` as a non-admin banker — should redirect immediately with no flash of admin content.
3. Confirm entitlement grant/revoke (if your role has it) works via **Admin → Access Grant** and is a real, audited write (readback-verified, not silently accepted).

---

## Recording defects

For every failure found while running this script, capture:
`stage` · `exact reproduction steps` · `expected behavior` · `actual behavior` · `severity (P0/P1/P2)` · `business impact` · `likely root cause` (if apparent) · `recommended fix`, and route it back to engineering using this same format so it lands in the certification defect register, not a one-off ticket.

**P0** = deal cannot proceed / data doesn't persist / a calculation is wrong / approval or audit is unreliable.
**P1** = workflow is confusing, information is inconsistent, dashboards don't reconcile, or a required action is hard to find.
**P2** = polish, wording, non-blocking usability.
