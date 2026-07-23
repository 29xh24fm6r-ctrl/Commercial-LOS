import type { ClosingDocumentFactModel, ClosingDocumentTemplate } from './closingDocumentTypes';

/**
 * Deterministic, pure content rendering — a plain-text body built ONLY from the facts a template
 * was already confirmed eligible against (never a fabricated field). This is intentionally simple
 * (no PDF/rich formatting) — the framework's job is proving governed generation with provenance,
 * not document typesetting; a real rendering engine can replace this function's body later without
 * touching any other module in this framework.
 */
export function renderClosingDocumentContent(
  template: ClosingDocumentTemplate,
  facts: ClosingDocumentFactModel,
): string {
  const lines: string[] = [
    `${template.title} (template v${template.version})`,
    `Deal: ${facts.dealName ?? facts.dealId ?? 'Unknown'}`,
  ];
  if (facts.borrowerLegalName) lines.push(`Borrower: ${facts.borrowerLegalName}`);
  if (facts.product) lines.push(`Product: ${facts.product}`);
  if (typeof facts.loanAmount === 'number') lines.push(`Loan amount: ${facts.loanAmount}`);
  if (facts.closingDate) lines.push(`Closing date: ${facts.closingDate}`);
  if (facts.jurisdiction) lines.push(`Jurisdiction: ${facts.jurisdiction}`);
  if (facts.collateralDescription) lines.push(`Collateral: ${facts.collateralDescription}`);
  if (typeof facts.conditionsPrecedentResolved === 'boolean') {
    lines.push(`Conditions precedent resolved: ${facts.conditionsPrecedentResolved ? 'Yes' : 'No'}`);
  }
  if (facts.fundingInstructions) lines.push(`Funding instructions: ${facts.fundingInstructions}`);
  return lines.join('\n');
}

/**
 * A stable, non-cryptographic content hash (FNV-1a, 32-bit) — sufficient to detect whether
 * regenerated content differs from a prior manifest's content, without pulling in a crypto
 * dependency for what is, today, a text-only rendering. Swap for a real digest (SHA-256) if/when
 * this framework starts producing binary output a stronger integrity guarantee matters for.
 */
export function hashClosingDocumentContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
