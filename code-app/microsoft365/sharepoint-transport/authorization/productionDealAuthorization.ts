import type { DealAuthorizationService } from './dealAuthorization.js';

/** Injection seam for a certified, read-only Dataverse deal authorization query. */
export interface DataverseDealAuthorizationAdapter extends DealAuthorizationService {
  readonly adapterId: string;
  healthCheck(): Promise<{ readonly ready: true; readonly evidenceId: string }>;
}

/** The repository phase cannot fabricate deal access. */
export class UnavailableDataverseDealAuthorizationAdapter implements DataverseDealAuthorizationAdapter {
  readonly adapterId = 'UNRESOLVED';
  async healthCheck(): Promise<never> { throw new Error('DATAVERSE_AUTHORIZATION_ADAPTER_UNAVAILABLE'); }
  async authorize(): Promise<never> { throw new Error('DATAVERSE_AUTHORIZATION_ADAPTER_UNAVAILABLE'); }
}
