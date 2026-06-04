# Phase 130B — Copilot demo polish & connector-readiness audit

## Goal

Polish the visible Copilot Assist placement across the four LOS
surfaces and document the live Microsoft Copilot connector path —
**without enabling any live call**. The default adapter stays
`not_configured`; no `fetch` / Graph / MSAL / connector call is
introduced; no write, no autonomous action, no new Dataverse scope.

---

## 1. UI polish shipped

All changes are presentation-only inside `src/copilot/`.

- **Distinctive accent + status pill** ([CopilotAssistPanel.tsx](../src/copilot/CopilotAssistPanel.tsx)).
  The panel now renders with a cobalt accent stripe (`Card accentColor={palette.cobalt}`)
  so it reads as a distinct "intelligence" surface rather than another
  white card, and a header **status pill** that states the connector
  state in one glance:
  - not_configured → a muted/neutral **"Not configured"** pill
    (`aria-label="Copilot connector not configured"`). Never colored to
    imply an active connector.
  - live (dormant today) → a cobalt **"Connected"** pill. This branch
    only renders when the adapter is not `not_configured`, which cannot
    happen with the shipped default — so it never appears now.
  The subtitle ("Connector not configured — local summaries only") and
  the two-line footer ("Copilot connector not configured. Local
  summaries only. No AI. No external calls." / "Read-only assistant.
  Cannot approve, change data, or send communications.") are unchanged.
- **Deal cockpit opens expanded** ([DealCopilotAssist.tsx](../src/copilot/DealCopilotAssist.tsx)).
  The deal-workspace placement passes `defaultExpanded`, so the banker
  immediately sees the read-only quick actions + the honest
  not-configured state in the right rail. The command-center surfaces
  (manager / portfolio / team) stay **collapsed by default** (compact)
  but are now more discoverable via the accent stripe + status pill,
  and remain mounted near the top of each cockpit body (Phase 130A
  placement, unchanged).

Net effect: more noticeable, still honest, still read-only. No new
buttons or affordances were added to the dense cockpit bodies — the
panel encapsulates its own (non-mutating) controls.

---

## 2. Connector-readiness — current architecture

The Copilot UI already sits behind a clean adapter boundary, so going
live is an adapter swap, not a UI rewrite:

- [`CopilotAssistantAdapter`](../src/copilot/copilotAssistantAdapter.ts)
  is the contract (`summarizeDeal`, `summarizeWorkspace`,
  `suggestNextActions`, `explainMissingFields`, `explainBlockers`).
- `getCopilotAdapter()` returns a module singleton, defaulted to
  `createNotConfiguredAdapter()` (`mode: 'not_configured'`, every
  response `isLive: false`, text prefixed "Copilot connector is not
  configured…").
- Context builders (`buildDealCopilotContext`,
  `buildWorkspaceCopilotContext`) already produce **GUID-free,
  label-and-count-only** context objects from data the surface already
  loaded — exactly the payload a live model call would ground on.

Going live = implement a `createLiveAdapter()` against the same
interface and have `getCopilotAdapter()` return it (gated on config).
The panel already renders the live-mode copy ("Powered by Microsoft
Copilot. Verify before acting.") and the "Connected" pill for that
branch.

### How this Code App invokes a connector today (the precedent)

The only live connector wired in this app is **Office 365 Outlook**:

1. `power.config.json` → `connectionReferences` registers
   `shared_office365` with a connection reference logical name
   (`new_Office365OutlookCommercialLOS`). Dataverse tables live under
   `databaseReferences.default.cds.dataSources`.
2. `pac code add-data-source` generates a typed client under
   `src/generated/services/` — e.g. `Office365OutlookService` with
   static async methods returning `IOperationResult<T>`.
3. Production code calls it directly:
   `await Office365OutlookService.SendEmailV2(message)`
   ([outlookEmailAdapters.ts](../src/deals/emailDelivery/outlookEmailAdapters.ts)) —
   no raw `fetch`, no secret in the client; auth flows through the
   Power Platform connection reference.

A live Copilot connector would follow the **same** three-step pattern:
a connection reference in `power.config.json`, a generated typed
service, and an adapter that calls it. That is the constraint that
shapes the options below.

---

## 3. Option evaluation

| Option | Mechanism | Pros | Cons / blockers |
|---|---|---|---|
| **(a) Copilot Studio custom connector / action** | Publish a Copilot Studio agent; expose it to the Code App via a (custom) connector + connection reference; call the generated service. | Managed conversational agent; built-in grounding + content moderation; governed by Power Platform DLP + connection references; no model key in the client. | Requires a published Copilot Studio agent, custom-connector authoring, a new connection reference, and a DLP review. Streaming/structured responses need shaping. Licensing (Copilot Studio messages). |
| **(b) Dataverse custom API (plugin → Azure OpenAI)** ⭐ | Author an unbound Dataverse custom API (e.g. `cr664_CopilotSummarize`); a plugin calls Azure OpenAI server-side and returns a typed result; the Code App calls it through the existing Dataverse SDK path. | Model key stays **server-side** (plugin / Key Vault) — never in the browser. Reuses the **existing Dataverse connection/auth** — no new connector, no new DLP surface. The plugin can write the **per-call audit row** the project's governance model expects (mirrors `GOVERNED_WRITES`). Deterministic request/response shape. | Requires plugin development + ALM, an Azure OpenAI resource + key management, and an SDK regen to expose the custom API. Server-side latency budget. |
| **(c) Azure OpenAI / Graph via connector (direct)** | Code App calls an Azure OpenAI connector (or Graph) directly. | Fewest moving parts to "a model". | Business context + prompt leave the Dataverse boundary through a client-initiated call; heaviest DLP + data-governance review; no built-in grounding or audit; highest hallucination-exposure. Graph is M365-data, not an LLM. **Least aligned** with the conservative, auditable posture. |
| **(d) Power Automate flow invoked from Code App** | An instant/HTTP-triggered flow calls Copilot Studio or Azure OpenAI; the Code App invokes the flow connector. | Low-code; secrets in the flow connection; can add audit steps in-flow. | Latency + flow throttling/run limits; another ALM artifact; awkward for structured/streamed responses; per-run licensing. |

---

## 4. Recommendation

**Primary: (b) Dataverse custom API backed by a plugin → Azure OpenAI.**

It is the best fit for this codebase because it:

- keeps the model call and key **server-side**, so the browser never
  holds a secret and never calls an LLM endpoint directly;
- reuses the **existing Dataverse connection** the Code App already
  authenticates against — no new connector, no new DLP review surface;
- lets the plugin emit the **same audit/timeline discipline** the rest
  of the platform enforces for governed writes (an AI call becomes an
  auditable event with provenance), which is exactly what the Lane F
  governance gap in
  [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md)
  (§1.11) calls for: a per-token audit trail and an explicit "this is
  AI" disclosure;
- returns a typed result that drops straight into a `createLiveAdapter()`
  implementing the existing `CopilotAssistantAdapter` interface.

**Secondary: (a) Copilot Studio custom connector** if the org prefers a
managed conversational agent (built-in moderation + grounding) over a
self-hosted plugin. Both keep the model boundary off the client.

**Not recommended now:** (c) direct Azure OpenAI/Graph from the client
(governance/data-egress risk) and (d) Power Automate (latency +
operational overhead) unless a low-code constraint forces it.

---

## 5. Blockers before any live call (why we stop here)

1. **Governance / model policy (Lane F).** No approved model-governance
   policy: AI-output disclosure, hallucination policy, and a per-call
   audit shape must be ratified first. AI generation is inventoried as
   `NOT_WIRED.ai-generation`.
2. **No AI resource provisioned.** No Azure OpenAI resource / Copilot
   Studio agent, and no key-management (Key Vault) decision.
3. **No connector / custom API exists.** For (b): the `cr664_Copilot*`
   custom API + plugin aren't authored and the SDK hasn't been
   regenerated to expose them. For (a): no connection reference in
   `power.config.json` and no custom connector.
4. **DLP review.** Any new connector path needs a Data Loss Prevention
   review for the environment.

Until these land, the default `not_configured` adapter is the correct,
honest state, and the UI says so plainly.

---

## 6. Governance confirmation

- Default adapter remains **`not_configured`** (pinned).
- **No** `fetch` / `XMLHttpRequest` / `Office365` / `SendEmailV2` /
  `microsoft-graph` / `msal` reference anywhere in `src/copilot/`
  (pinned by [copilotSurfaceWiring.governance.test.ts](../src/copilot/copilotSurfaceWiring.governance.test.ts) §3).
- **No** write action, email send, task completion, or document
  request. The assistant is read-only by construction.
- **No fake AI.** Every default response is `isLive: false`, tagged
  "Local summary", "Not AI-generated. Not a recommendation."
- **No raw GUID leakage** — context builders emit labels + counts only
  (pinned).
- **No new Dataverse scope** — every surface reuses already-loaded,
  already-authorized data.

---

## 7. Tests

- **Visible on all four surfaces** — `DealCopilotAssist.test.tsx` plus
  the "Phase 130A — Copilot assist panel wiring" blocks in the
  Manager / Portfolio / Team Ops suites assert the panel mounts.
- **Polish pinned** — `DealCopilotAssist.test.tsx`: opens expanded by
  default on the deal cockpit (quick actions visible without a click)
  and renders the "Not configured" status pill;
  `copilotSurfaceWiring.governance.test.ts` §5 pins the accent stripe,
  the status-pill text, and the live pill being gated off by default.
- **Not-configured still explicit** — every surface test asserts the
  "Copilot connector not configured" copy.
- **No live network/connector call / no write / no GUID** — governance
  §1–§4 + the deal connector test.

## Acceptance

```
npm test -- Copilot DealCopilot ManagerBloomberg Portfolio TeamOpsQueue
npm run build
```

- Target suites: **246 tests pass** (14 files).
- `npm run build` (`tsc -b && vite build`) is clean.

## Out of scope (next phase, if approved)

- Author the custom API + plugin (or Copilot Studio agent + connector).
- Implement `createLiveAdapter()` against `CopilotAssistantAdapter`;
  gate `getCopilotAdapter()` on configuration.
- Per-call audit + "this is AI" disclosure surface.
