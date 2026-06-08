/**
 * Phase 140Q — Portfolio Boarding live Dataverse transport.
 *
 * Implements the Phase 140L `PortfolioBoardingTransport` over an INJECTED
 * low-level Dataverse write client. It is the only place that could touch live
 * Dataverse, and it is constrained so it can ONLY ever read/write the
 * `cr664_portfolioboardedloan*` schema — never `cr664_loandeal`, client, team,
 * banker, or systemuser tables, and never a delete.
 *
 * NOTE: this module imports NO generated Dataverse service and performs NO
 * `fetch` itself. The real client is injected at enable time (and is never
 * wired by default), so the build has no hard dependency on services that may
 * not yet be generated for the boarded-loan tables. 140Q certifies readiness;
 * it does not turn writes on.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Only `cr664_portfolioboardedloan*` entities; any other entity fails closed.
 *   - No delete operation exists anywhere in the seam.
 *   - No arbitrary entity-set string from the UI; entity sets are derived from
 *     the allow-listed logical names only.
 */

import {
  ALLOWED_BOARDING_ENTITIES,
  isAllowedBoardingEntity,
  type PortfolioBoardingTransport,
  type TransportResult,
} from './portfolioLoanBoardingLivePersistence';

export interface DataverseWriteClientResult {
  ok: boolean;
  id?: string;
  record?: Record<string, unknown>;
  records?: readonly Record<string, unknown>[];
  error?: string;
}

/**
 * The injected low-level client. Note: NO delete. The transport derives the
 * entity-set name itself from the allow-listed logical name, so the caller can
 * never pass an arbitrary entity set.
 */
export interface DataverseWriteClient {
  create(
    entitySetName: string,
    record: Record<string, unknown>,
  ): Promise<DataverseWriteClientResult>;
  update(
    entitySetName: string,
    id: string,
    record: Record<string, unknown>,
  ): Promise<DataverseWriteClientResult>;
  retrieve(entitySetName: string, id: string): Promise<DataverseWriteClientResult>;
  retrieveMultiple(
    entitySetName: string,
    query: string | undefined,
  ): Promise<DataverseWriteClientResult>;
}

/** Derive the entity-set (plural) name for an allow-listed boarded-loan table. */
export function boardingEntitySetName(entityLogicalName: string): string {
  // Dataverse plural for these tables is the logical name + 's'.
  return `${entityLogicalName}s`;
}

const NOT_ALLOWED: TransportResult = Object.freeze({
  ok: false,
  error: 'entity_not_allowed',
});

function guard(entityLogicalName: string): TransportResult | undefined {
  if (!isAllowedBoardingEntity(entityLogicalName)) return NOT_ALLOWED;
  return undefined;
}

export interface LiveTransportDeps {
  client: DataverseWriteClient;
}

export function createLivePortfolioBoardingTransport(
  deps: LiveTransportDeps,
): PortfolioBoardingTransport {
  const { client } = deps;
  return {
    async create(entityLogicalName, fields): Promise<TransportResult> {
      const blocked = guard(entityLogicalName);
      if (blocked) return blocked;
      const res = await client.create(boardingEntitySetName(entityLogicalName), fields);
      return { ok: res.ok, id: res.id, error: res.error };
    },
    async update(entityLogicalName, id, fields): Promise<TransportResult> {
      const blocked = guard(entityLogicalName);
      if (blocked) return blocked;
      const res = await client.update(boardingEntitySetName(entityLogicalName), id, fields);
      return { ok: res.ok, error: res.error };
    },
    async retrieve(entityLogicalName, id): Promise<TransportResult> {
      const blocked = guard(entityLogicalName);
      if (blocked) return blocked;
      const res = await client.retrieve(boardingEntitySetName(entityLogicalName), id);
      return { ok: res.ok, record: res.record, error: res.error };
    },
    async retrieveMultiple(entityLogicalName, query): Promise<TransportResult> {
      const blocked = guard(entityLogicalName);
      if (blocked) return blocked;
      const res = await client.retrieveMultiple(
        boardingEntitySetName(entityLogicalName),
        query,
      );
      return { ok: res.ok, records: res.records, error: res.error };
    },
  };
}

/** The set of entities this transport will ever touch (read-only export). */
export const LIVE_TRANSPORT_ALLOWED_ENTITIES = ALLOWED_BOARDING_ENTITIES;
