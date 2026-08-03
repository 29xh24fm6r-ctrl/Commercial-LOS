export const LOS_PRODUCTION = {
  environmentName: 'Commercial LOS',
  environmentId: 'afec9c13-e5c5-eea6-b1f7-3f51abb7571d',
  dataverseUrl: 'https://org8c12c949.crm.dynamics.com',
  appId: '7870515e-45cb-4b37-bbd1-55fc0b1ff769',
  appUrl: 'https://apps.powerapps.com/play/e/afec9c13-e5c5-eea6-b1f7-3f51abb7571d/app/7870515e-45cb-4b37-bbd1-55fc0b1ff769',
} as const;

export const LOS_ROLES = ['Banker', 'Manager', 'Credit Approver', 'Funding Approver', 'Boarding Servicing Operator', 'Admin'] as const;
export type LosRole = (typeof LOS_ROLES)[number];
export const LOS_WORKSPACES = ['Banker Workspace', 'Team Workspace', 'Manager Command Center', 'Portfolio Management', 'Admin Control Center', 'Executive Dashboard'] as const;
export type LosWorkspace = (typeof LOS_WORKSPACES)[number];
export type ProvisioningTemplate = 'Banker Tester' | 'Admin Tester' | 'Credit Approver' | 'Funding Approver';

export interface VerifiedMicrosoftIdentity {
  status: 'verified' | 'existing_los_user';
  systemUserId: string;
  fullName: string;
  upn: string;
  businessUnit: string;
  enabled: boolean;
  baseDataverseRoles: readonly string[];
  availableRoles: readonly LosRole[];
  availableWorkspaces: readonly LosWorkspace[];
  existingStatus?: 'complete' | 'partial' | 'inactive';
  existingRecordIds: Readonly<Record<string, string>>;
}

export interface ProvisionLosUserRequest {
  microsoftSystemUserId: string;
  upn: string;
  fullName: string;
  roleCode: LosRole;
  primaryWorkspaceCode: LosWorkspace;
  additionalWorkspaceCodes: LosWorkspace[];
  bankerRequired: boolean;
  adminAccessRequired: boolean;
  active: boolean;
  adminConfirmation: boolean;
  environmentId: typeof LOS_PRODUCTION.environmentId;
}

export interface ProvisioningResult {
  status: 'completed';
  correlationId: string;
  verification: 'verified';
  recordsCreated: Readonly<Record<string, string>>;
  recordsReused: Readonly<Record<string, string>>;
  recordsUpdated: Readonly<Record<string, string>>;
  request: ProvisionLosUserRequest;
}

export interface ProvisioningClient {
  verify(upn: string): Promise<VerifiedMicrosoftIdentity>;
  provision(request: ProvisionLosUserRequest): Promise<ProvisioningResult>;
}

const COMBINATIONS: Readonly<Record<LosRole, readonly LosWorkspace[]>> = {
  Banker: ['Banker Workspace', 'Team Workspace'],
  Manager: ['Manager Command Center', 'Team Workspace', 'Banker Workspace'],
  'Credit Approver': ['Manager Command Center', 'Team Workspace'],
  'Funding Approver': ['Manager Command Center', 'Team Workspace'],
  'Boarding Servicing Operator': ['Portfolio Management', 'Team Workspace'],
  Admin: ['Admin Control Center'],
};

export const PROVISIONING_TEMPLATES: Readonly<Record<ProvisioningTemplate, Pick<ProvisionLosUserRequest, 'roleCode' | 'primaryWorkspaceCode' | 'additionalWorkspaceCodes' | 'bankerRequired' | 'adminAccessRequired' | 'active'>>> = {
  'Banker Tester': { roleCode: 'Banker', primaryWorkspaceCode: 'Banker Workspace', additionalWorkspaceCodes: [], bankerRequired: true, adminAccessRequired: false, active: true },
  'Admin Tester': { roleCode: 'Admin', primaryWorkspaceCode: 'Admin Control Center', additionalWorkspaceCodes: [], bankerRequired: false, adminAccessRequired: true, active: true },
  'Credit Approver': { roleCode: 'Credit Approver', primaryWorkspaceCode: 'Team Workspace', additionalWorkspaceCodes: [], bankerRequired: false, adminAccessRequired: false, active: true },
  'Funding Approver': { roleCode: 'Funding Approver', primaryWorkspaceCode: 'Team Workspace', additionalWorkspaceCodes: [], bankerRequired: false, adminAccessRequired: false, active: true },
};

