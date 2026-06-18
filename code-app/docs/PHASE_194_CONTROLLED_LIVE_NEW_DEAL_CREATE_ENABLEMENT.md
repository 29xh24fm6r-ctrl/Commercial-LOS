# Phase 194 — Controlled Live New Deal Create Enablement

## 1. Purpose & urgency

This is the **launch unlock**. Phase 191 (Banker V1) and Phase 192 (Credit /
Committee / Compliance) found **no P0 release blockers**; the one remaining
launch-critical condition was live New Deal creation. This phase certifies the
**controlled production enablement path** for live New Deal create — under
controlled gates, with one-line rollback, audit, no borrower comms, no schema
mutation, and no fake data.

It answers: *can the bank safely enable live New Deal creation under controlled
gates?* — **Yes. READY FOR CONTROLLED ENABLEMENT.** This phase **changes no
gate**; it certifies the already-built controlled path and documents the operator
enable/rollback procedure.

## 2. Current integrated master posture

- **Phase 191 — Banker V1:** CONDITIONAL GO (no P0; live create was the open item).
- **Phase 192 — Credit / Committee / Compliance:** CONDITIONAL GO (no P0).
- **Phase 190A — build recovery:** verified; `pnpm build` works from a no-`.power`
  clone via the wired preflight.
- **Phase 189L — Salesforce CRM live readiness console:** present on master
  (read-only readiness; no CRM writes).

## 3. Why live New Deal create is the remaining launch unlock

Origination starts with deal creation. Phases 191/192 certified that every banker
and credit/committee surface is honest, fail-closed, and free of fake data — but a
banker cannot originate a deal until live create is enabled. Enabling it safely
(actor-bound, audited, allow-listed payload, rollback-ready) is the last gate
between the certified V1 and an operating LOS.

## 4. Gate inventory

Live create is governed by `evaluateBankerCreateRollout()`
(`src/deals/bankerNewDealCreateRollout.ts`), which returns `live_controlled` ONLY
when every condition holds:

1. **Three governance gates** (global defense-in-depth constants, all `false`):
   - `BANKER_NEW_DEAL_CREATE_ENABLED` (`dealOriginationFeatureFlags.ts`)
   - `NEW_DEAL_CREATE_ADAPTER_ENABLED` (`newDealCreateFeatureFlags.ts`)
   - `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` (`adminNewDealIntakeModel.ts`)
2. **A resolved actor systemuser** (`actorSystemUserId`) — no actorless create.
3. **Banker authorization** (`bankerAuthorized`).
4. **Environment approval** — in production, an explicit `productionRolloutApproved`.
5. **Approved production references** (`productionReferencesApproved`).
6. **A Ready Stage/Status resolver** (`resolverReady`).

Any one missing → a specific non-`live_controlled` state (`disabled`,
`unauthorized`, `environment_not_allowed`, `references_not_approved`,
`resolver_not_ready`), each surfaced honestly with "No record has been created."

## 5. Disabled-by-default posture & the operator-controlled switch

The three **global governance constants remain `false`** — the no-override default
of `evaluateBankerCreateRollout()` is `disabled`. Controlled enablement is supplied
**not** by flipping those constants but by the explicit, operator-controlled pilot
config (Phase 182B, `src/deals/bankerCreatePilotConfig.ts`):

- `BANKER_CREATE_PILOT_ENABLED` — **THE single enable/rollback switch**. When
  `true`, `bankerCreatePilotGateValues()` supplies `{ banker, adapter, intake }`
  overrides to the rollout gate; when `false`, it returns `undefined` and the gate
  falls back to the false globals → `disabled`.
- `BANKER_CREATE_PILOT` — the approved production context
  (`environmentIsProduction`, `productionRolloutApproved`,
  `productionReferencesApproved`).

The switch only **authorizes the gate**; it never bypasses actor resolution,
references, the Ready resolver, the payload allow-list, or audit. This is the
"explicit operator-controlled configuration already exists" path — the default
code posture stays safe, and rollback is one line.

## 6. Required conditions for live enablement

All of: the three gate overrides true (pilot switch on) **and** a resolved actor
systemuser **and** banker authorization **and** approved production references
**and** a Ready production Stage/Status resolver **and** (in production) explicit
rollout approval. The governed adapter (`newDealCreateAdapter.ts`) re-verifies
references/resolver at submit and **fails closed**; the create payload is asserted
to be a **subset of `NEW_DEAL_CREATE_ALLOWED_FIELDS`** (7 fields only) or it fails
closed — no stray/guessed column is ever written.

## 7. Rollback / kill-switch plan

- **One-line kill-switch:** set `BANKER_CREATE_PILOT_ENABLED = false` in
  `bankerCreatePilotConfig.ts` and ship. The rollout gate immediately returns
  `disabled`; the create form is replaced by the honest "Create disabled" note;
  no write path is reachable.
