import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';

export interface CommandItem {
  /** Stable id. */
  id: string;
  /** Visible label. */
  label: string;
  /** Right-aligned hint (e.g. a shortcut or route). */
  meta?: string;
  /** Extra search terms. */
  keywords?: string[];
  /** Leading icon. */
  icon?: ReactNode;
  /** Run on select. The palette closes first. */
  run: () => void;
}

export interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

export interface CommandPaletteProps {
  groups: CommandGroup[];
  /** Controlled open (optional). When omitted, ⌘K / Ctrl-K toggles internally. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
}

const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
};

/**
 * Intaglio command palette (⌘K / Ctrl-K). cmdk for fuzzy search + keyboard
 * selection, inside a Radix dialog for focus-trap + escape + a labelled surface.
 * The single biggest perceived-eliteness jump after the tokens.
 */
export function CommandPalette({ groups, open, onOpenChange, placeholder = 'Search or run a command…' }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setOpen]);

  const flatCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="ig-overlay" />
        <Dialog.Content className="ig-dialog" aria-label="Command palette" style={{ padding: '0.75rem 0.9rem' }}>
          <Dialog.Title style={srOnly}>Command palette</Dialog.Title>
          <Dialog.Description style={srOnly}>Search across the app and run quick actions.</Dialog.Description>
          <Command className="ig-cmd" label="Command palette" loop>
            <Command.Input className="ig-cmd__input" placeholder={placeholder} autoFocus />
            <Command.List className="ig-cmd__list">
              <Command.Empty className="ig-cmd__empty">No matches{flatCount === 0 ? ' available' : ''}.</Command.Empty>
              {groups.map((group) => (
                <Command.Group key={group.heading} heading={group.heading}>
                  {group.items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${(item.keywords ?? []).join(' ')}`}
                      onSelect={() => {
                        setOpen(false);
                        item.run();
                      }}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      {item.meta && <span className="ig-cmd__item-meta">{item.meta}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
