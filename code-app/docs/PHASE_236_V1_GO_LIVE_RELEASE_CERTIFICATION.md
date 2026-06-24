# Phase 236 — V1.0 Go-Live Release Certification

## Purpose

Give leadership and admins one clear answer: **can the lending department restart on
this Commercial LOS / internal OGB CRM + internal lending workflow system, and what
remains intentionally gated?**

This certification is read-only. It enables no live write, flips no feature gate,
widens no route, and triggers no action. It certifies an **operating restart**
posture; it does **not** certify live-mutation expansion.

## Current gate status

| Gate | Status | How verified |
|---|---|---|
| Production build | green | `npm run build` (tsc -b + vite build) |
| Full regression suite | green | `npm test -- --run` (full vitest suite) |
| Banker operating coverage | green | Banker operating command center (read-only) |
| Manager operating coverage | green | Manager operating command center (read-only) |
| Executive restart readiness coverage | green | Executive restart readiness command center (read-only) |
| Admin operator action queue coverage | green | Admin operator action queue (read-only) |
| Internal CRM + LOS activation coverage | green | Internal OGB CRM + internal lending workflow operating surfaces |
| Portfolio boarding readiness coverage | gated | Boarding handoff/readiness visible; live persistence gated |

Build and regression gates are verified **out-of-band** by the pre-release commands
below; the model never fabricates a runtime green it cannot observe (it is issued
from a green baseline and accepts explicit verify inputs).

## What is ready (operating restart)

- Bankers operate from a unified CRM + LOS command center: relationship
  intelligence, active deal workflow cockpit, daily actions, and readiness surfaces
  (all read-only).
- Managers supervise pipeline, banker workload, CRM coverage, and workflow
  bottlenecks (read-only).
- Executives see the lending-restart posture across banker/manager/admin/CRM/LOS and
  the live gate categories (read-only).
- Admins see the operator action queue (remaining go-live blockers grouped by
  category) and this certification (read-only).

## What remains gated (live-write expansion)

Every live-write category is **intentionally gated** by default and is **not**
enabled by this certification:

- New Deal create
- CRM writeback / live persistence
- Document checklist generation
- Borrower communication send
- Stage advancement
- Portfolio boarding live persistence

## What users can safely do on day one

- Read and operate from the CRM + LOS surfaces above.
- Review relationship intelligence, pipeline, workload, readiness, and the operator
  action queue.
- Use the safe internal production-core signals (task generation, duplicate
  detection) for prioritization.

## What users cannot do until certified live gates clear

- Create deals, write back to CRM / persist CRM records, generate document
  checklists, send borrower communications, advance stage, or persist portfolio
  boarding. Each remains fail-closed until its dedicated certified gate clears,
  separately, with its own evidence.

## Required pre-release commands

```bash
git status --short
npm run build
npm test -- --run
```

## Expected green baseline

- Production build: **green** (`npm run build`)
- Test files: **614 / 614**
- Tests: **9923 / 9923**

(The certification is valid only when the pre-release commands confirm this
baseline. If counts have grown in a later phase, confirm the suite is fully green
rather than matching the exact numbers.)

## Rollback posture

This phase adds only read-only certification surfaces (a pure model, an admin
panel, governance tests, and this doc). Rollback is a clean revert of the phase
commit; it removes the certification surfaces and changes no gate, route, data, or
behavior. No live-write category is touched, so there is nothing to unwind beyond
the read-only additions.

## No external vendor dependency

No external Salesforce or nCino dependency is implied or required by this
certification or by the underlying operating surfaces. All CRM and lending workflow
capability is the internal OGB CRM and internal lending workflow.
