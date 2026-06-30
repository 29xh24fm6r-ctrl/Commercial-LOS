/**
 * Intaglio design system — primitive library barrel.
 *
 * One small, accessible component set backed by the --cc-* tokens. Import from
 * here, not the individual files, so the system stays cohesive.
 */
export { Button, IconButton, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Card, type CardProps } from './Card';
export { Badge, type BadgeProps } from './Badge';
export { Input, SearchField, type InputProps, type SearchFieldProps } from './Input';
export { Kbd } from './Kbd';
export { Tabs, type TabItem, type TabsProps } from './Tabs';
export { DataTable, type Column, type DataTableProps } from './Table';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Guilloche, type GuillocheProps } from './Guilloche';
export { Tooltip, TooltipProvider, type TooltipProps } from './Tooltip';
export { Dialog, type DialogProps } from './Dialog';
export { ToastProvider } from './Toast';
export { useToast, type ToastOptions, type ToastTone } from './toastContext';
