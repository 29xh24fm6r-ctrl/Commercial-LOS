/**
 * Phase 170F2 -- New Deal Stage/Status reference reader.
 *
 * Concrete `NewDealReferenceReader` over the typed generated services
 * `Cr664_dealstagereferencesService` / `Cr664_dealstatusreferencesService`
 * (registered code-side per docs/PHASE_170F2_STAGE_STATUS_DATASOURCE_CODE_PROOF.md).
 *
 * It reads reference ROWS read-only (least-privilege `$select`), maps them
 * to `ReferenceRow`, and lets the fail-closed `resolveNewDealReferences`
 * decide ready/missing/duplicate/inactive. A failed read throws so the
 * resolver maps it to `serviceError`. It NEVER selects by GUID, NEVER
 * writes, and is NOT wired to any create path -- + New Deal stays disabled.
 */

import { Cr664_dealstagereferencesService } from '../generated/services/Cr664_dealstagereferencesService';
import { Cr664_dealstatusreferencesService } from '../generated/services/Cr664_dealstatusreferencesService';
import {
  resolveNewDealReferences,
  type NewDealReferenceReader,
  type NewDealReferenceResolution,
  type ReferenceRow,
} from './newDealReferenceResolver';
import {
  STAGE_REFERENCE,
  STATUS_REFERENCE,
  STAGE_REFERENCE_SELECTION,
  STATUS_REFERENCE_SELECTION,
  PRODUCTION_STAGE_REFERENCE_SELECTION,
  PRODUCTION_STATUS_REFERENCE_SELECTION,
  isProductionUnsafeReferenceLabel,
} from './newDealReferenceTargets';
import { createNewDealReferenceRuntimeReader } from './newDealReferenceRuntimeReader';

// Phase 226 — `new_productionapproved` is the governed production-approval marker;
// it is selected read-only and mapped to productionApproved. Production approval is
// never inferred from code/name.
const STAGE_SELECT = [
  STAGE_REFERENCE.primaryId,
  'cr664_name',
  'cr664_code',
  'cr664_activeflag',
  'new_productionapproved',
];
const STATUS_SELECT = [
  STATUS_REFERENCE.primaryId,
  'cr664_name',
  'cr664_code',
  'cr664_activeflag',
  'new_productionapproved',
];

function mapStageRow(r: {
  cr664_dealstagereferenceid: string;
  cr664_name?: string;
  cr664_code?: string;
  cr664_activeflag?: boolean;
  new_productionapproved?: boolean;
}): ReferenceRow {
  return {
    id: r.cr664_dealstagereferenceid,
    name: r.cr664_name ?? '',
    code: r.cr664_code ?? '',
    activeFlag: r.cr664_activeflag === true,
    productionApproved: r.new_productionapproved === true,
  };
}

function mapStatusRow(r: {
  cr664_dealstatusreferenceid: string;
  cr664_name?: string;
  cr664_code?: string;
  cr664_activeflag?: boolean;
  new_productionapproved?: boolean;
}): ReferenceRow {
  return {
    id: r.cr664_dealstatusreferenceid,
    name: r.cr664_name ?? '',
    code: r.cr664_code ?? '',
    activeFlag: r.cr664_activeflag === true,
    productionApproved: r.new_productionapproved === true,
  };
}

/**
 * Build a reader over the generated reference services. Each read returns
 * all rows (least-privilege select); the resolver applies the code/name +
 * active filter so it can report missing/inactive/duplicate precisely. A
 * non-success result throws -> the resolver reports `serviceError`.
 */
export function createNewDealReferenceReader(): NewDealReferenceReader {
  return {
    async readStageReferences(): Promise<readonly ReferenceRow[]> {
      const res = await Cr664_dealstagereferencesService.getAll({ select: STAGE_SELECT });
      if (!res.success) {
        throw new Error(res.error?.message ?? 'Failed to read Stage references.');
      }
      return (res.data ?? []).map(mapStageRow);
    },
    async readStatusReferences(): Promise<readonly ReferenceRow[]> {
      const res = await Cr664_dealstatusreferencesService.getAll({ select: STATUS_SELECT });
      if (!res.success) {
        throw new Error(res.error?.message ?? 'Failed to read Status references.');
      }
      return (res.data ?? []).map(mapStatusRow);
    },
  };
}

/**
 * Resolve the configured Stage/Status references using the live reader and
 * the canonical (code/name, GUID-free) selection. Foundation only: this is
 * NOT called from any create path; + New Deal stays disabled regardless of
 * the result.
 */
export async function resolveConfiguredNewDealReferences(
  reader: NewDealReferenceReader = createNewDealReferenceReader(),
): Promise<NewDealReferenceResolution> {
  return resolveNewDealReferences(
    {
      stageCode: STAGE_REFERENCE_SELECTION.code,
      stageName: STAGE_REFERENCE_SELECTION.name,
      statusCode: STATUS_REFERENCE_SELECTION.code,
      statusName: STATUS_REFERENCE_SELECTION.name,
    },
    reader,
  );
}

/**
 * Phase 181B -- wrap a reader so production-UNSAFE rows (TEST / PHASE / demo /
 * sample / temp) are filtered out before resolution. A TEST row can therefore
 * NEVER back a production create, even if it matched a production code.
 */
function productionGuardedReader(reader: NewDealReferenceReader): NewDealReferenceReader {
  return {
    async readStageReferences(): Promise<readonly ReferenceRow[]> {
      return (await reader.readStageReferences()).filter(
        (r) => !isProductionUnsafeReferenceLabel(r.code, r.name),
      );
    },
    async readStatusReferences(): Promise<readonly ReferenceRow[]> {
      return (await reader.readStatusReferences()).filter(
        (r) => !isProductionUnsafeReferenceLabel(r.code, r.name),
      );
    },
  };
}

/**
 * Resolve the APPROVED PRODUCTION Stage/Status references (code/name, never a
 * GUID), with TEST/PHASE rows filtered out. Fails closed (missing/duplicate/
 * inactive/serviceError/notConfigured) until the production rows are seeded and
 * approved -- so banker production create stays disabled until then.
 */
export async function resolveProductionNewDealReferences(
  reader: NewDealReferenceReader = createNewDealReferenceRuntimeReader(),
): Promise<NewDealReferenceResolution> {
  return resolveNewDealReferences(
    {
      stageCode: PRODUCTION_STAGE_REFERENCE_SELECTION.code,
      stageName: PRODUCTION_STAGE_REFERENCE_SELECTION.name,
      statusCode: PRODUCTION_STATUS_REFERENCE_SELECTION.code,
      statusName: PRODUCTION_STATUS_REFERENCE_SELECTION.name,
    },
    productionGuardedReader(reader),
  );
}
