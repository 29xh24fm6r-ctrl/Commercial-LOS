# Admin Diagnostics Completion Burn-Down — AAR

Companion to `ADMIN_DIAGNOSTICS_COMPLETION_REGISTER.md`. Branch
`phase6/diagnostics-burndown` off master `c1c7e9e`.

## Headline
The Admin Diagnostics "wall of blocked" is **not one problem and mostly not
defects**. Ground-truthing the current master (which already contains the
concurrent full-activation burn-down) showed the overwhelming majority of
Gated/Blocked/Not-Wired rows are **intentional live-write safety gates** (awaiting
real operator evidence) or **deliberate product deferrals** (already classified
distinctly by `blockerKind`). The genuinely avoidable defects were a small set of
copy/hygiene items — now fixed.

## Items CLEARED this arc (code/scripts)
1. **Stage Governance no longer false-CRITICAL on legacy pollution.** Diagnostics
   now tolerate leftover *active* non-canonical rows (e.g. `PHASE121_STATUS`) as an
   at-risk **Reference hygiene** warning instead of a red block, and compute
   canonical completeness ignoring them. Inactive legacy rows were already ignored.
2. **Legacy cleanup script** — `scripts/deactivate-legacy-stage-status-references.mjs`
   (dry-run default; deactivate-only; never touches canonical rows).
3. **KPI baseline dedupe script** — `scripts/dedupe-kpi-baseline-date.mjs`
   (dry-run default; `--approve "<value>" --commit` clears the conflicting values).
4. **Borrower-email connector copy** — removed the stale "connector NOT registered"
   comment that contradicted the module's own PASS state and `power.config.json`.

## Items still INTENTIONALLY GATED (operator evidence required — not defects)
- **CRM live persistence** — flag off + `VerifiedCrmSchemaState` not injected.
- **Portfolio boarding (automated)** — flags off + evidence sentinel
  `unknown-operator` (the *manual* Add-Existing-Loan path is already live).
- **Document checklist generation** — flag off + placeholder evidence (ruleset
  signoff already committed).
- **Stage advancement** — needs the seed (below) + injected transport + arming.
- **Borrower LIVE email** — highest risk; flags off + `VITE_EMAIL_MODE≠LIVE`.

Each is honest and documented; none was flipped, no evidence fabricated.

## Items DEFERRED (out of V1 internal-restart scope — already classified)
Document upload (File-column schema), borrower portal (6 external blockers),
executive & admin deal drill-through (governance non-goals), in-app build/test
observability (out-of-band CI). These carry `blockerKind` tags and group
separately in the Release Readiness Gate — they read as deliberate deferrals, not
accidental breakage.

## Exact operator commands still required
```
# 1. Stage/status seed (unblocks Stage Governance + Advance)   [maker]
node scripts/seed-stage-references.mjs --commit
node scripts/seed-stage-references.mjs --verify
#    (add cr664_sequence column first if absent — docs/STAGE_SCHEMA_SETUP.md — then regen SDK)

# 2. Deactivate leftover legacy/test reference rows            [operator]
node scripts/deactivate-legacy-stage-status-references.mjs            # dry-run
node scripts/deactivate-legacy-stage-status-references.mjs --commit
node scripts/deactivate-legacy-stage-status-references.mjs --verify

# 3. Dedupe KPI baseline to one approved value                 [operator]
node scripts/dedupe-kpi-baseline-date.mjs                             # dry-run (with token: shows conflicts)
node scripts/dedupe-kpi-baseline-date.mjs --approve "<value>" --commit
node scripts/dedupe-kpi-baseline-date.mjs --verify

# 4. Live-write gate evidence (per domain, when ready)         [operator]
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding
powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence <path>\documentChecklist.json
#    then flip the corresponding gate only after evidence is HIGH (see LIVE_ACTIVATION_GAP_MATRIX.md)
```

## Expected dashboard changes after deployment
- **Stage Governance:** with the seed applied → CRITICAL → **Ready**; if active
  legacy rows linger → **Needs review** (yellow hygiene warning) until the
  deactivation script runs, then **Ready**.
- **Configuration / System Health:** after the KPI dedupe → "KPI baseline
  ambiguous" alert clears → single "KPI baseline: <date>".
- **Outlook email:** connector evidence source no longer contradicts itself
  (already PASS); LIVE send stays gated until operator smoke.
- **Everything else:** unchanged and correct — the gated/deferred rows continue to
  show their honest, per-item reason (now easy to read as gate vs deferral vs the
  few fixed defects).

## What we deliberately did NOT do
- Did not flip any live-write gate or fabricate any evidence.
- Did not change the strict write-path stage/status resolvers (tolerance lives at
  the diagnostics layer only), avoiding any weakening of governed advancement.
- Did not touch the `CHECKLIST_WRITE_ENABLED` test-vs-flag inconsistency (zero
  runtime exposure; owned by the concurrent activation-contract work) — flagged
  for a follow-up in the register.

## Coordination note
There is active concurrent automation pushing to `origin/master` (this arc's
premise partly overlapped work already merged there). This branch was built on the
latest master and kept to non-overlapping, additive fixes; it should be rebased
onto master immediately before any merge.
