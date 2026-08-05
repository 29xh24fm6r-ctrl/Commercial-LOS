# Phase SP-A2 — SharePoint immutable identifier resolution AAR

## Verdict

**IDENTIFIERS RESOLVED / LIVE BLOCKED.**

The approved Business Lending SharePoint site, Documents drive, and governed `(a) Loans` root were resolved through the read-only Microsoft Graph discovery script. No SharePoint write, Dataverse write, deployment, connector activation, or LIVE mode change occurred.

## Resolved identifiers

- Tenant ID: `e5d2be43-2e2c-4968-b5f3-c73dd825ee80`
- Graph site ID: `oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48`
- Graph drive ID: `b!lYrv_Li2f0yF2dMMTROqivV7fyyVmbJIk6QTe8dBz0gxIabBRnm5RLtMtGN6Fvg8`
- Governed root driveItem ID: `01GLFG6KONJ5W27MKUD5AZRKTJWP2MGT5P`
- Verified root path: `/(a) Loans`
- Site URL: `https://oldglory22.sharepoint.com/sites/BusinessLending`
- SharePoint library/list ID: `c1a62131-7946-44b9-bb4c-b4637a16f83c`

## Important identity finding

- The SharePoint library ID equals the Graph list ID.
- The SharePoint library ID does not equal the Graph drive ID.
- The Graph drive ID must be pinned independently and must not be inferred from the list/library GUID.

## Discovery evidence

Evidence file:

`docs/SP_A2_SHAREPOINT_IDENTIFIER_EVIDENCE.json`

Discovery timestamp:

`2026-08-05T15:30:07.8406895+00:00`

## Still unresolved

- Authenticated server connector/function identity
- Runtime managed identity or service principal
- Microsoft Graph permission grant evidence
- Site-scoped authorization evidence
- Exact generated Power Apps service and operation signatures
- Configuration version and final configuration hash
- Server-side actor-resolution certification
- Deal-authorization certification
- Graph folder/file readback certification
- Orphan reconciliation certification
- Real-file smoke
- Replay, collision, cross-deal, rollback, and failure-path certification

## Safety state

- `VITE_DEAL_DOCUMENT_STORAGE_MODE` remains `DRY_RUN`
- LIVE storage remains `BLOCKED_EXTERNAL`
- No SharePoint mutation occurred
- No Dataverse mutation occurred
- No deployment occurred
- No access token was persisted

## Next phase

Phase SP-A3 must provision the authenticated server boundary and connector, establish the runtime identity and least-privilege Graph grant, regenerate the Power Apps SDK, and record the exact generated operation signatures. LIVE remains blocked until certification is complete.
