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
} from './newDealReferenceTargets';

const STAGE_SELECT = [
  STAGE_REFERENCE.primaryId,
  'cr664_name',
  'cr664_code',
  'cr664_activeflag',
];
const STATUS_SELECT = [
  STATUS_REFERENCE.primaryId,
  'cr664_name',
  'cr664_code',
  'cr664_activeflag',
];

function mapStageRow(r: {
  cr664_dealstagereferenceid: string;
  cr664_name?: string;
  cr664_code?: string;
  cr664_activeflag?: boolean;
}): ReferenceRow {
  return {
    id: r.cr664_dealstagereferenceid,
    name: r.cr664_name ?? '',
    code: r.cr664_code ?? '',
    activeFlag: r.cr664_activeflag === true,
  };
}

function mapStatusRow(r: {
  cr664_dealstatusreferenceid: string;
  cr664_name?: string;
  cr664_code?: string;
  cr664_activeflag?: boolean;
}): ReferenceRow {
  return {
    id: r.cr664_dealstatusreferenceid,
    name: r.cr664_name ?? '',
    code: r.cr664_code ?? '',
    activeFlag: r.cr664_activeflag === true,
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
