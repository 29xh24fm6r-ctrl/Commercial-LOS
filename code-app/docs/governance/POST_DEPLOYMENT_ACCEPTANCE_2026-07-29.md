# Post-Deployment Production Acceptance — 2026-07-29

Status: **NO-GO**

This report records the focused, read-only production acceptance retest requested after PR #171. It reports only behavior observed in the deployed Power App or values read from the live Dataverse environment. Source-code behavior and prior automated tests were not used to convert an unperformed production test into a PASS.

## Test identity and boundary

| Item | Recorded value |
|---|---|
| Expected deployed merge | `4b482082b65c743a181f654d4170bc3e1798e516` |
| Repository verification | `origin/master` and local `HEAD` both equal the expected merge; commit is “Merge pull request #171…” |
| Deployed build verification | **PARTIAL** — the app did not expose a build stamp and the Canvas App metadata inspected did not independently bind the running artifact to the Git commit |
| Environment | `https://org3a57b8d4.crm.dynamics.com/` |
| Environment ID | `5f2d77a5-de50-edeb-9d74-5b2400a2320d` |
| App ID | `63858e09-3d0b-47c9-b1d2-65cef742fda4` |
| App | Commercial Lending LOS (Rebuild) |
| App URL | `https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/a/63858e09-3d0b-47c9-b1d2-65cef742fda4` |
| Operator | Matthew Paller, `mpaller@oldglorybank.com` |
| Dataverse user ID | `e056f0e7-4a13-f111-8406-6045bd07ee56` |
| Banker record | `d7975960-0d59-f111-bec7-70a8a59be491` |
| Team | `26aaa63b-645f-f111-a826-70a8a59be491` |
| Test start | `2026-07-29T15:02:27-04:00` |
| Dataverse comparison snapshot | `2026-07-29T15:04:15-04:00` |
| Test end | `2026-07-29T15:21:28-04:00` |
| Browsers | Standard Chrome `150.0.7871.182`; Microsoft Edge `150.0.4078.99` |

The initial Chrome-for-Testing sign-in was rejected by the bank's Conditional Access policy with “You can't get there from here.” The test was restarted in the installed Microsoft Edge browser and successfully authenticated as the named operator. A later browser-automation reconnect failed with `net::ERR_PROXY_CONNECTION_FAILED`; results requiring additional interaction are marked NOT TESTED or PARTIAL, not inferred.

The authorized Dataverse token was held only in the PowerShell process, was never printed or persisted, and was removed after the read-only queries. No production row, configuration, SharePoint object, or app artifact was mutated. No deployment or `pac code push` occurred.

## Result summary

| Lane | Result | Production finding |
|---|---|---|
| 1. Operational deal count reconciliation | **FAIL** | Banker, Team, and Manager reconcile at 16 deals / $7.6M, but the default “operational” set visibly includes controlled TEST and smoke records. Loan Workflow shows all 25, including 9 separately classified test/smoke records. |
| 2. Task count reconciliation | **FAIL** | Badge, list, rail, and Dataverse all reconcile at 6 open tasks, but all 6 belong to a controlled `SYSTEM TEST` deal and inflate the production work queue. |
| 3. Loan Workflow navigation | **PARTIAL** | Both entry points render Loan Workflow immediately with selected-state feedback. The URL does not represent the tab transition, Back/Forward cannot replay it, and the default population is 25 including test/smoke records. |
| 4. Deal Cockpit blocker consistency | **PARTIAL** | For controlled deal `e262b023-5a8b-f111-ab10-70a8a59b1fe2`, the Blockers tile and Attention Console both show 3 blockers and Stage Map remains fail-closed. Post-save recalculation was not tested because no production write was authorized. |
| 5. Risk rating and recommendation enforcement | **NOT TESTED** | Existing final/reviewed facts were readable. The required negative and persistence writes were not performed against production. |
| 6. CRM client population and NAICS | **FAIL** | CRM shows 4 companies; New Deal shows 2. A controlled `OGB Full Workflow Test 07172026` company remains selectable. Exact NAICS is present in Deal CRM Relationship but absent from the inspected CRM company detail. |
| 7. Relationship context consistency | **PARTIAL** | The controlled deal's Relationship Context and CRM Relationship both reported no sibling deal. The required borrower-with-multiple-related-deals comparison was not completed. |
| 8. Document taxonomy and status | **FAIL** | Tax returns appeared once and metadata-only receipt copy was honest. However, Documents says “0 outstanding” and “3 required documents still needed,” while Stage Map still exposes “Generate checklist” despite automatic derivation copy. |
| 9. File-byte persistence | **BLOCKED** | Live Dataverse schema has a real File column and metadata columns, but no approved non-sensitive file was supplied and upload/download/readback was not performed. Actual bytes, authorization, audit, timeline, and storage location remain unproven. |
| 10. Credit memo finalization | **NOT TESTED** | A final memo record was visible, but stored final text was not reopened and inspected before the browser reconnect failure. Draft-language removal, durable final text, and fact consistency remain unproven. |
| 11. Risk chart integrity | **PARTIAL** | Manager percentages are 6% + 69% + 25% + 0% = 100%; Portfolio explicitly shows one Unknown/Unmapped record at 100%. Math passes, but Manager's governed population includes controlled records. |
| 12. Entitlement deduplication | **NOT TESTED** | Admin User & Access Management was not completed in the live UI. No tenant data was changed. |
| 13. Admin copy and truth | **NOT TESTED** | Live Admin certification, activation, readiness, and diagnostic copy was not completed before the browser reconnect failure. |
| 14. Banker transition feedback | **PARTIAL** | Banker tab changes tested during Dashboard, Active Deals, Tasks, and Loan Workflow were immediate and coherent. Repeated testing of every Deal Cockpit tab was not completed. |

