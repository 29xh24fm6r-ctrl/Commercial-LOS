import { describe, expect, it } from 'vitest';
import { ORIGINATION_DOCUMENT_INTAKE_CAPABILITIES } from './originationDocumentIntakeCapability';

describe('origination document-intake capability inventory', () => {
  it('reports implemented repository capabilities without claiming LIVE SharePoint', () => {
    expect(ORIGINATION_DOCUMENT_INTAKE_CAPABILITIES.find((entry) => entry.id === 'canonical-underwriting-requirements')?.state).toBe('IMPLEMENTED');
    const live = ORIGINATION_DOCUMENT_INTAKE_CAPABILITIES.find((entry) => entry.id === 'origination-sharepoint-live-storage');
    expect(live).toMatchObject({ state: 'BLOCKED_EXTERNAL' });
    expect(live?.blocker).toMatch(/No generated SharePoint Online service/);
  });
});
