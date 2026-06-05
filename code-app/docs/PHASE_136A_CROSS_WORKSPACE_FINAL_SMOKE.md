# Phase 136A — Cross-workspace final parity smoke

## Purpose

Verify that the Executive finish (Phases 133A–135B) did **not** drift the
broader demo/workspace story across Banker, Manager, Portfolio, Team, and
Executive. This is a **tests + docs smoke phase**, not new feature work:
no runtime behavior, access model, or data flow changed. It adds the one
render smoke that was missing (the Banker route entry point) and a single
consolidated cross-workspace tripwire so the five surfaces move together
as one regression surface.

No Dataverse writes, no token work, no schema changes, no entitlement
widening, no new route/access model, no manager/team/executive proxy
changes, no fake runtime data, no Copilot live connector, no new
loaders/fetches, and no write-affordance changes.

## Current final workspace stack

| Surface | Route | Lead cockpit | Access |
| --- | --- | --- | --- |
| Banker | `/workspaces/banker` | BankerShell (Lending OS) | bootstrap-primary banker, or any signed-in banker |
| Team | `/workspaces/team` | Team Ops Queue (first) | team-primary, or manager-entitled banker |
| Manager | `/workspaces/manager` | Manager Bloomberg Control Panel | manager-primary, or manager-entitled banker |
| Portfolio | `/workspaces/manager?surface=portfolio` | Portfolio Command Center | **render surface on the manager route** — not a new route |
| Executive | `/workspaces/executive` | Executive Command Center (first) | **primary-workspace-name gated only** ("Executive Dashboard") |

Key invariants the smoke protects:

- **Executive access comes only from the primary workspace name.** No
  manager / team / portfolio entitlement is an executive proxy.
- **Portfolio is a query marker on the manager route** (`?surface=portfolio`),
  not a new route or access model. There is no `portfolio` entry in the
  route table.
- **Every surface is read-only.** No shell or cockpit carries a write
  affordance (`<form>`, `onSubmit`, email/send, Graph, Office365, or a
  Dataverse generated-write import).
- **Copilot stays governed / not-configured by default.** The cockpits
  that surface a Copilot panel route only through the governed
  `getCopilotConnector()` accessor; no live connector is wired.

## What was tested

- **Banker (new render smoke — `BankerWorkspace.test.tsx`):** the route
  entry mounts the BankerShell cockpit path; a banker-only user gets a
  single workspace link (no executive, no portfolio); a manager-entitled
  banker gets banker/team/manager/portfolio links but **still no
  executive link**; the route entry adds no write affordance.
- **Manager / Portfolio (existing `ManagerWorkspace.test.tsx`):** the
  Manager Bloomberg Control Panel renders for manager-name workspaces and
  the Portfolio Command Center swaps in on the `?surface=portfolio` marker
  (and the `Portfolio Management` bootstrap name), with the same data
  provider chain — no permission widening.
- **Team (existing `TeamWorkspace.test.tsx`):** the Team Ops Queue mounts
  first; the switcher widens honestly for manager-entitled users only;
  the team body stays read-only.
- **Executive (existing `ExecutiveWorkspace.test.tsx` /
  `ExecutiveCommandCenter.test.tsx`):** the board-safe, read-only shell
  renders the command center first; empty/partial states stay honest;
  performance/profitability stays "Not yet wired".
- **Access derivation (existing `WorkspaceGate.test.tsx` /
  `workspaceEntitlements.test.tsx`):** executive admission has no
  manager/team proxy; the gate fails closed; `useEntitledRoutes` only ever
  admits manager + team.
- **Consolidated tripwire (new `crossWorkspaceFinalSmoke.test.ts`):**
  every shell still mounts its lead cockpit; the executive link appears
  for a primary **iff** that primary is "Executive Dashboard"; manager +
  team + portfolio entitlement never synthesizes an executive link;
  portfolio stays a manager-route query marker; no shell/cockpit grew a
  write affordance; Copilot stays governed (no live connector, no
  `fetch`).

## What was intentionally not changed

- No runtime source was changed in this phase (tests + docs only).
- No route, access model, entitlement rule, or data loader was touched.
- No Executive, Manager, Portfolio, Team, or Banker cockpit logic or copy
  was modified.
- Phase 133C seed behavior is unchanged.

## Demo checklist

### Banker
- Sign in as a banker-primary user → land on `/workspaces/banker`, see the
  Lending OS shell + cockpit. Banker-only users see a single workspace
  pill (no switcher), and no executive/portfolio entries.

### Manager
- Manager-primary (or manager-entitled banker) → `/workspaces/manager`
  shows the Manager Bloomberg Control Panel and the nine manager cards;
  the switcher offers Portfolio (and Banker/Team where entitled).

### Portfolio
- Append `?surface=portfolio` on the manager route (or use a "Portfolio
  Management" primary) → the Portfolio Command Center renders in place of
  the Manager panel, same data provider chain, same shell. The URL stays
  on `/workspaces/manager` — no new route.

### Team
- Team-primary (or manager-entitled banker) → `/workspaces/team` shows the
  Team Ops Queue first. Team-only users with no extra entitlements see no
  switcher.

### Executive
- Only a user whose **primary workspace name resolves to "Executive
  Dashboard"** reaches `/workspaces/executive`. The board-safe, read-only
  Executive Command Center renders first; "Not yet wired" performance /
  profitability panel and "Not configured" Copilot panel are expected.

## Known limitations

- **Executive live provisioning still needs operator auth.** The Phase
  133C seed that flips a pilot user's primary workspace to "Executive
  Dashboard" is ready but cannot run without a token/device-code session.
- **Copilot remains not configured.** Every workspace shows the Copilot
  panel in its governed not-configured posture; no live connector is
  wired.
- **Profitability / live-connector metrics remain governed future work.**
  Revenue / ROE / yield / margin and any live-assistant behavior are
  intentionally out of scope until a future governance phase.

## Acceptance

```
npm test -- BankerWorkspace ManagerWorkspace PortfolioCommandCenter TeamWorkspace ExecutiveWorkspace WorkspaceGate workspaceEntitlements releaseCandidateSnapshot
npm run build
```
