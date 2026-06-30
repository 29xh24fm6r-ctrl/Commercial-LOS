import { useId } from 'react';

export interface GuillocheProps {
  /** Pixel size (square). */
  size?: number;
  /** Stroke color. Defaults to the Seal-Red security color. */
  color?: string;
  /** Overall opacity of the engraved line-work. */
  opacity?: number;
  className?: string;
  /** Decorative by default; pass a label to expose it to AT. */
  title?: string;
}

/**
 * The engraved security line — a fine guilloché / intaglio rosette, the kind on
 * banknotes and stock certificates. Pure deterministic SVG (no images, no
 * randomness). Use it in ONE or TWO places only (brand lockup + empty-state
 * hero); this is where the identity's boldness is spent.
 */
export function Guilloche({
  size = 120,
  color = 'var(--cc-security-rule)',
  opacity = 0.5,
  className,
  title,
}: GuillocheProps) {
  const id = useId();
  const cx = 50;
  const cy = 50;

  // A guilloché rosette = several superimposed rose curves with slightly
  // different harmonic counts, so the lines interlace into a moiré rosette.
  const rings = [
    { n: 7, a: 0.34, base: 34, samples: 720 },
    { n: 11, a: 0.22, base: 30, samples: 720 },
    { n: 5, a: 0.42, base: 38, samples: 720 },
  ];

  function rosette(n: number, a: number, base: number, samples: number): string {
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * Math.PI * 2;
      const r = base * (1 + a * Math.cos(n * t));
      const x = cx + r * Math.cos(t);
      const y = cy + r * Math.sin(t);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
    }
    return d + 'Z';
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ opacity }}
    >
      {title && <title>{title}</title>}
      <g fill="none" stroke={color} strokeWidth={0.45} aria-hidden="true">
        {rings.map((ring, idx) => (
          <path key={`${id}-${idx}`} d={rosette(ring.n, ring.a, ring.base, ring.samples)} />
        ))}
        <circle cx={cx} cy={cy} r={11} strokeWidth={0.6} />
        <circle cx={cx} cy={cy} r={3.4} strokeWidth={0.6} />
      </g>
    </svg>
  );
}
