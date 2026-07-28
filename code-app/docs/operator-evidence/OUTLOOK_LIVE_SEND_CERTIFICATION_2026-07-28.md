# Outlook LIVE send certification evidence — 2026-07-28

## Scope

This evidence records the July 28, 2026 production diagnostic certification for the Office 365 Outlook connector runtime binding in the Commercial Lending LOS Code App.

It certifies only the internal diagnostic LIVE send path. It does **not** claim borrower delivery, read receipt, broad borrower messaging certification, shared-mailbox behavior, or external-recipient deliverability.

## Environment

- Environment ID: `5f2d77a5-de50-edeb-9d74-5b2400a2320d`
- App ID: `63858e09-3d0b-47c9-b1d2-65cef742fda4`
- Tenant ID: `e5d2be43-2e2c-4968-b5f3-c73dd825ee80`
- Outlook connection ID: `<masked-outlook-connection-id>`

## Initial failure

Admin Outlook LIVE Email Diagnostics initially failed with:

```text
Unable to find data source: office365 in data sources info.
```

Confirmed local facts:

- `power.config.json` contained the Office 365 Outlook connection reference:
  - `shared_office365`
  - `office365`
- `.power/schemas/appschemas/dataSourcesInfo.ts` did not contain `office365`.

## Corrective action

The operator ran:

```powershell
pac connection list
pac code add-data-source -a shared_office365 -c <masked-outlook-connection-id>
```

The full connection ID was intentionally not recorded in source control.

## Runtime binding observed

PAC added `office365` to:

```text
.power/schemas/appschemas/dataSourcesInfo.ts
```

Required runtime entry observed:

```text
"office365": {
  ...
  "dataSourceType": "Connector",
  ...
}
```

## Build and deployment

- `npm run build`: PASS
- `pac code push`: PASS

## LIVE diagnostic smoke

- Admin Outlook LIVE Email Diagnostics mode: LIVE
- Diagnostic recipient: internal Old Glory Bank mailbox
- Connector result: `Connector accepted the smoke message.`
- Actual inbox receipt: confirmed at `mpaller@oldglorybank.com`

## Final verdict

Outlook LIVE send: **CERTIFIED PASS** for the internal diagnostic mailbox smoke path.

Connector acceptance was treated as transport acceptance only. Actual inbox receipt was separately confirmed before this verdict.
