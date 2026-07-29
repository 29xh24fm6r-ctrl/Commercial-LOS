import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CrmDomainKey, CrmRecord, CrmWorkspaceData } from '../workspace/crmWorkspaceData';
import { loadCrmWorkspaceData } from '../workspace/crmWorkspaceData';
import { CrmWriteActions } from '../workspace/CrmWriteActions';
import { deriveCrmHome, explicitPersonClassifications, relatedToCompany, relatedToPerson, searchCrm } from './crmWorkspaceSelectors';

interface Props {
  readonly section: string;
  readonly actorEmail: string;
  readonly actorSystemUserId?: string;
  readonly writeDisabledReason?: string;
}

type State = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; data: CrmWorkspaceData };

export function CrmExperience(props: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadCrmWorkspaceData().then((data) => !cancelled && setState({ kind: 'ready', data }))
      .catch((error: unknown) => !cancelled && setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }));
    return () => { cancelled = true; };
  }, [nonce]);

  if (state.kind === 'loading') return <Loading />;
  if (state.kind === 'failed') return <StatePanel title="CRM data could not be loaded" copy={state.message} tone="error" />;
  return <ReadyExperience {...props} data={state.data} refresh={() => setNonce((n) => n + 1)} />;
}

function ReadyExperience({ section, data, actorEmail, actorSystemUserId, writeDisabledReason, refresh }: Props & { data: CrmWorkspaceData; refresh: () => void }) {
  const navigate = useNavigate();
  const { recordId } = useParams();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchCrm(data, query), [data, query]);
  const companyOptions = data.organizations.records.map((r) => ({ id: r.id, label: r.title }));
  const personOptions = data.people.records.map((r) => ({ id: r.id, label: r.title }));
  const authorized = Boolean(actorSystemUserId) && !writeDisabledReason;

  if (recordId && section === 'companies') return <Company360 data={data} id={recordId} />;
  if (recordId && section === 'people') return <Person360 data={data} id={recordId} />;

  return (
    <div className="crmws__experience">
      <section className="crmws__command" aria-label="CRM command bar">
        <div className="crmws__search">
          <label htmlFor="crm-global-search">Search the relationship book</label>
          <input id="crm-global-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company, person, relationship, activity…" />
          {query && <SearchResults results={results} onOpen={(domain, id) => navigate(domain === 'organizations' ? `../companies/${id}` : domain === 'people' ? `../people/${id}` : `../${section}`)} />}
        </div>
        <CrmWriteActions authorized={authorized} actorEmail={actorEmail} actorSystemUserId={actorSystemUserId}
          disabledReason={writeDisabledReason ?? 'A governed CRM writer identity is required.'}
          companyOptions={companyOptions} personOptions={personOptions} onWritten={refresh} />
        <Link className="crmws__dealLink" to="/workspaces/banker" state={{ initialTab: 'active-deals' }}>Start governed loan deal</Link>
      </section>
      {section === 'home' && <Home data={data} />}
      {section === 'companies' && <RecordIndex title="Companies" domain="organizations" records={data.organizations.records} status={data.organizations.status} />}
      {section === 'people' && <RecordIndex title="People" domain="people" records={data.people.records} status={data.people.status} />}
      {section === 'relationships' && <RecordIndex title="Relationships" domain="relationships" records={data.relationships.records} status={data.relationships.status} />}
      {section === 'activities' && <Timeline title="Activity center" records={data.timelineEvents.records} status={data.timelineEvents.status} />}
      {section === 'tasks' && <TaskCenter data={data} />}
      {section === 'insights' && <Insights data={data} />}
      {section === 'reports' && <Reports data={data} />}
      {['opportunities','referrals','calendar'].includes(section) && <DependencySection section={section} />}
    </div>
  );
}

