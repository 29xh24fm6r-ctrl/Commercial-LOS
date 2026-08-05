# Governed origination SharePoint Azure Function

This isolated TypeScript package exposes only `ensureFolder`, `upload`, `verifyFolder`, and `verifyFile`. Azure App Service Authentication must validate Entra tokens before a request reaches the host. Function authorization is additionally non-anonymous. No browser token, credential, or fallback authorization path exists.

## Deployment prerequisites

1. Deploy `infra/main.bicep` by first running the repository what-if script.
2. Read back the managed identity and Easy Auth settings.
3. Apply the separately gated `Sites.Selected` grant only to the pinned Business Lending site.
4. Configure a certified Dataverse authorization adapter and durable idempotency/orphan stores.
5. Resolve every immutable setting and calculate the final configuration hash.
6. Build with `npm ci && npm run build`, deploy the resulting package, then run read-only endpoint health verification.

The example local settings intentionally contain `UNRESOLVED` values. Production startup fails until they are replaced and the hash matches. This package does not enable Code App LIVE mode.