## Lane 1 — operational deal count reconciliation

Result: **FAIL**

Classification: deployed behavior and production-data classification.

Live Dataverse and UI comparison:

| Surface | Count | Amount | Scope or observation |
|---|---:|---:|---|
| Banker Dashboard | 16 | $7.6M | Assigned banker default |
| Active Deals | 16 | $7.6M | “Include 9 controlled test records” unchecked |
| Team Workspace | 16 | $7.6M | Same governed result claimed |
| Manager Workspace | 16 | $7.6M | Same governed result claimed |
| Loan Workflow | 25 | not used for reconciliation | Explicitly says it includes 9 test/smoke records |
| Live Dataverse active deals | 25 | — | 16 classified operational plus 9 explicitly excluded by the current classifier |

The 16-row default result visibly contains records named:

- `SYSTEM TEST - FULL E2E - 2026-07-25 - Working Capital`
- `TEST — Deal Phase 121`
- multiple `V1 ... Smoke` records
- `STAGE ADVANCEMENT SMOKE`

The current data/classifier behavior treats an explicit false test flag as authoritative even when the business name is unmistakably controlled. Therefore, numerical reconciliation does not establish a governed production population. The visible default violates the acceptance rule that TEST, QA, smoke, and certification records be excluded unless explicitly opted in.

Observed stage totals for the 16-row default:

| Stage | Count | Amount |
|---|---:|---:|
| Intake | 14 | $4.6M |
| Credit Approval | 1 | $500K |
| `TEST - Stage Phase 121` | 1 | $2.5M |

Evidence: [Banker Dashboard](evidence/post-deployment-2026-07-29/01-banker-dashboard.png), [Active Deals](evidence/post-deployment-2026-07-29/02-active-deals.png), [Team Workspace](evidence/post-deployment-2026-07-29/06-team-workspace.png), [Manager Workspace](evidence/post-deployment-2026-07-29/07-manager-workspace.png), [Loan Workflow](evidence/post-deployment-2026-07-29/04-loan-workflow-top-tab.png).

## Lane 2 — task count reconciliation

Result: **FAIL**

Classification: production-data classification.

The Tasks & Actions badge, My Tasks header, Dashboard rail, visible list, and live Dataverse query all reconcile at 6 open tasks. Overdue is 0 and due today is 0. One task is due `2026-08-15`; five have no due date.

All six tasks belong to controlled deal `e262b023-5a8b-f111-ab10-70a8a59b1fe2`, so the correct arithmetic still produces an incorrect operational work queue.

Task IDs:

- `9f79dadc-5a8b-f111-ab10-70a8a59b1fe2`
- `71f1f56c-5c8b-f111-ab10-70a8a59b1fe2`
- `74f1f56c-5c8b-f111-ab10-70a8a59b1fe2`
- `3efa24cd-5f8b-f111-ab10-70a8a59b1fe2`
- `41fa24cd-5f8b-f111-ab10-70a8a59b1fe2`
- `44fa24cd-5f8b-f111-ab10-70a8a59b1fe2`

