import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens the dialog. */
  trigger?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Render as a right-side sheet instead of a centered dialog. */
  side?: boolean;
}

/**
 * Intaglio Dialog / Sheet (Radix). Accessible focus trap + escape + labelled
 * title come from Radix; the skin is ours. `side` switches to a right sheet
 * (used for record/detail panels).
 */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  side = false,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ig-overlay" />
        <RadixDialog.Content className={side ? 'ig-sheet' : 'ig-dialog'}>
          <RadixDialog.Title className="ig-dialog__title">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="ig-dialog__desc">{description}</RadixDialog.Description>
          ) : (
            // Radix warns without a description; provide an SR-only one.
            <RadixDialog.Description style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              {title}
            </RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