function Home({ data }: { data: CrmWorkspaceData }) {
  const home = useMemo(() => deriveCrmHome(data), [data]);
  return (
    <>
      {home.partialDomains.length > 0 && <div className="crmws__partial" role="status">Partial data: {home.partialDomains.join(', ')} could not be read. Available facts remain visible.</div>}
      <section className="crmws__metrics" aria-label="Relationship portfolio">
        <Metric label="Assigned companies" value={home.companyCount} source="CRM organizations" href="../companies" />
        <Metric label="Active relationships" value={home.relationshipCount} source="Active CRM relationships" href="../relationships" />
        <Metric label="People" value={home.peopleCount} source="CRM persons" href="../people" />
        <Metric label="Recent activity" value={home.recentActivityCount} source="Dated events in the last 45 days" href="../activities" />
      </section>
      <div className="crmws__twoCol">
        <section className="crmws__panel">
          <PanelHead eyebrow="TODAY & ATTENTION" title="Where the book needs a human next action" />
          {home.attention.length === 0 ? <Empty copy="No attention items can be derived from the available contact and activity facts." /> :
            <ul className="crmws__attention">{home.attention.slice(0, 12).map((item) => <li key={item.id}><Link to={`../companies/${item.company.id}`}>{item.company.title}</Link><strong>{item.kind === 'missing-contact' ? 'Missing linked contact' : 'No recent recorded contact'}</strong><span>{item.evidence}</span></li>)}</ul>}
        </section>
        <section className="crmws__panel">
          <PanelHead eyebrow="RECENT ACTIVITY" title="Confirmed relationship interactions" />
          <CompactTimeline records={home.recentActivity} />
        </section>
      </div>
      <section className="crmws__unavailableGrid" aria-label="Unavailable command center facts">
        {['Opportunities and weighted pipeline','Loan exposure and deposits','Unanswered customer communication','Service issues and risk indicators'].map((label) =>
          <div key={label}><strong>{label}</strong><span>Unavailable from the current verified CRM snapshot; no value inferred.</span></div>)}
      </section>
    </>
  );
}

function Company360({ data, id }: { data: CrmWorkspaceData; id: string }) {
  const rel = relatedToCompany(data, id);
  if (!rel.company) return <StatePanel title="Company not found" copy="The record is absent or outside the authorized CRM result set." />;
  const last = rel.activities[0];
  return <Record360 kind="Company" record={rel.company}
    summary={[['Last interaction', last?.occurredAt ? new Date(last.occurredAt).toLocaleDateString() : undefined], ['Active relationships', String(rel.relationships.length)], ['Linked people', String(rel.people.length)], ['Loan exposure', undefined]]}>
    {rel.duplicateWarning && <div className="crmws__duplicate" role="alert">Possible duplicate cluster by {rel.duplicateWarning.matchType}: {rel.duplicateWarning.organizationIds.length} records. Review only; no automatic merge occurs.</div>}
    <DetailGrid record={rel.company} />
    <RecordSection title="People and roles" missing="No linked people or governed roles are present."><RecordLinks records={[...rel.people, ...rel.roles]} domain="people" /></RecordSection>
    <RecordSection title="Relationship graph" missing="No parent, affiliate, ownership, guarantor, or adviser edges are recorded."><RecordLinks records={rel.relationships} /></RecordSection>
    <RecordSection title="Opportunities, deals, and loans" missing="Opportunity schema is not provisioned; deal and exposure facts remain in the governed LOS."><Link to="/workspaces/banker">Open Loan Workflow</Link></RecordSection>
    <RecordSection title="Activities and communications" missing="No linked CRM activity is recorded."><CompactTimeline records={rel.activities} /></RecordSection>
    <RecordSection title="Documents and relationship plan" missing="Relationship-document and plan fields are not present in the verified CRM schema. No credit documents are duplicated here." />
    <RecordSection title="Data quality and provenance"><Provenance record={rel.company} auditCount={rel.audits.length} /></RecordSection>
  </Record360>;
}

