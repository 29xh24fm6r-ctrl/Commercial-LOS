import { useMemo } from 'react';
import { Badge, Card, DataTable, EmptyState, type Column } from '../../design';
import { palette, spacing, typography } from '../../shared/theme';
import {
  deriveSectorConcentration,
  type ConcentrationCompany,
  type SectorConcentrationRow,
} from '../naics/concentrationViewModel';

export interface IndustryConcentrationPanelProps {
  companies: ReadonlyArray<ConcentrationCompany>;
}

const money = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');

/**
 * Industry concentration by 2-digit NAICS sector — the examiner-facing picture of
 * the book. Honest: companies with no NAICS are shown as an explicit unclassified
 * count; exposure renders only when a loan exposure is linked.
 */
export function IndustryConcentrationPanel({ companies }: IndustryConcentrationPanelProps) {
  const model = useMemo(() => deriveSectorConcentration(companies), [companies]);

  const columns = useMemo<Column<SectorConcentrationRow>[]>(() => {
    const cols: Column<SectorConcentrationRow>[] = [
      { key: 'sector', header: 'Sector', cell: (r) => (
        <span><span style={{ fontFamily: typography.mono, color: palette.textMuted }}>{r.sectorCode}</span>{'  '}{r.sectorTitle}</span>
      ), sortValue: (r) => r.sectorCode },
      { key: 'count', header: 'Companies', numeric: true, cell: (r) => r.count, sortValue: (r) => r.count },
      { key: 'pct', header: '% of book', numeric: true, cell: (r) => `${r.pctOfBook}%`, sortValue: (r) => r.pctOfBook },
    ];
    if (model.hasExposure) {
      cols.push({ key: 'exp', header: 'Exposure', numeric: true, cell: (r) => money(r.exposure), sortValue: (r) => r.exposure });
    }
    return cols;
  }, [model.hasExposure]);

  if (model.total === 0) {
    return (
      <EmptyState
        title="No companies to compare yet"
        body="As companies are added with a NAICS industry, this shows how the book concentrates by sector — the examiner-facing view."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span style={{ fontFamily: typography.display, fontSize: typography.size.xl, color: palette.text }}>
          {model.rows.length}
        </span>
        <span style={{ color: palette.textMuted, fontSize: typography.size.sm }}>
          sector{model.rows.length === 1 ? '' : 's'} across {model.classified} classified
          {model.unclassified > 0 && (
            <> · <Badge tone="neutral">{model.unclassified} unclassified</Badge></>
          )}
          {!model.hasExposure && <> · exposure not linked yet</>}
        </span>
      </div>
      <Card style={{ overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={model.rows}
          rowKey={(r) => r.sectorCode}
          caption="Industry concentration by NAICS sector"
        />
      </Card>
    </div>
  );
}
