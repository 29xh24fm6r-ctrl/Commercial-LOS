# Deployment & Rollback Plan — Platform-Enforced Credit Workflow Governance

**Companion to** `ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md`,
`dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md`, and
`LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`. This document sequences the full rollout — schema,
plugin, client — and the exact steps to safely back out of any stage.

## Why a sequence, not a single cutover

Two independent capabilities are being armed here, and they do not have to land together:

1. **Core enforcement** (stage-graph adjacency, terminal-status lock, credit-approval authority) —
   needs only the plugin built + registered. No new schema. No client change.
2. **Reason enforcement** (RETURN/DECLINE/WITHDRAW must carry a non-empty reason) — needs the new
   `cr664_governedactionreason` column, the client writing it
   (`GOVERNANCE_REASON_FIELD_ENABLED`), and the plugin's `RequireReasonFieldToEnforce` flipped.

Landing (1) alone already closes the single most important gap (D1 from the E2E certification) —
do not wait for (2) to get core enforcement live.

## Phase 0 — Prerequisite: already-shipped client work (this pass)

- Return/Decline/Withdraw mounted live in the banker deal workspace (`DealGovernedTransitionPanel`).
- Client-side canonical engine consolidated (`deriveTransitionReadiness` delegates to
  `evaluateCanonicalStageTransition` for RETURN/DECLINE/WITHDRAW).
- `buildLiveCanonicalTransitionDeps.ts` already writes the reason field when
  `GOVERNANCE_REASON_FIELD_ENABLED` is true (currently `false`).
- Full automated suite green (`npx tsc -b && npx vitest run && npm run build`).

**Nothing in Phase 0 changes production behavior today** — `GOVERNANCE_REASON_FIELD_ENABLED` stays
`false`, and the plugin isn't registered, so the live app behaves exactly as before this initiative
except that RETURN/DECLINE/WITHDRAW are now reachable in the UI (previously unmounted) and go
through the SAME governed write path (audit + timeline + readback) ADVANCE already uses.

**Operator action required before Phase 0's UI change reaches real users:** confirm this is the
intended rollout for RETURN/DECLINE/WITHDRAW becoming clickable — this is a UI/behavior change
(a banker can now decline or withdraw a deal from the app) independent of server enforcement, and
should be reviewed as such before this branch reaches production traffic.

## Phase 1 — Core server enforcement (no new schema)

1. Build the plugin: `dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md` steps
   "Before you build" (items 1, 2, 4) and "Build".
2. Register both steps (pre-validation + pre-operation) per "Register" in that same document.
3. Run every scenario in `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`'s "Core enforcement" section.
4. **Go/no-go:** all core-enforcement scenarios pass, including the concurrency scenario, with a
   real `cr664_auditevents` row for each rejected attempt. If any scenario fails, disable the
   pre-operation step immediately (see Rollback below) — do not leave a half-working gate armed.

At the end of Phase 1: every direct-write bypass in `THREAT_BYPASS_MODEL.md` rows 1-9 is closed for
stage-graph skips, terminal-status violations, and CREDIT_APPROVAL authority. RETURN/DECLINE/
WITHDRAW reason presence is still enforced client-side only.

## Phase 2 — Reason enforcement (new schema)

1. `scripts/dataverse/create-governed-transition-reason-field.ps1 -Apply` — create
   `cr664_governedactionreason` on `cr664_loandeal`. Verify with the script's own metadata check.
2. Regenerate the SDK (`pac code add-data-source -a dataverse -t cr664_loandeal` or the
   equivalent for this environment) so the client model exposes the new column.
3. Flip `GOVERNANCE_REASON_FIELD_ENABLED = true` in `src/deals/dealOriginationFeatureFlags.ts`
   (a one-line, reviewed code change — this is the governed gate-flip step, not a schema change).
4. Flip `RequireReasonFieldToEnforce = true` in
   `dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealGovernedTransitionPlugin.cs`, rebuild,
   re-register (update the existing assembly — the Plugin Registration Tool supports updating an
   already-registered assembly in place).
5. Run `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`'s "Reason enforcement" section.
6. **Go/no-go:** a RETURN/DECLINE/WITHDRAW with no reason is rejected server-side (not just
   client-side); one with a reason succeeds and the reason is visible on the deal record, not just
   in the audit note.

## Rollback (any phase)

Disabling is **always** a single, fast, non-destructive step — no schema change, no client
redeploy, no data migration required to undo:

| To undo... | Do this |
|---|---|
| Core enforcement (Phase 1) | Plugin Registration Tool -> disable (or delete) BOTH the pre-validation and pre-operation steps on `LoanDealGovernedTransitionPlugin`. The app returns to today's client-only enforcement instantly. |
| Reason enforcement only (Phase 2), keep core enforcement | Set `RequireReasonFieldToEnforce = false`, rebuild, redeploy the plugin (do NOT disable the whole plugin — core enforcement stays live). Optionally also flip `GOVERNANCE_REASON_FIELD_ENABLED = false` client-side to stop writing the column (harmless to leave on; the column write is additive and never blocks anything on its own). |
| The reason column itself | No rollback needed — the column is additive, nothing reads it once `RequireReasonFieldToEnforce` is false, and the provisioning script has no delete path by design (removing a column is a separate, deliberate, out-of-band schema decision, not part of this initiative's rollback path). |
| The RETURN/DECLINE/WITHDRAW UI mount (Phase 0) | Remove `<DealGovernedTransitionPanel />` from `BankerDealWorkspace.tsx` (one line) and redeploy the client. The plugin, if registered, keeps protecting ADVANCE and any direct-write attempt regardless of whether this UI is mounted. |

**When to use rollback:** a plugin bug that produces a false-positive rejection (blocking a
genuinely valid transition) is the primary trigger — disable the pre-operation step immediately
(this is the one that actually blocks writes), leave pre-validation running if it's not implicated
(it only logs, it never blocks), fix the bug, re-verify against
`LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` before re-registering.

## What this plan deliberately does not cover

- Dataverse security-role configuration (who can register/unregister plugin steps, who holds
  System Administrator) — an organizational/platform-admin control outside version control, per
  `docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md` and `THREAT_BYPASS_MODEL.md` row 9.
- Extending server-side enforcement to the fact-bearing tables the requirement registry reads from
  (documents, tasks, credit memo) — named as future, out-of-scope work in
  `THREAT_BYPASS_MODEL.md`'s "what this model does not claim" section.
