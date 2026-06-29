# Launch Readiness Run Log

Branch: `launch/readiness-20260629` · Base commit: `4e29147` (Phase 262)

This log tracks the launch-readiness hardening session. Prime directive: **never
fabricate evidence; only harden gates.** Repo-side work is completed here; operator-owned
steps (real smoke re-capture, Dataverse column provisioning, live production acceptance)
are handed to the Phase 7 runbook, never faked.

## Baseline (session start)

| Gate | Result |
| --- | --- |
| `phase190A-power-artifact-preflight --ensure` | ✅ 0 (artifact present) |
| `npx tsc -b` | ✅ 0 |
| `npm run audit:reachability` | ✅ 0 (expected orphans only) |
| `npm run build` | ✅ 0 (green at `4e29147` deploy) |
| full `vitest` suite | ✅ 684 files / 10,386 passed / 2 skipped (green at `4e29147` deploy) |

## Launch posture at baseline — smoke evidence truth

The committed evidence in `docs/operator-evidence/final-launch/*.json`, read against the
**pre-hardening** parser (`src/access/finalLaunchSmokeEvidence.ts`), all show `outcome:
passed` and pass structurally. Their *integrity*, however, is not launch-grade:

| Domain | operatorUpn | Machine proof | Timestamps | Honest verdict |
| --- | --- | --- | --- | --- |
| crmLivePersistence | `unknown-operator` ❌ sentinel | real record GUID ✅ | sub-second ✅ | **Not attributable** |
| portfolioBoarding | `unknown-operator` ❌ sentinel | real record GUID ✅ | sub-second ✅ | **Not attributable** |
| documentChecklist | `mpaller@oldglorybank.com` ✅ | `affectedRecordIds: []` ❌ | round `:00.000` ⚠ | **No machine proof** |
| stageAdvancement | `mpaller@oldglorybank.com` ✅ | `affectedRecordIds: []` ❌ | round `:00.000` ⚠ | **No machine proof** |
| borrowerSend | `mpaller@oldglorybank.com` ✅ | no `deliveryReceiptId`/`approvedRecipient`/`approverUpn` ❌ | round `:00.000` ⚠ | **No transport receipt** |

**Correction (from wiring map):** the six live-write flags **are ON** (flipped in Phase
256B), and `deriveProductionEnvironmentVerification().fullLaunchReady` + the evidence GO
gate (`deriveFinalLaunchReadiness().deploymentAllowed`) both report `true` on the weak
evidence. So the system **does** currently claim full launch on manufactured-looking
proof — exactly the gap this session closes. The evidence GO authority is
`isFinalLaunchSmokeGo` (consumed belt-and-braces in `finalLaunchReadiness.ts`).

## Phase 1 — Evidence-integrity hardening ✅ (commit pending)

Hardened `src/access/finalLaunchSmokeEvidence.ts` (additive, stricter only):
- **Identity:** `isAttributableOperatorUpn` requires a real `local@domain.tld` UPN and
  rejects the sentinel set (`unknown-operator`, `unknown`, ``, `system`, `service-account`,
  `n/a`, all-zero GUID).
- **Evidence class + machine proof:** `EVIDENCE_CLASS_BY_CAPABILITY`. AUTOMATED_CRUD
  (crm/portfolio/checklist/stage) requires non-empty `affectedRecordIds`; EXTERNAL_SEND
  (borrowerSend) requires `deliveryReceiptId` + `approvedRecipient` + a valid `approverUpn`
  (new optional fields).
- **Synthetic-timestamp heuristic:** `isSyntheticTimestamp` flags round `…:SS=00.000`
  clocks → downgrades AUTOMATED_CRUD confidence to LOW (never full proof).
- **`EvidenceIntegrityReport` + `deriveEvidenceIntegrity`:** per-domain `{ accepted,
  evidenceClass, operatorUpn, identityValid, machineProofPresent, confidence
  HIGH|LOW|NONE, issues[] }`.
- **`isFinalLaunchSmokeGo` now delegates to `deriveEvidenceIntegrity().accepted`** (shape
  GO is preserved as `isFinalLaunchSmokeShapeGo`). The whole belt-and-braces chain
  (`toOperatorSmokeEvidence` → registry; `deriveFinalLaunchReadiness`) hardens automatically.
- Surfaced `integrity` + `evidenceInsufficient` on each `FinalLaunchCapabilityReadiness`.

**Effect (correct, not a regression):** the committed evidence is now reported
**INSUFFICIENT** — `deriveFinalLaunchReadiness().deploymentAllowed` is `false`; crm/portfolio
fail on sentinel identity, checklist/stage/borrowerSend on missing machine proof.
**Zero evidence files were edited.** Updated tests (`finalLaunchSmokeEvidence`,
`finalLaunchReadiness`, `phase256A/B`) — "valid" fixtures now model real machine proof; the
committed-evidence tests assert the honest insufficiency.

