/**
 * Phase 143 — CRM activation arc shared safety helpers.
 *
 * PURE. Deterministic local proof ids (FNV-1a, never random / never a real CRM id)
 * and an unsafe-payload scan (executable / SQL / secret / sensitive identifier).
 * No IO, no network, no eval/Function — used by the disabled / dry-run / read-only
 * CRM seams so none of them carries a live transport.
 */

/** Deterministic 32-bit FNV-1a hash, hex. Stable for identical input. */
export function crmDeterministicProofId(prefix: string, seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}_${hash.toString(16).padStart(8, '0')}`;
}

const UNSAFE_RX: readonly RegExp[] = [
  /\bfunction\s*\(|=>|\beval\s*\(|new\s+Function\b|\brequire\s*\(|\bimport\s*\(/,
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE)\b/i,
  /\b(api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

/** True when any field text looks executable / contains SQL / secret / SSN. */
export function crmContainsUnsafePayload(...texts: ReadonlyArray<string | undefined>): boolean {
  const joined = texts.filter((t): t is string => typeof t === 'string').join('\n');
  return UNSAFE_RX.some((rx) => rx.test(joined));
}

/** Sensitive identifier-like field keys that must never enter a CRM activation seam. */
export const CRM_SENSITIVE_KEYS: readonly string[] = Object.freeze([
  'ssn', 'tin', 'taxid', 'dob', 'dateofbirth', 'accountnumber', 'routingnumber', 'cardnumber', 'fulladdress',
]);

/** True when an object carries any sensitive identifier-like key. */
export function crmHasSensitiveKey(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj as Record<string, unknown>).map((k) => k.toLowerCase());
  return CRM_SENSITIVE_KEYS.some((s) => keys.includes(s));
}
