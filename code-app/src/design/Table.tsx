import { useMemo, useState, type ReactNode } from 'react';

export interface Column<Row> {
  /** Stable key. */
  key: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: Row) => ReactNode;
  /** Right-align + tabular figures (for money / counts). */
  numeric?: boolean;
  /** Provide a comparable value to enable sorting on this column. */
  sortValue?: (row: Row) => string | number;
  /** Header width hint. */
  width?: string | number;
}

export interface DataTableProps<Row> {
  columns: ReadonlyArray<Column<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row, index: number) => string;
  /** Click handler — makes rows focusable + keyboard-activatable. */
  onRowActivate?: (row: Row) => void;
  /** Accessible caption. */
  caption?: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/**
 * Intaglio DataTable — row hover, aligned numerics (tabular figures), optional
 * sortable headers, and keyboard-activatable rows. A proper financial table, not
 * a div grid.
 */
export function DataTable<Row>({ columns, rows, rowKey, onRowActivate, caption }: DataTableProps<Row>) {
  const [sort, setSort] = useState<SortState>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }, [rows, columns, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  return (
    <table className="ig-table">
      {caption && <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>}
      <thead>
        <tr>
          {columns.map((col) => {
            const sortable = Boolean(col.sortValue);
            const active = sort?.key === col.key;
            const arrow = active ? (sort!.dir === 'asc' ? ' ↑' : ' ↓') : '';
            return (
              <th
                key={col.key}
                className={[col.numeric ? 'ig-num' : '', sortable ? 'ig-th-sortable' : ''].filter(Boolean).join(' ')}
                style={{ width: col.width }}
                aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                onClick={sortable ? () => toggleSort(col.key) : undefined}
                onKeyDown={
                  sortable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleSort(col.key);
                        }
                      }
                    : undefined
                }
                tabIndex={sortable ? 0 : undefined}
              >
                {col.header}
                {arrow}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row, i) => (
          <tr
            key={rowKey(row, i)}
            className={['ig-tr', onRowActivate ? 'ig-tr--clickable' : ''].filter(Boolean).join(' ')}
            tabIndex={onRowActivate ? 0 : undefined}
            onClick={onRowActivate ? () => onRowActivate(row) : undefined}
            onKeyDown={
              onRowActivate
                ? (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onRowActivate(row);
                    }
                  }
                : undefined
            }
          >
            {columns.map((col) => (
              <td key={col.key} className={col.numeric ? 'ig-num' : undefined}>
                {col.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
