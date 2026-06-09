# Phase 142B — Governed Platform Object / View Metadata Surfaces

> **What this is.** Safe, **read-only** product surfaces over the Phase 142A
> governed object/view registries — an object catalog, a view catalog, an object
> relationship map, workspace capability groups, and a unified metadata dashboard.
> It makes OGB LOS feel more like a Salesforce/nCino-style operating system
> **without** a low-code builder, schema mutation, route expansion, or writes.

## 1. Purpose

Salesforce and nCino are powerful because users can understand the business
operating model through objects, views, workflows, and relationship context. OGB
LOS now has the underlying governed metadata (142A); this phase adds safe
surfaces so bankers, managers, portfolio users, executives, and admins can *see*
what objects/views exist, who owns them, what is allowed vs forbidden, and what
is shipped vs planned — **without mutating anything.**

Core principle: **expose metadata; do not mutate metadata.** Show governed
platform capability; do not create a low-code builder yet.

## 2. Prerequisites

- **Phase 142A** — competitive platform convergence layer (object/view/route/
  product registries, competitive backlog).

## 3. What this phase adds

| File | Role |
|---|---|
| `platformSurfaceTypes.ts` | Read-only catalog/surface types |
| `derivePlatformObjectCatalog.ts` | Workspace-scoped object catalog |
| `derivePlatformViewCatalog.ts` | Workspace-scoped view catalog |
| `derivePlatformObjectRelationshipMap.ts` | Object architecture edges (redacted) |
| `deriveWorkspaceCapabilityGroups.ts` | Capability groups (shipped vs planned) |
| `PlatformObjectCatalogPanel.tsx` | Read-only object catalog panel |
| `PlatformViewCatalogPanel.tsx` | Read-only view catalog panel |
| `PlatformRelationshipMapPanel.tsx` | Read-only relationship map (accessible list) |
| `PlatformMetadataDashboard.tsx` | Unified read-only metadata dashboard |

The catalog derivers are permission-scoped: object/view **visibility is metadata
only and never implies data visibility**. `admin` / `strategy` contexts see the
full catalog; other workspaces see only what they own (or `shared`). Relationship
edges to objects the viewer cannot see are **redacted**.

## 4. Salesforce / nCino / Twenty / Corteza inspiration

- **Salesforce/nCino** — objects, list views, and relationship context as the way
  users understand the operating model.
- **Twenty** — a navigable object/view model.
- **Corteza** — a metadata-driven app configuration view.

These surfaces borrow the *understandability* of those platforms while staying
governed and read-only.

## 5. Why this is not a low-code builder yet

There is **no object creation, view creation, custom-field creation, schema
mutation, dynamic query, workflow activation, route registration, or write
toggle.** Filters are structured (never raw query strings), the relationship map
uses an accessible list (no external graph library / canvas), and panels expose
local search only. A low-code builder would require write paths and schema
mutation — both explicitly out of scope.

## 6. Safety posture

- **Read-only** — every panel and deriver; no writes.
- **No schema mutation / custom fields** — Dataverse schema stays operator-script
  governed.
- **No dynamic queries** — structured filters only, no SQL/OData from the UI.
- **No external graph libraries** — accessible list/table only.
- **No route registration** — the dashboard is an exportable component; no global
  nav entry is added in this phase.
- **No fetch / no Dataverse / no CRM writes** — pure derivation over registries.
- **No record data / PII** — the surfaces carry object/view metadata only.

## 7. Next recommended phase

**Phase 142C — Configurable workflow routing and credit committee route deriver.**
