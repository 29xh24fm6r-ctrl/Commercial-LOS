# Microsoft Copilot full integration runbook

This repo now treats Microsoft Copilot as a first-class, cross-system capability, not a loose chat widget. The integration is intentionally governed:

- the user experience is mounted across the LOS deal and command-center surfaces;
- live AI runs through Microsoft Copilot Studio / Dataverse server-side boundaries;
- the browser never receives model secrets or direct model endpoints;
- Copilot can summarize and propose, but it cannot autonomously write, approve, email, post to Teams, or mutate Dataverse.

## Current implementation in this app

| Area | Status | Evidence |
| --- | --- | --- |
| Banker deal workspace | Wired | `src/deals/BankerDealWorkspace.tsx` mounts `DealCopilotAssist` |
| Manager command center | Wired | `src/manager/ManagerBloombergControlPanel.tsx` mounts `CopilotAssistPanel` |
| Portfolio command center | Wired | `src/portfolio/PortfolioCommandCenter.tsx` mounts `CopilotAssistPanel` |
| Team ops queue | Wired | `src/team/TeamOpsQueue.tsx` mounts `CopilotAssistPanel` |
| Executive command center | Wired | `src/executive/ExecutiveCommandCenter.tsx` mounts `CopilotAssistPanel` |
| Dataverse Custom API contract | Defined | `cr664_RunLosCopilotAssist` in `src/copilot/copilotCustomApiContract.ts` |
| Audit event ledger | Defined | `cr664_copilotauditevent` in `src/copilot/copilotAuditLogger.ts` |
| Microsoft Copilot Studio contract | Defined | `microsoft365/copilot-studio/agent-contract.json` |
| Activation verifier | Defined | `scripts/activation/verify-copilot-integration.ps1` |

The runtime default remains `not_configured` until tenant-side Copilot Studio and Dataverse Custom API activation are completed. That is deliberate: no fake Copilot, no client-side secret, no unapproved model call.

## Microsoft-supported integration path

Use the Microsoft Copilot Studio agent path for live assistance:

1. Create or select the Copilot Studio agent in the same Power Platform environment.
2. Add the LOS tool/action that invokes the Dataverse Custom API contract `cr664_RunLosCopilotAssist`.
3. Add approved knowledge sources such as Dataverse records and SharePoint-hosted operating runbooks.
4. Publish the agent and share it with the required users/security groups.
5. Configure the code app to use the non-secret live connector flags after the server-side handler and audit table pass validation.
6. Package or expose the agent through Teams / Microsoft 365 Copilot only after tenant admin approval.

Relevant Microsoft docs:

- Power Apps code apps can connect to Copilot Studio agents: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio
- Copilot Studio agents can be extended with tools: https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-tools-custom-agent
- Copilot Studio supports connectors as agent tools: https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-connectors
- Copilot Studio knowledge sources can include enterprise data such as Dataverse, Dynamics 365, websites, and external systems: https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-copilot-studio
- SharePoint knowledge sources honor the signed-in user's permissions: https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-add-sharepoint

## Tenant activation checklist

Run these from the repo root unless noted.

### 1. Verify repo-side Copilot wiring

```powershell
powershell -File scripts/activation/verify-copilot-integration.ps1
```

Expected result: `STATUS: PASS`.

This is read-only. It checks source wiring, the Copilot Studio contract, docs, the Dataverse custom API seam, the audit ledger seam, and the "no browser-direct model/Graph/write" posture.

### 2. Verify Dataverse auth for live smoke scripts

```powershell
pac org who
Connect-AzAccount
$env:DATAVERSE_ACCESS_TOKEN = (Get-AzAccessToken -ResourceUrl "https://org3a57b8d4.crm.dynamics.com").Token
if ($env:DATAVERSE_ACCESS_TOKEN) { "DATAVERSE_ACCESS_TOKEN set" } else { "TOKEN MISSING" }
```

### 3. Inspect Dataverse Copilot metadata

```powershell
node scripts/phase122-lookup-repair.mjs --inspect-copilot-audit-table
node scripts/phase122-lookup-repair.mjs --inspect-copilot-custom-api
```

If the audit table or Custom API is missing, do not improvise a browser or client workaround. Create the tenant-side metadata through the approved Power Platform/Dataverse deployment path, then inspect again.

### 4. Create the Copilot Studio agent

Create the agent using `microsoft365/copilot-studio/agent-contract.json` as the implementation contract:

- instructions: copy the `copilotStudio.agentInstructions` text;
- tool: create `RunLosCopilotAssist` and map it to the server-side action for `cr664_RunLosCopilotAssist`;
- knowledge: add only approved Dataverse/SharePoint knowledge sources;
- channel: publish first to the code app/test users, then Teams/Microsoft 365 Copilot after tenant approval.

### 5. Enable live app mode only after server-side proof

Client-visible config must remain non-secret:

```text
VITE_COPILOT_MODE=live_read_only
VITE_COPILOT_CUSTOM_API_NAME=cr664_RunLosCopilotAssist
VITE_COPILOT_ENDPOINT_ALIAS=dataverse-custom-api
VITE_COPILOT_POLICY_VERSION=<approved-policy-version>
```

Do not add Azure OpenAI endpoints, keys, Copilot Studio tokens, Graph tokens, or Dataverse bearer tokens to client config.

### 6. Escalate to proposal-only mode after read-only proof

Use `proposal_only` only after these are proven in the test tenant:

- audit_start is written before the agent/model call;
- audit_completion or audit_fail_closed is written after;
- unsafe or malformed model output fails closed;
- every write-capable proposal carries `requireConfirmation: true`;
- every write-capable proposal maps to an existing governed write path;
- the human confirmation UI, not Copilot, performs the write.

## What "fully integrated" means here

Fully integrated means Microsoft Copilot is wired into the LOS operating model end-to-end:

- every primary workspace has a Copilot surface;
- the Microsoft Copilot Studio agent contract is explicit;
- Dataverse context and security stay server-side;
- Outlook/Teams remain governed, user-confirmed channels;
- activation can be verified with a repeatable script;
- live enablement is controlled by tenant/admin proof, not by a hidden front-end switch.

It does not mean Copilot gets broad write permissions. In a lending LOS, that would be the wrong kind of magic trick.
