# Phase 129A — Microsoft Copilot Integration Foundation

## Context

The Commercial Lending LOS has a mature workspace layer (Banker, Team, Manager, Portfolio, Deal cockpit) with Dataverse-backed command surfaces and entitlement-gated routing. The original Microsoft Vibe scope included a Microsoft Copilot-style user assistance surface. This phase adds the governed foundation for that integration.

## What This Phase Does

Adds a governed Copilot Assistance foundation so users have an in-platform assistant surface that can explain, summarize, and guide actions **without bypassing permissions or inventing data**.

### Copilot Adapter Boundary

**`src/copilot/copilotAssistantAdapter.ts`**

Clean interface for future Microsoft Copilot connector:

- `mode`: `"not_configured"` | `"live"`
- `summarizeDeal(context)`: Summarize a deal from authorized loaded data
- `summarizeWorkspace(context)`: Summarize workspace KPIs and status
- `suggestNextActions(context)`: List next best actions from loaded data
- `explainMissingFields(context)`: Identify incomplete deal fields
- `explainBlockers(context)`: Explain current deal blockers

**Default implementation** (`createNotConfiguredAdapter`):
- Returns honest `not_configured` responses
- No network call
- No hallucinated content
- Every response explicitly states "Copilot connector is not configured"

### Context Builders

**`src/copilot/dealCopilotContext.ts`** — Builds `CopilotDealContext` from DealDataProvider's already-loaded data:
- deal name, client, stage, status, amount
- task counts (total + open)
- document counts (total + outstanding)
- blocker count + summaries

**`src/copilot/workspaceCopilotContext.ts`** — Builds `CopilotWorkspaceContext` from workspace data providers:
- workspace role, user name, team name
- deal count, urgent item count
- KPI summary strings

**Context builder rules:**
- Only include already-authorized data from the current screen/provider
- No broader Dataverse queries
- No cross-user/cross-team records
- Strip raw GUIDs
- Include provenance labels

### UI Components

| Component | Purpose |
|-----------|---------|
| `CopilotAssistPanel` | Main panel composing all sub-components in a Card |
| `CopilotPromptBar` | Text input for Copilot queries |
| `CopilotResponseCard` | Renders a response with source provenance tags |
| `CopilotNotConfiguredState` | Honest display when connector is absent |

**Placement (ready for integration):**
- Deal cockpit: right rail or summary tab
- Manager/Portfolio/Team command center: collapsible panel
- Banker dashboard: optional assist panel

### Current Connector State

**Not configured.** No live Microsoft Copilot connector is registered. The UI honestly states this. All responses are local summaries from already-visible data.

## Security Model

### Copilot NEVER:
- Approves loans
- Changes data (no creates, updates, or deletes)
- Sends emails
- Completes tasks
- Requests documents
- Creates records
- Accesses unauthorized routes
- Claims probability/approval odds unless a source record exists
- Makes external network calls (in not_configured mode)
- Imports generated SDK services
- Accesses cross-team or cross-user data

### Copilot ALWAYS:
- States when the connector is not configured
- Sources responses from already-loaded authorized data only
- Includes provenance labels on responses
- Renders honest disclaimers ("Not AI-generated. Not a recommendation.")
- Declares itself read-only in the UI footer

## Allowed and Forbidden Copilot Behaviors

| Behavior | Allowed | Reason |
|----------|---------|--------|
| Summarize current deal | Yes | Read-only, authorized data only |
| Explain missing fields | Yes | Read-only field inspection |
| List next best actions | Yes | Derived from loaded tasks/docs/blockers |
| Summarize workspace KPIs | Yes | From rendered dashboard data |
| Approve a loan | **No** | Governance violation |
| Send an email | **No** | Governed write, requires explicit user action |
| Complete a task | **No** | Governed write |
| Create a record | **No** | Governed write |
| Claim approval probability | **No** | No source record exists |
| Query Dataverse directly | **No** | Bypasses data provider authorization |

## Intended Microsoft Copilot Integration Path

When a live connector is approved:

1. Implement a `createLiveAdapter()` that wraps the Microsoft Copilot API
2. Swap the singleton via a configuration gate (not a code change per deploy)
3. The live adapter receives the same `CopilotDealContext` / `CopilotWorkspaceContext` — no scope widening
4. The live adapter returns `CopilotResponse` with `mode: 'live'` and `isLive: true`
5. The UI automatically switches to live mode (shows "Powered by Microsoft Copilot" instead of "Local summary")
6. All governance constraints remain enforced — the adapter boundary does not change

## Future Live Connector Handoff Steps

1. Register Microsoft Copilot connector in Power Platform
2. Obtain API credentials and configure environment variables
3. Implement `createLiveAdapter()` with proper auth token flow
4. Wire connector status probe into the adapter factory
5. Test with production-equivalent data to verify no scope widening
6. Update `platformInventory.ts` NOT_WIRED entry if applicable
7. Add governed write entry if the live connector performs any write action (currently none planned)

## Tests

```bash
npm test -- copilot copilotAssistant dealCopilot workspaceCopilot CopilotAssistPanel CopilotFoundationGovernance
```

Tests prove:
- Copilot context only contains authorized loaded data
- not_configured adapter is honest
- No fake AI response text
- No write functions are called
- No cross-team data access
- Deal context includes client/stage/status/amount/tasks/docs/blockers
- Workspace context includes KPI/deal/urgent summaries
- UI renders disabled/not-configured state when connector is absent
- Adapter source has no Dataverse imports
- Context builders are pure (no async, no load, no fetch)

## Acceptance

```bash
npm test -- copilot copilotAssistant dealCopilot workspaceCopilot CopilotAssistPanel CopilotFoundationGovernance
npm run build
```

- No live connector required for this phase
- UI honestly states when Copilot is not configured
