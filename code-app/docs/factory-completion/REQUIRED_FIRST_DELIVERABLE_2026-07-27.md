# OGB Commercial LOS — Factory Required First Deliverable

**Date:** 2026-07-27 · **HEAD:** `12e1b328df641d412d5f30042083a985cb01b2ce` (branch `master`, clean tree)
**Scope:** Source-only reconciliation of the entire existing planning corpus (300+ docs) against
current HEAD, produced by 5 parallel research passes plus direct verification, before any
implementation begins per the mission's own "do not begin implementation until this map is
complete" rule.

**Method note:** this repo already contains an extensive, mature self-audit history
(`docs/final-completion/*`, `docs/production-remediation/*`, `docs/remediation/*`,
`docs/factory-arc/*`, `docs/governance/*`, 300+ files total). This deliverable does not re-derive
that work from scratch — it reconciles it against current source, resolves drift, and fills the
gaps the mission's 14-item list requires that no single existing doc covers.

**Operator-confirmed fact governing this document:** the six final-arc Dataverse tables
(`cr664_creditapprovaldecision`, `cr664_commitmentrecord`, `cr664_conditionverification`,
`cr664_executeddocattestation`, `cr664_bookingqccheck`, `cr664_adverseactionrecord`) were
genuinely registered via a live `pac code add-data-source` run, per the operator's direct
confirmation this session. This overrides the source-only evidence below (§4), which — considered
in isolation — would suggest otherwise (unchanged "not applied" disclosure headers in 5 of 6 store
files, an empty local `dataSourcesInfo.ts` fallback, no `src/Entities/` spec for any of the six
tables). That source-only evidence is preserved below because the **documentation trail itself is
stale regardless of which way the underlying fact resolves** — the operator action in §12 is to
bring it into agreement with reality.

---

## 1. Full current-state lifecycle map

### 1.1 The requested 15-name lifecycle does not exist as a literal coded vocabulary

