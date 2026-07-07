import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Badge } from '../../shared/Badge';
import { Guilloche } from '../../design';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import {
  loadCrmWorkspaceData,
  type CrmDomainKey,
  type CrmRecord,
  type CrmWorkspaceData,
} from './crmWorkspaceData';
import { CrmWriteActions, type CrmOption } from './CrmWriteActions';
import { CrmOrgFieldInlineEdit } from './CrmOrgFieldInlineEdit';
import { buildLiveCrmUpdateDeps, type CrmUpdatableOrgField } from '../write/crmUpdateAdapter';
import type { CrmWriteFns } from '../write/crmWriteActions';
import {
  loadLinkedDealsForOrganization,
  type LinkedDealsLoader,
  type LinkedDealsResult,
} from './crmLinkedDeals';

/**
 * Phase 260 — Relationship CRM (elite CRM cockpit).
 *
 * A premium commercial-banking CRM workspace: a command header, a command bar
 * (search + view tabs + filter), dashboard cards, a polished record table per
 * view, an activity timeline, and a record detail drawer. The header / command
 * bar / cards always render synchronously so the surface is never blank while
 * data loads. Empty states are useful and branded — never bare "0" cards. No
 * fabricated records; CRM stays read-only this pilot (stated once, subtly).
 */

interface Props {
  loadData?: () => Promise<CrmWorkspaceData>;
  /** Signed-in identity for governed CRM writes. */
  actorEmail?: string;
  actorSystemUserId?: string;
  /** Reason writes are disabled (no identity); when set, actions are inert. */
  writeDisabledReason?: string;
  /** Injected for tests; defaults to the live governed writes. */
  writeFns?: CrmWriteFns;
  /** Record-scoped linked-deals reader (F4); defaults to the live read. */
  loadLinkedDeals?: LinkedDealsLoader;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: CrmWorkspaceData }
  | { kind: 'failed'; message: string };

type CrmView = 'companies' | 'contacts' | 'relationships' | 'activities' | 'vendors' | 'timeline';

interface ViewSpec {
  readonly key: CrmView;
  readonly label: string;
  readonly domain: CrmDomainKey;
  readonly timeline?: boolean;
  /** Column header for the record's primary field. */
  readonly primaryCol: string;
  readonly secondaryCol: string;
  /** Bank-user empty heading + guidance. */
  readonly emptyHeading: string;
  readonly emptyGuidance: string;
}

const VIEWS: readonly ViewSpec[] = [
  { key: 'companies', label: 'Companies', domain: 'organizations', primaryCol: 'Company', secondaryCol: 'Industry / type', emptyHeading: 'No companies yet', emptyGuidance: 'Companies you manage will appear here once relationships are loaded or entered.' },
  { key: 'contacts', label: 'Contacts', domain: 'people', primaryCol: 'Name', secondaryCol: 'Role / title', emptyHeading: 'No contacts yet', emptyGuidance: 'Key people across your relationships will appear here as contacts are added.' },
  { key: 'relationships', label: 'Relationships', domain: 'relationships', primaryCol: 'Relationship', secondaryCol: 'Role', emptyHeading: 'No relationships yet', emptyGuidance: 'Connections between companies, people, and deals will appear here.' },
  { key: 'activities', label: 'Activities', domain: 'timelineEvents', timeline: true, primaryCol: 'Activity', secondaryCol: 'Summary', emptyHeading: 'No CRM activity yet', emptyGuidance: 'Log a call, meeting, or note once CRM updates are enabled.' },
  { key: 'vendors', label: 'Vendors', domain: 'vendorProfiles', primaryCol: 'Vendor', secondaryCol: 'Type', emptyHeading: 'No vendors yet', emptyGuidance: 'Approved vendors (title, appraisal, insurance, legal) will appear here.' },
  { key: 'timeline', label: 'Timeline', domain: 'timelineEvents', timeline: true, primaryCol: 'Activity', secondaryCol: 'Summary', emptyHeading: 'No CRM activity yet', emptyGuidance: 'Log a call, meeting, or note once CRM updates are enabled.' },
];

