# Phase 137M — Copilot governance checkpoint packet

> **Governance checkpoint only.** This is a board/operator-ready summary of
> the full **137A–137L** Copilot readiness runway and the decision gates
> required before any real Dataverse table creation, Custom API creation,
> server deployment, or live model enablement. It changes **no runtime
> source**, creates **no** table / Custom API / schema / server / live
> connector, and the runtime Copilot connector stays **`not_configured`**.

## A. Executive summary

- **Copilot is architected but NOT live.** The repo contains a fully
  designed, inert, fail-closed path to enable Copilot later — and nothing
  that enables it.
- **Runtime default remains `not_configured`.**
- There are **no model calls, no Dataverse writes, no Custom API calls, no
  schema creation, no plugin / Azure Function deployment, and no live
  transport** anywhere in the repo.
- The repo now contains a **governed path** to enable Copilot later, gated
  behind the approvals in §E.

## B. What has been built (137A–137L)

| Phase | Artifact | Purpose | Runtime effect | Live-risk status |
| --- | --- | --- | --- | --- |
| 137A | docs/governance (decision) | Selected **Dataverse Custom API + server-side Azure OpenAI** architecture | None | Safe |
| 137B | docs (contract) | Specified the `cr664_RunLosCopilotAssist` request/response contract | None | Safe |
| 137C | `src/copilot/copilotCustomApiContract.ts` (+ adapter) | Inert types + validators + disabled-by-default adapter | Inert; `not_configured` | Safe |
| 137D | `src/copilot/copilotConnectorConfig.ts` | Pure config resolver + injected transport seam | Inert; resolves `not_configured`, secrets fail closed | Safe |
| 137E | `src/copilot/copilotDataverseCustomApiTransport.ts` (+ readiness) | Fail-closed transport **stub** + readiness helper | Inert; `disabled`/`missing_config` | Safe |
| 137F | docs (runbook) | Custom API registration runbook + server contract | None | Safe |
| 137G | `scripts/phase122-lookup-repair.mjs` modes | Custom API metadata **dry-run** inspect/plan (commit not implemented) | None (offline / read-only) | Safe |
| 137H | docs (spec) | Server-side plugin / Azure Function skeleton spec | None | Safe |
| 137I | docs (design) | Audit / event ledger design (`cr664_copilotauditevent`) | None | Safe |
| 137J | `scripts/phase122-lookup-repair.mjs` modes | Audit-table metadata **dry-run** inspect/plan (commit not implemented) | None (offline / read-only) | Safe |
| 137K | `src/copilot/copilotAuditLogger.ts` | Disabled audit-logger skeleton + builders + validation | Inert; disabled logger fails closed | Safe |
| 137L | `src/copilot/copilotServerHandler.ts`, `copilotLiveTransportHarness.ts` | Disabled server-handler skeleton + disabled live harness | Inert; fail-closed audit-before-model, model never invoked | Safe |

Every artifact is docs/governance or **inert TypeScript that is not on any
render path**; none enables a live call.

## C. Current runtime posture

- **Default connector mode: `not_configured`** (`getCopilotConnector().status().mode`).
- **No concrete transport** — only the fail-closed stub; the live transport
  is an injected interface that does not exist.
- **No browser `fetch` / `XMLHttpRequest` / network call** in `src/copilot`.
- **No Azure / OpenAI endpoint** (`api.openai.com` / `openai.azure.com`)
  anywhere.
- **No Dataverse write path** from Copilot — no table create/update/patch/delete.
- **No autonomous writes.**
- **No fake responses** — `not_configured` returns honest, non-AI local
  summaries only.
- **UI remains read-only / not-configured** — the cockpit Copilot panel
  shows "Not configured"; no behavior changed.

## D. Architecture decision

**Browser → Dataverse Custom API `cr664_RunLosCopilotAssist` → server-side
handler → Azure OpenAI.** The browser calls only the first-party Dataverse
Custom API; the server-side handler calls Azure OpenAI; secrets stay
server-side.

**Rejected alternatives:**

- **Browser-direct Azure OpenAI** — rejected (secret exposure, DLP risk,
  weak audit boundary).
- **Fake local AI responses** — rejected (honesty-contract violation).
- **Autonomous write agent** — rejected (proposal-only + human confirmation
  always).
- **Unmanaged client secrets** — rejected (server-side managed identity /
  secret store only; no secret in the browser bundle).

## E. Required governance gates before live enablement

All gates must clear, in a test tenant first, before any production
enablement:

