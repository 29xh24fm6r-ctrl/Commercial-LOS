import type { TeamsChannelPostProposal } from './teamsChannelPostModel';

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:tax\s*id|tin|ein)\s*[:#]?\s*[A-Za-z0-9-]+/gi,
  /\b(?:account|acct)\s*(?:number|#)?\s*[:#]?\s*\d{4,}/gi,
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
];

export function redactTeamsChannelContent(input: string): string {
  return FORBIDDEN_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), input);
}

export function stableContentHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `h${hash.toString(16).padStart(8, '0')}`;
}

export function buildTeamsChannelPostIdempotencyKey(input: {
  targetAlias: string;
  contentHash: string;
  correlationId: string;
}): string {
  return `${input.targetAlias}|${input.contentHash}|${input.correlationId}`;
}

export function buildSafeTeamsChannelPreview(input: {
  dealId: string;
  dealName: string;
  stage?: string;
  assignedBanker?: string;
  blockers?: string[];
  nextAction?: string;
  losDeepLink?: string;
  targetAlias: string;
  correlationId: string;
  policyVersion?: string;
}): TeamsChannelPostProposal {
  const raw = [
    `Deal: ${input.dealName}`,
    input.stage ? `Stage: ${input.stage}` : undefined,
    input.assignedBanker ? `Assigned banker: ${input.assignedBanker}` : undefined,
    input.blockers?.length ? `Blockers: ${input.blockers.join('; ')}` : 'Blockers: none returned',
    input.nextAction ? `Next action: ${input.nextAction}` : undefined,
    input.losDeepLink ? `LOS: ${input.losDeepLink}` : undefined,
    `Timestamp: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');
  const safePreview = redactTeamsChannelContent(raw);
  const contentHash = stableContentHash(safePreview);
  return {
    dealId: input.dealId,
    dealName: input.dealName,
    stage: input.stage,
    assignedBanker: input.assignedBanker,
    blockers: input.blockers ?? [],
    nextAction: input.nextAction,
    losDeepLink: input.losDeepLink,
    targetAlias: input.targetAlias,
    safePreview,
    contentHash,
    correlationId: input.correlationId,
    idempotencyKey: buildTeamsChannelPostIdempotencyKey({
      targetAlias: input.targetAlias,
      contentHash,
      correlationId: input.correlationId,
    }),
    policyVersion: input.policyVersion ?? 'teams-channel-post-2026-07-28',
  };
}
