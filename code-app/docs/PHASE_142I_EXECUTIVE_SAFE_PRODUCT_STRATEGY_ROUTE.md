# Phase 142I — Executive-Safe Route Mounting for the Product Strategy Surface

> **What this is.** Executive-safe reachability for the Phase 142H competitive /
> product strategy dashboard. The surface is mounted as a read-only RENDERING
> SURFACE under the existing, already-gated **executive** route —
> `/workspaces/executive?surface=product-strategy` — mirroring the Phase 126C
> portfolio-surface pattern. It is **not** a new route and **not** a new
> entitlement: it is subordinate to executive access by construction. **Mount the
> strategy surface. Do not enable actions.**

## 1. Purpose

The competitive / product strategy dashboard is valuable only if leadership can
see it safely. This phase adds executive-safe reachability while preserving the
existing permission-before-render model — no public access, no permission
widening, no external calls, no live writes.

Core principle: **mount the strategy surface; do not enable actions.**

## 2. Prerequisites

- **Phases 142A–142H** — competitive convergence layer through the executive
  product strategy surface.
- The existing **WorkspaceGate** / entitlement model remains fail-closed.
- The **executive workspace** exists from prior executive phases.
- Banker / Manager / Portfolio / Team access rules remain unchanged.

## 3. What this phase adds

| File | Role |
|---|---|
| `workspaceRoutes.ts` (extended) | `PRODUCT_STRATEGY_SURFACE_*` constants + `isProductStrategySurface` |
| `buildExecutiveProductStrategySurfaceState.ts` | Composes the 142H state from static registries |
| `ProductStrategyNavigationCard.tsx` | Read-only nav card (internal link, no actions) |
| `ExecutiveProductStrategyWorkspace.tsx` | Read-only strategy surface (inner executive content) |
| `ExecutiveWorkspace.tsx` (modified) | Reads `?surface=product-strategy`, swaps content, adds the nav card |

The executive workspace reads the `?surface=product-strategy` query param and
renders the strategy surface in place of the default command center; the default
executive view is otherwise unchanged and gains only a read-only navigation card.

## 4. Access model

- **Executive entitlement required** — the surface shares the executive route, so
  the existing `WorkspaceGate allowed={executive}` is the only gate. No new gate,
  no new entitlement type.
- **Direct URL fail-closed** — a non-executive user hitting
  `/workspaces/executive?surface=product-strategy` is bounced by the executive
  WorkspaceGate exactly as they are for the executive route itself.
- **No manager / banker / team / portfolio proxy** — the surface adds no route to
  the entitlement set; no non-executive role gains access.
- **Loading / unknown entitlement** — the WorkspaceGate renders its loading state
  rather than exposing the route.

## 5. What remains disabled

Admin apply, schema mutation, integrations, borrower outreach, upload-link
generation, email / SMS, credit approval, covenant waiver, final export, and
Dataverse writes all remain disabled. The surface is read-only: no action
buttons, no mutation callbacks, no fetch, no external URLs or iframes.

## 6. Next recommended phase

**Phase 142J — Admin configuration persistence adapter, disabled by default** — a
disabled-by-default persistence seam for the Phase 142G review-only proposals.
