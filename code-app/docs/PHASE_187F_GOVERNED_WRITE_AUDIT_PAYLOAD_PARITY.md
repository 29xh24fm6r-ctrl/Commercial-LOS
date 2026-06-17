# Phase 187F — Governed Write Audit Payload Parity

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Mode:** READ-ONLY source analysis vs live `cr664_auditevent` metadata (187B). No writes.
- **Spec:** Phase 187F.

## Live required baseline (authoritative, 187B)

`cr664_auditevent` App-required: `cr664_changedby` (Lookup → **cr664_user**, NOT systemuser),
`cr664_changeddate`, `cr664_entityid` (String), `cr664_entitytype` (Picklist), `cr664_eventcategory`
(Picklist), `cr664_eventtype` (Picklist), `cr664_outcomestatus` (Picklist), `cr664_auditeventname`
(String). Owner/state are server-defaulted and must **not** be sent.

## Summary table

| Domain | File | Emits audit? | ChangedBy target | ActorUser | Owner/state sent? | cr664_user resolver | Partial distinct? | Verdict |
|---|---|---|---|---|---|---|---|---|
| New Deal create (canonical) | dealOriginationAudit.ts + newDealCreateAdapter.ts | Yes | `/cr664_users(<id>)` ✅ | none ✅ | No ✅ | Present (`newDealAuditActorResolver`) ✅ | Yes (`audit_failed_partial`) ✅ | **PARITY_OK** (reference) |
| Task complete | dealTaskActions.ts:89-101 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes (`governance-partial`) | **WRONG_ACTOR_TARGET** |
| Create review task | dealTaskActions.ts:302-315 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Document request | documentActions.ts:87-99 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Document receive | documentActions.ts:293-305 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Document review | documentActions.ts:507-519 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Document request email | sendDocumentRequestEmail.ts:180-192 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Document request handoff | prepareDocumentRequestHandoff.ts:157-169 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Borrower communication | sendBorrowerUpdateEmail.ts:177-189 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Log activity | logActivityActions.ts:58-73 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Credit memo draft save | creditMemoActions.ts:122-134 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes | **WRONG_ACTOR_TARGET** |
| Alert resolve/dismiss | alertActions.ts:97-109 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes (`audit-failed`) | **WRONG_ACTOR_TARGET** |
| Data quality flag resolve | dataQualityActions.ts:76-88 | Yes | `/systemusers(<id>)` ❌ | `/systemusers` | **Yes** ❌ | Missing | Yes (`audit-failed`) | **WRONG_ACTOR_TARGET** |
| CRM automation | dealCrmAutomationAdapter.ts | **No** | n/a | n/a | n/a | n/a | n/a | **NO_AUDIT** (disabled by design) |
| Stage advancement (auto) | autoStageAdvanceAdapter.ts | **No** | n/a | n/a | n/a | n/a | n/a | **NO_AUDIT** (disabled by design) |
| Checklist generation | newDealChecklistGenerationAdapter.ts | **No** | n/a | n/a | n/a | n/a | n/a | **NO_AUDIT** (disabled by design) |
| Portfolio side effects | newDealPortfolioSideEffectsAdapter.ts | **No** | n/a | n/a | n/a | n/a | n/a | **NO_AUDIT** (disabled by design) |
| Downstream automation (orchestrator) | dealOriginationOrchestrator.ts | Only via create step | inherits New Deal ✅ | none | No | inherits ✅ | Yes (fail-closed) ✅ | **PARITY_OK** |
| CRM mapper audit entry | crmDataverseMapper.ts | Separate table `cr664_crmauditentry`, pure mapper | n/a | n/a | No | n/a | n/a | **OTHER** |
| Copilot audit logger | copilotAuditLogger.ts | Future table `cr664_copilotauditevent`, disabled no-op | n/a | n/a | n/a | n/a | Fail-closed (`audit_unavailable`) | **OTHER** |

## Detail

