import type { CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import type { BoardingFieldSpec } from './portfolioLoanBoardingFieldSpecs';

/** One labeled input, generic over a field spec's declared input type. */
export function BoardingFieldInput({
  spec,
  value,
  onChange,
  disabled,
}: {
  spec: BoardingFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const id = `boarding-field-${spec.key}-${spec.label.replace(/\s+/g, '-')}`;
  return (
    <label style={styles.field} htmlFor={id}>
      <span style={styles.label}>{spec.label}</span>
      {renderInput(spec, id, value, onChange, disabled)}
    </label>
  );
}

function renderInput(
  spec: BoardingFieldSpec,
  id: string,
  value: unknown,
  onChange: (value: unknown) => void,
  disabled: boolean | undefined,
) {
  switch (spec.inputType) {
    case 'boolean':
      return (
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={styles.checkbox}
        />
      );
    case 'number':
      return (
        <input
          id={id}
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          style={styles.input}
        />
      );
    case 'date':
      return (
        <input
          id={id}
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          style={styles.input}
        />
      );
    case 'text':
      return (
        <textarea
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          style={styles.textarea}
          rows={2}
        />
      );
    case 'enum':
      return (
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          style={styles.input}
        >
          <option value="">Not set</option>
          {(spec.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case 'string':
    default:
      return (
        <input
          id={id}
          type="text"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          style={styles.input}
        />
      );
  }
}

/** Grid of fields for a single scalar section object (e.g. `pkg.identity`). */
export function BoardingScalarSectionEditor<T extends object>({
  fields,
  values,
  onFieldChange,
  disabled,
}: {
  fields: readonly BoardingFieldSpec[];
  values: T;
  onFieldChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const record = values as Record<string, unknown>;
  return (
    <div style={styles.grid} data-boarding-scalar-section>
      {fields.map((spec) => (
        <BoardingFieldInput
          key={spec.key}
          spec={spec}
          value={record[spec.key]}
          onChange={(value) => onFieldChange(spec.key, value)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

/** Repeatable item list (e.g. `pkg.collateral.items`) — add/remove rows, each a mini scalar editor. */
export function BoardingRepeatableSectionEditor<T extends object>({
  fields,
  items,
  onItemsChange,
  emptyItem,
  itemLabel,
  disabled,
}: {
  fields: readonly BoardingFieldSpec[];
  items: readonly T[];
  onItemsChange: (items: T[]) => void;
  emptyItem: () => T;
  itemLabel: string;
  disabled?: boolean;
}) {
  return (
    <div data-boarding-repeatable-section>
      {items.length === 0 && <p style={styles.emptyNote}>No {itemLabel.toLowerCase()} entries yet.</p>}
      {items.map((item, index) => (
        <div key={index} style={styles.itemCard} data-boarding-repeatable-item={index}>
          <div style={styles.itemHeader}>
            <span style={styles.itemTitle}>{itemLabel} #{index + 1}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onItemsChange(items.filter((_, i) => i !== index))}
              style={styles.removeButton}
            >
              Remove
            </button>
          </div>
          <BoardingScalarSectionEditor
            fields={fields}
            values={item}
            disabled={disabled}
            onFieldChange={(key, value) => {
              const next = items.map((it, i) => (i === index ? { ...it, [key]: value } : it));
              onItemsChange(next);
            }}
          />
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onItemsChange([...items, emptyItem()])}
        style={styles.addButton}
      >
        Add {itemLabel.toLowerCase()}
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: spacing.sm,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  label: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  input: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
    fontFamily: typography.family,
    fontSize: typography.size.sm,
  },
  textarea: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
    fontFamily: typography.family,
    fontSize: typography.size.sm,
    resize: 'vertical',
  },
  checkbox: { width: 18, height: 18, alignSelf: 'flex-start' },
  itemCard: {
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontWeight: typography.weight.semibold, fontSize: typography.size.sm, color: palette.text },
  removeButton: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    background: palette.surfaceAlt,
    color: palette.text,
    padding: `2px ${spacing.sm}`,
    fontSize: typography.size.xs,
    cursor: 'pointer',
  },
  addButton: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    background: palette.surface,
    color: palette.text,
    padding: `${spacing.xs} ${spacing.sm}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
  emptyNote: { color: palette.textMuted, fontSize: typography.size.sm },
};
