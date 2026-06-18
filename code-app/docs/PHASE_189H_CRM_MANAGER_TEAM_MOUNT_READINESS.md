# Phase 189H — Manager/Team CRM Detail Mount Readiness Audit

**Status:** Complete. Pure, read-only **mount-readiness audit**. No new mounts,
no manager/team/executive CRM UI, no `App.tsx`/router/`WorkspaceGate` change, no
Dataverse IO, no Dataverse writes, no schema/migration files, no
`CRM_LIVE_PERSISTENCE_ENABLED` flip, no fabricated CRM data. `BankerDealWorkspace`
remains the only active `DealCrmRelationshipPanel` mount.

**Branch:** `phase189h-crm-manager-team-mount-readiness` (base: `main` after the
Phase 189G merge / PR #14). One prior remediation commit on this branch fixes the
189G governance build warning; this is the second commit.

**New module:** `src/crm/crmManagerTeamMountReadiness.ts`
(`deriveCrmManagerTeamMountReadiness(input)` and the no-arg
`auditCrmManagerTeamMountReadiness()` over the known real surfaces — pure, no IO).

## 189C–189G chain of custody

| Phase | Contribution |
|---|---|
| 189C | Read-only `CrmRelationshipPanel` + `DealCrmRelationshipPanel` container, mounted in `BankerDealWorkspace`. |
| 189D | Enriched the already-authorized `DealDetail` with real lookup ids + per-edge classifications (no second GET). |
| 189E | Pure detail-readiness audit: which detail surfaces are safe to render from the authorized graph. |
| 189F | Read-only CRM detail cards gated on the 189E readiness, mounted only in the banker workspace. |
| 189G | Fit-and-finish + source-fact provenance for the detail cards; pinned banker-only mount. |
| **189H** | **Mount-readiness audit** that proves which non-banker (Manager/Team) deal workspaces are technically *capable* of hosting the existing read-only CRM surface — without mounting anything. |

## What this audit assesses

`DealCrmRelationshipPanel` consumes two things from its host: the deal context
(`useDealData`, provided by `DealDataProvider`) and an **optional** banker context
(`useOptionalBanker`). It performs no IO of its own. So whether a host *could*
mount it reduces to host facts already true in the codebase:

| Surface | Mounts today | `DealDataProvider` | Banker context | Deal load | Scope |
|---|---|---|---|---|---|
| Banker (`BankerDealWorkspace`) | **yes (only active mount)** | yes | yes | `loadDealForBanker` | deal-owner |
| Manager (`ManagerDealWorkspace`) | no | yes | no | `loadDealForManager` | team-scoped |
| Team (`TeamDealWorkspace`) | no | yes | no | `loadDealForTeam` | team-scoped |

## Mount-capability rules (audit only)

A non-banker host is **mount-capable** only when both hard prerequisites hold:

1. **`providesDealData`** — it wraps deal content in `DealDataProvider` so the
   panel's `useDealData` resolves.
2. **`authorizedDealLoad`** — the deal was loaded under an authorized,
   role-scoped loader (no new CRM query, no broadened visibility).

A **missing banker context is a degradation, not a blocker**: the panel reads the
assigned banker through `useOptionalBanker` and falls back honestly to the
authorized deal row's lookup ids. The Manager and Team workspaces therefore come
out **mount-capable but deliberately UNMOUNTED** — the read-only CRM surface
remains banker-only this phase.

**Output:** `readinessStatus` (`ready`/`partial`/`blocked` over the
manager/team candidates), the safety literals `readOnly: true`,
`newMountsAdded: false`, `bankerRemainsOnlyActiveMount: true`,
`liveCrmPersistenceEnabled` (false), `activeMountSurfaces`,
`mountCapableSurfaces`, `blockedSurfaces`, `surfaceAssessments` (each carrying
`mountedThisPhase: false`, satisfied/missing prerequisites, and degradations),
`missingPrerequisites`, `unsafeAssumptionsRejected`, `nextActions`, `sourceFacts`.

**Status rules:** `blocked` when no manager/team candidate is mount-capable (or
none supplied); `ready` when every candidate is capable; `partial` otherwise.

**Next-action ordering:** always `preserve_active_mount_invariant` first (this
audit adds no mount), then a `resolve_blocked_prerequisite` per blocked
candidate, then `defer_capable_mount` — a manager/team CRM mount requires a
separate, explicit enablement decision that is **not** part of this phase.

## Always rejected (never inferred)

`broadened_crm_visibility` (a manager/team mount must stay within the team-scoped
deal already authorized to that host — no org-wide query), `cross_team_contacts`,
`manager_write_affordances` (the surface stays read-only), plus the inherited
189E rejections: `contacts`, `organization_hierarchy`, `relationship_roles`,
`activities`, `timeline_events`, `communication_preferences`. Each is listed in
`unsafeAssumptionsRejected` with a reason; none is ever materialized.

## Why 189H is audit-only

A manager/team CRM mount is a visibility and product decision, not a mechanical
one. This phase proves the mechanical facts — the hosts already carry the deal
context and an authorized, team-scoped load — so a later, explicitly-decided
enablement can act on that proof without re-deriving safety in the host
workspaces, and without this audit widening any surface area itself.

## Acceptance evidence

- `crmManagerTeamMountReadiness.test.ts`: known real surfaces (banker-only active
  mount, manager+team capable-but-unmounted), audit mounts nothing, missing
  banker context is a degradation not a blocker, blocked candidates (no
  `DealDataProvider` / no authorized load), banker-only active-mount invariant,
  next-action ordering, unsafe assumptions rejected, constant safety posture.
- `phase189HCrmManagerTeamMountReadinessContract.test.ts`: audit module is pure
  (no write verbs/fetch/broad query, no React/JSX/mount, no Dataverse
  service/client/transport/adapter import, imports only `crmFeatureFlags`), no
  flag flip, no route/App/WorkspaceGate change, no schema/migration,
  Manager/Team workspaces still neither import nor mount the panel/cards, banker
  remains the only mount, rejected assumptions named.
- Full suite green, `npm run build` green, no router/App/Gate change, no
  schema/migration files, no Dataverse IO or write paths.
