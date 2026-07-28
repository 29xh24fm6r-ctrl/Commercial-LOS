# Microsoft Teams package for Commercial LOS

This folder contains the Teams app manifest template for hosting the live Power Apps Code App as a Teams personal tab.

## Package steps

1. Copy `manifest.template.json` to `manifest.json`.
2. Add Teams package icons beside it:
   - `outline.png`: transparent 32x32 PNG.
   - `color.png`: full-color 192x192 PNG.
3. Validate without writing a package:

   ```powershell
   powershell -File scripts/microsoft365/build-teams-package.ps1 -ValidateOnly
   ```

4. Build the local package for tenant upload evidence:

   ```powershell
   powershell -File scripts/microsoft365/build-teams-package.ps1
   ```

   The script writes only under `dist/microsoft365/teams/`, prints `PACKAGE_SHA256=...`, and never uploads the app.

5. Zip structure must contain exactly these three files at the ZIP root:
   - `manifest.json`
   - `outline.png`
   - `color.png`
6. Upload the ZIP through Teams Admin Center or Teams app upload, per Old Glory Bank tenant policy.

## Version strategy

- Patch version: runbook/doc-only or icon/package rebuilds.
- Minor version: tab URL or app capability changes.
- Major version: identity, permission, or tenant policy changes.

Record the manifest version and `PACKAGE_SHA256` in `docs/operator-evidence/m365-calendar-teams/teams-app.md`.

## Rollback

Disable assignment for the test users first. If the package itself must be rolled back, upload the last certified ZIP/version recorded in evidence and verify the personal tab URL opens the previous production Power Apps URL.

## Security posture

This Teams package does not grant Graph permissions and does not let the LOS post messages automatically. It only hosts the already-deployed Power Apps URL in Teams. Existing in-app Teams features remain user-mediated:

- Open Teams chat deep link.
- Copy Teams-ready summaries to clipboard.
- Banker manually reviews and sends inside Teams.

Any future “Post to Teams” capability should be added as a separate server-side Graph or Power Automate boundary with named approval, target-channel configuration, Dataverse audit, and DLP review.
