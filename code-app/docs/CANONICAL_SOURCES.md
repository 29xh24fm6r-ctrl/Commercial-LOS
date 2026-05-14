# Canonical Sources

The authority for each concern in this codebase. If you find a second
implementation of any row, the canonical source wins and the duplicate
gets collapsed (per
[ENGINEERING_OPERATING_RULES.md §4](ENGINEERING_OPERATING_RULES.md)).

This file points at code. It does not restate the contents of the
modules it names. Read the modules.

---

## Governance metadata

| Concern                                  | Canonical source                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Governed writes (shipped)                | `GOVERNED_WRITES` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)                        |
| Deliberately-blocked capabilities        | `DELIBERATELY_BLOCKED` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)                   |
| Not-wired capabilities (with reason)     | `NOT_WIRED` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)                              |
| Local-only flows (generate / copy only)  | `LOCAL_ONLY_FLOWS` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)                       |
| Executive transitional fallback features | `EXEC_TRANSITIONAL_FALLBACK_FEATURES` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)    |
| Workspace deal-access matrix             | `WORKSPACE_DEAL_ACCESS` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)                  |
| Architectural invariants (boolean flags) | `WORKSPACE_ISOLATION_VERIFIED`, `PERMISSION_BEFORE_QUERY_VERIFIED` in [platformInventory.ts](../src/shared/governance/platformInventory.ts) |
| Reference-data governance posture        | `REFERENCE_DATA_GOVERNED` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)                |
| Release readiness derivation             | [releaseReadiness.ts](../src/shared/governance/releaseReadiness.ts)                                               |
| Stage progression availability contract  | [stageProgressionAvailability.ts](../src/shared/governance/stageProgressionAvailability.ts)                       |
| Correlation-id generation (governed writes) | `newCorrelationId` in [correlationId.ts](../src/shared/governance/correlationId.ts)                            |
| Current-user → Dataverse systemuserid resolution | `resolveCurrentSystemUserId` in [currentUserLookup.ts](../src/shared/governance/currentUserLookup.ts)      |

## Lifecycle / stage

| Concern                                       | Canonical source                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Stage identity, ordering, lifecycle group     | `STAGE_CATALOG` in [stageCatalog.ts](../src/shared/stages/stageCatalog.ts)             |
| Stage selectors (next / terminal / transition)| `getStageById` / `getNextStage` / `isTerminalStage` / `canTransitionStage` / `getLifecycleGroup` in [stageCatalog.ts](../src/shared/stages/stageCatalog.ts) |
| Stage NAME → lifecycle group (soft)           | `getLifecycleGroupByName` in [stageCatalog.ts](../src/shared/stages/stageCatalog.ts)   |
| Memo-gating predicate (Phase 27)              | `stageNameGatesMemo` in [stageCatalog.ts](../src/shared/stages/stageCatalog.ts)        |
| Lifecycle group pattern set                   | `LIFECYCLE_NAME_PATTERNS` (module-private) in [stageCatalog.ts](../src/shared/stages/stageCatalog.ts) |

## Routing & deal loading

| Concern                                  | Canonical source                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Deal route dispatch (role branching)     | [DealRoute.tsx](../src/deals/DealRoute.tsx)                               |
| Banker deal load + authorization         | `loadDealForBanker` in [dealQueries.ts](../src/deals/dealQueries.ts)      |
| Manager deal load (team-scoped, RO)      | `loadDealForManager` in [dealQueries.ts](../src/deals/dealQueries.ts)     |
| Team deal load (team-scoped, RO)         | `loadDealForTeam` in [dealQueries.ts](../src/deals/dealQueries.ts)        |
| Banker context (req / optional)          | `useBanker` / `useOptionalBanker` in [BankerContext.tsx](../src/banker/BankerContext.tsx) |

## Observability & shared primitives

| Concern                                  | Canonical source                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Performance instrumentation registry     | [perfRegistry.ts](../src/shared/observability/perfRegistry.ts)            |
| Shared work-queue primitives (severity / windows / day math) | [primitives.ts](../src/shared/workQueue/primitives.ts) |

## Schema & SDK

| Concern                                  | Canonical source                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Typed Dataverse services                 | [src/generated/services/](../src/generated/services/) (regenerated; do not hand-edit) |
| Model types                              | [src/generated/models/](../src/generated/models/) (regenerated; do not hand-edit) |

## Cross-cutting docs

| Concern                                  | Canonical source                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Stabilization punch list                 | [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md)                  |
| Phase 1–40 narrative + bundle history    | [RELEASE_NOTES_PHASES_1_40.md](RELEASE_NOTES_PHASES_1_40.md)              |
| Stage governance rationale + non-goals   | [STAGE_GOVERNANCE.md](STAGE_GOVERNANCE.md)                                |
| Stage progression unblock checklist (planning) | [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md) |
| Standing engineering rules               | [ENGINEERING_OPERATING_RULES.md](ENGINEERING_OPERATING_RULES.md)          |
| Phase brief + AAR format                 | [PHASE_EXECUTION_TEMPLATE.md](PHASE_EXECUTION_TEMPLATE.md)                |

---

## Rules of use

1. **Adding a new canonical source** is a deliberate act. Pick a
   precise concern, name the file, and add a row here in the same
   phase. Don't ship a second source without a row.
2. **Removing / renaming** a canonical source requires updating every
   row that references it. Tests in
   [stageCatalog.test.ts](../src/shared/stages/stageCatalog.test.ts)
   already demonstrate the static-source sweep pattern that catches
   inline duplication; replicate it for new canonical sources where
   duplication risk is high.
3. **If two rows could plausibly own a concern**, pick one and remove
   the other. Overlap is the failure mode this file prevents.
4. **`src/generated/` is generated.** Never edit it directly. Schema
   changes go through the Power Apps regeneration path; the rest of
   the codebase consumes the generated output read-only.