export function normalizeOldGloryUpn(value: string): string {
  const upn = value.trim().toLowerCase();
  if (!/^[^\s@]+@oldglorybank\.com$/.test(upn)) throw new Error('Enter an approved @oldglorybank.com email address.');
  return upn;
}

export function validateProvisioningRequest(request: ProvisionLosUserRequest): void {
  normalizeOldGloryUpn(request.upn);
  if (request.environmentId !== LOS_PRODUCTION.environmentId) throw new Error('ENVIRONMENT_MISMATCH: Provisioning is locked to Commercial LOS Production.');
  if (!LOS_ROLES.includes(request.roleCode)) throw new Error('ROLE_INVALID: The selected LOS role is not approved.');
  if (!COMBINATIONS[request.roleCode].includes(request.primaryWorkspaceCode)) throw new Error('ROLE_WORKSPACE_INVALID: The selected role and primary workspace are not an approved combination.');
  if (request.additionalWorkspaceCodes.some((workspace) => !COMBINATIONS[request.roleCode].includes(workspace))) throw new Error('ADDITIONAL_WORKSPACE_INVALID: One or more additional workspaces are not allowed for the selected role.');
  if (request.roleCode === 'Admin' !== request.adminAccessRequired) throw new Error('ADMIN_ACCESS_INVALID: Admin role and Admin access must agree.');
  if (request.adminAccessRequired && !request.adminConfirmation) throw new Error('ADMIN_CONFIRMATION_REQUIRED: Confirm the elevated Admin grant.');
  if (request.roleCode.includes('Super Admin')) throw new Error('SUPER_ADMIN_PROHIBITED: System Super Admin is unavailable in the standard workflow.');
}

function unwrap(value: unknown): unknown {
  const envelope = value as { success?: boolean; error?: { message?: string }; data?: unknown };
  if (envelope?.success === false) throw new Error(envelope.error?.message ?? 'Dataverse operation failed.');
  const body = (envelope?.data ?? value) as Record<string, unknown>;
  const json = body?.ResultJson ?? body?.resultJson;
  return typeof json === 'string' ? JSON.parse(json) : body;
}

async function execute(operationName: string, body: Record<string, unknown>): Promise<unknown> {
  const [{ getClient }, { dataSourcesInfo }] = await Promise.all([
    import('@microsoft/power-apps/data'),
    import('../../.power/schemas/appschemas/dataSourcesInfo'),
  ]);
  return unwrap(await getClient(dataSourcesInfo).executeAsync({ dataverseRequest: { action: 'customapi', parameters: { operationName, tableName: '', body } } }));
}

export function createPowerAppsUserProvisioningClient(): ProvisioningClient {
  return {
    async verify(upn) {
      const result = await execute('cr664_VerifyLosUserIdentity', { Upn: normalizeOldGloryUpn(upn), EnvironmentId: LOS_PRODUCTION.environmentId }) as Partial<VerifiedMicrosoftIdentity>;
      if ((result.status !== 'verified' && result.status !== 'existing_los_user') || !result.systemUserId || !result.upn || result.enabled !== true) throw new Error('IDENTITY_RESPONSE_INVALID: The server did not return a complete enabled Microsoft identity.');
      return result as VerifiedMicrosoftIdentity;
    },
    async provision(request) {
      validateProvisioningRequest(request);
      const result = await execute('cr664_ProvisionLosUser', { RequestJson: JSON.stringify(request) }) as Partial<ProvisioningResult> & { message?: string; code?: string };
      if (result.status !== 'completed' || result.verification !== 'verified' || !result.correlationId) throw new Error(`${result.code ?? 'PROVISIONING_FAILED'}: ${result.message ?? 'The complete LOS access chain was not verified.'}`);
      return result as ProvisioningResult;
    },
  };
}
