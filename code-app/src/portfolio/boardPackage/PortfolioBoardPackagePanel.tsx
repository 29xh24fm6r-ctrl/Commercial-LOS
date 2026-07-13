import type { CSSProperties } from 'react';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import { buildPortfolioBoardPackage, buildPortfolioBoardPackageCsv, type PortfolioBoardPackageInput } from './portfolioBoardPackage';

/**
 * Phase 264 (P3) — one-click board/regulator package export panel.
 *
 * Read-only summary of the board package plus a "Download board package"
 * button. The download is a plain client-side CSV (Blob + anchor) — no PDF
 * generation, no server round-trip, no SharePoint/Graph/email call, matching
 * the same download mechanism already used by the portfolio import wizard's
 * report downloads.
 */

interface Props {
  readonly input: PortfolioBoardPackageInput;
}

/** Triggers a browser download of `content` as `fileName`; a no-op in non-DOM/test environments. */
function downloadCsv(fileName: string, content: string) {
  try {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Download is a no-op in non-DOM/test environments.
  }
}

export function PortfolioBoardPackagePanel({ input }: Props) {
  const pkg = buildPortfolioBoardPackage(input);

  return (
    <section style={styles.wrap} aria-label="Portfolio board package" data-board-package="ready">
      <header style={styles.head}>
        <div>
          <h3 style={styles.title}>Board / Regulator Package</h3>
          <p style={styles.subtitle}>
            As of {pkg.asOfDate}
            {pkg.institutionName ? ` — ${pkg.institutionName}` : ''}. Aggregates concentration risk,
            regulatory classification, watchlist{pkg.stressTestIncluded ? ', and stress-test' : ''} into one
            summary.
          </p>
        </div>
        <button
          type="button"
          style={styles.downloadBtn}
          data-board-package-download
          onClick={() =>
            downloadCsv(
              `portfolio-board-package-${pkg.asOfDate}.csv`,
              buildPortfolioBoardPackageCsv(pkg),
            )
          }
        >
          ↓ Download board package (CSV)
        </button>
      </header>

      {pkg.sections.map((section) => (
        <div key={section.key} style={styles.section} data-board-package-section={section.key}>
          <div style={styles.sectionLabel}>{section.label}</div>
          <ul style={styles.lineList}>
            {section.lines.map((line, i) => (
              <li key={i} style={styles.line}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {!pkg.stressTestIncluded && (
        <p style={styles.note} data-board-package-no-stress-test>
          No stress-test scenario was run for this package — the stress-test section is omitted, not
          zeroed.
        </p>
      )}

      <footer style={styles.footer}>
        <span>No PDF generation. No server round-trip. No SharePoint / Graph / email call.</span>
      </footer>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.md, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: `${spacing.xs} 0 0`, color: palette.textMuted, fontSize: typography.size.sm, maxWidth: 640, lineHeight: typography.lineHeight.snug },
  downloadBtn: { background: palette.cobalt, color: palette.cobaltFg, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.bold, fontFamily: typography.family, cursor: 'pointer', whiteSpace: 'nowrap' },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  sectionLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  lineList: { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 },
  line: { fontSize: typography.size.sm, color: palette.text, lineHeight: typography.lineHeight.snug },
  note: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' },
  footer: { paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}`, fontSize: typography.size.xs, color: palette.textSubtle },
};
