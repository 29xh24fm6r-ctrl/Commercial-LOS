/**
 * 2026-07-14 Dataverse credit-authority integration — STOPGAP type augmentation.
 *
 * cr664_banker now has three real columns, provisioned via
 * scripts/dataverse/create-banker-credit-authority-fields.ps1: cr664_approvallimit (Money),
 * cr664_creditcommitteemember (Boolean), cr664_approvaloverrideauthority (Boolean). They are NOT
 * yet part of the generated `Cr664_bankersModel.ts` — that requires re-running
 * `pac code add-data-source -a dataverse -t cr664_banker` (see
 * scripts/dataverse/regenerate-powerapps-sdk.ps1 and docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md),
 * which this session's sandbox cannot run (no `pac` CLI / Dataverse credentials here).
 *
 * `src/generated/` must never be hand-edited (see docs/CANONICAL_SOURCES.md rule 4), so this file
 * is a small, NON-GENERATED bridge instead: `Cr664_bankersService.getAll()` fetches full records
 * with no `$select`, so these fields already come back in the raw Dataverse JSON today regardless
 * of what the generated TS model declares — this file only adds the TypeScript type for reading
 * them safely (`undefined`, not a crash, if they're ever actually absent).
 *
 * DELETE THIS FILE once a real SDK regeneration makes these fields part of
 * `Cr664_bankersModel.ts` directly, and read them from the generated type instead.
 */
export interface BankerCreditAuthorityFields {
  readonly cr664_approvallimit?: number;
  readonly cr664_creditcommitteemember?: boolean;
  readonly cr664_approvaloverrideauthority?: boolean;
}