The mission's lifecycle — `CRM → Deal Creation → Intake → Document Collection → Financial
Analysis → Underwriting → Credit Memo → Approval → Commitment → Conditions → Closing → Funding →
Boarding → Portfolio → Servicing` — does not match any of the three stage vocabularies that exist
in source. The **real, live, gated** canonical spine is seven stage codes
(`src/workflow/stageOrderingContract.ts:16-24`): `INTAKE, UNDERWRITING, CREDIT_APPROVAL,
COMMITMENT, DOCUMENTATION, CLOSING_FUNDING, BOARDED`. Honest mapping:

| Requested name | Maps to | Note |
|---|---|---|
| CRM | *no gated scope* | Precedes deal existence entirely |
| Deal Creation | *no gated scope* | Precondition of INTAKE, not itself gated |
| Intake | `INTAKE` | Exact |
| Document Collection | folded into `UNDERWRITING` | |
| Financial Analysis | folded into `UNDERWRITING` | |
| Underwriting | `UNDERWRITING` | Exact |
| Credit Memo | folded into `CREDIT_APPROVAL` | |
| Approval | folded into `CREDIT_APPROVAL` | |
| Commitment | `COMMITMENT` | Exact |
| Conditions | folded into `DOCUMENTATION` | |
| Closing | folded into `CLOSING_FUNDING` | |
| Funding | folded into `CLOSING_FUNDING` | |
| Boarding | `BOARDED` | label is literally "Boarded / Servicing" |
| Portfolio | *no gated scope* | Separate domain (`src/portfolio/*`), deal-gate-unrouted |
| Servicing | folded into `BOARDED` | one servicing-adjacent requirement (`servicing_owner`) |

A separate, 12-stage `stageCatalog.ts` vocabulary exists but is explicitly frozen/governance-only,
consumed only by `platformInventory.ts` and `stageProgressionGuard.ts` — it gates nothing. A third,
11-stage vocabulary (`LoanWorkflowCommandCenter.tsx`) is formally retired and unmounted
(`src/navigation/intentionallyUnrouted.ts:376`). **`docs/CANONICAL_SOURCES.md` still points readers
at the wrong file** (`stageCatalog.ts`) for "stage identity, ordering" — see §3.1.

### 1.2 Per-stage table (the 7 real, gated scopes)

"REAL" = evaluator reads a durable, deal-scoped Dataverse record. "DERIVED-FROM-DEAL" = read
directly off the deal's own persisted field. "SHALLOW/LEGACY" = presence/substring match, not a
typed status.

| Stage | Entry criteria | Exit requirements (tracked, blocking unless noted) | Authorized actions | Next | Return paths | Downstream effect |
|---|---|---|---|---|---|---|
| **INTAKE** (seq 10) | Banker opens an active deal | Fields/document("loan application")/tasks — all SHALLOW | ADVANCE (any resolvable banker); RETURN unavailable (no priors) | UNDERWRITING | none | seeds UNDERWRITING tasks |
| **UNDERWRITING** (20) | Package initiated | Fields/docs SHALLOW; `risk_rating` & `uw_recommendation` — **DERIVED-FROM-DEAL/real** (`cr664_riskratinginputs`/`cr664_underwritingrecommendationinputs`) | ADVANCE, RETURN (→INTAKE), DECLINE/WITHDRAW | CREDIT_APPROVAL | INTAKE | none special |
| **CREDIT_APPROVAL** (30) | Underwriting complete | `memo_finalized` — real (`cr664_creditmemo1.cr664_status`); `approval_decision`/`approval_authority`/`approval_conditions` — **REAL** (`cr664_creditapprovaldecisions`) | ADVANCE requires genuine authority check (`evaluateCreditApprovalAuthority`: committee-member+within-limit OR override, self-approval blocked when both ids known) | COMMITMENT | INTAKE, UNDERWRITING | none special |
| **COMMITMENT** (40) | Approval granted | `commitment_issued`/`borrower_acceptance` — **REAL** (`cr664_commitmentrecords`) | ADVANCE (identity only), RETURN/DECLINE/WITHDRAW | DOCUMENTATION | any prior | none special |
| **DOCUMENTATION** (50) | Commitment accepted | `conditions_precedent`/`collateral_verified`/`insurance_verified` — **REAL** (`cr664_conditionverifications`) | same | CLOSING_FUNDING | any prior | none special |
| **CLOSING_FUNDING** (60) | Docs complete | `executed_docs` — REAL; `funds_disbursed` — REAL (reads `fundingAuthorization.authorizationStatus==='FUNDED'`, itself gated by 3 hardcoded-false flags, see §2.f); `booking_qc` — REAL | same | BOARDED | any prior | none special |
| **BOARDED** (70, terminal) | Loan booked | `boarded_loan_record`/`servicing_owner` — **REAL**, cross-reconciles stage-claim vs. actual handoff row | none (terminal status) | — | — | **auto-fires** real, unconditional `onDealBoarded` write (creates `cr664_portfolioboardedloans` row, no feature flag) |

Non-forward actions (RETURN/DECLINE/WITHDRAW) apply uniformly across all stages via the same
shared evaluator (`canonicalStageTransition.ts`) — `RETURN:authorization` is the one deliberately
untracked requirement (ratified governance decision, not a gap); `DECLINE:adverse_action` is REAL
(`cr664_adverseactionrecord`).

### 1.3 Confirmed live divergence: Attention Console vs. Advance button

**Not a "different engine" bug (that was already fixed) — a fact-supply bug.** Both the Attention
Console (`DealBlockers.tsx`) and the Advance button/write-guard now call the *same* function,
`deriveStageExitReadiness`/`evaluateStageExitPolicy`
(`src/workflow/loanWorkflowRequirementEngine.ts`). But `DealBlockers.tsx:49,63-69` builds its facts
object from only `{ deal, tasks, documents, creditMemo, fundingAuthorization }` — it never loads or
forwards `creditApprovalDecisions, commitments, conditionVerifications,
executedDocumentAttestations, bookingQcChecks, boardingHandoff`, or the derived risk-rating/UW-
recommendation facts, even though `DealDataProvider.tsx` already supplies all of them and
`DealStageProgressionCard.tsx` already uses the full set. Every deep evaluator fails closed on
`undefined`, and every one of these is `severity: 'blocking'` — so **the Attention Console
permanently over-reports "blocked" for every stage past Intake**, regardless of whether the real
record satisfies the requirement. This is a false-positive generator, the opposite direction from
the divergence a prior fix addressed, and it directly violates Objective 1C ("Attention Console,
Stage Map, and stage-advance control must not disagree").

There is also a second, narrower, **UI-only** divergence: `DealStageProgressionCard.tsx` renders
both the real engine's `StageAdvanceRequirements` block *and* a separate, non-blocking severity
badge from `stageProgressionGuard.ts`'s `deriveStageProgressionEligibility` — the two can show
different severities on the same card (write path is safe either way, since only the real engine
gates the write).

---

## 2. Duplicate/conflict inventory

| Concept | Status | Evidence |
|---|---|---|
| Stage/requirement readiness | Converged on one real engine; UX-level fact-supply gap (§1.3) and a soft badge duplicate | `dealBlockerModel.ts`, `DealBlockers.tsx:49,63-69`, `DealStageProgressionCard.tsx:129,180-193` |
| Active deal | **One violation**: CRM "linked deals" widget uses its own literal `statecode eq 0` filter, no `cr664_isterminalstatus` check, doesn't import `ACTIVE_DEAL_ODATA_PREDICATE` | `src/crm/workspace/crmLinkedDeals.ts:90,110` |
| Test/smoke deal exclusion | Consistent — all deal-enumerating loaders use `isTestOrSmokeDeal`/`operationalDeals` | verified across banker/manager/team/executive/admin loaders |
| Document status | Layered correctly (bucket classification vs. typed stage-exit matcher), not conflicting | `src/deals/documentStatusClassification.ts` (note: not at the path originally assumed) |
| Task/date "overdue" math | **Genuine, unremediated duplication** — same task can be overdue on one screen, not on another, for a same-day due date | Fixed: `teamQueries.ts:526`, `creditMemoFreshness.ts:216`, `creditMemoDraft.ts:736`, `primitives.ts:118`. **Not fixed**: `dealCockpitMetrics.ts:254-258` (feeds Metric Deck "Blockers" tile), `stageProgressionGuard.ts:179-184` (feeds eligibility badge). **Partially fixed**: `blockerRules.ts:46-49` (fixed parsing, still compares against exact instant not start-of-day). ~20 files total contain raw `getTime()` date-math outside the canonical helpers; only ~7 were individually audited here |
| Funding readiness | Mostly still hardcoded false, **one fact now fixed**: `conditionsPrecedentResolved` is live (Workstream E/G); `requiredDocumentsComplete`/`exceptionsAllResolved`/`destinationVerified` remain hardcoded `false` | `DealFundingAuthorizationPanel.tsx:48,56-57`; `DealFundingAuthorizationPanelConnected.tsx:33` |
| Portfolio boarding readiness | `NOT_WIRED.portfolio-boarding-audit-governance` registry entry is **confirmed stale** — cites a flag (`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`) that gates a *different* (manual bulk-import) path; the auto-board-on-stage-advance path has **no flag at all** and is live today given `AUTO_STAGE_ADVANCE_ENABLED=true` | `buildLiveStageAdvanceDeps.ts:234-236` (own comment states this explicitly) |
| Relative-date/day-count math | Same as task/date row above (one finding, two symptoms) | |
| Client identity resolution | Clean — two legitimately distinct single-sourced resolvers for two distinct schema targets (`systemuserid` vs. `cr664_user`), no duplication | `currentUserLookup.ts`, `newDealAuditActorResolver.ts` |
| Credit memo data assembly | Single path (`buildCreditMemoDraft`), no duplication | `creditMemoDraft.ts:147` |

### `CANONICAL_SOURCES.md` / `platformInventory.ts` staleness found

1. **Stage-identity row points at the wrong file.** `platformInventory.ts`'s own comment says the
   canonical vocabulary moved to `stageOrderingContract.ts`; `CANONICAL_SOURCES.md` never mentions
   that file and still names the retired `stageCatalog.ts`. (Bonus: that same comment miscounts
   `stageCatalog.ts` as "9-stage" when it's actually 12.)
2. Several genuinely-canonical modules are **missing from `CANONICAL_SOURCES.md` entirely**:
   `stageOrderingContract.ts`, `loanWorkflowRequirementEngine.ts`, `dealBlockerModel.ts`,
   `documentStatusClassification.ts`, `testDealClassification.ts`, `dealVisibilityScopes.ts`.
3. **`DELIBERATELY_BLOCKED.stage-progression-advance` is stale** — claims Return/Decline/Withdraw
   "is not mounted in any live workspace." It IS mounted (`BankerDealWorkspace.tsx:236`,
   `DealGovernedTransitionPanel.tsx`), with a real live write path. The component's own code
   comment already acknowledges the registry claim is outdated; the registry itself was never
   updated. This write path is also absent from `GOVERNED_WRITES`.
4. **`NOT_WIRED.portfolio-boarding-audit-governance` cites the wrong flag** (§2 table above).
5. **`NOT_WIRED.funding-authorization-persistence` is stale on "conditions"** — no longer
   hardcoded false (§2 table above).

---

## 3. Schema and datasource inventory

| Table | Registered in `power.config.json`? | Migration script | Live status |
|---|---|---|---|
| 52 pre-existing tables (loan deal, borrower, document checklist, task, credit memo, team, CRM org/person, 12-table portfolio-boarded family, NAICS, etc.) | Yes | N/A (production schema) | Live, but see deployment-staleness note below |
| `fundingauthorization` | Yes | `pr107-funding-authorization/` | Store still discloses "not applied to any live environment" |
| `closingdocumentmanifest` | **No** — absent from `power.config.json`, despite being exported from `src/generated/index.ts` | `pr123-closing-document-persistence/` | Not live; the export/registration mismatch is itself a small defect |
| 6 final-arc tables (credit approval decision, commitment, condition verification, executed doc attestation, booking QC, adverse action) | Yes (added by PR #147) | `final-arc-*/` (6 dirs) | **Per operator confirmation this session: genuinely live.** Source-only evidence (unchanged "not applied" headers in 5/6 store files, empty local `dataSourcesInfo.ts` fallback, no `src/Entities/` spec) would suggest otherwise in isolation — reconcile per §12 |

**Deployment record is stale regardless of the above:** `docs/operator-evidence/final-launch/PAC_DEPLOYMENT_EVIDENCE.md`
pins the last recorded `pac code push` to commit `5ff16b2` (2026-06-25) — independently verified
via `git rev-list --count 5ff16b2..HEAD` = **360 commits behind current HEAD**. Whatever the true
current deployment state is, this specific document is not it and needs to be refreshed (§12).

**SharePoint connector:** absent — `power.config.json`'s `connectionReferences` contains only
Office 365 Outlook. Binary document/closing-package storage has no destination.

### Migration requirements (exact list, none show evidence of having been run against the live org other than what the operator has now confirmed for the six final-arc tables)

1. Document requirement lifecycle columns — `scripts/dataverse/create-document-requirement-lifecycle-fields.ps1 -Apply`
2. CRM industry/NAICS projection — `scripts/schema-migrations/pr138-crm-industry-projection/create-columns.mjs`
3. Test/production classification field — `scripts/schema-migrations/pr142-test-record-field/create-columns.mjs`
4. Closing document manifest table — `scripts/schema-migrations/pr123-closing-document-persistence/create-entity.mjs` (+ register in `power.config.json`, currently missing)
5–10. Six final-arc tables — `scripts/schema-migrations/final-arc-*/create-entity.mjs` each (per operator: already run)
11. Document-checklist binary File column — `scripts/dataverse/create-document-checklist-file-columns.ps1 -Apply`

All require `DATAVERSE_URL`/`DATAVERSE_ACCESS_TOKEN` or `pac` against
`org3a57b8d4.crm.dynamics.com` / environment `5f2d77a5-de50-edeb-9d74-5b2400a2320d`, followed by
`pac code add-data-source` and "publish customizations."

---

## 4. Identity and authority matrix

Four distinct identity spaces exist, bridged only by ad-hoc email matching and one bridge table —
no Dataverse relationship constraint enforces the bridging:

| Concept | What it is | Resolution |
|---|---|---|
| Entra/system user | Azure AD → Dataverse `systemuser` | client: `entraObjectId`→`resolveCurrentSystemUserId`; server (plugin): `context.InitiatingUserId` |
| `cr664_user` | Custom table, required target of every audit/timeline actor bind; **not a registered runtime datasource** | reached only via `cr664_platformusers` bridge |
| `cr664_banker` | Credit-authority-bearing identity (`cr664_approvallimit`, `cr664_creditcommitteemember`, `cr664_approvaloverrideauthority`) | resolved by email match, both client and (separately, hand-ported) server |
| assigned banker | Field on the deal itself (`_cr664_assignedbanker_value`) | used as `originatingBankerId` in self-approval comparison |
| servicing owner | Separate field on the **portfolio** record (`_cr664_assignedservicingowner_value`) | not auto-linked from assigned banker; boarding doesn't set it |
| approver / funder / reviewer | Not modeled as roles at all — computed per-transition from whichever banker's fields pass the relevant policy function | `creditApprovalAuthority.ts`, `fundingAuthorizationPolicy.ts`, document-review segregation |
| admin | Not a Dataverse security role — derived client-side from a `cr664_workspaceentitlements` row via three "safe identity signal" heuristics | `adminWorkspaceEntitlementQuery.ts:232-341` |

### Server-side enforcement — the single most consistent finding across every document and this entire audit

| Control | Exists in source | Deployed | Bypassable today |
|---|---|---|---|
| Stage/status transition policy (adjacency, terminal lock, credit-committee/limit/override) | Yes, comprehensively, both sides | **No — written, unit-tested (41 tests), never compiled/registered** | Everything — direct Web API write, Power Automate, bulk edit, second app |
| Self-approval prevention for CREDIT_APPROVAL exit | Client only | N/A | The plugin's own `EvaluateCreditApprovalAuthority` (C#) has **no id-comparison logic at all** — even once armed, server-side self-approval prevention does not exist |
| Admin/workspace entitlement changes | Client only (`authorized` is a caller-supplied boolean) | None | Total |
| Funding dual control | Client only | None — no funding-authorization plugin/table constraint exists | Total |
| Boarding | Read-time honesty check only (`missing-handoff` detection), not a write-time gate | Same plugin as stage changes (undeployed) | A direct write can force `stagereference=BOARDED` with no handoff row; detected on next read, never prevented |
| Six new durable-record tables (approval decision, commitment, condition verification, doc attestation, booking QC, adverse action) | **Zero server-side enforcement for any of them** — the plugin registers on `cr664_loandeal` only | N/A | Total, for all six |
| **Audit trail for successful (non-rejected) writes, system-wide** | **None** — the one plugin writes audit rows only on `Blocked` outcomes, at pre-validation stage only; every successful action's audit row is emitted by ordinary client `Create` calls | N/A | **100% of the audit trail for every successful governed action is client-emitted and spoofable** |

**Bottom line, reconfirmed independently by 3 of the 5 research passes and every planning document
back to 2026-07-21 with zero exceptions:** this system's governance floor is entirely client-side
TypeScript today. This is not new information this factory discovered — it is the single most
durable, unchanging fact in the repository's entire audit history, and it remains true at current
HEAD.

---

## 5. Capability classification (verbatim current contents of `platformInventory.ts`)

- **GOVERNED_WRITES** — 23 entries (task/document/memo/activity/stage-advance/six-final-arc-table
  writes/data-quality/servicing-owner). Two gaps: forward stage-advance's registration doesn't
  cross-reference Return/Decline/Withdraw, and the canonical-transition (Return/Decline/Withdraw)
  write path has **no entry at all**.
- **DELIBERATELY_BLOCKED** — 1 entry (`stage-progression-advance`), **confirmed stale** (§2).
- **NOT_WIRED** — 12 entries: `new-deal-create`, `document-upload`, `ai-generation`,
  `test-coverage-build-verification`, `stage-reference-data-source`, `stage-ordering-contract`,
  `executive-deal-drillthrough`, `admin-deal-drillthrough`, `borrower-portal`,
  `closing-document-persistence`, `funding-authorization-persistence` (**partially stale**),
  `annual-review-persistence`, `portfolio-boarding-audit-governance` (**confirmed stale**),
  `portfolio-migration-reconciliation`.
- **LOCAL_ONLY_FLOWS** — 16 entries (borrower-update draft, credit-memo local preview/consistency,
  various Teams/Outlook handoffs, catch-up ledgers) — all correctly disclosed as local-only.
- **EXEC_TRANSITIONAL_FALLBACK_FEATURES**, **WORKSPACE_DEAL_ACCESS**, **REFERENCE_DATA_GOVERNED** —
  verified accurate against source except the stage-catalog staleness noted in §2.

---

## 6. Prior audit reconciliation

This repo's audit history spans 2026-07-21 through 2026-07-27 across 10+ major documents. Full
finding-by-finding reconciliation is in the individual research-agent transcripts; the material
conclusions:

- **N-01 through N-36, D-01/D-04** (`PRODUCTION_AUDIT_FINDINGS_N01_N36_2026-07-25.md`): the large
  majority are confirmed fixed and durable at current HEAD (N-02, N-07, N-08, N-09, N-17 [code-side],
  N-33 all independently re-verified by direct source read this pass). **Unaccounted for, reconfirmed
  once more, no new evidence found**: `N-04, N-05, N-06, N-12, N-13, N-27, N-28, N-29, N-30, N-31,
  N-32, D-02, D-03`. Treating these as fixed or open would be fabrication.
- **D1–D20** (`FINAL_PRODUCTION_COMPLETION_D1_D20_DISPOSITION_2026-07-22.md`): mostly fixed;
  **D13 (portfolio-manager/servicing-owner auto-assignment on boarded record) remains open even at
  the much later Final LOS Completion arc** — independently re-investigated and explicitly declined
  (needs a `systemuser`-typed field or a name-resolution service; product/operator decision).
- **Largest doc/reality drift found:** `FINAL_PRODUCTION_COMPLETION_CAPABILITY_DISPOSITION_2026-07-22.md`
  claims funding authorization is "missing... no module exists anywhere." **Current source shows it
  fully built, mounted, and Dataverse-persisted** (PRs #111/#112, two days after that doc). Not a
  contradiction to act on — the doc predates the work — but a trap for anyone citing that doc as
  current. (Its *readiness gate* still fails closed by design — three flags hardcoded false — which
  is a separate, still-real finding; "built" and "gated shut" are not contradictory facts.)
- **`LAUNCH_DEFECT_REGISTER_AND_GO_NO_GO_2026-07-22.md` L-P0-3/L-P0-4**: both since correctly
  self-corrected by later docs (document-file columns do exist now; portfolio auto-boarding's
  persistence is live, not "OFF") — verified accurate. The correcting docs don't flag that a
  *second*, differently-named boarding path (`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`) really
  is still off, which could over-generalize "boarding is live" to the wrong workspace.
- **L-P0-2 (no server-side plugin enforcement)**: confirmed still true, with zero drift, the entire
  span — see §4.

---

## 7. Root-cause grouped defect register

| # | Root cause | Defects |
|---|---|---|
| RC-1 | **Incomplete server-side authorization** | Every control in §4's table; entire successful-write audit trail is client-emitted |
| RC-2 | **Stale shared state (no post-write refresh)** | Credit-memo stale-read: `GlobalCashFlowPanel`/`DealRiskRatingPanel` writes never call `refresh()`/`applyVerifiedDealPatch()`; no `DealDataKey` reloads the deal row (source-confirmed, carried forward from Phase-3 audit, unchanged at this HEAD) |
| RC-3 | **Missing downstream consumption** | Attention Console fed a shallower fact set than the write-guard (§1.3); portfolio-boarding FK never consumed by any Portfolio-workspace view; CRM linked-deals widget uses its own filter |
| RC-4 | **Governance-registry drift (documentation vs. reality)** | `DELIBERATELY_BLOCKED.stage-progression-advance` stale; `NOT_WIRED.portfolio-boarding-audit-governance` cites wrong flag; `NOT_WIRED.funding-authorization-persistence` stale on conditions; `CANONICAL_SOURCES.md` names the wrong stage file and omits 6 genuinely-canonical modules; `PAC_DEPLOYMENT_EVIDENCE.md` 360 commits stale |
| RC-5 | **Missing durable fact / schema gap** | `closingdocumentmanifest` not registered as a datasource despite being exported; document-checklist binary File column; portfolio-migration-reconciliation control table; servicing-owner/portfolio-manager auto-assignment field |
| RC-6 | **Local-only / structurally-capped persistence** | Closing rendered-text: write path exists, `SELECT_FIELDS` excludes the content column (structurally impossible readback even once live); binary file / SharePoint storage absent entirely |
| RC-7 | **Misleading derived state (missing ≠ healthy)** | Funding disbursement confirmation: `requiredDocumentsComplete`/`exceptionsAllResolved`/`destinationVerified` hardcoded `false` (fails closed correctly, but the underlying facts have no live source at all); document "reviewed/received" achievable from metadata alone with zero file bytes (upload flag off by default) |
| RC-8 | **Duplicate/divergent logic not yet collapsed** | ~20 files with independent relative-date math (6 fixed, 2+ confirmed unfixed, rest unaudited); DealAdverseActionPanel missing the `isMountedRef` guard its 5 siblings received in PR #148 |
| RC-9 | **Navigation / operating-experience gaps** | New Deal wizard focus/scroll-into-view behavior — no supporting code found; `LogActivityModal` max-height/overflow handling — no supporting code found |
| RC-10 | **Fixture/test-data contamination** | CRM company counts use neither the active-deal predicate nor test/smoke exclusion — the one surface of 9+ audited with zero filtering |

---

## 8. Proposed coordinated implementation plan (PR boundaries)

Per the mission's required structure, refined by what this deliverable now knows:

- **PR A — Canonical lifecycle and source-of-truth foundation.** Fix RC-3 (Attention Console fact
  supply), RC-4 (registry/doc drift: `DELIBERATELY_BLOCKED`, both stale `NOT_WIRED` entries,
  `CANONICAL_SOURCES.md`), RC-8's date-math consolidation, RC-10 (CRM count filter), RC-3's CRM
  linked-deals filter. Cross-surface contract tests proving canonical usage everywhere.
- **PR B — Underwriting and decision integrity.** RC-2 (the stale-read architecture fix —
  post-write refresh/verified-patch strategy for `DealDataProvider`), full memo reconstruction
  proof, RC-8's `DealAdverseActionPanel` regression, approval/adverse-action authority work,
  investigate the plugin's missing self-approval id-comparison (§4) as a design item even though
  deployment itself is out of this session's reach.
- **PR C — Closing and funding completion.** RC-6 (closing content readback fix — add the content
  column to `SELECT_FIELDS`), RC-5 (`closingdocumentmanifest` datasource registration), RC-7's
  funding readiness facts (replace hardcoded flags with real sources where a live source can exist;
  where none can, keep fail-closed and document the business risk explicitly, not silently).
- **PR D — Boarding, portfolio, and servicing completion.** Register auto-boarding in
  `GOVERNED_WRITES`, fix the stale registry citation, RC-5's servicing-owner/portfolio-manager
  auto-assignment (needs the operator/product decision on the resolution mechanism — flag, don't
  invent), RC-3's FK-consumption gap in Portfolio views.
- **PR E — Operating experience and certification.** RC-9 (navigation/modal), RC-1's fully honest
  security/segregation certification update, capability-registry accuracy sweep, full automated
  test expansion, refreshed deployment/operator runbooks, final GO/NO-GO.

Sequencing rationale: A first because B/C/D all depend on the canonical facts and registries being
correct before building more on top of them; E last because certification must reflect the finished
state of A–D, not a snapshot mid-way.

---

## 9. Migration requirements

See §3. Eleven migrations total; the six final-arc ones are, per operator confirmation, already
applied — the remaining five (document-requirement lifecycle, CRM/NAICS, test-record field, closing
manifest, document-file column) are not, per every piece of source evidence found.

---

## 10. Operator requirements

1. Run the 5 remaining schema migrations (§3/§9) against the live org; verify; publish customizations.
2. Register `cr664_closingdocumentmanifests` in `power.config.json` (currently missing even though exported from `src/generated/index.ts`).
3. Confirm (or re-run) `pac code push` — refresh `PAC_DEPLOYMENT_EVIDENCE.md` regardless of the outcome, since it is 360 commits stale and cannot be trusted as-is.
4. Activate the SharePoint connector per `docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md`'s runbook.
5. Build + register the Dataverse governance plugin (`LoanDealGovernedTransitionPlugin.cs`) — and note the self-approval id-comparison gap in §4 should be fixed in the plugin source before that build, not after.
6. Decide the servicing-owner/portfolio-manager auto-assignment mechanism for the boarded record (RC-5) — this needs a product decision, not just code.
7. Security-role / column-level-security review for the six final-arc tables.
8. Run the live two-user segregation/dual-control tests (`03_TWO_USER_TEST_REQUIREMENTS.md`) — no evidence this has ever been executed.
9. Run the adversarial retest (`07_ADVERSARIAL_RETEST_REPORT.md`) — template only, blank.
10. Make the actual GO/NO-GO decision (`08_GO_NO_GO_DECISION.md`) — still reads "NOT YET MADE."
11. Set `cr664_istestrecord` on the disposable test deal — no admin UI writes this field yet.

---

## 11. Production certification requirements

A genuine production certification requires, beyond this source-only deliverable: live schema
verification of all seven pending items in §3/§9; a live browser session exercising Tests A–Q style
coverage per stage; two distinct real authorized human actors for every dual-control/segregation
claim; hard-reload readback proof for every durable write; and a completed
`FINAL_CONTROLLED_PRODUCTION_E2E.md` run. **None of this is exercisable in the current session** —
no browser automation or Dataverse/PAC CLI tool exists here. This is the same disclosed limitation
as the prior certification phase, unchanged.

---

## 12. Explicit GO/NO-GO at current state

**NO-GO**, for the same reason the prior certification phase reached NO-GO, now reconfirmed with
five independent research passes rather than one: **the system's entire governance floor is
client-side today.** Every authority/segregation/dual-control claim in this application can be
bypassed by a direct Web API write or a compromised client, with the sole partial exception of
stage/status transition rejections — and that exception requires a plugin that has never been
built, compiled, or registered against the live org. This is not a new discovery; it is the single
most consistent finding in this repository's entire audit history, unchanged since 2026-07-21.

Independently blocking regardless of the security finding: the credit-memo stale-read defect
(RC-2), the structurally-impossible closing-document-content readback (RC-6), the un-registered
auto-boarding write path (RC-4/RC-5), and the CRM count filtering gap (RC-10) are all real,
source-confirmed defects that would block a GO on their own, with zero dependency on live testing.

This deliverable does not by itself change that verdict — it is the required map before
implementation begins, per the mission's own sequencing rule. PR A–E (§8) is the proposed path to
close the code-completable portion of these gaps; the operator actions in §10 are required for the
rest.
