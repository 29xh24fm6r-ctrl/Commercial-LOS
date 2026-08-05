import type { DealAuthorizationBinding, NormalizedActorIdentity, SharePointTransportOperation } from '../contract/types.js';

export interface DealAuthorizationService {
  authorize(input: {
    readonly actor: NormalizedActorIdentity;
    readonly dealId: string;
    readonly operation: SharePointTransportOperation;
  }): Promise<DealAuthorizationBinding | undefined>;
}
