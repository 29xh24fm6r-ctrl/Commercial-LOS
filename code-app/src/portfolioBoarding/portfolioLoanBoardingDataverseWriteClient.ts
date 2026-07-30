/**
 * Live `DataverseWriteClient` for portfolio boarding
 * (`portfolioLoanBoardingLiveDataverseTransport.ts`'s injected boundary).
 *
 * A lookup table from each allow-listed boarded-loan entity SET name (plural
 * — what the transport actually passes) to a thin shim over its generated
 * SDK service. Every service import is DYNAMIC (`await import(...)`), the
 * same convention `crmWriteAdapter.ts`'s `buildLiveCrmWriteDeps()` uses, so
 * this module's static graph stays SDK-free — importing it never pulls the
 * generated SDK into a component's bundle; only an actual call does.
 *
 * Entity coverage matches `PORTFOLIO_BOARDING_ENTITIES` exactly (12 tables —
 * examiner notes are not yet in the persistence allow-list). Adding a 13th
 * table means adding both an entry to that allow-list AND a row here; the
 * `resolveEntity` guard rejects any entity-set name outside this table, so a
 * missing entry fails closed rather than silently no-op-ing.
 */

import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';
import {
  evaluateLifecycleBeforeWrite,
  type LifecycleGovernanceInvocation,
} from '../governance/lifecycleGovernanceIntegration';

interface GeneratedRecordService {
  create(record: Record<string, unknown>): Promise<{ success: boolean; data?: Record<string, unknown>; error?: { message?: string } }>;
  update(id: string, changedFields: Record<string, unknown>): Promise<{ success: boolean; data?: Record<string, unknown>; error?: { message?: string } }>;
  get(id: string, options?: { select?: readonly string[] }): Promise<{ success: boolean; data?: Record<string, unknown>; error?: { message?: string } }>;
  getAll(options?: { filter?: string }): Promise<{ success: boolean; data?: readonly Record<string, unknown>[]; error?: { message?: string } }>;
}

export interface DataverseWriteClientResult {
  ok: boolean;
  id?: string;
  record?: Record<string, unknown>;
  records?: readonly Record<string, unknown>[];
  error?: string;
}

export interface DataverseWriteClient {
  create(entitySetName: string, record: Record<string, unknown>): Promise<DataverseWriteClientResult>;
  update(entitySetName: string, id: string, record: Record<string, unknown>): Promise<DataverseWriteClientResult>;
  retrieve(entitySetName: string, id: string): Promise<DataverseWriteClientResult>;
  retrieveMultiple(entitySetName: string, query: string | undefined): Promise<DataverseWriteClientResult>;
}

interface EntityRegistration {
  /** Dynamic import of the generated service module (never a static import). */
  load: () => Promise<Record<string, unknown>>;
  /** The exported service member name within the module. */
  exportName: string;
  /** The record id attribute (Dataverse convention: entity logical name + 'id'). */
  idField: string;
}

/** Plural entity-set name -> generated service registration. Mirrors PORTFOLIO_BOARDING_ENTITIES + boardingEntitySetName's `+ 's'` rule 1:1. */
const REGISTRY: Readonly<Record<string, EntityRegistration>> = Object.freeze({
  cr664_portfolioboardedloans: {
    load: () => import('../generated/services/Cr664_portfolioboardedloansService'),
    exportName: 'Cr664_portfolioboardedloansService',
    idField: 'cr664_portfolioboardedloanid',
  },
  cr664_portfolioboardedloanborrowers: {
    load: () => import('../generated/services/Cr664_portfolioboardedloanborrowersService'),
    exportName: 'Cr664_portfolioboardedloanborrowersService',
    idField: 'cr664_portfolioboardedloanborrowerid',
  },
  cr664_portfolioboardedloancollaterals: {
    load: () => import('../generated/services/Cr664_portfolioboardedloancollateralsService'),
    exportName: 'Cr664_portfolioboardedloancollateralsService',
    idField: 'cr664_portfolioboardedloancollateralid',
  },
  cr664_portfolioboardedloanguarantors: {
    load: () => import('../generated/services/Cr664_portfolioboardedloanguarantorsService'),
    exportName: 'Cr664_portfolioboardedloanguarantorsService',
    idField: 'cr664_portfolioboardedloanguarantorid',
  },
  cr664_portfolioboardedloancovenants: {
    load: () => import('../generated/services/Cr664_portfolioboardedloancovenantsService'),
    exportName: 'Cr664_portfolioboardedloancovenantsService',
    idField: 'cr664_portfolioboardedloancovenantid',
  },
  cr664_portfolioboardedloanticklers: {
    load: () => import('../generated/services/Cr664_portfolioboardedloanticklersService'),
    exportName: 'Cr664_portfolioboardedloanticklersService',
    idField: 'cr664_portfolioboardedloanticklerid',
  },
  cr664_portfolioboardedloaninsurances: {
    load: () => import('../generated/services/Cr664_portfolioboardedloaninsurancesService'),
    exportName: 'Cr664_portfolioboardedloaninsurancesService',
    idField: 'cr664_portfolioboardedloaninsuranceid',
  },
  cr664_portfolioboardedloandocuments: {
    load: () => import('../generated/services/Cr664_portfolioboardedloandocumentsService'),
    exportName: 'Cr664_portfolioboardedloandocumentsService',
    idField: 'cr664_portfolioboardedloandocumentid',
  },
  cr664_portfolioboardedloanexceptions: {
    load: () => import('../generated/services/Cr664_portfolioboardedloanexceptionsService'),
    exportName: 'Cr664_portfolioboardedloanexceptionsService',
    idField: 'cr664_portfolioboardedloanexceptionid',
  },
  cr664_portfolioboardedloanreviews: {
    load: () => import('../generated/services/Cr664_portfolioboardedloanreviewsService'),
    exportName: 'Cr664_portfolioboardedloanreviewsService',
    idField: 'cr664_portfolioboardedloanreviewid',
  },
  cr664_portfolioboardedloanevidences: {
    load: () => import('../generated/services/Cr664_portfolioboardedloanevidencesService'),
    exportName: 'Cr664_portfolioboardedloanevidencesService',
    idField: 'cr664_portfolioboardedloanevidenceid',
  },
  cr664_portfolioboardedloanauditentries: {
    load: () => import('../generated/services/Cr664_portfolioboardedloanauditentriesService'),
    exportName: 'Cr664_portfolioboardedloanauditentriesService',
    idField: 'cr664_portfolioboardedloanauditentryid',
  },
});

