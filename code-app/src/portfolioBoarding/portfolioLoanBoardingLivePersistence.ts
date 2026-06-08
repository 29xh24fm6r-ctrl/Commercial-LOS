/**
 * Phase 140L — Portfolio Loan Boarding LIVE persistence adapter.
 *
 * The first real app-runtime write adapter for portfolio boarding. It maps a
 * `PortfolioLoanBoardingPackage` to Dataverse payloads (via the Phase 140B-H
 * mapper) and performs create / read / update / search against ONLY the
 * Portfolio Boarded Loan schema, through an INJECTED transport seam.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - The adapter performs NO IO itself: no `fetch`, no Dataverse SDK import.
 *     All network access goes through the injected `PortfolioBoardingTransport`
 *     (which the real SDK implements, and which is never wired by default).
 *   - It only ever touches `cr664_portfolioboardedloan*` entities. Any other
 *     entity name fails closed.
 *   - There is NO delete path — the transport seam exposes no delete and the
 *     adapter never deletes.
 *   - Disabled by default: `createDisabled…` fails closed on every call.
 *   - It never invents values; the mapper preserves nulls and the source
 *     marker.
 */

import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import {
  mapPackageToPersistence,
  mapPersistenceToPackage,
} from './portfolioLoanBoardingDataverseMapper';
import { PORTFOLIO_BOARDING_ENTITIES } from './portfolioLoanBoardingPersistenceTypes';

// ---------------------------------------------------------------------------
// Allowed entities + binds
// ---------------------------------------------------------------------------

/** The ONLY entities this adapter may write/read. */
export const ALLOWED_BOARDING_ENTITIES: readonly string[] = Object.freeze(
  Object.values(PORTFOLIO_BOARDING_ENTITIES),
);

/** Entity set (plural) name for the root boarded-loan table, used for binds. */
export const PORTFOLIO_BOARDING_ROOT_ENTITY_SET = 'cr664_portfolioboardedloans';

/** The child→root bind property name. */
export const PORTFOLIO_BOARDING_ROOT_BIND_PROPERTY =
  'cr664_PortfolioBoardedLoan@odata.bind';

export function isAllowedBoardingEntity(entityLogicalName: string): boolean {
  return ALLOWED_BOARDING_ENTITIES.includes(entityLogicalName);
}

// ---------------------------------------------------------------------------
// Transport seam (async; NO delete)
// ---------------------------------------------------------------------------

export interface TransportResult {
  ok: boolean;
  id?: string;
  record?: Record<string, unknown>;
  records?: readonly Record<string, unknown>[];
  error?: string;
}

/**
 * The injected boundary the real Dataverse SDK fulfills. It deliberately
 * exposes NO delete operation, so a destructive write is structurally
 * impossible from this adapter.
 */