function Person360({ data, id }: { data: CrmWorkspaceData; id: string }) {
  const rel = relatedToPerson(data, id);
  if (!rel.person) return <StatePanel title="Person not found" copy="The record is absent or outside the authorized CRM result set." />;
  const classifications = explicitPersonClassifications(rel.person, rel.roles, rel.relationships);
  return <Record360 kind="Person" record={rel.person}
    summary={[['Company', rel.company?.title], ['Last interaction', rel.activities[0]?.occurredAt ? new Date(rel.activities[0].occurredAt!).toLocaleDateString() : undefined], ['Contact points', String(rel.contactPoints.length)], ['Open tasks', undefined]]}>
    <DetailGrid record={rel.person} />
    <RecordSection title="Affiliation and explicit role evidence"><RecordLinks records={[...(rel.company ? [rel.company] : []), ...rel.roles, ...rel.relationships]} domain={rel.company ? 'companies' : undefined} />{classifications.length ? <p className="crmws__classifications">Classified from recorded role text: {classifications.join(', ')}</p> : <Empty copy="Employee, owner, guarantor, referral, adviser, and internal-user classifications are unavailable because no explicit role evidence matches." />}</RecordSection>
    <RecordSection title="Contact preferences and consent" missing="No communication-preference or authorization record is linked."><RecordLinks records={[...rel.contactPoints, ...rel.preferences, ...rel.authorizations]} /></RecordSection>
    {rel.contactPoints.length === 0 && <div className="crmws__duplicate" role="status">Missing contact information: no governed phone, email, or other contact point is linked.</div>}
    <RecordSection title="Activity and commitments" missing="No linked activity is recorded."><CompactTimeline records={rel.activities} /></RecordSection>
    <RecordSection title="Duplicate and merge posture" missing="Duplicate detection is advisory. Merge remains unavailable until a merge-safe governed adapter is certified." />
  </Record360>;
}

function Record360({ kind, record, summary, children }: { kind: string; record: CrmRecord; summary: readonly (readonly [string,string|undefined])[]; children: React.ReactNode }) {
  return <article className="crmws__record360"><Link to=".." className="crmws__back">← Back to {kind === 'Company' ? 'companies' : 'people'}</Link>
    <header><div><span>{kind.toUpperCase()} 360</span><h2>{record.title}</h2><p>{record.subtitle ?? 'Classification unavailable'} · {record.badge ?? 'Status unavailable'}</p></div>
      <div className="crmws__summary">{summary.map(([label,value]) => <div key={label}><span>{label}</span><strong>{value ?? 'Unavailable'}</strong></div>)}</div></header>
    <div className="crmws__recordBody">{children}</div></article>;
}

function RecordIndex({ title, domain, records, status }: { title: string; domain: string; records: readonly CrmRecord[]; status: string }) {
  if (status === 'failed') return <StatePanel title={`${title} unavailable`} copy="This CRM domain could not be read. No empty result is implied." tone="error" />;
  return <section className="crmws__panel"><PanelHead eyebrow="RELATIONSHIP BOOK" title={title} /><div className="crmws__tableWrap"><table><thead><tr><th>Name</th><th>Classification</th><th>Status</th><th>Source</th></tr></thead><tbody>
    {records.map((r) => <tr key={r.id}><td><Link to={`${r.id}`}>{r.title}</Link></td><td>{r.subtitle ?? r.tertiary ?? 'Unavailable'}</td><td>{r.badge ?? 'Unavailable'}</td><td>Dataverse · {domain}</td></tr>)}
  </tbody></table></div>{records.length === 0 && <Empty copy={`No authorized ${title.toLowerCase()} were returned.`} />}</section>;
}

