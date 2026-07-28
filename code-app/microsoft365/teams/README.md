# Microsoft Teams package for Commercial LOS

This folder contains the Teams app manifest template for hosting the live Power Apps Code App as a Teams personal tab.

## Package steps

1. Copy `manifest.template.json` to `manifest.json`.
2. Add Teams package icons beside it:
   - `outline.png`: transparent 32x32 PNG.
   - `color.png`: full-color 192x192 PNG.
3. Run:

   ```powershell
   powershell -File scripts/activation/verify-microsoft365-integration.ps1 -RequireTeamsIcons
   ```

4. Zip exactly these three files at the ZIP root:
   - `manifest.json`
   - `outline.png`
   - `color.png`
5. Upload the ZIP through Teams Admin Center or Teams app upload, per Old Glory Bank tenant policy.

## Security posture

This Teams package does not grant Graph permissions and does not let the LOS post messages automatically. It only hosts the already-deployed Power Apps URL in Teams. Existing in-app Teams features remain user-mediated:

- Open Teams chat deep link.
- Copy Teams-ready summaries to clipboard.
- Banker manually reviews and sends inside Teams.

Any future “Post to Teams” capability should be added as a separate server-side Graph or Power Automate boundary with named approval, target-channel configuration, Dataverse audit, and DLP review.