const NOT_REGISTERED: DataverseWriteClientResult = Object.freeze({ ok: false, error: 'entity_not_registered' });

async function resolveEntity(entitySetName: string): Promise<{ service: GeneratedRecordService; idField: string } | undefined> {
  const reg = REGISTRY[entitySetName];
  if (!reg) return undefined;
  const mod = await reg.load();
  return { service: mod[reg.exportName] as unknown as GeneratedRecordService, idField: reg.idField };
}

/**
 * Final LOS completion (Workstream P) — every `error` this client returns is a raw
 * Dataverse/network failure string. It bubbles, unmapped, through
 * `portfolioLoanBoardingLiveDataverseTransport.ts` and
 * `portfolioLoanBoardingLivePersistence.ts` into `usePortfolioLoanBoardingPersistence.ts`'s
 * `state.message`, which `PortfolioLoanBoardingSaveBar.tsx` renders verbatim ("Save failed:
 * {state.message}"). None of those intermediate modules is in this pass's scope, and none of
 * them do anything with the raw text besides pass it through — so mapping it here, at its
 * origin, is the only in-scope point that actually closes the leak (every downstream layer
 * already carries the safe message unchanged).
 */
export function buildLivePortfolioBoardingDataverseWriteClient(
  lifecycleGovernance?: LifecycleGovernanceInvocation,
): DataverseWriteClient {
  return {
    async create(entitySetName, record) {
      const resolved = await resolveEntity(entitySetName);
      if (!resolved) return NOT_REGISTERED;
      try {
        const res = await resolved.service.create(record);
        if (!res.success) {
          const raw = res.error?.message ?? 'create returned non-success.';
          return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
        }
        return { ok: true, id: (res.data?.[resolved.idField] as string | undefined) ?? undefined, record: res.data };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
      }
    },
    async update(entitySetName, id, record) {
      if (entitySetName === 'cr664_portfolioboardedloans') {
        const lifecycleGate = await evaluateLifecycleBeforeWrite(
          'modification',
          lifecycleGovernance,
          { allowed: true, evidenceIds: ['legacy-portfolio-update-controls'] },
        );
        if (!lifecycleGate.allowed) return { ok: false, error: lifecycleGate.safeMessage };
      }
      const resolved = await resolveEntity(entitySetName);
      if (!resolved) return NOT_REGISTERED;
      try {
        const res = await resolved.service.update(id, record);
        if (!res.success) {
          const raw = res.error?.message ?? 'update returned non-success.';
          return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
        }
        return { ok: true, record: res.data };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
      }
    },
    async retrieve(entitySetName, id) {
      const resolved = await resolveEntity(entitySetName);
      if (!resolved) return NOT_REGISTERED;
      try {
        const res = await resolved.service.get(id);
        if (!res.success) {
          const raw = res.error?.message ?? 'retrieve returned non-success.';
          return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
        }
        return { ok: true, record: res.data };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
      }
    },
    async retrieveMultiple(entitySetName, query) {
      const resolved = await resolveEntity(entitySetName);
      if (!resolved) return NOT_REGISTERED;
      try {
        const res = await resolved.service.getAll(query ? { filter: query } : undefined);
        if (!res.success) {
          const raw = res.error?.message ?? 'retrieveMultiple returned non-success.';
          return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
        }
        return { ok: true, records: res.data ?? [] };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
      }
    },
  };
}
