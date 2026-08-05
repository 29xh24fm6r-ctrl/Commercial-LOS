# Power Platform custom connector package

Import `origination-sharepoint-transport.openapi.json` only after the Function hostname, Entra application identity, site-scoped grant, Easy Auth readback, durable ledger health, and final configuration hash are certified. Replace only the unresolved server URL through the managed connector configuration process. The connector uses OAuth and carries no function key, client secret, Graph token, role, or authorization assertion.

After registration, regenerate the Power Apps SDK and inspect the exact generated service/operation signatures. Do not edit generated sources or enable `LIVE` based only on connector registration.
