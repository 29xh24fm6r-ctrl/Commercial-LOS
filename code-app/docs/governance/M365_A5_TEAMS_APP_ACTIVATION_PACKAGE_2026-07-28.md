# M365-A5 Teams app activation package - 2026-07-28

## Production manifest

- Manifest: `microsoft365/teams/manifest.template.json`
- App ID: `63858e09-3d0b-47c9-b1d2-65cef742fda4`
- Personal tab scope only.
- `contentUrl` and `websiteUrl` point to the same Power Apps app/environment URL.
- `validDomains` are limited to `apps.powerapps.com`, `make.powerapps.com`, and `oldglorybank.com`.
- Resource-specific Graph permissions list is empty.

## Local build

```powershell
powershell -File scripts/microsoft365/build-teams-package.ps1 -ValidateOnly
powershell -File scripts/microsoft365/build-teams-package.ps1
```

The build emits `PACKAGE_SHA256` and writes the ZIP only under ignored `dist/microsoft365/teams/`.

## Tenant upload checklist

1. Verify package hash against the PR evidence.
2. Upload through Teams Admin Center under tenant policy.
3. Assign only the approved internal test users.
4. Confirm the personal tab opens.
5. Confirm Power Apps authentication succeeds.
6. Confirm deep links preserve the configured environment/app identifiers.

## Rollback

Remove the test-user assignment first. If necessary, upload the prior certified package version and record the package hash, operator, and timestamp.
