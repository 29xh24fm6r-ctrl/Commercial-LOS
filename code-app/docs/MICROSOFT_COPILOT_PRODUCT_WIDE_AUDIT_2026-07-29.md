# Microsoft Copilot product-wide audit — 2026-07-29

## Executive finding

The app has a strong governed Copilot design, but it is not live in the current Power Platform environment. Existing code defined a fail-closed Custom API, audit, proposal, and UI contract; the runtime transport is still a stub and `power.config.json` has no Microsoft Copilot Studio connection reference. The previous "full integration" verifier checks static wiring and policy markers, not an end-to-end agent response.

This change closes the repository-side surface coverage gap. Copilot is now contextually mounted for the banker command center, banker deal workspace, CRM, team, manager, portfolio, executive, and admin workspaces. Every production mount is gated by `isCopilotSurfaceLive()`, uses only data already loaded and authorized by its current surface, and remains hidden until a real connector reports connected.

## Surface audit

| User / surface | Helpful Copilot jobs | Repository status |
| --- | --- | --- |
| Banker command center | Prioritize today; summarize pipeline; explain overdue tasks and missing documents; prepare handoff | Added |
| Banker deal workspace | Deal summary; blockers; missing fields; next action; borrower-question drafts | Existing |
| CRM — all sections | Relationship brief; coverage gaps; recent interactions; follow-up proposals | Expanded from Insights-only to workspace-wide |
| Team operations | Queue prioritization; stalled-item explanation; shift handoff | Existing |
| Manager | Portfolio summary; team blockers; review preparation | Existing |
| Portfolio | Exceptions; concentrations; risk themes; follow-up review | Existing |
| Executive | Board narrative; risk movement; governance blockers | Existing |
| Admin | Diagnostic summary; activation blockers; operator checklist | Added, operational context only |

Copilot is intentionally not placed inside irreversible confirmation dialogs, credit approval controls, funding authorization, adverse-action issuance, entitlement changes, deletion/removal controls, or send/post buttons. In those locations it may prepare context outside the transaction, but it must not compete with or obscure the human confirmation boundary.

## Current tenant evidence

`pac connection list --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d` returned connected Office 365 Outlook, SharePoint, and Dataverse connections. It returned no connection whose API ID is `/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio`.

Therefore these activation steps remain:

1. Create a Microsoft Copilot Studio connection in the Power Apps maker portal.
2. Add it to this code app with `pac code add-data-source -a "shared_microsoftcopilotstudio" -c <connectionId>`.
3. Publish the approved agent and record its agent name.
4. Implement the generated connector invocation behind the existing validated request/response boundary.
5. Prove audit-start, completion/fail-closed, citation, DLP, end-user authorization, and prompt-injection controls in a test tenant.
6. Only then set the non-secret live-mode flags and run end-to-end validation.

Microsoft's supported code-app connection procedure is documented at:
https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio

End-user authentication must be used for restricted data tools:
https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-enduser-authentication

## Mandatory banking controls

- Use the signed-in user's authorization; never maker credentials for customer or loan data.
- Send only the already-authorized current-surface context. Do not broaden queries for Copilot.
- Require citations/evidence references for factual answers and disclose limitations.
- Keep ungrounded answers disabled for lending, credit, compliance, and customer-record questions.
- Log correlation ID, user, workspace, prompt kind/redacted hash, policy version, outcome, citations, and confirmed proposal.
- Treat model output as untrusted input. Validate the response allowlist and fail closed.
- Copilot may summarize, explain, prepare, and propose. It may never approve credit, advance stages, waive conditions, change entitlements, send communications, or write records autonomously.
- Every write-capable proposal must route to an existing governed UI and require a separate human confirmation.

## Deferred opportunities after live read-only proof

- Ground approved operating procedures and policy manuals from permission-trimmed SharePoint knowledge.
- Publish the same agent to Teams and Microsoft 365 Copilot after tenant approval.
- Add cited meeting preparation and post-call recap using the existing governed Outlook/Teams boundaries.
- Add document-content assistance only after document-level authorization, sensitivity-label, retention, and prompt-injection testing are certified.
