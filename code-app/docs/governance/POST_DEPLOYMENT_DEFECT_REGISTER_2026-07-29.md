# Post-Deployment Defect Register — 2026-07-29

Status: **OPEN — RELEASE ACCEPTANCE BLOCKED**

This register is derived from the live post-deployment acceptance run. No production data was cleaned or modified during diagnosis.

| ID | Severity | State | Category | Finding | Required disposition |
|---|---|---|---|---|---|
| PDA-001 | P0 | Open | Data / classifier / deployed behavior | The default 16-deal “operational” population visibly includes `SYSTEM TEST`, `TEST`, and smoke records. An explicit false test flag overrides unmistakable controlled-record naming. | Establish one governed production-record predicate, repair or quarantine misclassified controlled records, and retest Banker, Active Deals, Team, Manager, and Loan Workflow against the same default scope. |
| PDA-002 | P0 | Open | Data / classifier | All 6 open tasks shown in banker production queues belong to controlled deal `e262b023-5a8b-f111-ab10-70a8a59b1fe2`. | Exclude tasks through the governed parent-deal population by default; provide explicit authorized opt-in for investigation; retest badge/list/date/reference reconciliation. |
| PDA-003 | P1 | Open | Navigation / scope | Loan Workflow renders from both entry points but defaults to all 25 deals, including 9 test/smoke records, while other surfaces claim an operational 16. The URL does not encode the tab transition, so Back/Forward cannot replay it. | Align default scope and implement or explicitly document coherent history semantics. |
| PDA-004 | P1 | Open | CRM / client governance | CRM reports 4 companies while New Deal offers 2, and controlled company `OGB Full Workflow Test 07172026` remains selectable. | Apply the same governed operational-client rule to CRM counts and New Deal selection, or label intentionally different scopes in business language. |
| PDA-005 | P1 | Open | CRM / classification presentation | Deal CRM Relationship shows exact `NAICS 722511` and the coarse `Other` category separately, but the inspected CRM company detail shows only the broad sector. | Preserve and display exact code/title on every authoritative company/detail/reporting surface and keep coarse reporting category visibly separate. |
| PDA-006 | P1 | Open | Documents / operator truth | One deal simultaneously shows “0 outstanding,” “3 required documents still needed,” and a Stage Map “Generate checklist” action despite automatic-derivation copy. | Normalize status vocabulary/count derivation and remove or explain the obsolete manual-generation action. Retest blockers, requirements, documents, stage map, and timeline together. |
| PDA-007 | P0 | Certification blocker | File persistence | A Dataverse File column exists, but actual upload, refresh, reopen, readback, integrity, authorization, audit, and timeline behavior were not proven. | Run the controlled non-sensitive file test end to end. Do not claim SharePoint unless the retrieved file is proven to reside there. |
| PDA-008 | P0 | Certification blocker | Credit memo | A memo is labeled final, but stored final text and stale-state behavior were not inspected. | Reopen the final artifact; prove draft language is absent, stored text/status agree, facts persist, and finalized content is not silently rewritten. |
| PDA-009 | P1 | Open | Release provenance | The running app exposes no build/version identifier that binds it to merge `4b48208`. Repository state is correct, but the deployed artifact cannot be independently attributed from the UI/metadata checked. | Add an immutable release/build identifier to the app and deployment evidence. |
| PDA-010 | P0 | Certification blocker | Admin / access truth | Live entitlement deduplication and Admin activation/readiness copy were not completed after the browser session reconnect failed. | Complete live read-only Admin inspection and prove logical deduplication and truthful state language. |
| PDA-011 | P0 | Certification blocker | Write enforcement | Risk-rating and recommendation negative/final write enforcement and post-save blocker recalculation were not exercised in production. | Run controlled writes with approved records and capture rejection/persistence evidence. |
| PDA-012 | P0 | Certification blocker | Segregation of duties | Independent requester, approver, funding authorizer, and boarding identities were not available or used. | Execute Spec 2 separately with distinct live users; do not simulate identities or use a token as a substitute. |
| PDA-013 | P1 | Open | Browser / Conditional Access | Chrome for Testing is denied by Conditional Access; managed Edge works. A later Edge automation reconnect failed with `net::ERR_PROXY_CONNECTION_FAILED`. | Use an approved managed Edge testing route and document the supported operator/browser path. |

## Evidence map

- PDA-001: [Banker Dashboard](evidence/post-deployment-2026-07-29/01-banker-dashboard.png), [Active Deals](evidence/post-deployment-2026-07-29/02-active-deals.png), [Team](evidence/post-deployment-2026-07-29/06-team-workspace.png), [Manager](evidence/post-deployment-2026-07-29/07-manager-workspace.png)
- PDA-002: [Tasks & Actions](evidence/post-deployment-2026-07-29/03-tasks-actions.png), [controlled Deal Cockpit](evidence/post-deployment-2026-07-29/15-deal-cockpit-overview.png)
- PDA-003: [top-tab Loan Workflow](evidence/post-deployment-2026-07-29/04-loan-workflow-top-tab.png), [left-nav Loan Workflow](evidence/post-deployment-2026-07-29/05-loan-workflow-left-nav.png)
- PDA-004 and PDA-005: [CRM Home](evidence/post-deployment-2026-07-29/11-crm-home.png), [New Deal picker](evidence/post-deployment-2026-07-29/12-new-deal-client-picker.png), [CRM company detail](evidence/post-deployment-2026-07-29/14-crm-company-detail-naics.png)
- PDA-006 through PDA-008: [Deal Cockpit](evidence/post-deployment-2026-07-29/15-deal-cockpit-overview.png), [Attention Console and Stage Map](evidence/post-deployment-2026-07-29/16-deal-attention-stage-map.png)

## Retest exit criteria

The register is not cleared until:

1. controlled deal and task records are excluded from every operational default;
2. same-scope counts and dollars reconcile across Banker, Team, Manager, Loan Workflow, CRM, and New Deal;
3. document status and checklist copy are unambiguous;
4. real file bytes are uploaded and read back with durable audit evidence;
5. final memo text is inspected and durable;
6. Admin access/readiness truth is inspected live;
7. controlled write-enforcement tests pass; and
8. the separate multi-user certification is completed with distinct authorized people.
