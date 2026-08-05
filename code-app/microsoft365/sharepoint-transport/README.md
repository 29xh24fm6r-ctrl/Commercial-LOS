# Governed SharePoint file transport boundary

This folder contains a server-only, Microsoft Graph transport implementation for
`DealSharePointDocumentPort`. It is an implementation boundary, not an activated
connector. Browser code receives no Graph token, client secret, or authority
decision.

The host pins the Business Lending site, registered Documents library, resolved
drive, and governed root item; resolves the Entra caller from server claims;
authorizes each operation against the deal; enforces correlation-based
idempotency; uses `conflictBehavior=fail`; and requires exact Graph readback.
Ambiguous/post-upload failures create an unreconciled orphan candidate and never
satisfy a document requirement.

Deployment must use an Entra-authenticated Azure Function or equivalently approved
custom-connector boundary. Anonymous HTTP, browser-held Graph tokens, embedded
secrets/function keys, guessed connector operation names, and
`DocumentsService.create` binary uploads are prohibited.

`VITE_DEAL_DOCUMENT_STORAGE_MODE` remains `DRY_RUN`. LIVE remains blocked until
the discovery script resolves immutable identifiers, the configuration hash is
approved, Sites.Selected (preferred) permission is evidenced, the connector is
generated/bound, and controlled tenant certification passes.
