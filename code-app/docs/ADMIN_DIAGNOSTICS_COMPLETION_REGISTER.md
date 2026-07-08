# Admin Diagnostics — Completion Blocker Burn-Down Register

**Branch:** `phase6/diagnostics-burndown` (off master `c1c7e9e`) · **Date:** 2026-07-08

Ground truth = the current `main`/`master` code (which already contains the
concurrent "full LOS activation blocker burn-down"), not an earlier dashboard
snapshot. Several items in the original request were already dispositioned on
master before this arc; those are marked **Already-on-master**.

## Disposition legend (root-cause categories)
- **DEFECT** — a real bug / stale-or-contradictory copy → fix in code (this arc).
- **OPERATOR-GATE** — intentional live-write safety gate; needs real operator
  evidence (schema verify / smoke capture / gate flip). Not a code defect.
- **MAKER** — Dataverse schema/seed/SDK-regen owned by the maker portal.
- **DEFERRED** — intentional product scope decision, out of V1 internal restart.
- **DONE-ON-MASTER** — already correctly implemented by the concurrent burn-down.

Columns per item: Surface · Item · State · Root cause · Complete-now? · Owner ·
Fix · Command/file · Expected UI · Verification.

---

## Part 1 — Items FIXED in this arc (code/scripts)

### F1 · Stage Governance — tolerate leftover active legacy/test rows
- **Surface / item:** Stage Governance Diagnostics → (was) hard CRITICAL when an
  active non-canonical row (e.g. `PHASE121_STATUS`) sits beside the canonical set.
- **State → :** `Critical` → **`Needs review` (at-risk)**, then `Ready` after cleanup.
- **Root cause:** DEFECT — the diagnostics blocked on *any* active non-canonical
  row even when the canonical stage+status sets were complete. (Inactive legacy
  rows were already ignored by the resolvers.)
- **Complete-now:** Yes (code). · **Owner:** Claude code.
- **Fix:** Diagnostics-layer tolerance — resolve ordering/status IGNORING active
  non-canonical rows so a complete canonical set is not blocked; surface the
  leftovers as an at-risk **Reference hygiene** warning with a one-command
  cleanup. The strict write-path resolvers are UNCHANGED (governed advancement
  still blocks on active non-canonical rows until they're deactivated — honest +
  consistent).
- **Command/file:** `src/shared/governance/stageProgressionAvailability.ts`
  (`deriveStageGovernanceDiagnostics` + hygiene check + `legacyActiveStage/StatusCodes`),
  `src/admin/stageGovernanceDiagnosticsLoader.ts` (tolerant resolution).