- **Gate 1 — DLP and Azure OpenAI model policy approval.**
- **Gate 2 — `cr664_copilotauditevent` audit table created and verified.**
- **Gate 3 — `cr664_RunLosCopilotAssist` Custom API created and verified.**
- **Gate 4 — server-side handler / plugin / Azure Function approved and
  deployed.**
- **Gate 5 — server-side secret store or managed identity configured.**
- **Gate 6 — audit logger writes `audit_start` before the model call.**
- **Gate 7 — `live_read_only` test-tenant enablement only.**
- **Gate 8 — `proposal_only` with human confirmation only.**
- **Gate 9 — production enablement review.**

## F. Audit-before-model rule

- **No Azure OpenAI / model call before `audit_start` succeeds.**
- If `audit_start` fails, the handler returns a fail-closed response with
  **`audit_unavailable`** and makes no model call.
- **Audit completion / fail-closed events are required** (`audit_completion`
  / `audit_fail_closed`).
- **Proposal confirmation / governed-write completion must link by
  `correlationId` + proposal id** (`proposal_confirmed` /
  `governed_write_completed`).

## G. Data protection posture

- **Minimized / redacted context only** — the request carries the
  already-authorized view-model context, minimized.
- **No raw borrower documents** — document metadata only unless a future
  approved policy says otherwise.
- **No secrets / tokens / API keys** in prompts or logs.
- **Prompt / context stored as hash or summary only** in the audit ledger.
- **Retention must be approved** before live enablement (bank records
  policy).

## H. Proposal / write safety

- **The model never executes writes.**
- **Proposals require `requireConfirmation: true`.**
- **Write-capable proposals require a `governedWritePath`.**
- **Final writes occur only through existing governed app paths after human
  confirmation** — audited separately via `cr664_AuditEvent`, cross-linked
  by `correlationId`.
- **`explain_only` is the read-only floor** (never write-capable; no
  governedWritePath required).

## I. Remaining blockers

1. Audit table (`cr664_copilotauditevent`) not created.
2. Custom API (`cr664_RunLosCopilotAssist`) not created.
3. Server handler not deployed.
4. Audit logger not live (only the disabled logger exists).
5. Azure OpenAI / DLP / model policy not approved.
6. Managed identity / secret store not configured.
7. Disable switch not configured for live mode.
8. `live_read_only` / `proposal_only` not enabled.

## J. Decision fork

Governance chooses one:

- **Option 1 — Approve Gate 1 / Gate 2 work in a TEST TENANT only** (DLP +
  model policy approval, then create + verify the `cr664_copilotauditevent`
  audit table via the guarded 137J script with an explicit commit flag).
- **Option 2 — Pause Copilot** and return to LOS product-surface work.
- **Option 3 — Perform a security / compliance review** before any
  Dataverse schema work.

**Recommended:** Option 3 first (security/compliance review), because the
next concrete step (table creation → live model calls) crosses into real
Azure OpenAI spend, DLP, and borrower-data-exposure boundaries.

## K. Operator acceptance checklist

Before **any** live enablement (all must be true):

- [ ] git working tree clean
- [ ] full tests pass
- [ ] build clean
- [ ] DLP / model policy approved
- [ ] audit table exists (`cr664_copilotauditevent`)
- [ ] Custom API exists (`cr664_RunLosCopilotAssist`)
- [ ] server handler deployed
- [ ] `audit_start` verified (before any model call)
- [ ] fail-closed behavior verified (`audit_unavailable` / disabled)
- [ ] disable switch verified
- [ ] test tenant only
- [ ] documented rollback

## L. Explicit non-goals

- **No live enablement in 137M.**
- **No schema creation.**
- **No Dataverse writes.**
- **No Azure OpenAI calls.**
- **No runtime behavior change.**

## References

- [PHASE_138A_COPILOT_COMPLETION_CERTIFICATION.md](./PHASE_138A_COPILOT_COMPLETION_CERTIFICATION.md)
  — the completion certification: repo-side readiness done, live
  enablement intentionally blocked.
- [PHASE_139A_COPILOT_FINAL_COMPLETION_CERTIFICATION.md](./PHASE_139A_COPILOT_FINAL_COMPLETION_CERTIFICATION.md)
  — the FINAL completion certification + operator commands, server-handler
  package plan, and test-tenant validation packet.
- 137A–137L docs (see the table in §B), and the inert `src/copilot`
  skeletons.
- `feat/copilot-live-connector-safe-actions @ fea3520` — prior prep. **Not
  merged or implemented.**
