/**
 * Phase 154 — Dry-run writeback plan.
 * Generates a writeback plan without executing. No writes. No transport.
 */

import { validateExternalWritebackSchema, type SchemaValidationInput } from './externalWritebackSchemaValidator';

export interface DryRunWritebackPlanRow {
  fieldKey: string;
  status: 'allowed' | 'blocked';
  reason: string;
}

export interface DryRunWritebackPlanResult {
  dryRunOnly: true;
  liveWritePerformed: false;
  externalSystemChanged: false;
  planRows: readonly DryRunWritebackPlanRow[];
  allowedCount: number;
  blockedCount: number;
  overallStatus: string;
  proofId: string;
}

export function deriveDryRunWritebackPlan(input: SchemaValidationInput): DryRunWritebackPlanResult {
  const validation = validateExternalWritebackSchema(input);

  const planRows: DryRunWritebackPlanRow[] = [
    ...validation.allowedFields.map((f) => ({ fieldKey: f, status: 'allowed' as const, reason: 'Passed schema + allowlist + policy' })),
    ...validation.blockedFields.map((f) => ({ fieldKey: f, status: 'blocked' as const, reason: validation.schemaFindings.find((s) => s.startsWith(f)) ?? 'Blocked' })),
  ];

  return {
    dryRunOnly: true,
    liveWritePerformed: false,
    externalSystemChanged: false,
    planRows,
    allowedCount: validation.allowedFields.length,
    blockedCount: validation.blockedFields.length,
    overallStatus: validation.status,
    proofId: validation.dryRunProofId,
  };
}
