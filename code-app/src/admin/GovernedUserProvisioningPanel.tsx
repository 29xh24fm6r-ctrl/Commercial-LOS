import { useMemo, useState, type CSSProperties } from 'react';
import { useAdmin } from './AdminContext';
import {
  LOS_PRODUCTION,
  LOS_ROLES,
  LOS_WORKSPACES,
  PROVISIONING_TEMPLATES,
  createPowerAppsUserProvisioningClient,
  normalizeOldGloryUpn,
  validateProvisioningRequest,
  type LosRole,
  type LosWorkspace,
  type ProvisioningClient,
  type ProvisioningResult,
  type ProvisioningTemplate,
  type VerifiedMicrosoftIdentity,
} from './governedUserProvisioning';
import { palette, radius, spacing, typography } from '../shared/theme';

type Step = 'closed' | 'verify' | 'configure' | 'review' | 'result';

export function GovernedUserProvisioningPanel({
  client = createPowerAppsUserProvisioningClient(),
  onCompleted,
}: {
  client?: ProvisioningClient;
  onCompleted?: () => void;
}) {
  const admin = useAdmin();
  const [step, setStep] = useState<Step>('closed');
  const [email, setEmail] = useState('');
  const [identity, setIdentity] = useState<VerifiedMicrosoftIdentity | null>(null);
  const [template, setTemplate] = useState<ProvisioningTemplate>('Banker Tester');
  const [role, setRole] = useState<LosRole>('Banker');
  const [workspace, setWorkspace] = useState<LosWorkspace>('Banker Workspace');
  const [additional, setAdditional] = useState<LosWorkspace[]>([]);
  const [banker, setBanker] = useState(true);
  const [adminAccess, setAdminAccess] = useState(false);
  const [active, setActive] = useState(true);
  const [adminConfirmed, setAdminConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProvisioningResult | null>(null);

  const request = useMemo(() => identity ? ({
    microsoftSystemUserId: identity.systemUserId,
    upn: identity.upn,
    fullName: identity.fullName,
    roleCode: role,
    primaryWorkspaceCode: workspace,
    additionalWorkspaceCodes: additional,
    bankerRequired: banker,
    adminAccessRequired: adminAccess,
    active,
    adminConfirmation: adminConfirmed,
    environmentId: LOS_PRODUCTION.environmentId,
  } as const) : null, [identity, role, workspace, additional, banker, adminAccess, active, adminConfirmed]);

  function applyTemplate(value: ProvisioningTemplate) {
    const next = PROVISIONING_TEMPLATES[value];
    setTemplate(value); setRole(next.roleCode); setWorkspace(next.primaryWorkspaceCode);
    setAdditional([...next.additionalWorkspaceCodes]); setBanker(next.bankerRequired);
    setAdminAccess(next.adminAccessRequired); setActive(next.active); setAdminConfirmed(false); setError('');
  }

  async function verify() {
    setBusy(true); setError(''); setIdentity(null);
    try {
      const found = await client.verify(normalizeOldGloryUpn(email));
      setIdentity(found);
      if (found.status === 'existing_los_user') setError(`Existing LOS user found (${found.existingStatus ?? 'complete'}). Use the access controls above to change this user; inactive or partial chains require explicit remediation.`);
      else setStep('configure');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  function review() {
    if (!request) return;
    try { validateProvisioningRequest(request); setError(''); setStep('review'); }
    catch (cause) { setError(message(cause)); }
  }

  async function create() {
    if (!request) return;
    setBusy(true); setError('');
    try {
      const completed = await client.provision(request);
      setResult(completed); setStep('result'); onCompleted?.();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  if (step === 'closed') return <div style={s.card} data-user-provisioning="closed"><div><strong>Add a new LOS user</strong><p style={s.copy}>Verify an existing Microsoft identity, then create the complete governed LOS access chain.</p></div><button style={s.primary} onClick={() => setStep('verify')}>+ Add New User</button></div>;

  return <section style={s.panel} data-user-provisioning={step} aria-label="Governed user provisioning">
    <header><h4 style={s.title}>Add New User</h4><div style={s.env}>Writing is locked to <strong>{LOS_PRODUCTION.environmentName}</strong> · Environment ID {LOS_PRODUCTION.environmentId}</div></header>
    <div style={s.steps}>Verify identity → Configure access → Review → Verified result</div>
    {error && <div role="alert" style={s.error}>{error}</div>}

    {step === 'verify' && <div style={s.grid}>
      <label style={s.field}>Old Glory Bank email<input aria-label="Old Glory Bank email" style={s.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@oldglorybank.com" /></label>
      <div style={s.actions}><button style={s.primary} disabled={busy} onClick={verify}>{busy ? 'Verifying…' : 'Verify User'}</button><button style={s.secondary} onClick={() => setStep('closed')}>Cancel</button></div>
    </div>}

    {identity && step !== 'result' && <div style={s.identity} data-verified-identity><strong>Microsoft user found in Commercial LOS Production</strong><span>{identity.fullName} · {identity.upn}</span><span>System user ID: {identity.systemUserId}</span><span>Business unit: {identity.businessUnit} · Status: {identity.enabled ? 'Enabled' : 'Disabled'}</span><span>Dataverse roles: {identity.baseDataverseRoles.join(', ') || 'Required base role not found'}</span></div>}

    {step === 'configure' && identity && <div style={s.grid}>
      <label style={s.field}>Template<select aria-label="Provisioning template" style={s.input} value={template} onChange={(e) => applyTemplate(e.target.value as ProvisioningTemplate)}>{Object.keys(PROVISIONING_TEMPLATES).map((x) => <option key={x}>{x}</option>)}</select></label>
      <label style={s.field}>LOS role<select aria-label="LOS role" style={s.input} value={role} onChange={(e) => setRole(e.target.value as LosRole)}>{LOS_ROLES.filter((x) => identity.availableRoles.includes(x)).map((x) => <option key={x}>{x}</option>)}</select></label>
      <label style={s.field}>Primary workspace<select aria-label="Primary workspace" style={s.input} value={workspace} onChange={(e) => setWorkspace(e.target.value as LosWorkspace)}>{LOS_WORKSPACES.filter((x) => identity.availableWorkspaces.includes(x)).map((x) => <option key={x}>{x}</option>)}</select></label>
      <fieldset style={s.fieldset}><legend>Additional workspace access</legend>{LOS_WORKSPACES.filter((x) => x !== workspace && identity.availableWorkspaces.includes(x)).map((x) => <label key={x} style={s.check}><input type="checkbox" checked={additional.includes(x)} onChange={(e) => setAdditional(e.target.checked ? [...additional, x] : additional.filter((w) => w !== x))} />{x}</label>)}</fieldset>
      <label style={s.check}><input type="checkbox" checked={banker} onChange={(e) => setBanker(e.target.checked)} />Banker record required</label>
      <label style={s.check}><input type="checkbox" checked={adminAccess} onChange={(e) => { setAdminAccess(e.target.checked); setAdminConfirmed(false); }} />Admin access</label>
      {adminAccess && <div style={s.warning}><strong>Admin access permits administrative functions in the Commercial LOS. Grant only when required.</strong><label style={s.check}><input aria-label="Confirm Admin access" type="checkbox" checked={adminConfirmed} onChange={(e) => setAdminConfirmed(e.target.checked)} />I explicitly confirm this Admin grant.</label></div>}
      <label style={s.check}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active access</label>
      <div style={s.actions}><button style={s.primary} onClick={review}>Review access</button><button style={s.secondary} onClick={() => setStep('verify')}>Back</button></div>
    </div>}

    {step === 'review' && request && <div data-provisioning-review>
      <h5>New user review</h5><dl style={s.review}><dt>User</dt><dd>{request.fullName} · {request.upn} · Microsoft identity verified</dd><dt>LOS access</dt><dd>Role: {request.roleCode}; Primary: {request.primaryWorkspaceCode}; Additional: {request.additionalWorkspaceCodes.join(', ') || 'None'}; Banker: {yesNo(request.bankerRequired)}; Admin: {yesNo(request.adminAccessRequired)}; Status: {request.active ? 'Active' : 'Inactive'}</dd><dt>Records</dt><dd>User Directory, Core User, Platform User, LOS User Profile{request.bankerRequired ? ', Banker' : ''}, Workspace Entitlement{request.additionalWorkspaceCodes.length ? ', Additional Workspace Access' : ''}</dd><dt>Administrator</dt><dd>{admin.fullName} · {admin.upn}</dd></dl>
      <div style={s.actions}><button style={s.primary} disabled={busy} onClick={create}>{busy ? 'Creating and verifying…' : 'Create User'}</button><button style={s.secondary} onClick={() => setStep('configure')}>Back</button></div>
    </div>}

    {step === 'result' && result && <div data-provisioning-result style={s.success}><h5>User created successfully</h5><p>{result.request.fullName} · {result.request.upn}</p><p>{result.request.roleCode} · {result.request.primaryWorkspaceCode} · Banker: {yesNo(result.request.bankerRequired)} · Admin: {yesNo(result.request.adminAccessRequired)}</p><p>Created: {Object.keys(result.recordsCreated).join(', ') || 'None'} · Reused: {Object.keys(result.recordsReused).join(', ') || 'None'} · Verification: {result.verification}</p><p>Correlation ID: {result.correlationId}</p><button style={s.primary} onClick={() => navigator.clipboard.writeText(LOS_PRODUCTION.appUrl)}>Copy Production App Link</button><p style={s.copy}>The user may need an approved Power Apps Premium license or trial before opening the app.</p></div>}
  </section>;
}

function message(value: unknown) { return value instanceof Error ? value.message : String(value); }
function yesNo(value: boolean) { return value ? 'Yes' : 'No'; }
const s: Record<string, CSSProperties> = {
  card: { display: 'flex', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center', padding: spacing.md, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, background: palette.surfaceAlt },
  panel: { display: 'grid', gap: spacing.md, padding: spacing.lg, border: `2px solid ${palette.borderStrong}`, borderRadius: radius.md, background: palette.surfaceAlt },
  title: { margin: 0, color: palette.text, fontSize: typography.size.lg }, env: { marginTop: spacing.xs, fontSize: typography.size.xs, color: palette.textMuted }, steps: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label },
  grid: { display: 'grid', gap: spacing.md, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }, field: { display: 'grid', gap: spacing.xs, fontSize: typography.size.sm, color: palette.text }, input: { padding: spacing.sm, border: `1px solid ${palette.border}`, borderRadius: radius.sm, background: palette.surface, color: palette.text },
  actions: { display: 'flex', gap: spacing.sm, alignItems: 'end' }, primary: { padding: `${spacing.sm} ${spacing.md}`, border: 0, borderRadius: radius.sm, background: palette.accent, color: '#fff', cursor: 'pointer', fontWeight: typography.weight.semibold }, secondary: { padding: `${spacing.sm} ${spacing.md}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, background: palette.surface, color: palette.text, cursor: 'pointer' },
  error: { padding: spacing.sm, border: '1px solid #b42318', borderRadius: radius.sm, color: '#b42318', background: '#fff5f5' }, identity: { display: 'grid', gap: 3, padding: spacing.md, border: `1px solid ${palette.border}`, borderRadius: radius.sm, background: palette.surface, fontSize: typography.size.sm },
  fieldset: { display: 'grid', gap: spacing.xs, border: `1px solid ${palette.border}`, borderRadius: radius.sm }, check: { display: 'flex', gap: spacing.xs, alignItems: 'center', fontSize: typography.size.sm }, warning: { gridColumn: '1 / -1', padding: spacing.sm, border: '1px solid #b54708', borderRadius: radius.sm, color: '#7a2e0e', background: '#fffaeb' }, review: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: spacing.sm, fontSize: typography.size.sm }, success: { padding: spacing.md, border: '1px solid #027a48', borderRadius: radius.sm, background: '#ecfdf3', color: '#054f31' }, copy: { margin: `${spacing.xs} 0 0`, color: palette.textMuted, fontSize: typography.size.sm },
};