**Deferred to Phase 5:** the flag-driven `productionEnvironmentVerification.fullLaunchReady`
(and cutover/ledger) still report 6/6; those are gated on the integrity report in Phase 5.
Documented in the two phase256 tests.

Gate: tsc 0 · full vitest **684 files / 10,393 passed / 2 skipped** · reachability 0 · build 0.

## Phase 4 — Authentic-evidence verifier + production-acceptance checklist ✅ (commit pending)

- **`npm run verify:launch-evidence`** (new): runs the Phase-1 integrity report over
  `docs/operator-evidence/final-launch/*.json` and exits **non-zero** unless every domain is
  `accepted` at `HIGH` confidence, printing a per-domain reason report. Lives in its own
  config (`vitest.launch-evidence.config.ts`) + spec (`scripts/launchEvidenceVerify.spec.ts`)
  **outside** the default `src/**` suite, so the green CI gate (`npm run verify`) is
  unaffected. **Currently exits non-zero (1)** against the insufficient evidence — the correct
  signal — naming each domain's gap (sentinel identity / no record ids / no delivery receipt).
- **`docs/PRODUCTION_ACCEPTANCE_CHECKLIST.md`** (new): the human acceptance pass on the live
  play URL, per domain, with named sign-off fields and the explicit borrowerSend protocol
  (approved test recipient, captured transport receipt, named approver).
- **Harness upgrade (operator-owned, → Phase 7):** the PowerShell smoke harness must (a) fail
  rather than default to `unknown-operator` when it cannot resolve the live UPN, and (b)
  capture the borrowerSend `deliveryReceiptId`/`approvedRecipient`/`approverUpn`. Contract is
  specified in the checklist; the `.ps1` change is operator-run against a live env and is not
  faked here.

Gate: tsc 0 · lint 0 errors · default suite unchanged (verifier excluded from `src/**`).
`verify:launch-evidence` exits 1 by design.

## Phase 5 — Governance truth-up ✅ (commit pending)

Removed the split-brain: **every** launch projection now derives launch truth from the
Phase-1 integrity authority, so the admin panel agrees with the verifier.

- **Single source, browser-safe:** new `src/access/committedFinalLaunchEvidence.ts` imports the
  committed `docs/operator-evidence/final-launch/*.json` at build time (enabled
  `resolveJsonModule`) and runs the SAME `deriveEvidenceIntegrity` authority. On the operator's
  Phase-7 re-capture + deploy rebuild, every projection flips together — no second copy.
- **`productionEnvironmentVerification`:** a domain resolves `enabled` only when
  `certified && gateFlagOn && evidenceHigh` (accepted at HIGH confidence). Evidence/flags gate
  DOWN; nothing asserts launch UP. Added `evidenceHigh` / `evidenceInsufficient` /
  `evidenceIssues` per domain + an `evidenceHigh` input override for fixtures.
- **Propagation:** the admin panel (`fullActivationLaunchCertificationModel`), cutover
  (`controlledLiveCutoverReadiness`), and ledger roll-up (`fullProductionLaunchEvidence`) read
  the verification, so all flip together. Against the committed (insufficient) evidence they now
  report **1/6 — not launched** (only New Deal create, which is pilot-certified).
- **History preserved (5.4):** the ledger's environment-evidence rows + PASS statuses and the
  `PAC_DEPLOYMENT_EVIDENCE.md` deploy record are untouched — only the forward-looking roll-up is
  gated.
- **Mandatory positive fixture:** `deriveProductionEnvironmentVerification({ evidenceHigh:
  ALL_TRUE, ... })` ⇒ 6/6, `fullLaunchReady=true` — proving the gate flips GO under authentic
  evidence (so the operator's green is trusted, not hard-wired false).

**Effect:** the verifier, projection, admin panel, cutover, and ledger roll-up now tell ONE
true story — not launched until authentic evidence lands. `verify:launch-evidence` still exits 1
(unchanged). No evidence files / ledger event rows edited; no flag forces launch true.

Tests flipped toward honesty across ~17 files (core models + panel + phase237–256 governance
contracts); valid fixtures inject HIGH evidence to prove the positive path.

Gate: tsc 0 · full vitest **684 files / 10,393 passed / 2 skipped** · reachability 0 · build 0 ·
new-code lint 0 · `verify:launch-evidence` exit 1 (by design).

## Remaining phases

- **Phase 2** (extended-attributes persistence): next.
- **Phase 3** (lint baseline): new code lint-clean; legacy baseline pending.
- **Phase 7** operator runbook: pre-drafted in `PRODUCTION_ACCEPTANCE_CHECKLIST.md`.
