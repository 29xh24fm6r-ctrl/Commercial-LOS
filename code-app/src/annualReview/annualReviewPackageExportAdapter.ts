/**
 * Phase 141P — Annual review package EXPORT adapter seam (disabled by default).
 *
 * `previewExport` returns metadata only; `exportPackage` ALWAYS returns blocked.
 * This file generates NO PDF/docx, writes NO file, performs NO Dataverse write,
 * and makes NO SharePoint / OneDrive / Graph / email call.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No `fetch`, no SDK import, no file generation, no external call.
 *   - `exportPackage` is blocked in this phase (export disabled + draft only).
 */

import type {
  AnnualReviewPackageType,
  AnnualReviewPackageStatus,
  AnnualReviewPackageExportPreview,
} from './annualReviewPackageTypes';

export type AnnualReviewPackageExportErrorCode =
  | 'package_export_disabled'
  | 'package_export_draft_only'
  | 'package_approval_required';

export interface AnnualReviewPackageExportInput {
  packageType: AnnualReviewPackageType;
  status: AnnualReviewPackageStatus;
  sectionCount: number;
  evidenceCount: number;
}

export interface AnnualReviewPackageExportResult {
  ok: boolean;
  operation: string;
  packageType: AnnualReviewPackageType;
  blocked: boolean;
  errorCode?: AnnualReviewPackageExportErrorCode;
  message?: string;
  data?: AnnualReviewPackageExportPreview;
}

export interface AnnualReviewPackageExportAdapter {
  readonly enabled: boolean;
  previewExport(input: AnnualReviewPackageExportInput): AnnualReviewPackageExportResult;
  exportPackage(input: AnnualReviewPackageExportInput): AnnualReviewPackageExportResult;
}

export interface AnnualReviewPackageExportAdapterOptions {
  /** Would enable export. PINNED OFF in this phase. */
  exportEnabled?: boolean;
}

export function createAnnualReviewPackageExportAdapter(
  options: AnnualReviewPackageExportAdapterOptions = {},
): AnnualReviewPackageExportAdapter {
  // Export is pinned off in this phase regardless of config.
  const enabled = false;
  void options;

  function previewExport(input: AnnualReviewPackageExportInput): AnnualReviewPackageExportResult {
    const data: AnnualReviewPackageExportPreview = {
      packageType: input.packageType,
      status: input.status,
      sectionCount: input.sectionCount,
      evidenceCount: input.evidenceCount,
      exportEnabled: false,
      hasGeneratedFile: false,
      notes: 'Preview metadata only. No file is generated and no export occurs in this phase.',
    };
    return { ok: true, operation: 'previewExport', packageType: input.packageType, blocked: false, data };
  }

  function exportPackage(input: AnnualReviewPackageExportInput): AnnualReviewPackageExportResult {
    const errorCode: AnnualReviewPackageExportErrorCode =
      input.status === 'review_ready' ? 'package_export_draft_only' : 'package_export_disabled';
    return {
      ok: false,
      operation: 'exportPackage',
      packageType: input.packageType,
      blocked: true,
      errorCode,
      message: 'Package export is disabled in this phase. No PDF/document is generated and no export, filing, or submission occurs.',
    };
  }

  return { enabled, previewExport, exportPackage };
}

export function createDisabledAnnualReviewPackageExportAdapter(): AnnualReviewPackageExportAdapter {
  return createAnnualReviewPackageExportAdapter();
}
