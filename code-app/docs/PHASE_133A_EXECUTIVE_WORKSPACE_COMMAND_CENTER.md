# Phase 133A — Executive Workspace command center foundation

Builds the first real **Executive Command Center** — a board/executive,
read-only roll-up across the commercial lending operation. Pure deriver
+ UI + tests. **No Dataverse schema change, no new route, no new write
actions, no live Copilot activation, no permission widening, no fake
regulatory / profitability / win-rate / approval-probability metrics.**

---

## 1. Scope & the data-source decision

The Executive Workspace already had an isolated data provider
(`ExecutiveDataProvider`) and an explicit, codebase-level architectural
rule (documented in `ExecutiveProvider`, SPEC W2 / phase-15):

> "Executive Workspace must NOT consume live operational queries from
> BankerProvider or ManagerProvider… keeping it as its own thing
> prevents future drift where someone wires the executive UI directly
> into an operational provider."

So this phase **does not** broaden access to the manager/team-scoped
operational path. The command center is derived **only** from the data
the Executive Workspace already loads via `ExecutiveDataProvider`. Where
that snapshot genuinely lacks a field, the metric is **omitted with
honest copy** rather than faked.

---

## 2. Data sources used

`useExecutiveData()` (existing, isolated):

- **`snapshotReadiness`** — governed `cr664_DealReadinessSnapshot` rows:
  per-deal readiness band (High/Medium/Low/Blocked), open-blocker /
  missing-doc / pending-approval / stale-item counts, and `dealId` (used
  only for a `/deals/<id>` link). **No dollar amount on these rows.**
- **`fallbackPipelineByStage`** — transitional stage aggregate: count +
  total amount per stage (the only $ exposure the executive snapshot
  exposes; aggregate, no per-deal identifiers).
- **`fallbackClosingForecast`** — transitional monthly closing forecast:
  count + total amount per month bucket.
- **`snapshotPerformance`** — performance metric rows (count surfaced
  honestly; not treated as exposure).

---

## 3. What was added

### Pure deriver — [src/executive/executiveCommandSnapshot.ts](../src/executive/executiveCommandSnapshot.ts)

`deriveExecutiveCommandSnapshot(input)` produces:

- **KPI ribbon:** active deals, total exposure (stage aggregate),
  nearest closing-window exposure + label, blocked count (readiness
  band Blocked), at-risk count (band Low), open blockers, outstanding
  docs (missing-docs proxy), pending approvals, stale items, readiness
  scored / unknown counts.
- **Risk distribution** (readiness-band counts).
- **Exposure by stage** (with share %).
- **Closing forecast** buckets.
- **Top deals to watch** — readiness-ranked (Blocked → Low → Medium →
  High → unknown, then by open blockers), each with a `dealId` link.
- **Top bottlenecks** — ranked by open-blocker count.
- **Data quality** — scored / unknown / deals-missing-docs /
  deals-with-stale-items.
- `executiveCopilotSummaries(snapshot)` — GUID-free summary lines.

### Cockpit UI — [src/executive/ExecutiveCommandCenter.tsx](../src/executive/ExecutiveCommandCenter.tsx)

Sections: header, KPI ribbon, **Strategic risk posture** (readiness
donut + stats), **Portfolio exposure** (exposure-by-stage bar + closing
forecast sparkline), **Operations health**, **Data quality &
readiness**, **Top deals to watch** + **Top bottlenecks** (deal links),
a **Copilot Assist** panel (default `not_configured`), and the honest
omissions. Read-only: drill-downs are `<Link>` anchors; the only
interactive controls are encapsulated inside `CopilotAssistPanel`. Fails
closed on a failed slot; honest loading / empty states.

### Workspace shell — [src/workspaces/ExecutiveWorkspace.tsx](../src/workspaces/ExecutiveWorkspace.tsx)

Now renders inside `LendingOSLayout` (dark sidebar) with the workspace
switcher, signed-in identity, and the `ExecutiveCommandCenter` as the
first cockpit (the existing board-safe snapshot cards remain below).
Permission-before-render preserved: `ExecutiveDataProvider` is nested
inside the `ExecutiveProvider` identity boundary — data is never queried
before the workspace is authorized. **W2 isolation preserved** — no
Manager/Banker provider import.

