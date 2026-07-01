import type { CSSProperties } from 'react';
import { palette, spacing, typography } from '../../shared/theme';

/**
 * NAICS external lookup aids.
 *
 * Discovery-only links a banker can open to search NAICS by company activity, then enter
 * the six-digit code back into the field (which validates against the internal
 * `cr664_naicscodes` table). These are STATIC links — no scraping, no iframe, no
 * third-party API, no runtime dependency: if either site is down the LOS still loads and
 * internal validation still works. Final NAICS selection stays banker-entered.
 */

/** Compliance-safe official source (U.S. Census). */
export const NAICS_CENSUS_URL = 'https://www.census.gov/naics/';
/** Convenience third-party lookup with a more keyword-friendly UX. */
export const NAICS_DOTCOM_URL = 'https://www.naics.com/search/';

export function NaicsLookupLinks() {
  return (
    <div style={styles.wrap} data-naics-lookup-links>
      <p style={styles.help}>
        Need help finding the right code? Search by the company’s activity in the official NAICS
        tool, then enter the six-digit code here.
      </p>
      <div style={styles.links}>
        <a
          href={NAICS_CENSUS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
          data-naics-link="census"
        >
          Search official Census NAICS
          <ExternalIcon />
        </a>
        <a
          href={NAICS_DOTCOM_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
          data-naics-link="naics-dotcom"
        >
          Search NAICS.com lookup
          <ExternalIcon />
          <span style={styles.thirdParty}>Third-party lookup</span>
        </a>
      </div>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M14 3h7v7" />
      <path d="M21 3l-9 9" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.xs, marginTop: spacing.xs },
  help: { margin: 0, fontSize: typography.size.xs, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
  links: { display: 'flex', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xxs,
    color: palette.link,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    textDecoration: 'none',
  },
  thirdParty: {
    color: palette.textSubtle,
    fontWeight: typography.weight.regular,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
  },
};
