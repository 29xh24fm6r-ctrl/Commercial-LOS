# Microsoft 365 integration runbook

This app integrates with Microsoft 365 in two deliberately separate ways:

1. **Outlook live send** through the Power Apps Office 365 Outlook connector.
2. **Teams hosted/user-mediated collaboration** through a Teams app tab, Teams deep links, and copy-ready summaries.

The separation matters. Outlook send is already a connector-backed governed write path. Teams remains user-mediated unless a future approved server-side Graph posting service is added.

## Current Outlook posture

- Connector verification:

  ```powershell
  powershell -File scripts/activation/verify-outlook-connector.ps1
  ```

- Expected result: `STATUS=PASS`.
- The only production connector callsite remains `Office365OutlookService.SendEmailV2` through `src/deals/emailDelivery/outlookEmailAdapters.ts`.
- `VITE_EMAIL_MODE=LIVE` is the environment switch for real send. Missing or misspelled values fail closed to `DRY_RUN`.

Before enabling broad borrower/document live send, run a diagnostic-mailbox smoke and record the evidence required by `scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence`.

## Current Teams posture

Teams is ready to host the app as a personal tab and to support safe banker-mediated handoff:

- `src/shared/teams/teamsEnvironment.ts` probes Teams host context using `@microsoft/teams-js`.
- `src/deals/TeamsChatHandoff.tsx` opens a Teams chat deep link.
- Teams summary components copy generated text for the banker to paste and send manually.
- No Graph permissions are requested by the Teams manifest template.
- The app does not post messages, read chats, raise Teams notifications, or create meetings.

## Teams package

The Teams manifest template is:

```text
microsoft365/teams/manifest.template.json
```

To package:

1. Copy `manifest.template.json` to `manifest.json`.
2. Add approved Teams PNG icons:
   - `outline.png` — 32x32 transparent.
   - `color.png` — 192x192 color.
3. Verify:

   ```powershell
   powershell -File scripts/activation/verify-microsoft365-integration.ps1 -RequireTeamsIcons
   ```

4. Zip `manifest.json`, `outline.png`, and `color.png` at the ZIP root.
5. Upload through Teams Admin Center / Teams app upload according to tenant policy.

## Future true Teams posting

Do not add direct browser Graph calls. If automatic Teams posting is approved later, add a server-side boundary first:

- Azure Function, Power Automate flow, or custom connector.
- Delegated or narrowly scoped permissions approved by tenant admins.
- Dataverse configuration for allowed team/channel targets.
- Explicit banker action such as “Post to Teams”.
- Dataverse audit event with actor, target, message hash/preview, Graph response id, and correlation id.
- DLP/security review before enabling production use.
