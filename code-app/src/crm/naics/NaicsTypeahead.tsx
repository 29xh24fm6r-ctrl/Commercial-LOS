import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Input } from '../../design';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import {
  filterNaicsHits,
  loadNaicsRowsLive,
  findNaicsByCode,
  type NaicsHit,
  type NaicsLoader,
  type NaicsRow,
  type NaicsCodeLookup,
} from './naicsSearch';
import { NaicsLookupLinks } from './NaicsLookupLinks';
import { normalizeNaicsCode, isSixDigitNaicsCode } from './validateNaicsCode';

export interface NaicsTypeaheadProps {
  /** Currently-selected code, if any (e.g. an existing record's cr664_naicscode). */
  value?: { code: string; title?: string } | undefined;
  /** Called with the chosen NAICS hit, or null when cleared. */
  onSelect: (hit: NaicsHit | null) => void;
  /** Injectable reference loader (defaults to the live, fail-closed loader). */
  loader?: NaicsLoader;
  /** Injectable exact-code lookup (defaults to the live server-side filter). */
  findByCode?: NaicsCodeLookup;
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
export function NaicsTypeahead({ value, onSelect, loader = loadNaicsRowsLive, findByCode = findNaicsByCode, label = 'Industry (NAICS)', disabled = false }: NaicsTypeaheadProps) {
  const initial = value?.code ? `${value.code}${value.title ? ` — ${value.title}` : ''}` : '';
  const [query, setQuery] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  // The confirmed selection (from picking an option, or an existing record's code+title).
  const [confirmed, setConfirmed] = useState<{ code: string; title: string } | null>(
    value?.code && value.title ? { code: value.code, title: value.title } : null,
  );
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
    setConfirmed({ code: hit.code, title: hit.title });
    setOpen(false);
    onSelect(hit);
  }

  function onChange(next: string) {
    setQuery(next);
    setConfirmed(null); // editing invalidates any prior confirmation
    setOpen(true);
    void ensureLoaded();
    if (next.trim().length === 0) onSelect(null);
  }

  // AC3/AC4 — direct code entry uses the AUTHORITATIVE exact lookup (a server-side `cr664_code`
  // filter), NOT the paginated typeahead set (the deployed bug: a valid code was missing from the
  // loaded page). Text queries (an industry search) show no format line; the dropdown handles those.
  const digitsOnly = /^\s*\d+\s*$/.test(query);
  const normalized = normalizeNaicsCode(query);
  const codeForLookup = !confirmed && digitsOnly && isSixDigitNaicsCode(normalized) ? normalized : null;

  // Result of the exact lookup for a specific code. setState happens only in the async callbacks
  // (never synchronously in the effect body); while the result doesn't match the current code the
  // derivation below renders "checking".
  const [codeResult, setCodeResult] = useState<{ code: string; title: string | null } | null>(null);
  useEffect(() => {
    if (!codeForLookup) return;
    let cancelled = false;
    findByCode(codeForLookup)
      .then((hit) => {
        if (!cancelled) setCodeResult({ code: codeForLookup, title: hit?.cr664_title ?? null });
      })
      .catch(() => {
        if (!cancelled) setCodeResult({ code: codeForLookup, title: null });
      });
    return () => {
      cancelled = true;
    };
  }, [codeForLookup, findByCode]);

  let validation:
    | { kind: 'confirmed'; text: string }
    | { kind: 'not-found' }
    | { kind: 'bad-format' }
    | { kind: 'checking' }
    | null = null;
  if (confirmed) {
    validation = { kind: 'confirmed', text: `${confirmed.code} — ${confirmed.title}` };
  } else if (codeForLookup) {
    if (codeResult && codeResult.code === codeForLookup) {
      validation = codeResult.title
        ? { kind: 'confirmed', text: `${codeForLookup} — ${codeResult.title}` }
        : { kind: 'not-found' };
    } else {
      validation = { kind: 'checking' };
    }
  } else if (digitsOnly && query.trim().length > 0) {
    validation = { kind: 'bad-format' };
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

      {validation?.kind === 'confirmed' && (
        <p style={styles.confirmed} role="status" data-naics-validated>
          <span aria-hidden>✓</span> {validation.text}
        </p>
      )}
      {validation?.kind === 'not-found' && (
        <p style={styles.warn} role="status" data-naics-not-found>
          NAICS code was not found in the internal reference table. Confirm the code or use the lookup links.
        </p>
      )}
      {validation?.kind === 'bad-format' && (
        <p style={styles.warn} role="status" data-naics-bad-format>
          Enter a valid six-digit NAICS code.
        </p>
      )}
      {validation?.kind === 'checking' && (
        <p style={styles.note} role="status" data-naics-checking>
          Checking NAICS reference…
        </p>
      )}

      <NaicsLookupLinks />
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
  confirmed: { margin: 0, fontSize: typography.size.sm, color: palette.clearFg, fontWeight: typography.weight.medium, display: 'flex', alignItems: 'center', gap: spacing.xxs },
  warn: { margin: 0, fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, borderLeft: `2px solid ${palette.atRisk}`, padding: `${spacing.xs} ${spacing.sm}`, lineHeight: typography.lineHeight.snug },
};
