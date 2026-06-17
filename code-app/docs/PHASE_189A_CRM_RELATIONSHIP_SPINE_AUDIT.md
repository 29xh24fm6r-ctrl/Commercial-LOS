# Phase 189A — CRM Relationship Spine Read-Only Audit

**Status:** Complete (read-only audit). No runtime behaviour changed, no
Dataverse writes, no schema mutation, no borrower contact.

**Branch:** `phase189-crm-relationship-spine-audit`

**New script mode:** `node scripts/phase122-lookup-repair.mjs --inspect-crm-relationship-graph`

```
--inspect-crm-relationship-graph
  (exactly one of) --deal-name "<deal name>" | --deal-id <guid>
  [--upn "<banker email>"]   # optional banker -> team cross-check
  [--json]                   # optional machine-readable output
```

The mode resolves **exactly one** Loan Deal and walks its CRM relationship
graph using **pure metadata + data GETs**. It emits exactly one terminal
status: `CRM_GRAPH_READY`, `CRM_GRAPH_PARTIAL`, `CRM_GRAPH_BLOCKED`, or
`CRM_GRAPH_UNSAFE_PSEUDO_LOOKUP`. It never POST/PATCH/DELETEs, never publishes
metadata, never mutates a solution, never contacts a borrower, and never
touches the document-requirement path.

---

## 1. What is our canonical CRM entity today?

There are **two layers**, and they do not yet meet:

| Layer | Entity | State |
|---|---|---|
| **Live (Dataverse, in use)** | `cr664_clientrelationship` | **De-facto canonical CRM record today.** It is the target of the Loan Deal's `cr664_Client` lookup. Columns observed: `cr664_clientname`, `cr664_borrowertype` (Picklist). It is a thin borrower/account stub — no contacts, owners, guarantors, activities, or relationship roles hang off it. |
| **Planned (modeled in code only)** | `cr664_crmorganization`, `cr664_crmperson`, `cr664_crmcontactpoint`, `cr664_crmrelationship`, `cr664_crmroleassignment`, `cr664_crmcommunicationpreference`, `cr664_crmcontactauthorization`, `cr664_crmvendorprofile`, `cr664_crmtimelineevent`, `cr664_crmauditentry` | **Modeled in `src/crm/crmDataverseSchemaPlan.ts` (Phase 141J–K) but NOT seeded into live Dataverse.** Feature flag `CRM_LIVE_PERSISTENCE_ENABLED` is OFF by default; the live adapter (`src/crm/crmLiveDataverseAdapter.ts`) fails closed behind flag → schema-gate → transport → authorization. |

**Conclusion:** The canonical CRM entity *as wired today* is
`cr664_clientrelationship` (borrower/account stub). The Salesforce-style spine
(`cr664_crmorganization` as account, `cr664_crmperson` as contact, edges via
`cr664_crmrelationship`/`cr664_crmroleassignment`) is **designed but not
present in the environment**.

---

## 2. The relationship graph that exists today

```
cr664_loandeal  (the deal — primary entity)
  ├─ cr664_Client      ──► cr664_clientrelationship   [REAL lookup, _cr664_client_value]
  ├─ cr664_Team        ──► cr664_team                 [REAL lookup, _cr664_team_value]
  └─ cr664_AssignedTo  ──► systemuser (historically)  [REAL lookup, _cr664_assignedto_value]

cr664_banker
  ├─ cr664_email        (matched against --upn)
  └─ cr664_Team        ──► cr664_team                 [_cr664_team_value]

cr664_platformuser
  ├─ cr664_CoreUser    ──► cr664_user                 (audit actor bridge, Phase 184–188)
  └─ cr664_primaryworkspace ──► cr664_platformworkspace
```

**Wired and live:** Deal→Client, Deal→Team, Deal→AssignedTo, Banker→Team,
PlatformUser→CoreUser, PlatformUser→Workspace.

**Absent:** any borrower→contact, organization→person, owner/principal,
guarantor, relationship-role, activity/timeline, referral/source,
household/business-group, KYC/ownership/control-person, or cross-deal-exposure
edges.

---

## 3. What is missing for a Salesforce-style CRM

| Capability | Today | Gap |
|---|---|---|
| Account / company profile | `cr664_clientrelationship` stub | No `cr664_crmorganization` live; no industry/legal-entity/address structure |
| Contacts | none | No `cr664_crmperson` / `cr664_crmcontactpoint` live |
| Owners / principals | none | No owner/principal modeling live |
| Guarantors | none | No guarantor edge live |
| Related entities / relationship roles | none | No `cr664_crmrelationship` / `cr664_crmroleassignment` live |
| Activity timeline (calls/emails/tasks/notes) | none live (`cr664_dealtask` exists for tasks; `cr664_auditevent` for audit) | No `cr664_crmtimelineevent` live |
| Notes / calls / emails / tasks | partial (`cr664_dealtask`) | No unified activity entity |
| Referrals / source tracking | none | Not modeled live |
| Household / business-group relationships | none | Not modeled live |
| KYC / ownership / control-person | none | Not modeled live |
| Cross-deal exposure by relationship | none | No relationship→many-deals rollup |

---

## 4. Tables / columns available (live, observed via metadata)

**Real Dataverse lookups** (expose `_<attribute>_value` + LookupAttributeMetadata `Targets`):

