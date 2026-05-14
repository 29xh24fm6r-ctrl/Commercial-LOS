/**
 * Phase 61: recipient masking for non-audit surfaces.
 *
 * The full recipient address is recorded ONLY on the audit event
 * (cr664_AuditEvent), which is the privileged ledger. Every other
 * surface — the timeline event (cr664_DealTimelineEvent, visible to
 * the banker and their manager) and the in-modal outcome card —
 * displays the masked form so the address is not casually exposed
 * outside the audit trail.
 *
 * Masking strategy:
 *   - Local part: keep the first character; replace the rest with
 *     '***'. ('bborrower@example.com' → 'b***@e***.com')
 *   - Domain part: keep the first character of the second-level label,
 *     replace the rest of that label with '***', preserve the TLD.
 *
 * Edge cases:
 *   - No '@' or empty halves → returns '***' (defensive fallback;
 *     the action layer rejects these inputs before reaching here).
 *   - No dot in the domain → masks the domain entirely as '***'.
 *   - Multi-label TLDs (.co.uk) are preserved as-is from the last
 *     dot onwards (so foo@example.co.uk → f***@e***.co.uk), which
 *     matches typical "what was the recipient roughly" debug needs
 *     without claiming forensic precision.
 *
 * Discipline:
 *   - Pure function. No I/O, no clock, no module-level state.
 *   - The shape is conservative — the masked form is intentionally
 *     not reversible. We do not encode the original length or any
 *     other fingerprint.
 */

export function maskRecipient(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  if (at !== trimmed.lastIndexOf('@')) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length === 0 || domain.length === 0) return '***';
  const localMasked = `${local[0]}***`;
  const firstDot = domain.indexOf('.');
  if (firstDot <= 0) return `${localMasked}@***`;
  const domainHead = domain.slice(0, firstDot);
  const domainTail = domain.slice(firstDot);
  return `${localMasked}@${domainHead[0]}***${domainTail}`;
}
