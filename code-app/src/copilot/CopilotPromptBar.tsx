import { useState, type CSSProperties, type FormEvent } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';

interface CopilotPromptBarProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function CopilotPromptBar({
  onSubmit,
  disabled = false,
  placeholder = 'Ask about this deal or workspace\u2026',
}: CopilotPromptBarProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
        aria-label="Copilot prompt"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        style={{
          ...buttonStyle,
          opacity: disabled || value.trim().length === 0 ? 0.5 : 1,
        }}
      >
        Ask
      </button>
    </form>
  );
}

const formStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  alignItems: 'center',
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: `${spacing.sm} ${spacing.md}`,
  fontSize: typography.size.sm,
  color: palette.text,
  background: palette.surfaceAlt,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.sm,
  outline: 'none',
  fontFamily: 'inherit',
};

const buttonStyle: CSSProperties = {
  padding: `${spacing.sm} ${spacing.lg}`,
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  color: palette.primaryFg,
  background: palette.primary,
  border: 'none',
  borderRadius: radius.sm,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
