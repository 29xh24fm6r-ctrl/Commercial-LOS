# SPEC-COPILOT-LIVE-CONNECTOR-AND-SAFE-ACTION-ADAPTERS-1

Move Copilot from visible-but-inert/read-only demo mode into a
**governed live-assistant foundation**: explicit connector modes, an
Azure-OpenAI-ready (but feature-flagged-off) live shell, per-surface
read-only context, and a safe proposal engine. Copilot can summarize
and propose; it can **never** write, send, approve, or execute.

> **Default posture is unchanged.** With no env set, the app stays
> `not_configured`: local summaries only, no proposals, no external
> calls, no new permissions.

---

## 1. Connector interface & modes

[src/copilot/copilotConnector.ts](../src/copilot/copilotConnector.ts) adds the explicit-mode boundary:

- **Modes:** `not_configured` | `live_read_only` | `proposal_only` | `disabled`.
- **Providers:** `default` | `azure_openai` | `copilot_studio` | `mock`.
- **`CopilotConnectorStatus`** `{ mode, provider, connected, reason?, model?, last_checked_at? }`.
- **`CopilotProposedAction`** `{ action_id, action_type, label, rationale, requires_confirmation: true, payload }` — `requires_confirmation` is hard-typed `true`.
- **`CopilotConnectorResponse`** `{ isLive, mode, summary, recommendations[], risks[], proposed_actions[], citations_or_evidence_refs[], limitations[] }`.
- **`CopilotConnector`** `{ status(), assistDeal(ctx), assistWorkspace(ctx) }`.

`resolveCopilotConnectorStatus(env, { transport? })` is pure and never
throws. The legacy Phase 129A `copilotAssistantAdapter` (text summaries)
is preserved unchanged for backward compatibility.

### Mode behavior

| Mode | isLive | summary + recommendations | proposals | notes |
|---|---|---|---|---|
| `not_configured` | false | local, honest | none | default; inert posture preserved |
| `live_read_only` | true (when connected) | yes | navigation + `suggest_*` only (no `draft_*`) | read-only |
| `proposal_only` | true (when connected) | yes | adds `draft_*` staging proposals | still no execution |
| `disabled` | false | states disabled + reason | none | explicit off |

---

## 2. Live read-only adapter shell (Azure-OpenAI-ready, off by default)

### Env flags (added to [.env.example](../.env.example))

| Flag | Where | Purpose |
|---|---|---|
| `VITE_COPILOT_MODE` | client (non-secret) | `not_configured`\|`live_read_only`\|`proposal_only`\|`disabled` |
| `VITE_COPILOT_PROVIDER` | client (non-secret) | `default`\|`azure_openai`\|`copilot_studio`\|`mock` |
| `AZURE_OPENAI_ENDPOINT` | **server-only** | live endpoint (never client) |
| `AZURE_OPENAI_DEPLOYMENT` | **server-only** | deployment name |
| `AZURE_OPENAI_API_KEY` | **server-only** | prefer managed identity; never shipped to client |

Resolution rules (all enforced + tested):

- **Missing env → `not_configured`.** Unrecognized mode → `not_configured` with a reason.
- **`mock` provider** in a live mode → `connected` (deterministic local output; the test/demo vehicle). No network call.
- **`azure_openai` / `copilot_studio`** require an injected **server-only** `CopilotLiveTransport`. It is **not wired** this phase, so without a transport they resolve to **`disabled`** with a reason. The client never reads the endpoint/deployment/key.
- **Never throws into the UI**; **no client-side secrets**; **no `fetch`/`fetch`-equivalent** anywhere in `src/copilot/`.

---

## 3. Per-surface read-only context

[src/copilot/copilotAssistContext.ts](../src/copilot/copilotAssistContext.ts) defines `CopilotDealAssistContext` and `CopilotWorkspaceAssistContext`, built from **already-loaded, already-authorized** data only — no new Dataverse scope:

- **Deal:** deal summary, stage/status, client, completeness/risk flags, readiness blockers, next-best-action, and an **optional `bie` block** (see §6).
- **Manager / Portfolio / Team:** the existing snapshot KPIs, exception/blocker tape, and top blockers fed from `deriveManagerPipelineSnapshot` / `derivePortfolioCommandSnapshot` / `deriveTeamOpsQueueSnapshot`.

The deal surface wires it in [DealCopilotAssist.tsx](../src/copilot/DealCopilotAssist.tsx); the three command centers wire workspace proposals in their cockpit bodies. All gated on connector mode, so nothing renders in `not_configured`.