### Copilot context

The executive workspace Copilot context (workspace surface) now carries
`executiveCopilotSummaries` (counts + percentages, no GUIDs). The
`CopilotWorkspaceContext.workspaceRole` union gained `'executive'`
(additive). Default connector remains `not_configured`, so no proposals
render and no external call is made.

---

## 4. Honest limitations (rendered copy)

- "Executive view is derived from authorized lending records currently
  available to this workspace."
- "Profitability, yield, legal lending limit, CECL/ALLL,
  criticized/classified assets, and enterprise-wide exposure require
  additional source fields and governance."
- "No approval probabilities or predictive rankings are shown."
- Operations panel: task / overdue-task counts and average days-in-stage
  are explicitly noted as **not** part of the executive snapshot.

What is **intentionally omitted** because the executive snapshot does
not carry it: per-deal dollar exposure (readiness rows have no amount),
exposure by product / banker, task counts, average days-in-stage, and
any portfolio-risk-engine findings (that engine is manager-scoped and
W2-isolated from this surface). "Top deals" are ranked by readiness
concern — never by a fabricated score.

---

## 5. Demo walkthrough

1. Sign in as an Executive-primary user → land on
   `/workspaces/executive` (route unchanged; switcher appears if
   entitled to other workspaces).
2. The **Executive Command Center** is the lead cockpit: scan the KPI
   ribbon (active deals, total exposure, closing window, blocked /
   at-risk, operational counts).
3. Review **Strategic risk posture** (readiness donut) and **Portfolio
   exposure** (by stage + closing forecast).
4. Check **Operations health** and **Data quality & readiness**.
5. Open a **Top deal to watch** or **Top bottleneck** → drills into the
   deal cockpit via a link.
6. Read the honest-omission footnotes.
7. Copilot Assist shows **Not configured** (inert; its context includes
   the executive summary for when a live connector is later enabled).

---

## 6. Tests

- [executiveCommandSnapshot.test.ts](../src/executive/executiveCommandSnapshot.test.ts) — empty view, KPI totals, readiness→risk mapping, operational sums, closing-window pick, readiness ranking, Copilot summary (no GUID), and a runtime-source scan proving the **deriver** carries no profitability / approval-probability / win-rate / predictive / yield / CECL vocabulary.
- [ExecutiveCommandCenter.test.tsx](../src/executive/ExecutiveCommandCenter.test.tsx) — loading / fail-closed / empty states, KPI ribbon, risk + data-quality summaries, top deals render as deal **links**, Copilot panel `not_configured`, honest-omission copy, and static-source pins (no `<button>`/`<form>`/`onClick`/`onSubmit`; no manager/banker/portfolio provider import).
- [ExecutiveWorkspace.test.tsx](../src/workspaces/ExecutiveWorkspace.test.tsx) — uses `LendingOSLayout`, command center is the first cockpit, switcher wired from the entitlement source, identity shown, data provider nested inside the identity provider (no data before authorization), W2 isolation.
- Route stays `/workspaces/executive` and switcher/gate behavior remains fail-closed (pinned by `workspaceEntitlements` / `WorkspaceGate` suites). Full suite **3840 passing**; `npm run build` clean.

---

## 7. Follow-up backlog

- A genuine bank-wide / cross-team executive loader (and the governance
  to authorize it) — would replace the honest team/snapshot-scoped copy.
- Per-deal dollar exposure on the readiness snapshot (or a dedicated
  executive exposure snapshot) to enable true top-$-exposure ranking.
- Exposure by product / banker / industry once those fields land on an
  executive-scoped snapshot.
- Time-series trend (readiness / exposure over time) via a snapshot
  store.
- Profitability / yield / CECL-ALLL / criticized-classified surfaces —
  each requires new source fields + governance; deliberately excluded.
- Wire the executive risk summary into a live Copilot connector once
  enabled under its own spec (default stays `not_configured` here).
