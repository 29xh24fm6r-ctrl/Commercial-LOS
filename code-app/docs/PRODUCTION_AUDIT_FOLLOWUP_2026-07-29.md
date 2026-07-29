# Production Audit Follow-up — 2026-07-29

## Scope and safety boundary

This follow-up remediates code-level findings confirmed by the 2026-07-29 production audit. It is
based on audit-remediation commit `defd9d8` and is implemented on
`remediation/production-audit-followup-2026-07-29`.

No deployment, `pac code push`, Dataverse mutation, SharePoint mutation, or production data cleanup
was performed. `.env.production` and unrelated/untracked files were excluded from this work.

## Fixed in code

- Banker dashboard, work queue, and Personal Pipeline now use the governed operational-deal
  population by default. Personal Pipeline retains an explicit opt-in to show labeled controlled
  test records without deleting or hiding them from authorized investigation.
- New Deal excludes controlled TEST/QA clients from the operational picker, reconciling its banker
  population with production CRM counts while preserving those records in CRM/admin workflows.
- Deal blocker totals now receive the persisted risk-rating and underwriting-recommendation facts
  used by the attention surface, removing the contradictory blocker counts.
- Relationship detail discovery includes controlled records when resolving siblings, matching the
  CRM relationship card for the selected deal.
- Exact duplicate entitlement rows are deduplicated by their composite logical identity.
- Risk-distribution donut percentages use deterministic largest-remainder allocation and total
  exactly 100 percent for non-empty data.
- `Tax returns` and `Business Tax Returns` normalize to the same governed document category.
- Credit-memo finalization writes the finalized memo text and finalized status atomically, so a
  persisted final memo no longer retains draft labels.
- NAICS displays the exact CRM classification separately from the coarser deal reporting category.
- Underwriting status grammar now correctly renders “an assigned rating”.
- Banker tab changes expose immediate navigation feedback instead of appearing inert during a
  transition.
- Admin activation and New Deal intake surfaces move raw capability flags and technical evidence
  behind clearly labeled disclosure controls.
- Document UI no longer represents a metadata-only receipt action as a file upload, and automatic
  requirement derivation is no longer described as requiring an obsolete manual generation step.

## Partially fixed / deployment-dependent

- The governed Dataverse checklist-file upload path exists for an existing requirement row, but
  production storage of real file bytes has not been independently re-certified in this follow-up.
  Missing-row creation remains explicitly metadata-only.
- Loan Workflow navigation and source implementation are present and tested. The production symptom
  still requires deployment of the remediated artifact followed by browser certification.
- Final credit memos remain immutable by design. If source deal facts change after finalization, the
  correct behavior is to identify the memo as stale and require governed re-finalization, not to
  silently rewrite an approved artifact.

## Tenant-blocked

- Real SharePoint file storage is not implemented or proven by this change. It requires a governed
  SharePoint site/library, connector and permission design, environment binding, retention policy,
  and tenant-side certification. The UI must not claim SharePoint persistence until that exists.

## Operator certification required

- Deploy the reviewed artifact through the authorized release process and repeat the production
  audit scenarios.
- Prove file-byte upload, readback, authorization, download, and retention against the intended
  production storage target.
- Complete independent multi-user lifecycle certification for banker, underwriter, approver,
  closer/funder, manager, and administrator roles, including segregation-of-duties and concurrent
  update behavior.
- Certify approval, commitment, closing, funding, and post-close transitions with separate users and
  durable audit evidence.
- Reconcile or govern existing tenant data anomalies (including duplicate entitlements and
  controlled test records); this code change intentionally does not mutate tenant data.

## Verification

- Changed-surface Vitest run: **271 passing tests across 16 test files**.
- TypeScript project build: **passed** (`tsc -b`).
- Production Vite build: **passed**.
- Build emitted existing bundle-size and ineffective-dynamic-import warnings; neither failed the
  production build.
- The repository-wide test run is not claimed here. The prior full run exceeded ten minutes and was
  not completed; this follow-up used bounded changed-surface verification.