export interface PortfolioBoardingTransport {
  create(
    entityLogicalName: string,
    fields: Record<string, unknown>,
  ): Promise<TransportResult>;
  update(
    entityLogicalName: string,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<TransportResult>;
  retrieve(entityLogicalName: string, id: string): Promise<TransportResult>;
  retrieveMultiple(
    entityLogicalName: string,
    query: string | undefined,
  ): Promise<TransportResult>;
}

// ---------------------------------------------------------------------------
// Adapter result + interface
// ---------------------------------------------------------------------------

export interface BoardingLiveResult {
  ok: boolean;
  operation: string;
  recordId?: string;
  childRecordIds?: readonly string[];
  data?:
    | Partial<PortfolioLoanBoardingPackage>
    | readonly Partial<PortfolioLoanBoardingPackage>[];
  errorCode?: string;
  message?: string;
}

export interface PortfolioBoardingLivePersistenceAdapter {
  readonly enabled: boolean;
  createBoardedLoan(
    pkg: PortfolioLoanBoardingPackage,
  ): Promise<BoardingLiveResult>;
  updateBoardedLoan(
    recordId: string,
    pkg: PortfolioLoanBoardingPackage,
  ): Promise<BoardingLiveResult>;
  readBoardedLoan(recordId: string): Promise<BoardingLiveResult>;
  searchBoardedLoans(query?: string): Promise<BoardingLiveResult>;
}

function failClosed(
  operation: string,
  errorCode: string,
  message?: string,
): BoardingLiveResult {
  return { ok: false, operation, errorCode, message };
}

// ---------------------------------------------------------------------------
// Disabled adapter (default)
// ---------------------------------------------------------------------------

export function createDisabledPortfolioBoardingLivePersistenceAdapter(): PortfolioBoardingLivePersistenceAdapter {
  const notConfigured = (operation: string): Promise<BoardingLiveResult> =>
    Promise.resolve(
      failClosed(
        operation,
        'adapter_not_configured',
        'Portfolio boarding live persistence is not enabled.',
      ),
    );
  return {
    enabled: false,
    createBoardedLoan: () => notConfigured('createBoardedLoan'),
    updateBoardedLoan: () => notConfigured('updateBoardedLoan'),
    readBoardedLoan: () => notConfigured('readBoardedLoan'),
    searchBoardedLoans: () => notConfigured('searchBoardedLoans'),
  };
}

// ---------------------------------------------------------------------------
// Live adapter (constructed only with an injected transport)
// ---------------------------------------------------------------------------

export interface LiveAdapterDeps {
  transport: PortfolioBoardingTransport;
}

export function createPortfolioBoardingLivePersistenceAdapter(
  deps: LiveAdapterDeps,
): PortfolioBoardingLivePersistenceAdapter {
  const { transport } = deps;

  async function createBoardedLoan(
    pkg: PortfolioLoanBoardingPackage,
  ): Promise<BoardingLiveResult> {
    const payload = mapPackageToPersistence(pkg);
    if (!isAllowedBoardingEntity(payload.entityName)) {
      return failClosed('createBoardedLoan', 'entity_not_allowed', payload.entityName);
    }
    const rootRes = await transport.create(payload.entityName, payload.fields);
    if (!rootRes.ok || !rootRes.id) {
      return failClosed('createBoardedLoan', 'transport_create_failed', rootRes.error);
    }

    const childRecordIds: string[] = [];
    for (const child of payload.childPayloads) {
      if (!isAllowedBoardingEntity(child.entityName)) {
        return failClosed('createBoardedLoan', 'entity_not_allowed', child.entityName);
      }
      const childFields: Record<string, unknown> = {
        ...child.fields,
        [PORTFOLIO_BOARDING_ROOT_BIND_PROPERTY]: `/${PORTFOLIO_BOARDING_ROOT_ENTITY_SET}(${rootRes.id})`,
      };
      const childRes = await transport.create(child.entityName, childFields);
      if (!childRes.ok) {
        return failClosed(
          'createBoardedLoan',
          'transport_child_create_failed',
          childRes.error,
        );
      }
      if (childRes.id) childRecordIds.push(childRes.id);
    }

    return {
      ok: true,
      operation: 'createBoardedLoan',
      recordId: rootRes.id,
      childRecordIds,
    };
  }

  async function updateBoardedLoan(
    recordId: string,
    pkg: PortfolioLoanBoardingPackage,
  ): Promise<BoardingLiveResult> {
    const payload = mapPackageToPersistence(pkg);
    if (!isAllowedBoardingEntity(payload.entityName)) {
      return failClosed('updateBoardedLoan', 'entity_not_allowed', payload.entityName);
    }
    // 140L update is root-only and never erases child records — child
    // create/update is a later phase. This keeps the first write adapter
    // minimal and non-destructive.
    const res = await transport.update(payload.entityName, recordId, payload.fields);
    if (!res.ok) {
      return failClosed('updateBoardedLoan', 'transport_update_failed', res.error);
    }
    return { ok: true, operation: 'updateBoardedLoan', recordId };
  }

  async function readBoardedLoan(recordId: string): Promise<BoardingLiveResult> {
    const res = await transport.retrieve(PORTFOLIO_BOARDING_ENTITIES.boardedLoan, recordId);
    if (!res.ok || !res.record) {
      return failClosed('readBoardedLoan', 'transport_retrieve_failed', res.error);
    }
    const data = mapPersistenceToPackage({
      entityName: PORTFOLIO_BOARDING_ENTITIES.boardedLoan,
      fields: res.record,
      source: undefined,
      childPayloads: [],
    });
    return { ok: true, operation: 'readBoardedLoan', recordId, data };
  }

  async function searchBoardedLoans(query?: string): Promise<BoardingLiveResult> {
    const res = await transport.retrieveMultiple(
      PORTFOLIO_BOARDING_ENTITIES.boardedLoan,
      query,
    );
    if (!res.ok || !res.records) {
      return failClosed('searchBoardedLoans', 'transport_search_failed', res.error);
    }
    const data = res.records.map((record) =>
      mapPersistenceToPackage({
        entityName: PORTFOLIO_BOARDING_ENTITIES.boardedLoan,
        fields: record,
        source: undefined,
        childPayloads: [],
      }),
    );
    return { ok: true, operation: 'searchBoardedLoans', data };
  }

  return {
    enabled: true,
    createBoardedLoan,
    updateBoardedLoan,
    readBoardedLoan,
    searchBoardedLoans,
  };
}
