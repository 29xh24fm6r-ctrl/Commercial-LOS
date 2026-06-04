/**
 * Phase 129A — Copilot assistant adapter boundary.
 *
 * Defines the contract between the LOS UI and a future Microsoft
 * Copilot connector. The default implementation is "not_configured"
 * and returns honest responses without any network call, hallucinated
 * content, or fake AI answer.
 *
 * Governance:
 *   - Copilot NEVER approves loans, changes data, sends emails,
 *     completes tasks, requests documents, creates records, or
 *     accesses unauthorized routes.
 *   - Copilot NEVER claims probability/approval odds unless a
 *     source record exists.
 *   - When the connector is not configured, every response explicitly
 *     says so.
 */

export type CopilotMode = 'not_configured' | 'live';

export interface CopilotResponse {
  mode: CopilotMode;
  text: string;
  /** Source labels for provenance (e.g. "deal", "task", "document"). */
  sources: string[];
  /** True only when the response came from a live connector. */
  isLive: boolean;
}

export interface CopilotDealContext {
  dealName: string | undefined;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  taskCount: number;
  openTaskCount: number;
  documentCount: number;
  outstandingDocumentCount: number;
  blockerCount: number;
  blockerSummaries: string[];
}

export interface CopilotWorkspaceContext {
  workspaceRole: 'banker' | 'manager' | 'team' | 'portfolio' | 'executive';
  userName: string | undefined;
  teamName: string | undefined;
  dealCount: number;
  urgentItemCount: number;
  kpiSummaries: string[];
}

export interface CopilotAssistantAdapter {
  readonly mode: CopilotMode;
  summarizeDeal(context: CopilotDealContext): CopilotResponse;
  summarizeWorkspace(context: CopilotWorkspaceContext): CopilotResponse;
  suggestNextActions(context: CopilotDealContext): CopilotResponse;
  explainMissingFields(context: CopilotDealContext): CopilotResponse;
  explainBlockers(context: CopilotDealContext): CopilotResponse;
}

const NOT_CONFIGURED_PREAMBLE =
  'Copilot connector is not configured. The response below is generated locally from data already visible on your screen.';

function notConfiguredResponse(text: string, sources: string[]): CopilotResponse {
  return {
    mode: 'not_configured',
    text: `${NOT_CONFIGURED_PREAMBLE}\n\n${text}`,
    sources,
    isLive: false,
  };
}

function formatDealSummary(ctx: CopilotDealContext): string {
  const lines: string[] = [];
  if (ctx.dealName) lines.push(`Deal: ${ctx.dealName}`);
  if (ctx.clientName) lines.push(`Client: ${ctx.clientName}`);
  if (ctx.stage) lines.push(`Stage: ${ctx.stage}`);
  if (ctx.status) lines.push(`Status: ${ctx.status}`);
  if (ctx.amount !== undefined) lines.push(`Amount: $${ctx.amount.toLocaleString()}`);
  lines.push(`Tasks: ${ctx.openTaskCount} open of ${ctx.taskCount} total`);
  lines.push(`Documents: ${ctx.outstandingDocumentCount} outstanding of ${ctx.documentCount} total`);
  if (ctx.blockerCount > 0) {
    lines.push(`Blockers: ${ctx.blockerCount}`);
    for (const b of ctx.blockerSummaries) {
      lines.push(`  - ${b}`);
    }
  }
  return lines.join('\n');
}

function formatNextActions(ctx: CopilotDealContext): string {
  const actions: string[] = [];
  if (ctx.openTaskCount > 0) actions.push(`Review ${ctx.openTaskCount} open task(s)`);
  if (ctx.outstandingDocumentCount > 0) actions.push(`Follow up on ${ctx.outstandingDocumentCount} outstanding document(s)`);
  if (ctx.blockerCount > 0) actions.push(`Address ${ctx.blockerCount} blocker(s)`);
  if (actions.length === 0) actions.push('No urgent actions identified from currently loaded data.');
  return actions.map((a, i) => `${i + 1}. ${a}`).join('\n');
}

function formatMissingFields(ctx: CopilotDealContext): string {
  const missing: string[] = [];
  if (!ctx.dealName) missing.push('Deal name');
  if (!ctx.clientName) missing.push('Client name');
  if (!ctx.stage) missing.push('Stage');
  if (!ctx.status) missing.push('Status');
  if (ctx.amount === undefined) missing.push('Loan amount');
  if (missing.length === 0) return 'All key fields are populated based on currently loaded data.';
  return `Missing fields:\n${missing.map((f) => `- ${f}`).join('\n')}`;
}

function formatBlockers(ctx: CopilotDealContext): string {
  if (ctx.blockerCount === 0) return 'No blockers identified from currently loaded data.';
  return `${ctx.blockerCount} blocker(s) identified:\n${ctx.blockerSummaries.map((b) => `- ${b}`).join('\n')}`;
}

function formatWorkspaceSummary(ctx: CopilotWorkspaceContext): string {
  const lines: string[] = [];
  lines.push(`Workspace: ${ctx.workspaceRole}`);
  if (ctx.userName) lines.push(`User: ${ctx.userName}`);
  if (ctx.teamName) lines.push(`Team: ${ctx.teamName}`);
  lines.push(`Deals: ${ctx.dealCount}`);
  if (ctx.urgentItemCount > 0) lines.push(`Urgent items: ${ctx.urgentItemCount}`);
  if (ctx.kpiSummaries.length > 0) {
    lines.push('KPI highlights:');
    for (const kpi of ctx.kpiSummaries) {
      lines.push(`  - ${kpi}`);
    }
  }
  return lines.join('\n');
}

export function createNotConfiguredAdapter(): CopilotAssistantAdapter {
  return {
    mode: 'not_configured',
    summarizeDeal(context) {
      return notConfiguredResponse(formatDealSummary(context), ['deal']);
    },
    summarizeWorkspace(context) {
      return notConfiguredResponse(formatWorkspaceSummary(context), ['workspace']);
    },
    suggestNextActions(context) {
      return notConfiguredResponse(formatNextActions(context), ['deal', 'task', 'document']);
    },
    explainMissingFields(context) {
      return notConfiguredResponse(formatMissingFields(context), ['deal']);
    },
    explainBlockers(context) {
      return notConfiguredResponse(formatBlockers(context), ['deal', 'blocker']);
    },
  };
}

/** Singleton adapter — not_configured by default. Replace with a live
 *  adapter when a Microsoft Copilot connector is approved and wired. */
let _adapter: CopilotAssistantAdapter = createNotConfiguredAdapter();

export function getCopilotAdapter(): CopilotAssistantAdapter {
  return _adapter;
}

/** Test-only: swap the adapter. Production code should not call this. */
export function _setCopilotAdapterForTest(adapter: CopilotAssistantAdapter): void {
  _adapter = adapter;
}
