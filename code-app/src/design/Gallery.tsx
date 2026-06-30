import { useState } from 'react';
import {
  Button,
  IconButton,
  Card,
  Badge,
  Input,
  SearchField,
  Kbd,
  Tabs,
  DataTable,
  EmptyState,
  Guilloche,
  Tooltip,
  TooltipProvider,
  Dialog,
  ToastProvider,
  useToast,
  InlineEdit,
  type Column,
} from './index';
import { palette, spacing, typography } from '../shared/theme';

/**
 * Dev-only primitive gallery (rendered at /design, outside AuthGate). A living
 * reference + a place to eyeball the system in isolation without the Power Apps
 * shell. Not shipped to any production surface.
 */

interface DemoRow {
  company: string;
  stage: string;
  exposure: number;
  tone: 'clear' | 'atRisk' | 'blocked';
}

const DEMO_ROWS: DemoRow[] = [
  { company: 'Cedar & Vine Holdings', stage: 'Underwriting', exposure: 4_250_000, tone: 'clear' },
  { company: 'Harbor Freight Partners', stage: 'Committee', exposure: 1_900_000, tone: 'atRisk' },
  { company: 'Meridian Mills LLC', stage: 'Closing', exposure: 12_400_000, tone: 'clear' },
  { company: 'Ridgeline Logistics', stage: 'Intake', exposure: 760_000, tone: 'blocked' },
];

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

const COLUMNS: Column<DemoRow>[] = [
  { key: 'company', header: 'Company', cell: (r) => r.company, sortValue: (r) => r.company },
  { key: 'stage', header: 'Stage', cell: (r) => r.stage, sortValue: (r) => r.stage },
  {
    key: 'tone',
    header: 'Status',
    cell: (r) => <Badge tone={r.tone} dot>{r.tone === 'clear' ? 'On track' : r.tone === 'atRisk' ? 'At risk' : 'Blocked'}</Badge>,
  },
  { key: 'exposure', header: 'Exposure', numeric: true, cell: (r) => usd(r.exposure), sortValue: (r) => r.exposure },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: spacing.xxl }}>
      <h2 style={{ fontFamily: typography.display, fontSize: '1.4rem', color: palette.text, margin: `0 0 ${spacing.md}` }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
}

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
      <Button onClick={() => toast({ title: 'Saved', tone: 'success' })}>Success toast</Button>
      <Button onClick={() => toast({ title: 'Could not save', description: 'The write was rejected.', tone: 'error' })}>
        Error toast
      </Button>
      <Button onClick={() => toast({ title: 'Heads up', description: 'Dry-run mode is on.', tone: 'info' })}>Info toast</Button>
    </div>
  );
}

export function DesignGallery() {
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider>
      <TooltipProvider>
        <div style={{ minHeight: '100vh', background: palette.pageBg, padding: spacing.xxl }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
              <Guilloche size={56} />
              <div>
                <div className="cc-display" style={{ fontSize: typography.size.hero, color: palette.text }}>
                  Intaglio
                </div>
                <div style={{ color: palette.textMuted, fontSize: typography.size.sm }}>
                  Design system — primitive gallery (dev only)
                </div>
              </div>
            </header>
            <hr className="cc-security-rule" style={{ marginBottom: spacing.xl }} />

            <Section title="Buttons — one primary per context">
              <Button variant="primary">+ Add company</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Delete</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <IconButton label="More">⋯</IconButton>
            </Section>

            <Section title="Type scale">
              <div>
                <div className="cc-display cc-tnum" style={{ fontSize: typography.size.displayLg, color: palette.text }}>
                  $4,012,400
                </div>
                <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: typography.size.xs, color: palette.textMuted }}>
                  Pipeline (display + tabular figures)
                </div>
              </div>
            </Section>

            <Section title="Badges">
              <Badge tone="clear" dot>Funded</Badge>
              <Badge tone="atRisk" dot>Overdue</Badge>
              <Badge tone="blocked" dot>Blocked</Badge>
              <Badge tone="neutral" dot>Draft</Badge>
              <Badge tone="info" dot>In review</Badge>
            </Section>

            <Section title="Inputs">
              <div style={{ width: 240 }}>
                <Input placeholder="Company name" />
              </div>
              <div style={{ width: 240 }}>
                <SearchField placeholder="Search companies…" />
              </div>
              <span>
                Press <Kbd>⌘</Kbd> <Kbd>K</Kbd>
              </span>
            </Section>

            <Section title="Tabs">
              <div style={{ width: '100%' }}>
                <Tabs
                  aria-label="Demo tabs"
                  items={[
                    { value: 'a', label: 'Companies', content: <p style={{ color: palette.textMuted }}>Companies content.</p> },
                    { value: 'b', label: 'Contacts', content: <p style={{ color: palette.textMuted }}>Contacts content.</p> },
                    { value: 'c', label: 'Timeline', content: <p style={{ color: palette.textMuted }}>Timeline content.</p> },
                  ]}
                />
              </div>
            </Section>

            <Section title="Data table">
              <Card style={{ width: '100%', overflow: 'hidden' }}>
                <DataTable columns={COLUMNS} rows={DEMO_ROWS} rowKey={(r) => r.company} onRowActivate={() => {}} caption="Demo deals" />
              </Card>
            </Section>

            <Section title="Empty state">
              <Card pad style={{ width: '100%' }}>
                <EmptyState
                  title="No companies yet"
                  body="Add your first company to start the relationship file."
                  action={<Button variant="primary">+ Add company</Button>}
                />
              </Card>
            </Section>

            <Section title="Overlays + feedback">
              <Tooltip content="A quiet hint">
                <Button variant="secondary">Hover me</Button>
              </Tooltip>
              <Dialog
                open={open}
                onOpenChange={setOpen}
                trigger={<Button variant="secondary">Open dialog</Button>}
                title="Confirm action"
                description="This is an Intaglio dialog (Radix under the hood)."
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md }}>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => setOpen(false)}>
                    Confirm
                  </Button>
                </div>
              </Dialog>
              <ToastDemo />
            </Section>

            <Section title="Inline edit (optimistic over governed writes)">
              <Card pad style={{ width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <span style={{ fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: '0.06em', color: palette.textMuted }}>
                    Company name
                  </span>
                  <InlineEdit
                    label="Company"
                    value="Cedar & Vine Holdings"
                    onSave={(next) =>
                      new Promise((resolve, reject) =>
                        // demo: succeeds unless you type "fail"
                        next.toLowerCase().includes('fail') ? reject(new Error('Rejected by gate')) : resolve(),
                      )
                    }
                  />
                  <span style={{ fontSize: typography.size.xs, color: palette.textSubtle }}>
                    Click to edit · Enter saves · type "fail" to see the rollback
                  </span>
                </div>
              </Card>
            </Section>

            <Section title="Command palette">
              <span style={{ color: palette.textMuted }}>
                Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> (or <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>) anywhere to open it.
              </span>
            </Section>
          </div>
        </div>
      </TooltipProvider>
    </ToastProvider>
  );
}