export function CrmHubWorkspace({
  loadData = loadCrmWorkspaceData,
  actorEmail,
  actorSystemUserId,
  writeDisabledReason,
  writeFns,
  loadLinkedDeals = loadLinkedDealsForOrganization,
}: Props = {}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [view, setView] = useState<CrmView>('companies');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CrmRecord | undefined>(undefined);
  const [reloadNonce, setReloadNonce] = useState(0);

  const authorized = !writeDisabledReason && Boolean(actorSystemUserId);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reload control intentionally returns the workspace to loading.
    setState({ kind: 'loading' });
    loadData()
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [loadData, reloadNonce]);

  const spec = useMemo(() => VIEWS.find((v) => v.key === view)!, [view]);

  const optionsFor = (domain: CrmDomainKey): CrmOption[] => {
    if (state.kind !== 'ready') return [];
    const r = state.data[domain];
    return r.status === 'ready' ? r.records.map((rec) => ({ id: rec.id, label: rec.title })) : [];
  };
  const companyOptions = useMemo(() => optionsFor('organizations'), [state]);
  const personOptions = useMemo(() => optionsFor('people'), [state]);

  // Follow-up tasks live in the timeline domain (eventType 'follow-up-task'); count
  // them so the "Follow-ups due" / "Open tasks" cards read real data, not undefined.
  const taskCount = useMemo(() => {
    if (state.kind !== 'ready') return undefined;
    const t = state.data.timelineEvents;
    return t.status === 'ready' ? t.records.filter((r) => r.eventType === 'follow-up-task').length : undefined;
  }, [state]);

  const count = (domain: CrmDomainKey): number | undefined => {
    if (state.kind !== 'ready') return undefined;
    const r = state.data[domain];
    return r.status === 'ready' ? r.records.length : undefined;
  };

  // Keyboard-first navigation for the CRM lists: "/" focuses search, j/k move
  // row focus, Enter opens (handled on the row). Ignored while typing in a field.
  function onListKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    if (e.key === '/' && !typing) {
      e.preventDefault();
      e.currentTarget.querySelector<HTMLInputElement>('[data-crm-search]')?.focus();
      return;
    }
    if ((e.key === 'j' || e.key === 'k') && !typing) {
      const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-crm-record]'));
      if (rows.length === 0) return;
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? rows.indexOf(active) : -1;
      const nextIdx =
        e.key === 'j' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx <= 0 ? 0 : idx - 1);
      rows[nextIdx]?.focus();
    }
  }

  const records = useMemo(() => {
    if (state.kind !== 'ready') return undefined;
    const r = state.data[spec.domain];
    if (r.status !== 'ready') return null; // unavailable
    const q = query.trim().toLowerCase();
    if (q.length === 0) return r.records;
    return r.records.filter(
      (rec) => rec.title.toLowerCase().includes(q) || (rec.subtitle ?? '').toLowerCase().includes(q),
    );
  }, [state, spec.domain, query]);

  return (
    <section style={styles.wrap} aria-label="Relationship CRM" data-crm-hub="workspace" onKeyDown={onListKeyDown}>
      {/* Command header */}
      <header style={styles.header} data-crm-header>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Relationship CRM</h1>
          <p style={styles.subtitle}>Manage companies, contacts, relationships, activities, and follow-ups.</p>
        </div>
        <div style={styles.headerActions} aria-label="CRM actions">
          <CrmWriteActions
            authorized={authorized}
            actorEmail={actorEmail}
            actorSystemUserId={actorSystemUserId}
            disabledReason={writeDisabledReason}
            companyOptions={companyOptions}
            personOptions={personOptions}
            writeFns={writeFns}
            onWritten={() => setReloadNonce((n) => n + 1)}
          />
        </div>
      </header>
      {/* The engraved security rule — the one place the Seal-Red identity marks
          the primary page header. */}
      <hr className="cc-security-rule" style={{ marginTop: `-${spacing.sm}` }} />

      {/* Command bar */}
      <div style={styles.commandBar} data-crm-command-bar>
        <label style={styles.search} aria-label="Search relationships">
          <span style={styles.searchIcon} aria-hidden="true">⌕</span>
          <input
            style={styles.searchInput}
            placeholder="Search companies, contacts, relationships…"
            value={query}
            data-crm-search
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div style={styles.viewTabs} role="tablist" aria-label="CRM views">
          {VIEWS.map((v) => {
            const active = v.key === view;
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={active}
                style={active ? styles.viewTabActive : styles.viewTab}
                data-crm-view={v.key}
                onClick={() => {
                  setView(v.key);
                  setSelected(undefined);
                }}
              >
                {v.label}
                {count(v.domain) !== undefined && count(v.domain)! > 0 && (
                  <span style={styles.viewTabCount}>{count(v.domain)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dashboard cards */}
      <div style={styles.cardRow} data-crm-cards>
        <DashCard label="Companies" value={count('organizations')} loading={state.kind === 'loading'} empty="Add companies to start" onClick={() => setView('companies')} />
        <DashCard label="Contacts" value={count('people')} loading={state.kind === 'loading'} empty="Add people to relationships" onClick={() => setView('contacts')} />
        <DashCard label="Active relationships" value={count('relationships')} loading={state.kind === 'loading'} empty="Map your relationships" onClick={() => setView('relationships')} />
        <DashCard label="Follow-ups due" value={taskCount} loading={state.kind === 'loading'} empty="No follow-ups scheduled" onClick={() => setView('activities')} />
        <DashCard label="Recent activity" value={count('timelineEvents')} loading={state.kind === 'loading'} empty="No activity logged yet" onClick={() => setView('timeline')} />
        <DashCard label="Open tasks" value={taskCount} loading={state.kind === 'loading'} empty="No CRM tasks yet" onClick={() => setView('activities')} />
      </div>

      {/* Main area */}
      <div style={styles.main} data-crm-main>
        {state.kind === 'loading' && <SkeletonRows />}
        {state.kind === 'failed' && (
          <FriendlyError
            heading="CRM is taking a moment"
            body="We couldn't load your relationship records just now. Refresh to try again — nothing is lost."
          />
        )}
        {state.kind === 'ready' && records === null && (
          <FriendlyError heading={`${spec.label} are unavailable`} body="This section couldn't load. Other CRM views may still be available." />
        )}
        {state.kind === 'ready' && records && records.length === 0 && (
          <EmptyState heading={spec.emptyHeading} guidance={spec.emptyGuidance} />
        )}
        {state.kind === 'ready' && records && records.length > 0 && (
          spec.timeline ? (
            <ActivityTimeline records={records} onOpen={setSelected} />
          ) : (
            <RecordTable spec={spec} records={records} selectedId={selected?.id} onOpen={setSelected} />
          )
        )}
      </div>

      {selected && (
        <DetailDrawer
          record={selected}
          view={spec.label}
          isOrganization={spec.domain === 'organizations'}
          data={state.kind === 'ready' ? state.data : undefined}
          actor={{ actorEmail, actorSystemUserId, authorized, writeDisabledReason }}
          writeFns={writeFns}
          loadLinkedDeals={loadLinkedDeals}
          onWritten={() => setReloadNonce((n) => n + 1)}
          onClose={() => setSelected(undefined)}
        />
      )}

      <footer style={styles.footer} data-crm-footer>
        Every change you make here is verified and recorded for the relationship file.
      </footer>
    </section>
  );
}

function DashCard({ label, value, loading, empty, onClick }: { label: string; value: number | undefined; loading: boolean; empty: string; onClick?: () => void }) {
  const interactive = typeof onClick === 'function';
  const body = (
    <>
      <span style={styles.cardLabel}>{label}</span>
      {loading ? (
        <span style={styles.cardSkeleton} aria-hidden="true" />
      ) : value === undefined || value === 0 ? (
        <span style={styles.cardEmpty}>{empty}</span>
      ) : (
        <span style={styles.cardValue}>{value}</span>
      )}
    </>
  );
  return interactive ? (
    <button type="button" className="cc-tile-lift" style={styles.card} data-crm-card={label} onClick={onClick}>{body}</button>
  ) : (
    <div style={styles.card} data-crm-card={label}>{body}</div>
  );
}

function RecordTable({ spec, records, selectedId, onOpen }: { spec: ViewSpec; records: readonly CrmRecord[]; selectedId: string | undefined; onOpen: (r: CrmRecord) => void }) {
  return (
    <table style={styles.table} data-crm-table={spec.key}>
      <thead>
        <tr>
          <th style={styles.th}>{spec.primaryCol}</th>
          <th style={styles.th}>{spec.secondaryCol}</th>
          <th style={styles.th}>Status</th>
          <th style={styles.thRight}></th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr
            key={r.id}
            style={r.id === selectedId ? styles.rowActive : styles.row}
            data-crm-record={r.id}
            role="button"
            tabIndex={0}
            aria-label={`Open ${r.title}`}
            onClick={() => onOpen(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(r);
              }
            }}
          >
            <td style={styles.tdStrong}>{r.title}</td>
            <td style={styles.td}>{r.subtitle ?? '—'}</td>
            <td style={styles.td}>{r.badge ? <Badge variant="neutral" appearance="outline">{r.badge}</Badge> : '—'}</td>
            <td style={styles.tdRight}><span style={styles.openLink}>Open →</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActivityTimeline({ records, onOpen }: { records: readonly CrmRecord[]; onOpen: (r: CrmRecord) => void }) {
  return (
    <ol style={styles.timeline} data-crm-timeline>
      {records.map((r) => (
        <li key={r.id} style={styles.timelineItem}>
          <span style={styles.timelineDot} aria-hidden="true" />
          <button
            type="button"
            style={styles.timelineCard}
            data-crm-record={r.id}
            onClick={() => onOpen(r)}
          >
            <div style={styles.timelineHead}>
              <span style={styles.timelineTitle}>{r.title}</span>
              {r.occurredAt && <span style={styles.timelineWhen}>{formatWhen(r.occurredAt)}</span>}
            </div>
            {r.subtitle && <span style={styles.timelineSub}>{r.subtitle}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** CRM-G — the safe, free-text company fields exposed for governed inline edit in the drawer. */
const ORG_EDIT_FIELDS: ReadonlyArray<{ field: CrmUpdatableOrgField; label: string }> = [
  { field: 'cr664_industry', label: 'Industry' },
  { field: 'cr664_website', label: 'Website' },
  { field: 'cr664_notes', label: 'Notes' },
];

/** Seed an inline-edit field from the record's already-displayed overview detail (by label). */
function detailValueByLabel(record: CrmRecord, label: string): string {
  const hit = record.detail.find((d) => d.label.toLowerCase() === label.toLowerCase());
  return hit?.value ?? '';
}

function DetailDrawer({
  record,
  view,
  isOrganization,
  data,
  actor,
  writeFns,
  loadLinkedDeals,
  onWritten,
  onClose,
}: {
  record: CrmRecord;
  view: string;
  isOrganization: boolean;
  data: CrmWorkspaceData | undefined;
  actor: { actorEmail?: string; actorSystemUserId?: string; authorized: boolean; writeDisabledReason?: string };
  writeFns?: CrmWriteFns;
  loadLinkedDeals: LinkedDealsLoader;
  onWritten: () => void;
  onClose: () => void;
}) {
  const domain = (key: CrmDomainKey): readonly CrmRecord[] => {
    if (!data) return [];
    const r = data[key];
    return r.status === 'ready' ? r.records : [];
  };

  // F4 — linked deals are a record-scoped read (deals aren't in the workspace load).
  const [linkedDeals, setLinkedDeals] = useState<LinkedDealsResult | undefined>(undefined);
  useEffect(() => {
    if (!isOrganization) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Record changes must clear stale linked-deal rows before the scoped read returns.
    setLinkedDeals(undefined);
    loadLinkedDeals(record.id)
      .then((r) => {
        if (!cancelled) setLinkedDeals(r);
      })
      .catch(() => {
        if (!cancelled) setLinkedDeals({ status: 'unavailable', reason: 'Linked deals are not available for this record yet.' });
      });
    return () => {
      cancelled = true;
    };
  }, [isOrganization, record.id, loadLinkedDeals]);
  // Related records for a company — filtered from the ALREADY-LOADED workspace data
  // (no new reads): people by employer org; timeline events by linked org, split
  // into activities vs follow-up tasks by event type.
  const contacts = isOrganization ? domain('people').filter((r) => r.organizationId === record.id) : [];
  const timeline = isOrganization ? domain('timelineEvents').filter((r) => r.organizationId === record.id) : [];
  const activities = timeline.filter((r) => r.eventType !== 'follow-up-task');
  const tasks = timeline.filter((r) => r.eventType === 'follow-up-task');

  const companyOptions: CrmOption[] = domain('organizations').map((r) => ({ id: r.id, label: r.title }));
  const personOptions: CrmOption[] = domain('people').map((r) => ({ id: r.id, label: r.title }));

  // CRM-G — governed inline-edit deps (dynamic generated-service import happens only on save).
  const orgUpdateDeps = buildLiveCrmUpdateDeps();

  return (
    <aside style={styles.drawer} role="dialog" aria-label={`${view} detail`} data-crm-detail-drawer>
      <div style={styles.drawerHead}>
        <div>
          <div style={styles.drawerEyebrow}>{view}</div>
          <div style={styles.drawerTitle}>{record.title}</div>
          {record.subtitle && <div style={styles.drawerSub}>{record.subtitle}</div>}
        </div>
        <button type="button" style={styles.drawerClose} aria-label="Close detail" data-crm-detail-close onClick={onClose}>✕</button>
      </div>
      {record.badge && <div><Badge variant="neutral" appearance="outline">{record.badge}</Badge></div>}

      <DrawerSection title="Overview">
        {record.detail.length === 0 ? (
          <div style={styles.drawerMuted}>No additional detail recorded.</div>
        ) : (
          <dl style={styles.detailList}>
            {record.detail.map((d) => (
              <div key={d.label} style={styles.detailRow}>
                <dt style={styles.detailLabel}>{d.label}</dt>
                <dd style={styles.detailValue}>{d.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </DrawerSection>

      {isOrganization && (
        <DrawerSection title="Record actions">
          <CrmWriteActions
            authorized={actor.authorized}
            actorEmail={actor.actorEmail}
            actorSystemUserId={actor.actorSystemUserId}
            disabledReason={actor.writeDisabledReason}
            companyOptions={companyOptions}
            personOptions={personOptions}
            writeFns={writeFns}
            presetOrganizationId={record.id}
            actions={['contact', 'activity', 'task', 'relationship']}
            onWritten={onWritten}
          />
        </DrawerSection>
      )}

      {isOrganization && (
        <DrawerSection title="Edit company details">
          <dl style={styles.detailList}>
            {ORG_EDIT_FIELDS.map((f) => (
              <div key={f.field} style={styles.detailRow}>
                <dt style={styles.detailLabel}>{f.label}</dt>
                <dd style={styles.detailValue}>
                  <CrmOrgFieldInlineEdit
                    organizationId={record.id}
                    field={f.field}
                    label={f.label}
                    value={detailValueByLabel(record, f.label)}
                    actor={{ authorized: actor.authorized, actorEmail: actor.actorEmail, actorSystemUserId: actor.actorSystemUserId }}
                    deps={orgUpdateDeps}
                    disabledReason={actor.writeDisabledReason ?? 'Sign-in identity is still resolving; CRM editing will enable shortly.'}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </DrawerSection>
      )}

      <DrawerSection title="Linked deals">
        {!isOrganization ? (
          <div style={styles.drawerMuted}>Linked deals appear on a company record.</div>
        ) : linkedDeals === undefined ? (
          <div style={styles.drawerMuted}>Loading linked deals…</div>
        ) : linkedDeals.status === 'unavailable' ? (
          <div style={styles.drawerMuted}>{linkedDeals.reason}</div>
        ) : linkedDeals.deals.length === 0 ? (
          <div style={styles.drawerMuted}>No deals are linked to this company yet.</div>
        ) : (
          <ul style={styles.relatedList} data-crm-related="deal">
            {linkedDeals.deals.map((d) => (
              <li key={d.id} style={styles.relatedItem} data-crm-related-item={d.id}>
                <span style={styles.relatedTitle}>{d.name}</span>
                <span style={styles.relatedSub}>{[d.stage, d.status, d.amount].filter(Boolean).join(' · ') || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection title="Contacts">
        {isOrganization && contacts.length > 0 ? (
          <RelatedList records={contacts} kind="contact" />
        ) : (
          <div style={styles.drawerMuted}>No contacts linked to this company yet.</div>
        )}
      </DrawerSection>

      <DrawerSection title="Activities & notes">
        {isOrganization && activities.length > 0 ? (
          <RelatedTimeline records={activities} />
        ) : (
          <div style={styles.drawerMuted}>No activity logged for this record yet.</div>
        )}
      </DrawerSection>

      <DrawerSection title="Tasks & follow-ups">
        {isOrganization && tasks.length > 0 ? (
          <RelatedList records={tasks} kind="task" />
        ) : (
          <div style={styles.drawerMuted}>No follow-ups scheduled.</div>
        )}
      </DrawerSection>
    </aside>
  );
}

function RelatedList({ records, kind }: { records: readonly CrmRecord[]; kind: 'contact' | 'task' }) {
  return (
    <ul style={styles.relatedList} data-crm-related={kind}>
      {records.map((r) => (
        <li key={r.id} style={styles.relatedItem} data-crm-related-item={r.id}>
          <span style={styles.relatedTitle}>{r.title}</span>
          {r.subtitle && <span style={styles.relatedSub}>{r.subtitle}</span>}
        </li>
      ))}
    </ul>
  );
}

function RelatedTimeline({ records }: { records: readonly CrmRecord[] }) {
  const sorted = [...records].sort(
    (a, b) => (a.occurredAt ? Date.parse(a.occurredAt) : 0) - (b.occurredAt ? Date.parse(b.occurredAt) : 0),
  ).reverse();
  return (
    <ul style={styles.relatedList} data-crm-related="activity">
      {sorted.map((r) => (
        <li key={r.id} style={styles.relatedItem} data-crm-related-item={r.id}>
          <span style={styles.relatedTitle}>{r.subtitle ?? r.title}</span>
          {r.occurredAt && <span style={styles.relatedSub}>{formatWhen(r.occurredAt)}</span>}
        </li>
      ))}
    </ul>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.drawerSection}>
      <div style={styles.drawerSectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ heading, guidance }: { heading: string; guidance: string }) {
  return (
    <div style={styles.empty} data-crm-empty>
      <Guilloche size={96} opacity={0.42} />
      <div style={styles.emptyHeading}>{heading}</div>
      <p style={styles.emptyGuidance}>{guidance}</p>
    </div>
  );
}

function FriendlyError({ heading, body }: { heading: string; body: string }) {
  return (
    <div style={styles.empty} role="alert" data-crm-error>
      <div style={styles.emptyMark} aria-hidden="true">⟳</div>
      <div style={styles.emptyHeading}>{heading}</div>
      <p style={styles.emptyGuidance}>{body}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div style={styles.skeletonWrap} aria-hidden="true" data-crm-skeleton>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={styles.skeletonRow} />
      ))}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: spacing.xs, padding: `${spacing.md} ${spacing.lg}`,
  background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md,
  boxShadow: shadow.elevated, textAlign: 'left', fontFamily: typography.family, cursor: 'pointer', minHeight: 78,
};

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg,
    padding: `${spacing.lg} ${spacing.xl}`, background: palette.primaryBg, border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.lg, boxShadow: shadow.card,
  },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  title: { margin: 0, fontFamily: typography.display, fontSize: typography.size.display, fontWeight: typography.weight.semibold, color: palette.text, letterSpacing: typography.letterSpacing.hero, lineHeight: 1.05 },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.md },
  headerActions: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  governChip: { fontSize: typography.size.xs, color: palette.infoFg, background: palette.infoBg, border: `1px solid ${palette.info}`, padding: `4px ${spacing.md}`, borderRadius: radius.pill, fontWeight: typography.weight.semibold, whiteSpace: 'nowrap' },
  commandBar: { display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  search: { display: 'inline-flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.xs} ${spacing.md}`, background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: radius.pill, minWidth: 300, flex: 1, maxWidth: 460 },
  searchIcon: { color: palette.textSubtle, fontSize: typography.size.md },
  searchInput: { flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: typography.size.sm, color: palette.text, fontFamily: typography.family },
  viewTabs: { display: 'inline-flex', gap: spacing.xs, borderBottom: `1px solid ${palette.border}`, flexWrap: 'wrap', flex: 1, minWidth: 0 },
  viewTab: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', borderBottom: '2px solid transparent', marginBottom: -1, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.textMuted, cursor: 'pointer', fontFamily: typography.family },
  viewTabActive: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', borderBottom: `2px solid ${palette.accent}`, marginBottom: -1, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text, cursor: 'pointer', fontFamily: typography.family },
  viewTabCount: { fontSize: typography.size.xs, color: palette.textSubtle, background: palette.surfaceAlt, borderRadius: radius.pill, padding: '0 6px', fontWeight: typography.weight.semibold },
  cardRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.sm },
  card,
  cardLabel: { fontSize: typography.size.xs, color: palette.textMuted, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  cardValue: { fontFamily: typography.display, fontSize: typography.size.display, fontWeight: typography.weight.semibold, color: palette.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', lineHeight: 1.05 },
  cardEmpty: { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.medium },
  cardSkeleton: { width: 48, height: 22, borderRadius: radius.sm, background: palette.surfaceAlt },
  main: { minHeight: 220, position: 'relative' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, overflow: 'hidden' },
  th: { textAlign: 'left', padding: `${spacing.sm} ${spacing.md}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  thRight: { padding: `${spacing.sm} ${spacing.md}`, borderBottom: `1px solid ${palette.divider}` },
  row: { cursor: 'pointer', borderBottom: `1px solid ${palette.divider}` },
  rowActive: { cursor: 'pointer', borderBottom: `1px solid ${palette.divider}`, background: palette.cobaltBg },
  td: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, borderBottom: `1px solid ${palette.divider}` },
  tdStrong: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontWeight: typography.weight.semibold, borderBottom: `1px solid ${palette.divider}` },
  tdRight: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, borderBottom: `1px solid ${palette.divider}`, textAlign: 'right' },
  openLink: { color: palette.cobalt, fontWeight: typography.weight.semibold, fontSize: typography.size.sm, whiteSpace: 'nowrap' },
  timeline: { listStyle: 'none', margin: 0, padding: `${spacing.sm} 0 ${spacing.sm} ${spacing.lg}`, display: 'flex', flexDirection: 'column', gap: spacing.sm, borderLeft: `2px solid ${palette.divider}` },
  timelineItem: { position: 'relative', paddingLeft: spacing.md },
  timelineDot: { position: 'absolute', left: -7, top: 14, width: 10, height: 10, borderRadius: radius.pill, background: palette.cobalt, border: `2px solid ${palette.surface}` },
  timelineCard: { width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: `${spacing.sm} ${spacing.md}`, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, cursor: 'pointer', fontFamily: typography.family },
  timelineHead: { display: 'flex', justifyContent: 'space-between', gap: spacing.sm },
  timelineTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text },
  timelineWhen: { fontSize: typography.size.xs, color: palette.textSubtle },
  timelineSub: { fontSize: typography.size.xs, color: palette.textMuted },
  drawer: { background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.elevated, padding: `${spacing.md} ${spacing.lg}`, display: 'flex', flexDirection: 'column', gap: spacing.md },
  drawerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  drawerEyebrow: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  drawerTitle: { fontFamily: typography.display, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text, letterSpacing: '-0.01em' },
  drawerSub: { fontSize: typography.size.sm, color: palette.textMuted },
  drawerClose: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: typography.size.md, color: palette.textMuted },
  drawerSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs, borderTop: `1px solid ${palette.divider}`, paddingTop: spacing.sm },
  drawerSectionTitle: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  drawerMuted: { color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic' },
  relatedList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  relatedItem: { display: 'flex', flexDirection: 'column', gap: 1, padding: `${spacing.xs} ${spacing.sm}`, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm },
  relatedTitle: { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.medium },
  relatedSub: { fontSize: typography.size.xs, color: palette.textMuted },
  detailList: { margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  detailRow: { display: 'grid', gridTemplateColumns: '150px 1fr', gap: spacing.sm },
  detailLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  detailValue: { margin: 0, fontSize: typography.size.sm, color: palette.text, wordBreak: 'break-word' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.xs, textAlign: 'center', padding: `${spacing.xxl} ${spacing.xl}`, background: palette.surface, border: `1px dashed ${palette.border}`, borderRadius: radius.md },
  emptyMark: { fontSize: 34, color: palette.textSubtle },
  emptyHeading: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  emptyGuidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, maxWidth: 420, lineHeight: typography.lineHeight.snug },
  skeletonWrap: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  skeletonRow: { height: 44, borderRadius: radius.sm, background: palette.surfaceAlt, border: `1px solid ${palette.divider}` },
  footer: { color: palette.textSubtle, fontSize: typography.size.xs, paddingTop: spacing.xs, borderTop: `1px solid ${palette.divider}` },
};
