# Phase 181E — Banker New Deal create live proof

## Status: DEFERRED — blocked (not run)

The controlled live banker create proof was **not run**. The preconditions are
not met, and the guardrails require stopping safely.

## Approval statement

No Matt approval for a live proof is recorded. Guardrail: "Do not create a deal
unless Matt explicitly approves the live proof."

## Blockers (all must clear before a proof)

1. **No production-safe Stage/Status references exist or are approved.** Only the
   TEST `PHASE121_*` rows are active; they are rejected for production
   (Phase 181A). The approved-production resolver therefore fails closed
   (`missingStage` / `missingStatus`).
2. **Banker create gates are hard-false**:
   `BANKER_NEW_DEAL_CREATE_ENABLED = false`,
   `NEW_DEAL_CREATE_ADAPTER_ENABLED = false`,
   `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`.
3. **No recorded Matt approval** for the live proof.
4. The banker-workspace create surface is not yet mounted (Phase 181D deferred).

## What is ready

- The approved-production resolver profile (code/name `INTAKE` / `OPEN`,
  TEST/PHASE rows filtered) — fails closed until production rows exist.
- The single banker rollout gate (`evaluateBankerCreateRollout`) — reaches
  `live_controlled` only when all gates + approved references + ready resolver +
  authorized banker actor are present.
- The read-only inspection tool to find/approve production references.

## Procedure to run (only after blockers clear + Matt approval)

1. Operator seeds/approves production Stage (`Intake`/`INTAKE`) and Status
   (`Open`/`OPEN`) rows and re-confirms via
   `--inspect-new-deal-create-references`.
2. Matt records explicit approval for one live proof.
3. The banker create gates are intentionally enabled via the single rollout
   config path for the approved environment only.
4. An approved banker opens the Banker workspace → New Deal → enters
   `V1 Banker Create Proof - YYYY-MM-DD HHMM` → submits.
5. Confirm: Loan Deal created; Stage label = approved production Stage; Status
   label = approved production Status; Assigned Banker / Owner / ChangedBy
   correct; audit event created with correlation id; UI shows success only after
   create + audit success; no downstream side effects (all disabled).
6. Decide keep / close / archive / correct the proof deal.

## Final proof result

Not performed. No Dataverse record created; no audit record written. See the
Phase 181F certification for the exact remaining operator action.
