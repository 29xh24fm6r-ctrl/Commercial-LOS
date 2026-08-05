import type { AuthenticatedActorResolver } from '../authorization/actorResolver.js';
import type { DataverseDealAuthorizationAdapter } from '../authorization/productionDealAuthorization.js';
import type { SharePointGraphClient } from '../graph/graphClient.js';
import { SharePointTransportHost } from '../host/sharePointTransportHost.js';
import { DurableIdempotencyLedger, DurableOrphanReconciliationLedger, type DurableJsonStore } from './durableLedgers.js';
import type { RuntimeConfiguration } from '../azure-function/src/runtimeConfiguration.js';

export interface ProductionHostDependencies {
  readonly configuration: RuntimeConfiguration;
  readonly graph: SharePointGraphClient;
  readonly actors: AuthenticatedActorResolver;
  readonly authorization: DataverseDealAuthorizationAdapter;
  readonly idempotencyStore: DurableJsonStore;
  readonly orphanStore: DurableJsonStore;
}

export async function createProductionSharePointTransportHost(input: ProductionHostDependencies): Promise<SharePointTransportHost> {
  if (input.authorization.adapterId !== input.configuration.dataverseAuthorizationAdapter) throw new Error('DATAVERSE_AUTHORIZATION_ADAPTER_MISMATCH');
  const authorization = await input.authorization.healthCheck();
  if (!authorization.ready || !authorization.evidenceId) throw new Error('DATAVERSE_AUTHORIZATION_UNVERIFIED');
  const idempotency = new DurableIdempotencyLedger(input.idempotencyStore);
  const orphans = new DurableOrphanReconciliationLedger(input.orphanStore);
  await Promise.all([idempotency.assertReady(), orphans.assertReady()]);
  return new SharePointTransportHost({ configuration: input.configuration, graph: input.graph, actors: input.actors, authorization: input.authorization, idempotency, orphans });
}
