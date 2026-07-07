/**
 * Shared fail-closed resolvers for the deal's stage + status reference lookups.
 *
 * Both `cr664_dealstagereferences` and `cr664_dealstatusreferences` are code
 * tables (cr664_code + cr664_activeflag). A governed write resolves a canonical
 * code (e.g. 'UNDERWRITING', 'DECLINED') to the ACTIVE reference row's id, then
 * binds it. Resolution returns null when the row is absent/inactive (table not
 * seeded) — the caller reports the write fail-closed. NEVER fabricates an id.
 *
 * SDK-only via guarded dynamic imports so importers keep the Power Apps data
 * client out of the static graph (mirrors buildLiveStageAdvanceDeps).
 */

/** Resolve an ACTIVE `cr664_dealstagereferences` row's raw id for a stage code. */
export async function resolveStageReferenceId(stageCode: string): Promise<string | null> {
  const { Cr664_dealstagereferencesService } = await import(
    '../generated/services/Cr664_dealstagereferencesService'
  );
  const escaped = stageCode.replace(/'/g, "''");
  const res = await Cr664_dealstagereferencesService.getAll({
    select: ['cr664_dealstagereferenceid', 'cr664_code', 'cr664_activeflag'],
    filter: `cr664_code eq '${escaped}'`,
    top: 1,
  });
  if (!res.success) return null;
  const row = (res.data ?? []).find(
    (r) => (r.cr664_code ?? '') === stageCode && r.cr664_activeflag === true,
  );
  return row?.cr664_dealstagereferenceid ?? null;
}

export async function resolveStageReferenceBind(stageCode: string): Promise<string | null> {
  const id = await resolveStageReferenceId(stageCode);
  return id ? `/cr664_dealstagereferences(${id})` : null;
}

/** Resolve an ACTIVE `cr664_dealstatusreferences` row's raw id for a status code. */
export async function resolveStatusReferenceId(statusCode: string): Promise<string | null> {
  const { Cr664_dealstatusreferencesService } = await import(
    '../generated/services/Cr664_dealstatusreferencesService'
  );
  const escaped = statusCode.replace(/'/g, "''");
  const res = await Cr664_dealstatusreferencesService.getAll({
    select: ['cr664_dealstatusreferenceid', 'cr664_code', 'cr664_activeflag'],
    filter: `cr664_code eq '${escaped}'`,
    top: 1,
  });
  if (!res.success) return null;
  const row = (res.data ?? []).find(
    (r) => (r.cr664_code ?? '') === statusCode && r.cr664_activeflag === true,
  );
  return row?.cr664_dealstatusreferenceid ?? null;
}

export async function resolveStatusReferenceBind(statusCode: string): Promise<string | null> {
  const id = await resolveStatusReferenceId(statusCode);
  return id ? `/cr664_dealstatusreferences(${id})` : null;
}
