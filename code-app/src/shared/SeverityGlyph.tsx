import { severityPalette, type SeverityKey } from './theme';

/**
 * Phase 125C — inline-SVG severity glyph for signal lists.
 *
 * Replaces the small colored dot (StatusDot) on severity-bearing
 * rows with a shape-bearing icon so severity reads at a glance from
 * shape, not just color (accessibility win for low-vision and
 * color-deficient bankers):
 *
 *   blocked  → warning triangle with exclamation
 *   atRisk   → alert circle with exclamation
 *   info /   → info circle
 *   clear /
 *   neutral
 *
 * The glyph sits inside a tinted halo (severity palette's `bg`) so
 * it has a soft container that reads as a premium chip on signal
 * rows' surfaceAlt background. aria-hidden — the surrounding row
 * label already carries semantic content for screen readers.
 *
 * No new dependency. No icon font. Single inline SVG per render.
 */
export function SeverityGlyph({ severity }: { severity: SeverityKey }) {
  const p = severityPalette[severity];
  return (
    <span
      aria-hidden="true"
      data-severity-glyph={severity}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: p.bg,
        color: p.bar,
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      {severity === 'blocked' ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ) : severity === 'atRisk' ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12.5" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )}
    </span>
  );
}