- `cr664_loandeal.cr664_Client` → `cr664_clientrelationship`
- `cr664_loandeal.cr664_Team` → `cr664_team`
- `cr664_loandeal.cr664_AssignedTo` → `systemuser` (target reported, not assumed)
- `cr664_banker.cr664_Team` → `cr664_team`
- `cr664_platformuser.cr664_CoreUser` → `cr664_user`
- `cr664_platformuser.cr664_primaryworkspace` → `cr664_platformworkspace`

**Choice / picklist fields:** `cr664_clientrelationship.cr664_borrowertype`;
deal stage/status are reference-table lookups (`cr664_dealstagereference`,
`cr664_dealstatusreference`), not picklists.

**Pseudo (GUID-as-text) columns — legacy, Phase 122 history:** lowercase
`cr664_deal` and `cr664_assignedto` were pseudo scalar columns on child tables
that stored a GUID string with **no relational integrity**. Phase 122 repaired
the canonical relationships to real Lookups (`cr664_Deal`, `cr664_AssignedTo`,
capitalized). The audit re-classifies each relationship column live via the
certified `classifyAttribute` probe and reports `real-lookup` vs
`pseudo-scalar`. A relationship found riding a pseudo column that holds a GUID
triggers `CRM_GRAPH_UNSAFE_PSEUDO_LOOKUP`.

**Real vs pseudo — how the audit decides (the safety contract):**

- *Real lookup:* `AttributeType === 'Lookup'`, castable to
  `Microsoft.Dynamics.CRM.LookupAttributeMetadata`, exposes `Targets[]`, and the
  row exposes the `_<attribute>_value` OData projection. Display name comes from
  the `OData.Community.Display.V1.FormattedValue` annotation.
- *Pseudo column:* `AttributeType !== 'Lookup'` (String/Uniqueidentifier/Memo)
  storing a raw GUID — surfaced as **unsafe**, never treated as a real link.

---

## 5. Recommended canonical CRM model

Adopt the **already-modeled spine** rather than overloading
`cr664_clientrelationship`:

- `cr664_crmorganization` = account/company (borrowers, vendors, agencies)
- `cr664_crmperson` = contacts / individuals (owners, principals, guarantors, advisors)
- `cr664_crmcontactpoint` = emails / phones / addresses
- `cr664_crmrelationship` = the canonical **edge** entity (org↔org, org↔person,
  person↔person) with optional `cr664_OriginatedLoanDeal` / `cr664_BoardedLoan`
  links — this is where owners/principals/guarantors/cross-deal exposure live
- `cr664_crmroleassignment` = relationship roles (relationship_manager,
  servicing_owner, borrower_contact, …)
- `cr664_crmtimelineevent` = read-only activity timeline
- Keep `cr664_clientrelationship` as the **borrower stub / bridge** that a
  migration later maps onto `cr664_crmorganization`.

This model is already specified in `src/crm/crmDataverseSchemaPlan.ts` and has
view-models waiting on it (`crmRelationshipIntelligenceViewModel`,
`crmCommandCenterViewModel`, `crmSourceOfTruthCockpitViewModel`,
`crmActivityTimelineModel`). The Salesforce/nCino lanes treat
**LOS/Dataverse as the source of truth**.

---

## 6. Recommended Phase 189B

Build in this order (least risk first):

1. **Pure CRM relationship view-model (read-only).** Consume the *live* graph
   this audit walks (Deal→Client→Banker→Team, +CoreUser/Workspace) and project
   it into a Salesforce-shaped view-model, surfacing the gaps in §3 as explicit
   "not yet linked" states. No IO, no writes.
2. **Read-only CRM Relationship Center UI** over that view-model — display only,
   no live CRM lookups, no outreach (mirror the existing CRM cockpit safety
   posture: `readOnly: true`, `liveWritePerformed: false`).
3. **Guarded seed/repair script** for the spine tables — *only* after a runtime
   schema gate confirms the `cr664_crm*` tables exist live. Dry-run by default,
   commit behind an explicit flag, fail-closed, idempotent, audit-emitting (reuse
   the `cr664_user` audit-actor resolver from Phase 184–188). **Not** part of
   189B unless the schema gate is green.

**Recommendation:** start with **189B = the pure read-only relationship
view-model**, because the spine tables are not yet live, so there is nothing to
seed safely and nothing for a UI to read beyond the existing live graph.

---

## 7. What is explicitly NOT built in 189A

- No new Dataverse tables, columns, lookups, or rows.
- No schema mutation, no `PublishXml`, no solution change.
- No CRM relationship view-model and no CRM Relationship Center UI (that is 189B).
- No seed/repair of the `cr664_crm*` spine tables.
- No borrower contact, email, SMS, Outlook, or handoff.
- No document-requirement / checklist changes.
- No stage/status/portfolio automation, no New Deal creation.
- No runtime React/source behaviour changed; route count unchanged.

---

## 8. Acceptance evidence

- New mode is mutually exclusive with all existing script modes (added to
  `exclusiveModes`); requires exactly one of `--deal-name` / `--deal-id`;
  `--deal-id` rejected outside the mode; `--upn` optional and allow-listed.
- Read-only: the entire Phase 189A code path issues only `GET`s — no
  POST/PATCH/DELETE, no PublishXml, no solution mutation
  (`src/shared/governance/phase189CrmRelationshipSpineAuditContract.test.ts`,
  26 source-level pins).
- Honest statuses: 0/>1 deal matches → `CRM_GRAPH_BLOCKED`; missing spine →
  `CRM_GRAPH_PARTIAL` (never fake success); pseudo lookup carrying a GUID →
  `CRM_GRAPH_UNSAFE_PSEUDO_LOOKUP`.
- No checklist/comms/handoff modules imported; the script imports only Node
  builtins.
