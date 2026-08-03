import { describe, expect, it } from 'vitest';
import {
  CREDIT_INTELLIGENCE_DATAVERSE_SCHEMA,
  validateCreditIntelligenceSchemaPlan,
} from './creditIntelligenceDataverseSchemaPlan';

describe('credit intelligence Dataverse schema plan', () => {
  it('is additive, internally unique, and preserves immutable provenance', () => {
    expect(validateCreditIntelligenceSchemaPlan()).toEqual([]);
    expect(CREDIT_INTELLIGENCE_DATAVERSE_SCHEMA).toHaveLength(8);
    const evidence = CREDIT_INTELLIGENCE_DATAVERSE_SCHEMA.find((table) => table.logicalName === 'cr664_creditevidence');
    expect(evidence?.appendOnly).toBe(true);
    for (const required of ['cr664_locator', 'cr664_retrievedat', 'cr664_contenthash', 'cr664_permissionbasis']) {
      expect(evidence?.columns.find((column) => column.logicalName === required)).toMatchObject({ required: true, immutable: true });
    }
  });

  it('keeps extracted fields unaccepted until a human records status', () => {
    const extraction = CREDIT_INTELLIGENCE_DATAVERSE_SCHEMA.find((table) => table.logicalName === 'cr664_documentextraction');
    expect(extraction?.columns.find((column) => column.logicalName === 'cr664_humanstatus')).toMatchObject({ required: true });
  });

  it('never treats a Copilot proposal as proof of execution', () => {
    const proposal = CREDIT_INTELLIGENCE_DATAVERSE_SCHEMA.find((table) => table.logicalName === 'cr664_copilotproposal');
    expect(proposal?.purpose).toMatch(/never proof/i);
    expect(proposal?.columns.some((column) => column.logicalName === 'cr664_governedwriteid')).toBe(true);
  });
});
