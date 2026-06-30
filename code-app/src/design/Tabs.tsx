import type { ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  items: ReadonlyArray<TabItem>;
  /** Controlled value. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  'aria-label'?: string;
}

/**
 * Intaglio Tabs (Radix). Active tab carries the Seal-Red underline indicator —
 * the one place the accent marks "you are here".
 */
export function Tabs({ items, value, defaultValue, onValueChange, ...rest }: TabsProps) {
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
    >
      <RadixTabs.List className="ig-tabs-list" aria-label={rest['aria-label']}>
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} value={item.value} className="ig-tab">
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} style={{ paddingTop: '1rem' }}>
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