The Deal Cockpit shows stable short reference `#e262b023`. Stable-reference consistency across every task surface was not fully proven.

Evidence: [Tasks & Actions](evidence/post-deployment-2026-07-29/03-tasks-actions.png), [Deal Cockpit](evidence/post-deployment-2026-07-29/15-deal-cockpit-overview.png).

## Lane 3 — Loan Workflow navigation

Result: **PARTIAL**

Classification: deployed behavior.

Both the top Loan Workflow tab and left-navigation item immediately selected and rendered Loan Workflow content; no dead click or stale prior panel was observed. The application URL did not change, so browser Back/Forward could not represent the navigation. The displayed default population was 25 and explicitly included 9 test/smoke records, unlike the other banker workspaces.

Evidence: [top-tab entry](evidence/post-deployment-2026-07-29/04-loan-workflow-top-tab.png), [left-navigation entry](evidence/post-deployment-2026-07-29/05-loan-workflow-left-nav.png).

## Lanes 4 and 5 — blockers, risk, and recommendation

Lane 4 result: **PARTIAL**

Lane 5 result: **NOT TESTED**

Classification: certification-required writes.

Controlled deal:

- ID: `e262b023-5a8b-f111-ab10-70a8a59b1fe2`
- Short reference: `#e262b023`
- Name: `SYSTEM TEST - FULL E2E - 2026-07-25 - Working Capital`
- Stage: Credit Approval
- Status: Open
- Amount: $500,000
- Target close: `2026-09-12`

The top tile showed 3 blockers. Attention Console showed the same 3 blocked requirements:

1. approval decision recorded;
2. authorized approver or committee approval;
3. conditions documented.

The memo-staleness item was separately at risk, not counted as blocked. Stage Map kept “Advance to Commitment” disabled. Existing risk rating and recommendation were valid/reviewed and did not appear as blockers.

No save was performed. The requested incomplete/final negative-write matrix, actor/timestamp/deal-link enforcement, refresh/reopen persistence, and live blocker recalculation after save therefore remain unproven.

Evidence: [Deal overview](evidence/post-deployment-2026-07-29/15-deal-cockpit-overview.png), [Attention Console and Stage Map](evidence/post-deployment-2026-07-29/16-deal-attention-stage-map.png).

## Lane 6 — CRM population and NAICS

Result: **FAIL**

Classification: deployed behavior and production-data classification.

CRM Home reported 4 companies:

- `OGB Full Workflow Test 07172026`
- `SYSTEM TEST - 2026-07-17 - Acme Test Borrower LLC`
- `SYSTEM TEST - FULL E2E - 2026-07-25 - Borrower`
- `OmniCare 365`

New Deal offered 2:

- `OGB Full Workflow Test 07172026`
- `OmniCare 365`

The new control excludes some known test clients, but a clearly controlled workflow-test company remains in the operational picker, and the CRM count does not reconcile with the picker.

For the inspected Acme test company, CRM company detail displayed only the broad sector “Accommodation and Food Services.” On the controlled deal, CRM Relationship correctly displayed:

`CRM-derived · NAICS 722511 · Accommodation and Food Services → Other (up to date)`

That Deal Cockpit text properly distinguishes the exact CRM-derived fact from the coarse reporting category. The inspected CRM company-detail surface did not preserve the same exact presentation, and the credit memo was not inspected.

Evidence: [CRM Home](evidence/post-deployment-2026-07-29/11-crm-home.png), [New Deal picker](evidence/post-deployment-2026-07-29/12-new-deal-client-picker.png), [CRM companies](evidence/post-deployment-2026-07-29/13-crm-companies-naics.png), [CRM company detail](evidence/post-deployment-2026-07-29/14-crm-company-detail-naics.png), [Deal Cockpit](evidence/post-deployment-2026-07-29/15-deal-cockpit-overview.png).

## Lane 7 — relationship context

Result: **PARTIAL**

Classification: incomplete certification coverage.

On controlled deal `e262b023-5a8b-f111-ab10-70a8a59b1fe2`, Relationship Context and CRM Relationship both reported no other visible deals. No contradiction was observed on that record. The specification requires a borrower with multiple related deals; that scenario was not completed, so sibling population and exposure reconciliation are not certified.

## Lane 8 — document taxonomy and status

Result: **FAIL**

Classification: deployed copy and state presentation.

The controlled deal showed 8 document requirements. “Tax returns” appeared once, so the old duplicate taxonomy was not visible. The receipt action was honestly labeled “Record receipt without file.”

