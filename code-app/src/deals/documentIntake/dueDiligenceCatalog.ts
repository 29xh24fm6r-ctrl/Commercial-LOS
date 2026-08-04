export type DueDiligenceItemType = 'FILE_REQUIRED' | 'VERIFICATION' | 'APPROVAL' | 'SYSTEM_COMPLETION' | 'CONDITIONAL_FILE' | 'CONDITIONAL_VERIFICATION';
export type DueDiligenceSectionKey = 'APPLICATION_CUSTOMER' | 'CREDIT_UNDERWRITING' | 'ENTITY' | 'COLLATERAL' | 'REAL_ESTATE' | 'INSURANCE' | 'CLOSING' | 'PRE_FUNDING';
export interface DueDiligenceDefinition { readonly key: string; readonly name: string; readonly section: DueDiligenceSectionKey; readonly type: DueDiligenceItemType; readonly activatedStage: 'POST_APPROVAL' | 'PRE_FUNDING'; readonly applicabilityFact?: string; }

const section = (sectionKey: DueDiligenceSectionKey, names: readonly string[], type: DueDiligenceItemType = 'FILE_REQUIRED', activatedStage: 'POST_APPROVAL' | 'PRE_FUNDING' = 'POST_APPROVAL'): DueDiligenceDefinition[] => names.map((name) => ({ key: `${sectionKey.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, name, section: sectionKey, type, activatedStage }));

export const DUE_DILIGENCE_CATALOG: readonly DueDiligenceDefinition[] = [
  ...section('APPLICATION_CUSTOMER', ['Loan Application', 'Beneficial Ownership Certification', 'Fair Credit Notice', 'Business Due Diligence', 'Auto Debit/ACH Authorization']),
  ...section('APPLICATION_CUSTOMER', ['CIP Completed', 'OFAC — Borrower', 'OFAC — Business', 'Military Lending Act Check'], 'VERIFICATION'),
  ...section('CREDIT_UNDERWRITING', ['Credit Report', 'Credit Memo', 'Calculation Worksheet', 'Income Verification', 'Personal Financial Statement', 'Personal Cash Flow Analysis', 'Business Financial Statements', 'Business Cash Flow Analysis']),
  ...section('CREDIT_UNDERWRITING', ['Debt Service Coverage Verified'], 'VERIFICATION'),
  ...section('ENTITY', ['Certificate of Incorporation', 'Articles of Incorporation', 'Operating Agreement', 'Bylaws', 'Borrowing Resolution', 'Trust Documents', 'Guarantor Agreements']),
  ...section('COLLATERAL', ['UCC Search', 'UCC Filing Prepared', 'Security Agreement']),
  ...section('COLLATERAL', ['Collateral Inspection'], 'VERIFICATION'),
  ...['Appraisal', 'Environmental Review', 'Livestock Inspection', 'Inventory Report', 'A/R Aging Report', 'Borrowing Base Certificate', 'Rent Rolls'].map((name): DueDiligenceDefinition => ({ key: `collateral-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, section: 'COLLATERAL', type: 'CONDITIONAL_FILE', activatedStage: 'POST_APPROVAL', applicabilityFact: name })),
  ...['Flood Certification', 'Flood Notice Provided', 'Title Commitment', 'Mortgage', 'Assignment of Rents', 'Title Insurance Policy', 'Final Title Policy Received', 'Recording Information Verified'].map((name): DueDiligenceDefinition => ({ key: `real-estate-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, section: 'REAL_ESTATE', type: name.includes('Verified') || name.includes('Provided') ? 'CONDITIONAL_VERIFICATION' : 'CONDITIONAL_FILE', activatedStage: 'POST_APPROVAL', applicabilityFact: 'realEstateCollateral' })),
  ...['Hazard Insurance', 'Flood Insurance', 'Property Insurance', 'Errors & Omissions Coverage'].map((name): DueDiligenceDefinition => ({ key: `insurance-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, section: 'INSURANCE', type: 'CONDITIONAL_FILE', activatedStage: 'POST_APPROVAL', applicabilityFact: name })),
  ...section('INSURANCE', ['Loss Payee Added', 'Mortgagee Clause Verified'], 'CONDITIONAL_VERIFICATION'),
  ...section('CLOSING', ['Promissory Note', 'Loan Agreement', 'Security Agreement', 'Commercial Guaranty', 'Mortgage/Deed of Trust', 'Disclosure Package']),
  ...section('CLOSING', ['All Signatures Verified'], 'VERIFICATION'),
  ...section('PRE_FUNDING', ['Approval Conditions Satisfied', 'Note Signed', 'Security Agreement Signed', 'Mortgage Executed', 'Guaranties Executed', 'Insurance Verified', 'UCC Filing Submitted'], 'VERIFICATION', 'PRE_FUNDING'),
  ...section('PRE_FUNDING', ['Funding Approval Received', 'Funding Authorized'], 'APPROVAL', 'PRE_FUNDING'),
  ...section('PRE_FUNDING', ['Core System Boarding Completed'], 'SYSTEM_COMPLETION', 'PRE_FUNDING'),
];

export function resolveDueDiligenceApplicability(definition: DueDiligenceDefinition, facts: Readonly<Record<string, boolean | undefined>>): true | false | 'UNRESOLVED' {
  if (!definition.applicabilityFact) return true;
  const value = facts[definition.applicabilityFact];
  return value === undefined ? 'UNRESOLVED' : value;
}

export function itemShowsUpload(type: DueDiligenceItemType): boolean {
  return type === 'FILE_REQUIRED' || type === 'CONDITIONAL_FILE';
}
