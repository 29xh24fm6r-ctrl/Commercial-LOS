# Phase 144D — Drill-Through Route / Deep-Link Support

> **Read-only, same-page deep links.** Lets a user share or reopen a specific
> read-only drill-through detail panel from a URL query param, without adding any
> new route, fetch, auth, or permission. The detail payload always comes from the
> current authorized page's drill-through registry — never from the URL text.

## 1. What deep-link support means

A drill-through panel that a user opened (a KPI breakdown, a chart segment list)
can be reopened by anyone who loads the same authorized page with a `?drill=<id>`
query param. The id only selects an already-present, prop-derived target; it never
fetches, authorizes, or fabricates data.

## 2. URL / query param contract

- A single query param: **`?drill=<targetId>`** (constant `DRILL_PARAM = 'drill'`).
- No new app route is added; the param rides on whatever authorized page the user
  is already on.
- Opening a panel sets the param (preserving other params); closing removes it.
- Example: `…/portfolio?drill=portfolio-kpi-active-deals`.

## 3. Target ID validation rules

`sanitizeDrillThroughTargetId` ([drillThroughDeepLink.ts](../src/shared/drillthrough/drillThroughDeepLink.ts))
returns the id only when ALL hold, else `null`:

- Non-empty string, length ≤ `MAX_TARGET_ID_LENGTH` (128).
- Charset allow-list only: letters, numbers, colon, dash, underscore, period
  (`/^[A-Za-z0-9:._-]+$/`). Slashes, angle brackets, quotes, spaces, `?`, `&`,
  `#`, `%` are rejected.
- Protocol/payload deny-list (colon is allowed by charset, so these are rejected
  explicitly, case-insensitively): `javascript:`, `data:`, `vbscript:`, `script`,
  `://`.

It is pure, deterministic, and never throws.

## 4. Why deep links never fetch or authorize data

- The id is only matched against the set of target ids that **already exist on the
  current page** (`useDrillThroughDeepLink(availableIds)`); it is never used to
  query Dataverse or any provider.
- The deep-link source contains no `fetch` / `XMLHttpRequest` / `axios`, no
  `POST/PATCH/PUT/DELETE`, no Dataverse/CRM calls, no `eval`/`Function`, no
  `dangerouslySetInnerHTML`, and no navigation sink (`location.href=`,
  `window.open`, `href="javascript:"`). The only reference to `javascript:` is in
  the deny-list — a rejection, not a sink.

## 5. How current-page authorization and existing data govern availability

- The page renders its drill-through targets from already-authorized props /
  registry data (Phase 144A–144C). Their ids form the `availableIds` set.
- `activeAvailable` is true only when the URL id is valid **and** in that set. An
  id from another workspace/role, or for data not present, is **not** available —
  the panel stays closed and the surface behaves normally.
- The panel's title/summary always come from the matched target payload, never
  from the URL text.

## 6. Supported surfaces

- **Portfolio Command Center** — KPI ribbon tiles are deep-linkable end to end:
  a `?drill=portfolio-kpi-<slug>` param opens the matching read-only panel, and
  toggling a tile updates/removes the param.

## 7. Deferred surfaces (with reasons)

The shared helper + hook + `DrillThroughCard` controlled-open support are generic
and ready to drop into the other surfaces; wiring is deferred to avoid repeating
cockpit churn in a single phase:

- **Manager / Team / Executive cockpits** — same KPI-ribbon pattern as Portfolio;
  wire `useDrillThroughDeepLink` with each ribbon's target ids.
- **Banker/Deal metric deck** and **chart cards** — chart disclosures are native
  `<details>`; deep-linking them needs the same controlled-open prop threaded
  through `ChartFrame`, a focused follow-up.
- **CRM relationship intelligence cockpit** — not yet on the shared
  `DrillThroughCard`/registry; deferred until it adopts the contract.

## 8. Accessibility behavior

- Deep-linking reuses the native `<details>`/`<summary>` disclosure — keyboard
  reachable, Enter/Space toggle, accessible name unchanged.
- `DrillThroughCard` gained an optional controlled `open` + `onOpenChange`; when
  omitted it is byte-identical native/uncontrolled behavior.
- Opening from a URL renders a real `<h3>` heading inside a `role="region"`; the
  panel can be collapsed, which removes the URL param.

## 9. Security posture

- No new route, no WorkspaceGate/auth/entitlement bypass, no permission widening.
- The param is sanitized and fails closed; it is never executed, never used as an
  href, and never used to fetch.
- Same-origin only: `buildDrillThroughUrl` returns a relative `pathname + search`
  with no protocol/host, so it can never become an external URL.
- A copy-link button is intentionally **deferred** — adding a clipboard button
  would require a `<button>`/`onClick` in the read-only panel, which the
  drill-through governance forbids. URL state is shareable directly from the
  address bar; the relative deep-link string is available via `buildDrillThroughUrl`.

## 10. No-fake-data posture

- The helpers embed no sample/mock/fake data. An unavailable deep-linked target
  shows no fabricated detail; the honest copy is:
  "This detail view is not available from the current authorized page or data set."

## 11. Future rule

Every new drill-through target must use a **stable, safe id** (the allowed charset)
so it can be deep-linked. Ids must not encode data, secrets, or protocols.

## 12. Acceptance commands

```
npm test -- drillThrough DeepLink deepLink route shareable manager portfolio team executive banker deal crm governance releaseCandidateSnapshot
npm run build
npm test
```