### New Deal create — PARITY_OK (the reference)
`dealOriginationAudit.ts:94-121` `buildNewDealAuditPayload` is the single canonical builder. It binds
`cr664_ChangedBy@odata.bind` to a caller-resolved `/cr664_users(<id>)` (line 110), emits no
`cr664_ActorUser`, no `ownerid`/`owneridtype`/`statecode` (allow-list `:66-85` excludes them). All
required fields present; deal referenced both as `cr664_entityid` string and `cr664_LoanDeal@odata.bind`;
correlation id set. The resolver (`newDealAuditActorResolver.ts:108-171`) maps actor email → ACTIVE
`cr664_platformusers` → `_cr664_coreuser_value` → `/cr664_users(<id>)`, fail-closed. `emitNewDealAuditEvent`
(`newDealCreateAdapter.ts:347-400`) refuses to POST if resolution fails (`:351-360`) — a systemuser id
is never bound and audit is never faked. Partial state is distinct: `createGovernedNewDeal` returns
`audit_failed_partial` (`:294-301`); the orchestrator propagates it and refuses downstream (`:235-244`).

### The 12 in-app governed writes — WRONG_ACTOR_TARGET
Every one binds a **systemuserid into the `cr664_user` lookup** (`cr664_ChangedBy@odata.bind:
'/systemusers(${systemUserId})'`), the exact bind the live POST proved Dataverse rejects ("Entity
'cr664_User' With Id = <systemuser id> Does Not Exist"). Each also binds a redundant
`cr664_ActorUser@odata.bind → /systemusers` and sends server-defaulted `ownerid` /
`owneridtype:'systemuser'` / `statecode:0`.

- These are **MISSING_REQUIRED in effect**: the required `cr664_changedby` is populated with an
  unresolvable target, so create fails closed at Dataverse.
- **No cr664_user resolver** is present in any of these files; they consume only a `systemUserId`
  from `currentUserLookup.ts` (Entra-OID → systemuserid — the wrong identity for this lookup).
- Otherwise correct: required-field coverage complete; option values pinned to verified constants
  (alert = Alert 788190003 / ExceptionResolved 788190006 / Configuration 788190005; DQ = Exception
  788190007); `entityid` is a string; deal referenced via both `cr664_entityid` + `cr664_LoanDeal@odata.bind`
  (admin alert/DQ correctly omit the LoanDeal bind); correlation id set and propagated to audit + timeline.
- **Partial discipline is correct** in all 12: primary write success + audit failure yields a distinct
  status (`governance-partial` / `audit-failed`), never swallowed or faked.

So these fail parity ONLY on **actor target + owner/state over-send**, not on the partial-state contract.

### CRM / stage / checklist / portfolio adapters — NO_AUDIT (by design)
The four origination-downstream adapters emit **no `cr664_auditevent`**; they carry only the shared
`cr664_correlationid` + `cr664_Deal@odata.bind`. Audit for the origination flow lives entirely in the
New Deal create step. **Future gap:** if these are ever enabled, the side-effect writes themselves will
have no audit row — flag for the enabling phase.

### CRM mapper / Copilot logger — OTHER
- `crmDataverseMapper.ts:304-324` builds a `cr664_crmauditentry` row (different table), pure mapper, no IO.
- `copilotAuditLogger.ts` targets a future `cr664_copilotauditevent`; the shipped logger is a disabled
  no-op that fails closed with `audit_unavailable` (`:121-134`) and never fabricates an id.

## Key findings

1. **One correct emitter (New Deal), twelve broken ones.** All 12 in-app governed writes bind
   `/systemusers(<id>)` into the `cr664_changedby` (`cr664_user`) lookup — the same defect class New
   Deal already fixed. They also bind a redundant `cr664_ActorUser` and send owner/state.
2. **The fix already exists and is proven.** `newDealAuditActorResolver.ts` resolves the
   platform-user → CoreUser bridge, fail-closed. It must be back-ported to the other emitters; ideally
   consolidate the 13 inline payloads behind the one canonical builder.
3. **Partial-failure discipline is uniformly correct.** No domain swallows or fakes success.
4. **Test gap.** `auditPayloadDiscipline.test.ts:126-137` pins `cr664_ChangedBy@odata.bind` as required
   but does **not** verify its bind target — which is why the systemuser-vs-cr664_user defect passes the
   sweep. `phase182AuditBindGovernance.test.ts` asserts the target only for the New Deal builder, not
   the 12 legacy emitters. Remediation must add a target-assertion test across all emitters.
5. **Downstream audit gap.** When CRM/stage/checklist/portfolio adapters are enabled, they emit no
   audit — must be addressed in their enabling phase, not silently.