function TaskCenter({ data }: { data: CrmWorkspaceData }) {
  const tasks = data.timelineEvents.records.filter((r) => r.eventType === 'follow-up-task');
  return <Timeline title="Tasks and follow-ups" records={tasks} status={data.timelineEvents.status} empty="No follow-up task events are present. The current schema does not carry completion status, priority, or due date, so overdue metrics are unavailable." />;
}
function Insights({ data }: { data: CrmWorkspaceData }) { const home = deriveCrmHome(data); return <section className="crmws__panel"><PanelHead eyebrow="EVIDENCE-BASED" title="Relationship coverage insights" /><p>{home.attention.length} deterministic coverage gap(s) derived from linked contacts and dated activity. No composite relationship score is calculated.</p></section>; }
function Reports({ data }: { data: CrmWorkspaceData }) { return <section className="crmws__panel"><PanelHead eyebrow="GOVERNED REPORTING" title="CRM source completeness" />{Object.entries(data).map(([k,v]) => <div className="crmws__reportRow" key={k}><strong>{k}</strong><span>{v.status === 'ready' ? `${v.records.length} loaded (bounded at source)` : 'Unavailable'}</span></div>)}</section>; }
function DependencySection({ section }: { section: string }) { return <StatePanel title={`${section[0].toUpperCase()+section.slice(1)} requires a tenant dependency`} copy={`The verified ten-table CRM schema has no governed ${section} table. The workspace does not substitute LOS stages or fabricate records. See the CRM architecture runbook for the exact fail-closed dependency.`} />; }
function Timeline({ title, records, status, empty }: { title: string; records: readonly CrmRecord[]; status: string; empty?: string }) { return <section className="crmws__panel"><PanelHead eyebrow="CHRONOLOGICAL LEDGER" title={title} />{status === 'failed' ? <StatePanel title="Timeline unavailable" copy="The timeline domain could not be read." tone="error" /> : <CompactTimeline records={records} empty={empty} />}</section>; }
function CompactTimeline({ records, empty = 'No dated activity is present.' }: { records: readonly CrmRecord[]; empty?: string }) { if (!records.length) return <Empty copy={empty} />; return <ol className="crmws__timeline">{records.slice(0,30).map((r) => <li key={r.id}><time>{r.occurredAt ? new Date(r.occurredAt).toLocaleString() : 'Date unavailable'}</time><strong>{r.title}</strong><span>{r.subtitle ?? 'No summary recorded'}</span></li>)}</ol>; }
function SearchResults({ results, onOpen }: { results: ReturnType<typeof searchCrm>; onOpen: (domain: CrmDomainKey,id:string) => void }) { return <div className="crmws__searchResults" role="listbox">{results.length ? results.map(({domain,record}) => <button key={`${domain}-${record.id}`} onClick={() => onOpen(domain,record.id)}><span>{record.title}</span><small>{domain} · {record.subtitle ?? 'No classification'}</small></button>) : <p>No matching authorized CRM records.</p>}</div>; }
function Metric({ label, value, source, href }: { label:string; value?:number; source:string; href:string }) { return <Link className="crmws__metric" to={href}><span>{label}</span><strong>{value ?? '—'}</strong><small>{value === undefined ? 'Source unavailable' : source}</small></Link>; }
function PanelHead({ eyebrow,title }: { eyebrow:string; title:string }) { return <header className="crmws__panelHead"><span>{eyebrow}</span><h2>{title}</h2></header>; }
function Empty({ copy }: { copy:string }) { return <p className="crmws__empty">{copy}</p>; }
function StatePanel({ title,copy,tone }: { title:string; copy:string; tone?:string }) { return <section className={`crmws__state ${tone ?? ''}`} role={tone === 'error' ? 'alert' : 'status'}><h2>{title}</h2><p>{copy}</p></section>; }
function Loading() { return <div className="crmws__loading" aria-label="Loading CRM data">{[1,2,3,4].map((n) => <span key={n}/>)}</div>; }
function DetailGrid({ record }: { record:CrmRecord }) { return <RecordSection title="Overview">{record.detail.length ? <dl className="crmws__details">{record.detail.map((d) => <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>)}</dl> : <Empty copy="No governed profile fields are populated." />}</RecordSection>; }
function RecordSection({ title,children,missing }: { title:string; children?:React.ReactNode; missing?:string }) { return <section className="crmws__recordSection"><h3>{title}</h3>{children ?? <Empty copy={missing ?? 'No supported facts are available.'} />}</section>; }
function RecordLinks({ records,domain }: { records:readonly CrmRecord[]; domain?:string }) { if (!records.length) return null; return <ul className="crmws__recordLinks">{records.map((r) => <li key={r.id}>{domain ? <Link to={`../../${domain}/${r.id}`}>{r.title}</Link> : <strong>{r.title}</strong>}<span>{r.subtitle ?? r.badge ?? 'Classification unavailable'}</span></li>)}</ul>; }
function Provenance({ record,auditCount }: { record:CrmRecord; auditCount:number }) { return <dl className="crmws__details"><div><dt>Source</dt><dd>Internal Dataverse CRM</dd></div><div><dt>Record ID</dt><dd>{record.id}</dd></div><div><dt>Audit events loaded</dt><dd>{auditCount}</dd></div><div><dt>Classification</dt><dd>User-entered or source-projected; not independently verified by this UI</dd></div></dl>; }
