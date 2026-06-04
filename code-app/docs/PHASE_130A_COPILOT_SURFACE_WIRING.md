# Phase 130A — Copilot assistant surface wiring

## Context

Phase 129A landed the Microsoft Copilot foundation (boundary +
context builders + UI), all in `src/copilot/`:

- `copilotAssistantAdapter.ts` — the connector boundary. Default
  singleton is the **not_configured** adapter; every response is local,
  non-live, and explicitly says the connector is not configured.
- `dealCopilotContext.ts` / `workspaceCopilotContext.ts` — pure context
  builders over already-authorized data. They emit labels + counts only
  (record ids are dropped — no raw GUID leakage).
- `CopilotAssistPanel.tsx`, `CopilotPromptBar.tsx`,
  `CopilotResponseCard.tsx`, `CopilotNotConfiguredState.tsx` — the
  read-only panel UI.

Phase 130A is **UI placement only**: wire the existing panel into the
four user-facing LOS surfaces, not-configured-first, using the
already-built context builders and the default adapter. No live
connector, no writes, no autonomous actions, no new Dataverse queries,
no permission widening.

## What was wired

| Surface | File | Placement | Context source | Context builder |
|---|---|---|---|---|
| **Deal cockpit** | [BankerDealWorkspace.tsx](../src/deals/BankerDealWorkspace.tsx) right rail (`data-deal-card="copilot-assist"`) via new [DealCopilotAssist.tsx](../src/copilot/DealCopilotAssist.tsx) | bottom of the attention/work right rail | `useDealData()` (deal + tasks + documents) + `useOptionalDealIntelligence()` (blocker labels) — all already loaded by `DealDataProvider` | `buildDealCopilotContext` |
| **Manager Command Center** | [ManagerBloombergControlPanel.tsx](../src/manager/ManagerBloombergControlPanel.tsx) | top of the cockpit body, above the command strip | the already-derived `deriveManagerPipelineSnapshot` (command strip KPIs + exception tape) | `buildWorkspaceCopilotContext` |
| **Portfolio Command Center** | [PortfolioCommandCenter.tsx](../src/portfolio/PortfolioCommandCenter.tsx) | top of the cockpit body, above the KPI ribbon | the already-derived `derivePortfolioCommandSnapshot` (ribbon + exceptions) | `buildWorkspaceCopilotContext` |
| **Team Ops Queue** | [TeamOpsQueue.tsx](../src/team/TeamOpsQueue.tsx) | top of the queue body, above the command ribbon | the already-derived `deriveTeamOpsQueueSnapshot` (ribbon + execution board) | `buildWorkspaceCopilotContext` |

Each embedded panel is wrapped in a `data-cockpit-copilot="<role>"`
marker so the read-only assistant subtree is identifiable and so the
existing "cockpit drill-downs are anchors, never buttons" runtime pin
can scope the cockpit's **own** surfaces while acknowledging the
panel's encapsulated (non-mutating) controls.

The workspace panels mount only when the surface snapshot is `ready`
and non-empty — so the Copilot context is always built from real,
already-loaded authorized data, never a partial/loading view.

### Quick actions today

The shipped `CopilotAssistPanel` exposes the actions the **default
not_configured adapter** can honestly answer:

- **Deal surface:** Summarize deal · Next actions · Missing fields ·
  Explain blockers (all from `buildDealCopilotContext`).
- **Workspace surfaces (manager / portfolio / team):** Summarize
  workspace, over a surface-specific context. Each surface feeds its
  own honest KPI summary lines (team risk / what-needs-attention /
  documents+tasks for manager; exposure / concentrations / exceptions
  for portfolio; today's queue / overdue / bottlenecks for team) and an
  `urgentItemCount` derived from that surface's exception/queue rows.

The brief's richer per-surface prompts (e.g. "Explain concentrations",
"What is overdue?") are framed by the context each surface passes; they
are **not** faked as separate AI answers. Adding dedicated adapter
methods + a live connector is a later phase — out of scope here.

## Governance / honesty posture

- **Connector not configured, clearly.** Collapsed, the panel's
  subtitle and footer both state "Copilot connector not configured.
  Local summaries only. No AI. No external calls." Expanded, the full
  `CopilotNotConfiguredState` renders.
- **Read-only.** The footer states "Read-only assistant. Cannot
  approve, change data, or send communications." No action button
  mutates data, sends email, completes a task, or requests a document.
  The panel's own controls (Expand / quick-action chips / prompt bar)
  are non-mutating local-summary triggers.
- **No fake AI.** Every default response is `isLive: false`, tagged
  "Local summary", with the disclaimer "Generated locally from visible
  data. Not AI-generated. Not a recommendation."
- **No new query / no permission widening.** Every surface reuses data
  its provider already loaded. No loader, no `getAll`, no `fetch`.
- **No raw GUID leakage.** The context builders surface labels + counts
  only; record ids never reach a `CopilotDealContext` /
  `CopilotWorkspaceContext` field or the rendered summary (pinned).
- **No cross-team data.** Workspace context is derived from the
  surface's already-team-scoped, already-filtered snapshot.

## Tests

- [DealCopilotAssist.test.tsx](../src/copilot/DealCopilotAssist.test.tsx)
  — deal cockpit connector: panel renders; not-configured + read-only
  messaging; the local summary reflects already-loaded provider context
  (open/total task + outstanding/total doc counts, deal + client name);
  blocker labels flow from the shared VM; no Send/Complete/Request/
  Approve button; no GUID in the rendered summary.
- Manager / Portfolio / Team surface tests each gained a **Phase 130A —
  Copilot assist panel wiring** block: the panel mounts atop the
  cockpit when the snapshot is ready, states the connector is not
  configured, and states the read-only posture. The manager suite also
  pins that the panel does **not** mount before the snapshot is ready.
- [copilotSurfaceWiring.governance.test.ts](../src/copilot/copilotSurfaceWiring.governance.test.ts)
  — cross-cutting pins: default adapter is `not_configured` and every
  default response is non-live (**no live connector required**); each
  surface mounts the panel with the correct `surface` kind via the
  right context builder; the whole `src/copilot/` module makes no
  network/connector call (no `fetch` / `Office365` / `SendEmailV2` /
  Graph / MSAL); the dense cockpit bodies remain free of raw
  `<button>`/`<form>`/`onClick`/`onSubmit` (the panel encapsulates its
  controls).
- The existing manager runtime drill-down pin was scoped to exclude the
  encapsulated Copilot subtree (`[data-cockpit-copilot]`), preserving
  its intent: the cockpit's own surfaces stay button/form-free.

## Acceptance

```
npm test -- Copilot DealCopilot ManagerBloomberg Portfolio TeamOpsQueue
npm run build
```

- Target suites: **241 tests pass** (14 files).
- Broad regression across `copilot` / `manager` / `portfolio` / `team`
  / `workspaces` / `deals` / `governance`: **2546 tests pass**.
- `npm run build` (`tsc -b && vite build`) is clean.

## Out of scope (tracked for later)

- A live Copilot connector adapter (swap `getCopilotAdapter()` to a
  `live` implementation behind approval + governance).
- Dedicated adapter methods for the richer per-surface prompts.
- Any write-capable or autonomous Copilot action.