---

## 4. Safe proposal engine

[src/copilot/copilotProposalEngine.ts](../src/copilot/copilotProposalEngine.ts) — pure. Allowed `action_type`s only: `open_screen`, `draft_note`, `draft_borrower_request`, `draft_committee_task`, `suggest_evidence`, `suggest_research_rerun`, `suggest_memo_regeneration`. Every proposal carries `requires_confirmation: true`.

`draft_*` proposals appear only in `proposal_only`; `live_read_only`
gets navigation + suggestions only. **Disallowed and not representable**
by the enum: create/update Dataverse records, send email/Teams, advance
stage, accept/reject committee evidence, mark a task committee-grade,
waive a risk flag, approve credit, auto-regenerate memo, auto-run
research.

---

## 5. UI behavior

[CopilotAssistPanel.tsx](../src/copilot/CopilotAssistPanel.tsx):

- **Status pill** reflects the 4 modes (`Not configured` / `Live read-only` / `Proposal only` / `Disabled`). The cobalt "live" styling is applied **only** when `status.connected === true` in a live mode — **no fake "Connected"**.
- **Disclaimer:** "Copilot can summarize and suggest. It cannot write or submit changes."
- **Proposed actions** render as confirmation-required cards **only** in `live_read_only`/`proposal_only`. `open_screen` renders a safe in-page anchor; other types are non-executing cards with a "Requires confirmation" badge. No proposal performs a write/send/approval.
- The existing not-configured subtitle, footer ("Cannot approve, change data, or send communications"), and `CopilotNotConfiguredState` are preserved.

---

## 6. BIE integration (committee readiness)

There is **no BIE / committee-evidence Dataverse loader in this repo
today** (verified). To honor "no new Dataverse scope / no new
permissions", BIE is modelled as an **optional, read-only `bie` block**
on the deal context: `preliminaryEligible`, `committeeEligible`,
`evidenceTasks[]` (category, status, `committeeGrade`, `autoClearable`),
`committeeBlockerCategories`, `sourceSnapshotStatus`, `researchGrade`.

Production deal contexts leave `bie` **undefined** (no loader); a future
spec can wire an authorized loader to populate it. Copilot only ever
**reads** this block (pinned: no mutation). For OmniCare-style deals the
connector summarizes preliminary-clear / committee-blocked, the evidence
task states, and the remaining blocker categories, and proposes only
safe next actions.

---

## 7. Governance & tests

- [specCopilotLiveConnectorGovernance.test.ts](../src/shared/governance/specCopilotLiveConnectorGovernance.test.ts) — no client secrets; no `fetch`/Graph/Teams/`Office365`/`SendEmailV2`/`.create`/`.update`/`.patch`/`.delete` in any Copilot file; panel imports no generated service / write surface; every proposal requires confirmation; disabled/not_configured never throw and yield no proposals; missing env → not_configured; mock `isLive` only when configured; BIE summary read without mutation.
- [copilotConnector.test.ts](../src/copilot/copilotConnector.test.ts), [copilotProposalEngine.test.ts](../src/copilot/copilotProposalEngine.test.ts), [omniCareCopilot.test.ts](../src/copilot/omniCareCopilot.test.ts), [CopilotAssistPanel.connector.test.tsx](../src/copilot/CopilotAssistPanel.connector.test.tsx).
- Existing Phase 129A/130A/130B governance + surface suites remain green; the one Phase 130B pill pin was updated to the new 4-mode logic (still gating "live" styling on `connected`).

---

## 8. Acceptance

- **Default (no env):** not_configured posture, no external calls, no new permissions, tests green.
- **Mock / live_read_only:** status shows the live pill, grounded summary from passed context, proposals render, all require confirmation, no writes.
- **OmniCare:** Copilot summarizes preliminary-clear, committee-blocked, 10 evidence tasks, website committee-grade accepted, management accepted-not-committee-grade, missing SOS/adverse/industry/market, scale-plausibility accepted-not-auto-clearable; proposes only safe next actions; does not clear committee, accept evidence, or auto-run research.

`npm test` → **3791 passing**. `npm run build` → clean.

## Non-goals (confirmed not built)

No autonomous writes; no email/calendar/Teams send; no borrower-portal
Copilot; no Copilot Studio production integration; no new Dataverse
permissions; no credit-approval automation; no committee blocker
auto-clear; no model output treated as source of truth.
