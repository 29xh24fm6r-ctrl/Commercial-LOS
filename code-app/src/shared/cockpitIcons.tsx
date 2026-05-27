import type { CSSProperties, SVGProps } from 'react';

/**
 * Phase 125E — inline-SVG icon library for the deal cockpit.
 *
 * Stroke-only feather-style glyphs. Every icon takes the standard
 * SVGProps so callers can pass `width` / `height` / `stroke` /
 * `color` / `style` / `aria-hidden`. The default is a 20x20
 * `currentColor` stroke so icons inherit their parent text color
 * unless overridden — matches how Bloomberg / Apple cockpit
 * iconography tints alongside its label.
 *
 * The glyphs are deliberately *not* a heavy icon-font dependency:
 * one file, one factory, only the shapes the cockpit needs. New
 * icons should be added here, not imported from a third party.
 *
 * No animation. No hover state. Every glyph is decoration only —
 * the surrounding label / value carries the semantic meaning, and
 * `aria-hidden` defaults to true so screen readers don't double-
 * read the visual.
 */

type GlyphProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  /**
   * Some callers want the icon to render with its own contained
   * tinted halo (a small colored disc behind the glyph). This is
   * applied as an inline-flex wrapper rather than as part of the
   * SVG so the halo size + color can vary per call-site without
   * leaking into the glyph viewbox.
   */
};

function baseProps(size: number | string | undefined, props: GlyphProps) {
  return {
    width: size ?? props.width ?? 20,
    height: size ?? props.height ?? 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': 'true' as const,
    role: 'presentation' as const,
    ...props,
  };
}

export function DollarIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function AlertIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function ChecklistIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function DocumentsIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function MailIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

export function CalendarIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function ActivityIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function StageIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <circle cx="5" cy="12" r="2.4" />
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="19" cy="12" r="2.4" />
      <line x1="7.4" y1="12" x2="9.6" y2="12" />
      <line x1="14.4" y1="12" x2="16.6" y2="12" />
    </svg>
  );
}

export function BankerIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function ClientIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M3 21V9l9-6 9 6v12" />
      <line x1="9" y1="21" x2="9" y2="13" />
      <line x1="15" y1="21" x2="15" y2="13" />
    </svg>
  );
}

export function SparkleIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M12 2v6" />
      <path d="M12 16v6" />
      <path d="M4.93 4.93l4.24 4.24" />
      <path d="M14.83 14.83l4.24 4.24" />
      <path d="M2 12h6" />
      <path d="M16 12h6" />
      <path d="M4.93 19.07l4.24-4.24" />
      <path d="M14.83 9.17l4.24-4.24" />
    </svg>
  );
}

export function MemoIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="16 3 16 8 21 8" />
      <line x1="9" y1="14" x2="15" y2="14" />
      <line x1="9" y1="18" x2="13" y2="18" />
    </svg>
  );
}

export function TeamsIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function CompletenessIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 9 9" strokeWidth="2.8" />
    </svg>
  );
}

export function PipelineIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function RelationshipIcon({ size, ...rest }: GlyphProps = {}) {
  return (
    <svg {...baseProps(size, rest)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/**
 * Small tinted halo wrapper for icon-led card headers + tiles.
 * Render `<IconChip><DollarIcon /></IconChip>` to get the standard
 * 32px tinted disc behind any glyph. The tint follows the parent
 * color tone (info-cobalt by default).
 */
export function IconChip({
  children,
  tone = 'info',
  size = 32,
}: {
  children: React.ReactNode;
  tone?: 'info' | 'clear' | 'atRisk' | 'blocked' | 'neutral' | 'violet' | 'teal';
  size?: number;
}) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '10px',
    background: TONE_BG[tone],
    color: TONE_FG[tone],
    flexShrink: 0,
  };
  return <span style={style}>{children}</span>;
}

const TONE_BG: Record<string, string> = {
  info: 'var(--cc-cobalt-bg)',
  clear: 'var(--cc-clear-bg)',
  atRisk: 'var(--cc-at-risk-bg)',
  blocked: 'var(--cc-blocked-bg)',
  neutral: 'var(--cc-neutral-bg)',
  violet: 'var(--cc-violet-bg)',
  teal: 'var(--cc-teal-bg)',
};

const TONE_FG: Record<string, string> = {
  info: 'var(--cc-cobalt)',
  clear: 'var(--cc-clear)',
  atRisk: 'var(--cc-at-risk)',
  blocked: 'var(--cc-blocked)',
  neutral: 'var(--cc-neutral)',
  violet: 'var(--cc-violet)',
  teal: 'var(--cc-teal)',
};
