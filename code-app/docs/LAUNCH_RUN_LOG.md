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

## Remaining phases

(Updated as each lands.)
