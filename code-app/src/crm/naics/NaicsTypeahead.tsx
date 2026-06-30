import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Input } from '../../design';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import {
  filterNaicsHits,
  loadNaicsRowsLive,
  type NaicsHit,
  type NaicsLoader,
  type NaicsRow,
} from './naicsSearch';

export interface NaicsTypeaheadProps {
  /** Currently-selected code, if any (e.g. an existing record's cr664_naicscode). */
  value?: { code: string; title?: string } | undefined;
  /** Called with the chosen NAICS hit, or null when cleared. */
  onSelect: (hit: NaicsHit | null) => void;
  /** Injectable reference loader (defaults to the live, fail-closed loader). */
  loader?: NaicsLoader;
  label?: string;
  disabled?: boolean;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; rows: readonly NaicsRow[] }
  | { kind: 'unavailable'; reason: string };

/**
 * Industry → NAICS type-ahead. The banker types plain words ("auto repair"); the
 * list resolves standard 6-digit codes with their derived sector context. Selecting
 * stores the 6-digit code via the governed write (caller's onSelect). Read-only;
 * honest empty / unavailable states; never fabricates a code.
 */
export function NaicsTypeahead({ value, onSelect, loader = loadNaicsRowsLive, label = 'Industry (NAICS)', disabled = false }: NaicsTypeaheadProps) {
  const initial = value?.code ? `${value.code}${value.title ? ` — ${value.title}` : ''}` : '';
  const [query, setQuery] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce the query that drives filtering.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function ensureLoaded() {
    if (load.kind !== 'idle') return;
    setLoad({ kind: 'loading' });
    const result = await loader();
    setLoad(result.status === 'ready' ? { kind: 'ready', rows: result.rows } : { kind: 'unavailable', reason: result.reason });
  }

  const hits = useMemo(
    () => (load.kind === 'ready' ? filterNaicsHits(load.rows, debounced) : []),
    [load, debounced],
  );

  function choose(hit: NaicsHit) {
    setQuery(`${hit.code} — ${hit.title}`);
    setOpen(false);
    onSelect(hit);
  }

  function onChange(next: string) {
    setQuery(next);
    setOpen(true);
    void ensureLoaded();
    if (next.trim().length === 0) onSelect(null);
  }

  return (
    <div ref={boxRef} style={styles.wrap}>
      {label && <span style={styles.label}>{label}</span>}
      <Input
        value={query}
        disabled={disabled}
        placeholder="Type an industry, e.g. “auto repair” or a code"
        aria-label={label}
        aria-expanded={open}
        role="combobox"
        aria-autocomplete="list"
        data-crm-field="naics"
        onFocus={() => { setOpen(true); void ensureLoaded(); }}
        onChange={(e) => onChange(e.target.value)}
      />
      {open && debounced.trim().length > 0 && (
        <div style={styles.panel} role="listbox" aria-label="NAICS results">
          {load.kind === 'loading' && <div style={styles.note}>Searching NAICS…</div>}
          {load.kind === 'unavailable' && (
            <div style={styles.noteInfo} role="note" data-crm-naics-unavailable>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <span>{load.reason}</span>
            </div>
          )}
          {load.kind === 'ready' && hits.length === 0 && (
            <div style={styles.note}>No NAICS match for “{debounced.trim()}”.</div>
          )}
          {hits.map((h) => (
            <button key={h.code} type="button" role="option" aria-selected={false} style={styles.option} data-crm-naics-option={h.code} onClick={() => choose(h)}>
              <span style={styles.optCode}>{h.code}</span>
              <span style={styles.optTitle}>{h.title}</span>
              <span style={styles.optSector}>{h.sectorCode} · {h.sectorTitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' },
  label: { fontSize: typography.size.xs, color: palette.textMuted, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  panel: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20, maxHeight: 280, overflowY: 'auto', background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: radius.md, boxShadow: shadow.rise },
  note: { padding: `${spacing.sm} ${spacing.md}`, color: palette.textMuted, fontSize: typography.size.sm },
  // v3 FIX 4 — the "not provisioned yet" message is an honest INFORMATIONAL state
  // (data pending, not a failure): legible Treasury-Blue info treatment, not dim error text.
  noteInfo: { display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.sm} ${spacing.md}`, color: palette.infoFg, background: palette.infoBg, borderLeft: `2px solid ${palette.info}`, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  option: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: spacing.sm, rowGap: 2, width: '100%', textAlign: 'left', padding: `${spacing.xs} ${spacing.md}`, background: 'transparent', border: 'none', borderBottom: `1px solid ${palette.divider}`, cursor: 'pointer', fontFamily: typography.family },
  optCode: { fontFamily: typography.mono, fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold },
  optTitle: { fontSize: typography.size.sm, color: palette.text },
  optSector: { gridColumn: '1 / -1', fontSize: typography.size.xs, color: palette.textSubtle },
};
