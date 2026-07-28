# M365-4 Teams app tenant activation runbook — 2026-07-28

This runbook covers Teams app package creation and tenant activation readiness. It does not authorize upload or tenant policy changes from the repo.

## Local package validation

```powershell
powershell -File scripts/microsoft365/build-teams-package.ps1 -ValidateOnly
```

## Local package build

```powershell
powershell -File scripts/microsoft365/build-teams-package.ps1
```

Output is written only under:

```text
dist/microsoft365/teams/
```

`dist/` is ignored. Do not commit generated ZIPs or package-root files.

## Tenant activation steps (operator only)

1. Review `microsoft365/teams/manifest.template.json`.
2. Build the package locally.
3. Upload the ZIP through Teams Admin Center according to tenant policy.
4. Submit for tenant policy approval.
5. Assign only test users/security groups first.
6. Install as a test user.
7. Open the personal tab.
8. Confirm Power Apps authentication succeeds.
9. Confirm deep links open the app and preserve tenant/app context.
10. Record evidence under `docs/operator-evidence/m365-calendar-teams/`.

## Rollback/removal

1. Remove app assignment from test users/groups.
2. Disable or remove the Teams app in Teams Admin Center.
3. Preserve package/version/audit evidence.
4. Do not delete LOS Dataverse records as part of Teams package rollback.