- **Defense-in-depth:** the three global constants remain `false`, so even an
  errant override cannot enable create without the pilot switch.
- **Rollback owner:** the release operator named in the pre-enable checklist.
- Rolling back is **non-destructive**: already-created deals are unaffected; only
  the create surface is re-disabled.

## 8. Operator pre-enable checklist

- [ ] Confirm master build is green from a no-`.power` state (`pnpm build`).
- [ ] Confirm the full suite is green (`pnpm test`).
- [ ] Confirm the target environment is production or the approved pilot environment.
- [ ] Confirm the Dataverse target environment is correct.
- [ ] Confirm the pilot banker(s) are identified and provisioned (resolved systemuser).
- [ ] Confirm the pilot deal/test-record policy is approved (test deals clearly labeled).
- [ ] Confirm the rollback owner is identified.
- [ ] Confirm audit logging is verified (cr664_auditevents + cr664_user ChangedBy bind).
- [ ] Confirm the first live deal's test data is agreed.
- [ ] Confirm no borrower comms will be sent.
- [ ] Confirm checklist generation remains disabled.
- [ ] Confirm CRM writes remain disabled / readiness-only.

## 9. Operator post-enable smoke checklist

- [ ] Banker workspace loads (fail-closed identity gate).
- [ ] New Deal create path is visible only to the entitled banker.
- [ ] Create form validates required fields (deal name required).
- [ ] One controlled live deal create succeeds (Stage Intake / Status Open).
- [ ] The created deal opens in the deal workspace (`/deals/:dealId`).
- [ ] The audit actor is correct (cr664_user CoreUser bind, never /systemusers).
- [ ] The payload contains only certified fields (`NEW_DEAL_CREATE_ALLOWED_FIELDS`).
- [ ] No borrower comms were sent.
- [ ] No checklist generation was triggered.
- [ ] Rollback gate tested or explicitly documented (flip the pilot switch off/on).
- [ ] Evidence captured (see §10).

## 10. Evidence capture checklist

- [ ] Build log (no-`.power` → green) + full-suite result.
- [ ] Screenshot/recording of the create → created-deal-opens flow.
- [ ] The created deal id + Stage/Status.
- [ ] The audit event row id + ChangedBy `/cr664_users(<CoreUser>)` bind.
- [ ] Correlation id (audit metadata only).
- [ ] Confirmation no borrower comms / no checklist rows were produced.
- [ ] Rollback test note (pilot switch toggled).

## 11. Failure handling

- **Create fails:** honest "Create failed. No confirmed deal." — non-destructive,
  no partial record claimed.
- **Audit fails after create (`audit_failed_partial`):** the deal exists but the
  audit must be reattempted by an operator; surfaced explicitly, never a clean
  success.
- **Any failure signal that requires rollback:** unexpected payload keys, a
  `/systemusers` bind attempt, borrower comms observed, checklist rows created, or
  any non-create Dataverse write → **flip `BANKER_CREATE_PILOT_ENABLED = false`
  immediately** and capture evidence.

## 12. No-borrower-comms statement

This phase introduces **no borrower communication**. The create surface
(`BankerNewDealCreate.tsx`) and the governed adapter import no borrower email /
SMS / Outlook / handoff / document-send module; create writes only the
allow-listed loan-deal fields + the audit event.

## 13. No-schema-mutation statement

**No schema and no migration file** is added in this phase. Live create writes a
single `cr664_loandeals` row whose keys are a subset of the 7-field certified
allow-list; no table is created or altered, and no broad CRM or unrelated-table
write occurs.

## 14. No-checklist-generation statement

**No checklist generation is enabled or triggered.** The banker create passes an
empty automation `config: {}`, and document-checklist generation stays gated off:

- `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false`
- `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false`
- `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`

## 15. Final recommendation

**READY FOR CONTROLLED ENABLEMENT.**

The controlled live New Deal create path is fully built, fail-closed, audited,
allow-listed, and one-line reversible. The three global governance gates remain
`false` (defense-in-depth); the Phase 182B operator switch is the single
controlled enable/rollback line. With the pre-enable checklist (§8) signed off,
the bank can safely enable live New Deal creation. This **clears the remaining
launch-unlock condition** behind the Phase 191/192 **CONDITIONAL GO** — the banker
and credit/committee paths were already P0-clear; live create is now certified for
controlled enablement, subject to operator sign-off.

## 16. Verification

```
Remove-Item .power -Recurse -Force -ErrorAction SilentlyContinue
pnpm build
pnpm test -- phase194 NewDeal BankerNewDealCreate phase191 phase192 releaseCandidateSnapshot
pnpm test -- phase188K phase190A documentChecklistPilot releaseCandidateSnapshot
pnpm test
```
