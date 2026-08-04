import { describe, expect, it } from 'vitest';
import { DUE_DILIGENCE_CATALOG, itemShowsUpload, resolveDueDiligenceApplicability } from './dueDiligenceCatalog';

describe('due diligence catalog', () => {
  it('keeps file, verification, approval, and system controls distinct', () => {
    expect(DUE_DILIGENCE_CATALOG.find((row) => row.name === 'Appraisal')?.type).toBe('CONDITIONAL_FILE');
    expect(DUE_DILIGENCE_CATALOG.find((row) => row.name === 'All Signatures Verified')?.type).toBe('VERIFICATION');
    expect(DUE_DILIGENCE_CATALOG.find((row) => row.name === 'Funding Authorized')?.type).toBe('APPROVAL');
    expect(DUE_DILIGENCE_CATALOG.find((row) => row.name === 'Core System Boarding Completed')?.type).toBe('SYSTEM_COMPLETION');
    expect(itemShowsUpload('VERIFICATION')).toBe(false); expect(itemShowsUpload('FILE_REQUIRED')).toBe(true);
  });
  it('does not guess conditional applicability', () => {
    const appraisal = DUE_DILIGENCE_CATALOG.find((row) => row.name === 'Appraisal')!;
    expect(resolveDueDiligenceApplicability(appraisal, {})).toBe('UNRESOLVED');
    expect(resolveDueDiligenceApplicability(appraisal, { Appraisal: true })).toBe(true);
  });
  it('activates pre-funding controls separately', () => {
    expect(DUE_DILIGENCE_CATALOG.filter((row) => row.section === 'PRE_FUNDING').every((row) => row.activatedStage === 'PRE_FUNDING')).toBe(true);
  });
});