Conflicts remain:

- the Documents summary reported 0 outstanding and 1 received / 5 reviewed;
- the same panel stated “3 required documents still needed to advance”;
- Stage Map still presented “Generate checklist,” while the requirements copy described automatic synchronization and no manual generation step.

The result is not sufficiently consistent for operators to understand whether work is complete or still blocks advancement.

Evidence: [Deal overview](evidence/post-deployment-2026-07-29/15-deal-cockpit-overview.png), [Stage Map](evidence/post-deployment-2026-07-29/16-deal-attention-stage-map.png).

## Lane 9 — file-byte persistence

Result: **BLOCKED**

Classification: operator-certification-required.

Read-only schema inspection passed 6/6 expected upload columns:

- `cr664_documentfile` — File
- filename — String
- MIME type — String
- size — Integer
- uploaded on — DateTime
- uploaded by — Lookup

This establishes a Dataverse File target, not durable byte persistence. No approved non-sensitive file was provided, and the required upload, refresh, reopen, download/readback, byte comparison, authorization, audit, timeline, requirement-status, and blocker checks were not performed.

No SharePoint storage claim is made. Real SharePoint file storage is not proven, and the inspected schema points to Dataverse File for this path.

## Lane 10 — credit memo finalization

Result: **NOT TESTED**

Classification: incomplete certification coverage.

The controlled deal displayed Memo Final, one memo, and 15 sections, while Attention Console reported that the memo may be stale. The stored final text was not opened before the Edge automation reconnect failed. Final-text cleanup, persistence, risk/recommendation consistency, and non-rewrite behavior are not certified.

## Lane 11 — risk chart integrity

Result: **PARTIAL**

Classification: deployed chart behavior plus governed-population defect.

Manager:

| Segment | Count | Percentage |
|---|---:|---:|
| Blocked | 1 | 6% |
| At risk | 11 | 69% |
| Clear | 4 | 25% |
| Unknown | 0 | 0% |

The displayed percentages total exactly 100%, and the zero segment remains 0%. However, the 16-record total includes controlled test/smoke records.

Portfolio contained one boarded loan for $43,000 and explicitly showed Unknown/Unmapped at 100%. Its math and unknown labeling were honest for that population.

Evidence: [Manager risk](evidence/post-deployment-2026-07-29/08-manager-risk-chart.png), [Portfolio](evidence/post-deployment-2026-07-29/09-portfolio-workspace.png), [Portfolio risk](evidence/post-deployment-2026-07-29/10-portfolio-risk-chart.png).

## Lanes 12 and 13 — Admin

Results: **NOT TESTED**

Classification: incomplete certification coverage.

The live Admin User & Access Management, Final Operating Certification, Full System Activation, New Deal readiness, document checklist readiness, CRM readiness, and Microsoft 365 diagnostics were not completed before the managed browser reconnect failed. No PASS is inferred from source or automated tests, and no entitlement rows were changed or removed.

## Lane 14 — transition feedback

Result: **PARTIAL**

Classification: incomplete certification coverage.

Dashboard, Active Deals, Tasks & Actions, and both Loan Workflow entry points produced immediate selected content without a silent no-op. Repeated transitions across every Deal Cockpit tab, including duplicate-click behavior, were not completed.

## Live schema and source availability observations

Read-only Dataverse checks also found:

- Deal stage sequence: 7 active stages with 7 unique sequence values; stage-type metadata was missing or unknown.
- Banker authority: approval limit $1,000,000; committee authority true; override false.
- Stage/status lookups and amount fields: available.
- CRM spine: 5/5 expected live objects available.
- Portfolio schema: 13/13 expected live objects available.
- Risk-rating inputs, underwriting recommendation, CRM industry projection, and credit-memo long text: available.
- Permission-group and role-permission-group reads: unknown.

These observations establish availability only. They do not substitute for the write, authorization, lifecycle, or multi-user tests required by the specification.

## Overall acceptance conclusion

The deployed app is reachable in managed Edge and several remediated surfaces behave coherently, but production acceptance is **NO-GO**. Controlled records remain in operational deal and task populations; the CRM/New Deal population and document messaging do not reconcile; actual file bytes, final memo text, Admin truth, write enforcement, and multi-user controls are not certified.

Spec 2 was not started. Independent multi-user lifecycle and segregation-of-duties certification requires distinct live users and remains a separate prerequisite.
