// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, Card, Badge, Input, SearchField, DataTable, EmptyState, Guilloche, type Column } from './index';

/**
 * Phase 2 — primitive library certification.
 *
 * Pins the system's hard rules: the single-primary class is applied only to
 * primary buttons, semantic tones map to the right classes, the data table sorts
 * + activates rows by keyboard, and the empty state renders one action.
 */

describe('Button', () => {
  it('defaults to secondary (primary is always a deliberate choice)', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('ig-btn--secondary');
    expect(btn.className).not.toContain('ig-btn--primary');
  });

  it('applies the single Seal-Red primary class only when asked', () => {
    render(<Button variant="primary">+ Add company</Button>);
    expect(screen.getByRole('button', { name: '+ Add company' }).className).toContain('ig-btn--primary');
  });

  it('is a real button with type=button by default and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toHaveAttribute('type', 'button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Badge tones', () => {
  it.each([
    ['blocked', 'ig-badge--blocked'],
    ['atRisk', 'ig-badge--atRisk'],
    ['clear', 'ig-badge--clear'],
    ['neutral', 'ig-badge--neutral'],
    ['info', 'ig-badge--info'],
  ] as const)('%s tone maps to %s', (tone, cls) => {
    render(<Badge tone={tone}>x</Badge>);
    expect(screen.getByText('x').className).toContain(cls);
  });
});

describe('Card / Input / SearchField render', () => {
  it('Card renders children', () => {
    render(<Card pad>inside</Card>);
    expect(screen.getByText('inside')).toBeInTheDocument();
  });
  it('SearchField exposes an accessible label', () => {
    render(<SearchField label="Search companies" />);
    expect(screen.getByLabelText('Search companies')).toBeInTheDocument();
  });
  it('Input forwards props', () => {
    render(<Input placeholder="Company" />);
    expect(screen.getByPlaceholderText('Company')).toBeInTheDocument();
  });
});

interface R { name: string; amt: number }
const COLS: Column<R>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
  { key: 'amt', header: 'Amount', numeric: true, cell: (r) => r.amt, sortValue: (r) => r.amt },
];

describe('DataTable', () => {
  const rows: R[] = [
    { name: 'Beta', amt: 200 },
    { name: 'Alpha', amt: 100 },
  ];

  it('renders rows and aligns numeric cells', () => {
    render(<DataTable columns={COLS} rows={rows} rowKey={(r) => r.name} />);
    expect(screen.getByText('Beta')).toBeInTheDocument();
    // numeric header carries the tabular class
    expect(screen.getByText('Amount').className).toContain('ig-num');
  });

  it('sorts ascending when a sortable header is clicked', () => {
    render(<DataTable columns={COLS} rows={rows} rowKey={(r) => r.name} />);
    const header = screen.getByText('Name');
    fireEvent.click(header);
    const cells = screen.getAllByRole('cell').filter((c) => /Alpha|Beta/.test(c.textContent ?? ''));
    expect(cells[0]).toHaveTextContent('Alpha');
  });

  it('activates a row via Enter when onRowActivate is provided', () => {
    const onActivate = vi.fn();
    render(<DataTable columns={COLS} rows={rows} rowKey={(r) => r.name} onRowActivate={onActivate} />);
    const firstRow = screen.getByText('Beta').closest('tr')!;
    fireEvent.keyDown(firstRow, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledOnce();
  });
});

describe('EmptyState', () => {
  it('renders one title, body and action', () => {
    render(<EmptyState title="No companies yet" body="Add your first company." action={<Button variant="primary">+ Add company</Button>} />);
    expect(screen.getByText('No companies yet')).toBeInTheDocument();
    expect(screen.getByText('Add your first company.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add company' }).className).toContain('ig-btn--primary');
  });
});

describe('Guilloche', () => {
  it('is decorative by default (aria-hidden, no img role)', () => {
    const { container } = render(<Guilloche />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
  it('exposes a label + img role when titled', () => {
    render(<Guilloche title="Old Glory Bank seal" />);
    expect(screen.getByRole('img', { name: 'Old Glory Bank seal' })).toBeInTheDocument();
  });
});