- **Expected UI:** With the 7 canonical stages + 5 statuses seeded, a leftover
  active `PHASE121_*` row shows a yellow "Reference hygiene" warning ("run the
  deactivation script") instead of a red CRITICAL; card reads "Needs review",
  flips to "Ready — available" once cleaned.
- **Verification:** `stageGovernanceDiagnosticsLoader.test.ts` (active-legacy →
  at-risk not blocked; inactive-legacy → ignored → Ready). tsc + full suite green.

### F2 · Legacy PHASE121_*/TEST reference cleanup script
- **Surface / item:** No script existed to deactivate active legacy/test
  stage/status reference rows.
- **State:** Missing → **added**.
- **Root cause:** DEFECT (missing operator script).
- **Complete-now:** Script yes; running it is operator-owned. · **Owner:** Claude
  code (script) + Matt operator (run with token).
- **Fix / file:** `scripts/deactivate-legacy-stage-status-references.mjs` —
  dry-run-by-default, `--commit`/`--verify`, deactivate-only (never deletes),
  never touches a canonical row, leaves unrecognized non-canonical rows for manual
  review (fail-closed).
- **Command:** `node scripts/deactivate-legacy-stage-status-references.mjs`
  (dry-run) → `--commit` → `--verify`.
- **Expected UI:** After `--commit`, Stage Governance "Reference hygiene" → clear;
  card → "Ready — available" (given canonical set seeded).
- **Verification:** dry-run executes clean; no-token path prints honest guidance.

### F3 · KPI_BASELINE_DATE dedupe script
- **Surface / item:** System Health / Configuration → "KPI baseline ambiguous —
  N conflicting values".
- **State:** Detection-only (no cleanup path) → **dedupe script added**.
- **Root cause:** DEFECT (missing operator cleanup path). The resolver already
  detects + fails closed; there was no way to collapse to one value.
- **Complete-now:** Script yes; running it is operator-owned. · **Owner:** Claude
  code (script) + Matt operator.
- **Fix / file:** `scripts/dedupe-kpi-baseline-date.mjs` — dry-run default;
  `--approve "<existing value>" --commit` CLEARS `cr664_kpibaselinedate` on the
  non-approved active rows (never deletes a row, never invents a value); `--verify`.
- **Command:** `node scripts/dedupe-kpi-baseline-date.mjs` (dry-run) →
  `--approve "<value>" --commit` → `--verify`.
- **Expected UI:** `ConfigurationOverview` renders "KPI baseline: <date>" instead
  of the ambiguity alert; the KPI data-quality flag clears.
- **Verification:** dry-run + no-token guidance execute clean.

### F4 · Borrower email — stale "connector NOT registered" copy
- **Surface / item:** Outlook LIVE Email Diagnostics / connector evidence.
- **State:** Contradictory copy → **reconciled**.
- **Root cause:** DEFECT (stale copy). `outlookConnectorEvidence.ts` header comment
  said the connector "is NOT registered", contradicting its own
  `OUTLOOK_CONNECTOR_STATE` (`connectorRegisteredInManifest: true`, PASS) and
  `power.config.json` (`apis/shared_office365` / `new_Office365OutlookCommercialLOS`).
- **Complete-now:** Yes (comment). · **Owner:** Claude code.
- **Fix / file:** `src/admin/outlookConnectorEvidence.ts` — header now states the
  connector IS registered; what still gates LIVE send is `VITE_EMAIL_MODE` + the
  flags + an operator diagnostic-mailbox smoke (delivery receipt + named approver).
- **Expected UI:** unchanged (logic already PASS); the source no longer lies. LIVE
  borrower send stays gated (correctly) until operator evidence.
- **Verification:** existing outlook connector tests remain green.

---

## Part 2 — OPERATOR-GATE items (intentional live-write gates; NOT defects)

These are correct-by-design. They are not "broken" — they need real operator
evidence. Each already has an honest gate + documented command on master.

| # | Item | State | Root cause | Gate / evidence | Owner | Exact operator command |
|---|---|---|---|---|---|---|
| G1 | CRM writeback / live persistence | Gated | `CRM_LIVE_PERSISTENCE_ENABLED=false` + no injected `VerifiedCrmSchemaState` + transport not wired | Schema gate fail-closed (`crmRuntimeSchemaGate`) | Operator + code | Refresh schema evidence, inject `VerifiedCrmSchemaState`, then flip the gate — per `docs/PHASE_193A_CRM_LIVE_GATES_AND_APPLY_ORCHESTRATOR.md` / `LIVE_ACTIVATION_GAP_MATRIX.md` |
| G2 | Portfolio boarding (automated LOS-originated) | Gated | `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED=false` + `_ROUTE_ENABLED=false` + evidence sentinel `unknown-operator` | 8-group adapter merged; evidence placeholder | Operator + code | `powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding` (real UPN), then flip flags |
| G3 | Document checklist generation | Gated | `DOCUMENT_CHECKLIST_GENERATION_ENABLED=false` + placeholder evidence (empty `affectedRecordIds`, synthetic ts); ruleset signoff already committed | Runtime + UI gate both false | Operator + code | `powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence <path>\documentChecklist.json` (real record ids), then flip |
| G4 | Stage advancement (Advance/Return/Decline/Withdraw) | Gated | Requires seed (below) + injected live transport + operator arming; write path exists + tested | `executeCanonicalStageTransition` default-off | Operator + maker | Seed (M1), then arm per `STAGE_GOVERNANCE_ACTIVATION_AAR.md` §3–4 |
| G5 | Borrower LIVE email send | Gated (DRY_RUN) | `BORROWER_MESSAGING_ENABLED`/`BORROWER_EMAIL_TRANSPORT_ENABLED=false` + `VITE_EMAIL_MODE≠LIVE`; connector registered (F4) | Highest-risk (irreversible) | Operator | Diagnostic-mailbox smoke with delivery receipt + named approver, then flip last |

> **New Deal Intake** (originally reported "contradictory"): on current master the
> copy is already consistent — banker **pilot create is LIVE**
> (`BANKER_CREATE_PILOT_ENABLED=true`, production refs approved) while
> **public/admin create is Gated** (`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED=false`,
> governed adapter not wired). The resolver is fail-closed (rejects INACTIVE
> matched rows; the production profile filters `PHASE121_*`/TEST labels). No
> contradiction remains → **DONE-ON-MASTER**. The strings honestly separate the
> two paths.

---

## Part 3 — MAKER items (Dataverse schema / seed / SDK regen)

| # | Item | Action | Command |
|---|---|---|---|
| M1 | Stage/status seed (unblocks Stage Governance + G4) | Add `cr664_sequence` column (if absent) → seed 7 stages + 5 statuses → regen SDK | `node scripts/seed-stage-references.mjs --commit` → `--verify` (see `docs/STAGE_SCHEMA_SETUP.md`) |
| M2 | Deactivate legacy rows after M1 | Clear active PHASE121_*/TEST rows | `node scripts/deactivate-legacy-stage-status-references.mjs --commit` (F2) |
| M3 | KPI baseline dedupe | Collapse to one approved value | `node scripts/dedupe-kpi-baseline-date.mjs --approve "<value>" --commit` (F3) |

---

## Part 4 — DEFERRED / Out of V1 internal-restart scope

These are intentional product decisions. On master they are **already** classified
distinctly (not lumped with fixable blockers) via the `blockerKind` union in
`src/shared/governance/platformInventory.ts`, and grouped in the Release Readiness
Gate by kind. **No code change needed; they should read as deliberate deferrals,
not accidental failures.**

| # | Item | blockerKind | Why deferred | Disposition |
|---|---|---|---|---|
| D1 | Document upload (binary File) | `schema` | No File column on `cr664_DocumentChecklist`; needs schema + SDK regen + gated upload UI | DEFERRED unless in V1: if yes, add create-missing-only File-column script + regen + gated UI; if no, keep as deferred |
| D2 | Borrower portal (external-user-facing) | `compound` | Six concurrent blockers OUTSIDE this repo (external auth, invite tokens, external-role model, File column, secure-message persistence, notification path) — `docs/PHASE_64/65_*` | DEFERRED product scope; does not belong in internal LOS restart readiness |
| D3 | Executive `/deals/:id` drill-through | `governance` | Executive workspace is snapshot-only by design (Phase 15); drill-through is a separate governance decision | DEFERRED governance non-goal (or wire a permissioned read-only drill-through if product approves) |
| D4 | Admin `/deals/:id` drill-through | `governance` | Intentionally not wired through DealRoute; separate governance decision | DEFERRED governance non-goal |
| D5 | In-app build/test observability | `observability` | No runtime signal for build/test; CI is out-of-band | DEFERRED — out-of-band CI evidence; should not be a promotion blocker |

---

## Part 5 — Noted, NOT changed this arc (governance hygiene)

- **`CHECKLIST_WRITE_ENABLED` vs tests:** the flag is `false` (Completion Phase A
  safe default) while three activation-contract tests still assert `true` (Phase
  256B state). **Zero runtime exposure** — `DOCUMENT_CHECKLIST_GENERATION_ENABLED=false`
  already blocks the write path. Left unchanged to avoid colliding with the
  concurrent activation-contract work; recommend a follow-up that resets the test
  assertions to match the safe default (owner: whoever owns the activation
  contracts). Tracked in `MASTER_ACTIVATION_STATUS_AND_OPERATOR_RUNBOOK.md`.

---

## Summary

- **Fixed in code/scripts this arc:** F1–F4 (legacy tolerance, 2 operator scripts,
  stale-copy fix).
- **Correct-by-design operator gates (not defects):** G1–G5 — need real evidence,
  documented commands.
- **Maker steps:** M1–M3.
- **Deferred product scope (already classified on master):** D1–D5.
- **Net:** the dashboard's "wall of blocked" is overwhelmingly **intentional,
  honest, gated or deferred** — the genuinely avoidable defects were a handful of
  copy/hygiene items, now fixed. No live-write gate was flipped; no evidence was
  fabricated.
