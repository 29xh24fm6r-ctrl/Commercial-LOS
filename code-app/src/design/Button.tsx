import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual weight. `primary` is the single Seal-Red filled action — use AT MOST
   * ONE per context (the design system enforces this by making everything else
   * quieter). `secondary` is bordered, `ghost` is chromeless, `danger` is
   * destructive.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render as the child element (e.g. an anchor) while keeping button styling. */
  asChild?: boolean;
  /** Optional leading icon. */
  icon?: ReactNode;
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'ig-btn--sm',
  md: '',
  lg: 'ig-btn--lg',
};

/**
 * Intaglio Button. Default variant is `secondary` so a `primary` is always a
 * deliberate, singular choice on a screen.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', asChild = false, icon, className = '', children, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const cls = ['ig-btn', `ig-btn--${variant}`, SIZE_CLASS[size], className].filter(Boolean).join(' ');
  return (
    <Comp
      ref={ref}
      className={cls}
      // Native buttons inside forms default to submit; be explicit unless asChild.
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...rest}
    >
      {icon}
      {children}
    </Comp>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — required because the button shows only an icon. */
  label: string;
}

/** Square, chromeless-until-hover icon button (e.g. the "•••" overflow). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className = '', children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={['ig-iconbtn', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});
