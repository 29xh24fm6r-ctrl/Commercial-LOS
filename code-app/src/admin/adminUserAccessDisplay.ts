/**
 * Phase 204N — PURE, LOCAL-ONLY display helpers for the read-only Admin User
 * Access console. These format values the safe-read queries already return; they
 * make NO Dataverse call, read NO formatted/display fields, and change NO
 * authorization. Honest blanks are preferred over fabricated display names.
 */

/** cr664_accesslevel option-set values (as the string the query surfaces). */
const ACCESS_LEVEL_LABELS: Readonly<Record<string, string>> = {
  '788190000': 'Full',
  '788190001': 'ReadOnly',
  '788190002': 'Admin',
};

/**
 * Format the numeric access-level option-set as a friendly label plus the raw
 * value, e.g. "Admin — 788190002". Blank/undefined → "—"; an unrecognized value →
 * "Unknown — <raw>" (never hides the real value).
 */
export function formatAdminAccessLevel(value: string | undefined): string {
  if (value === undefined || value === '') return '—';
  const label = ACCESS_LEVEL_LABELS[value];
  return label ? `${label} — ${value}` : `Unknown — ${value}`;
}

/**
 * The workspace display name is intentionally NOT selected (it is not selectable
 * live), so render an explicit honest label rather than an ambiguous dash.
 */
export function formatSafeReadWorkspaceName(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Primary workspace not included in current read contract';
}

/**
 * Render the entitlement's LOS profile reference. The safe-read returns the raw
 * `_cr664_losuserprofile_value` GUID (no display name); show it when present,
 * otherwise "Not linked". Never fabricates a profile display name.
 */
export function formatProfileReference(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Not linked';
}

/** Local-only access-level grouping for read-only table organization. */
export type AdminEntitlementGroup = 'Admin' | 'Full' | 'ReadOnly' | 'Other';

/**
 * Derive a display-only grouping bucket from the numeric access level ONLY. This is
 * presentation grouping, not authorization — it never changes who can access what.
 */
export function adminEntitlementGroup(accessLevel: string | undefined): AdminEntitlementGroup {
  switch (accessLevel) {
    case '788190002':
      return 'Admin';
    case '788190000':
      return 'Full';
    case '788190001':
      return 'ReadOnly';
    default:
      return 'Other';
  }
}
