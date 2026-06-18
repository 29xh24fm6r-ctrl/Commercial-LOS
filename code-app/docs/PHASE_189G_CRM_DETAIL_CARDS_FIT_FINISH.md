# Phase 189G — CRM Detail Cards Fit-and-Finish + Source-Fact Audit

**Status:** Complete. Banker-only, read-only polish of the 189F detail-card
surface plus stronger source-fact traceability. No Dataverse IO/writes, no
schema/migration files, no `App.tsx`/router/`WorkspaceGate` change, no new
route, no `CRM_LIVE_PERSISTENCE_ENABLED` flip, no manager/team/executive mount
parity, no fabricated CRM data, no write affordances.

**Branch:** `phase189g-crm-detail-cards-fit-finish` (base: `master` after PR #12 / Phase 189F merge)

## 189A → 189F chain of custody

| Phase | Contribution |
|---|---|
| 189A | Read-only Dataverse audit of the live relationship graph; real-lookup vs pseudo classification. |
| 189B | Pure `deriveCrmRelationshipViewModel` projection; never fabricates the spine. |
| 189C | Read-only CRM panel + `buildCrmRelationshipInput`, mounted in the authorized banker deal workspace. |
| 189D | Enriched the already-authorized `DealDetail` (no second GET) with real lookup ids + per-edge classifications. |
| 189E | Pure `deriveCrmRelationshipDetailReadiness` audit — which detail surfaces are safe to render. |
| 189F | Read-only detail cards gated by 189E readiness. |
| **189G** | **Fit-and-finish + source-fact traceability** over the 189F cards (this phase). |

## Banker-only scope

The detail cards reach the UI **only** through `BankerDealWorkspace`'s mount of
`DealCrmRelationshipPanel`. `ManagerDealWorkspace` and `TeamDealWorkspace` do
**not** mount the panel or cards. No executive deal workspace exists. Manager/
team/executive parity is an explicit **non-goal** of 189G (see 189H below).

## Source-fact traceability rules

Every visible value is explicitly traceable to its provenance, and the surface
states plainly that **no new CRM lookup** is performed:

- A **provenance banner** (`data-testid="crm-detail-provenance"`) at the top:
  values are derived from the already-authorized deal row via the 189B
  view-model, gated by the 189E readiness audit — no new CRM lookup.
- A **per-safe-section source-fact chip** (`data-source-fact`) naming the exact
  authorized deal lookup (`cr664_Client` / `cr664_Team` / `cr664_AssignedBanker`
  / workspace context), the 189B view-model, and the 189E gate.
- A **footer** (`data-testid="crm-detail-source-footer"`) restating that values
  come from the existing authorized deal context, not a new CRM lookup.

## Deterministic card order

1. Client identity
2. Team ownership
3. Assigned banker
4. Platform / workspace bridge
5. Relationship integrity
6. Salesforce-style spine

(The rejected-assumptions list renders last.)

## Safe / blocked rendering rules

- **Safe** (real id + verified `real-lookup`): name, record id, type/email/
  team-match as applicable, a `real-lookup` chip, and a source-fact chip.
- **Blocked**: a compact reason from the 189E assessment only — no record
  fields, no source-fact chip, and **no fake placeholders** (no `TBD`, "unknown
  contact", "sample role", etc.).
- **`name:` surrogate ids are never displayed** — a defensive `isSurrogateId`
  guard hides any surrogate id even though a safe section only ever carries a
  real id.
- **Unsafe assumptions** (contacts, org hierarchy, roles, activities, timeline,
  communication preferences) remain **rejected labels only**.
- **Salesforce-style spine** stays blocked — *not seeded · not wired*.

## Explicit non-goals (189G)

- No manager/team/executive mount parity.
- No IO loaders / second Dataverse GET.
- No schema seed / migration.
- No write actions, buttons, or forms.
- No `CRM_LIVE_PERSISTENCE_ENABLED` change.

## Recommended 189H

An **authorized manager/team CRM detail mount readiness audit** — a read-only
assessment of whether the manager/team deal-workspace authorization boundaries
can safely host the same readiness-gated cards — **not** a direct mount yet.

## Acceptance evidence

- `CrmRelationshipDetailCards.test.tsx`: deterministic section order; safe cards
  carry source-fact chips (189B + 189E + "no new CRM lookup"); provenance banner
  and footer; blocked cards compact with no fake placeholders/no source chip;
  `name:` surrogate never rendered; unsafe assumptions labels only; spine
  blocked/not seeded; no buttons/forms/inputs.
- `phase189GCrmDetailCardsFitFinishContract.test.ts`: no write verbs/fetch/broad
  query/service-client import, no flag flip, no route/App/Gate change, banker-only
  (manager/team workspaces don't mount), no write affordances, no fabricated
  spine, source-fact language present, deterministic order, surrogate-id guard.
- Full suite green, `npm run build` green, route invariance (no router/App/Gate
  change), no schema/migration files, no Dataverse write paths.
