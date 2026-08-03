import type { CreditIntelligenceHashPort } from './creditIntelligence';

export type ServiceRequestCategory =
  | 'document_request'
  | 'payment_or_payoff_question'
  | 'loan_information_request'
  | 'servicing_request'
  | 'complaint'
  | 'suspected_fraud'
  | 'other';

export interface InboundEmailEnvelope {
  readonly mailboxId: string;
  readonly internetMessageId: string;
  readonly receivedAt: string;
  readonly senderAddress: string;
  readonly subject: string;
  readonly bodyText: string;
  readonly hasAttachments: boolean;
  readonly sensitivity?: string;
}

export interface ServiceRequestClassification {
  readonly isServiceRequest: boolean;
  readonly category: ServiceRequestCategory;
  readonly confidence: number;
  readonly suggestedTaskTitle?: string;
  readonly requestedDueAt?: string;
  readonly companyHints: readonly string[];
  readonly personHints: readonly string[];
  readonly dealHints: readonly string[];
  readonly rationale: string;
  readonly suspiciousContent: boolean;
  readonly usedProtectedCharacteristic: boolean;
}

export interface ResolvedServiceRequestTarget {
  readonly kind: 'unique';
  readonly dealId: string;
  readonly assigneeSystemUserId: string;
  readonly assigneeDisplayName: string;
}

export type ServiceRequestTargetResolution =
  | ResolvedServiceRequestTarget
  | { readonly kind: 'none' | 'ambiguous' | 'forbidden'; readonly reason: string };

export interface EmailServiceRequestPolicy {
  readonly monitoredMailboxIds: readonly string[];
  readonly allowedCategories: readonly ServiceRequestCategory[];
  readonly automaticTaskCreation: boolean;
  readonly minimumConfidence: number;
  readonly maximumMessageAgeHours: number;
  readonly defaultDueHours: number;
}

export interface EmailServiceRequestIntakeRecord {
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly contentHash: string;
  readonly mailboxId: string;
  readonly internetMessageIdHash: string;
  readonly senderAddress: string;
  readonly receivedAt: string;
  readonly subject: string;
  readonly hasAttachments: boolean;
  readonly classification: ServiceRequestClassification;
  readonly status: 'ignored' | 'triage_required' | 'task_created' | 'blocked';
  readonly statusReason: string;
  readonly dealId?: string;
  readonly assigneeSystemUserId?: string;
  readonly taskId?: string;
  readonly evaluationHash: string;
}

export interface EmailServiceRequestPorts {
  readonly hash: CreditIntelligenceHashPort;
  readonly now: () => Date;
  readonly newCorrelationId: () => string;
  readonly identity: {
    resolveServiceActor(): Promise<{ kind: 'authorized'; systemUserId: string } | { kind: 'blocked'; reason: string }>;
  };
  readonly classifier: {
    classify(input: Readonly<Omit<InboundEmailEnvelope, 'bodyText'> & { bodyText: string }>): Promise<ServiceRequestClassification>;
  };
  readonly matcher: {
    resolve(input: { envelope: InboundEmailEnvelope; classification: ServiceRequestClassification }): Promise<ServiceRequestTargetResolution>;
  };
  readonly persistence: {
    /** Must be a transactional compare-and-create operation in production. */
    claim(input: { idempotencyKey: string; contentHash: string; correlationId: string }): Promise<'claimed' | 'duplicate' | 'conflict'>;
    persistIntake(record: EmailServiceRequestIntakeRecord): Promise<{ intakeId: string }>;
    createMonitoredTask(input: {
      correlationId: string;
      idempotencyKey: string;
      dealId: string;
      assigneeSystemUserId: string;
      title: string;
      dueAt: string;
      source: 'copilot-email-service-request';
      intakeEvaluationHash: string;
    }): Promise<{ taskId: string; auditEventId: string; timelineEventId: string }>;
  };
}

export type EmailServiceRequestOutcome =
  | { readonly kind: 'task-created'; readonly intakeId: string; readonly taskId: string; readonly correlationId: string }
  | { readonly kind: 'triage-required'; readonly intakeId: string; readonly reason: string; readonly correlationId: string }
  | { readonly kind: 'ignored'; readonly intakeId: string; readonly correlationId: string }
  | { readonly kind: 'duplicate'; readonly correlationId: string }
  | { readonly kind: 'blocked'; readonly code: string; readonly safeMessage: string; readonly correlationId: string };

const SAFE_ID = /^[a-zA-Z0-9_.:@<>+-]{1,500}$/;
const MAX_SUBJECT = 500;
const MAX_BODY = 50_000;

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function safeTitle(classification: ServiceRequestClassification, envelope: InboundEmailEnvelope): string {
  const proposed = classification.suggestedTaskTitle?.trim();
  const title = proposed || `Review service request: ${envelope.subject.trim() || classification.category}`;
  return title.replace(/[\r\n\t]+/g, ' ').slice(0, 200);
}

function dueAt(classification: ServiceRequestClassification, policy: EmailServiceRequestPolicy, now: Date): string {
  if (classification.requestedDueAt && validDate(classification.requestedDueAt) && Date.parse(classification.requestedDueAt) >= now.getTime()) {
    return new Date(classification.requestedDueAt).toISOString();
  }
  return new Date(now.getTime() + policy.defaultDueHours * 3_600_000).toISOString();
}

async function buildRecord(
  ports: EmailServiceRequestPorts,
  base: Omit<EmailServiceRequestIntakeRecord, 'evaluationHash'>,
): Promise<EmailServiceRequestIntakeRecord> {
  return { ...base, evaluationHash: await ports.hash.hashCanonical(base) };
}

/**
 * Governed inbound-email pipeline. Copilot classifies; deterministic policy
 * decides whether a task may be created. No model output supplies authority.
 */
export async function processInboundServiceRequestEmail(
  envelope: InboundEmailEnvelope,
  policy: EmailServiceRequestPolicy,
  ports: EmailServiceRequestPorts,
): Promise<EmailServiceRequestOutcome> {
  const correlationId = ports.newCorrelationId();
  const block = (code: string, safeMessage: string): EmailServiceRequestOutcome => ({ kind: 'blocked', code, safeMessage, correlationId });
  const now = ports.now();
  if (!policy.monitoredMailboxIds.includes(envelope.mailboxId)) return block('MAILBOX_NOT_AUTHORIZED', 'The mailbox is not approved for service-request monitoring.');
  if (!SAFE_ID.test(envelope.mailboxId) || !SAFE_ID.test(envelope.internetMessageId)) return block('MESSAGE_ID_INVALID', 'The inbound message identity is malformed.');
  if (!validDate(envelope.receivedAt)) return block('RECEIVED_AT_INVALID', 'The inbound message timestamp is invalid.');
  if ((now.getTime() - Date.parse(envelope.receivedAt)) / 3_600_000 > policy.maximumMessageAgeHours) return block('MESSAGE_TOO_OLD', 'The inbound message is outside the authorized processing window.');
  if (envelope.subject.length > MAX_SUBJECT || envelope.bodyText.length > MAX_BODY) return block('MESSAGE_SIZE_INVALID', 'The inbound message exceeds the governed processing limit.');

  const actor = await ports.identity.resolveServiceActor();
  if (actor.kind !== 'authorized') return block('SERVICE_ACTOR_UNRESOLVED', actor.reason);

  const internetMessageIdHash = await ports.hash.hashCanonical({ internetMessageId: envelope.internetMessageId });
  const idempotencyKey = await ports.hash.hashCanonical({ mailboxId: envelope.mailboxId, internetMessageId: envelope.internetMessageId });
  const contentHash = await ports.hash.hashCanonical({
    senderAddress: envelope.senderAddress.toLowerCase(), subject: envelope.subject,
    bodyText: envelope.bodyText, receivedAt: envelope.receivedAt, hasAttachments: envelope.hasAttachments,
  });
  const claim = await ports.persistence.claim({ idempotencyKey, contentHash, correlationId });
  if (claim === 'duplicate') return { kind: 'duplicate', correlationId };
  if (claim === 'conflict') return block('MESSAGE_ID_CONFLICT', 'The message identity was previously used with different content.');

  const classification = await ports.classifier.classify(envelope);
  if (!Number.isFinite(classification.confidence) || classification.confidence < 0 || classification.confidence > 1) return block('CLASSIFICATION_INVALID', 'Copilot returned an invalid classification.');
  if (classification.usedProtectedCharacteristic) return block('PROTECTED_CHARACTERISTIC_REJECTED', 'The classification used a prohibited protected characteristic.');

  const base = {
    correlationId, idempotencyKey, contentHash, mailboxId: envelope.mailboxId,
    internetMessageIdHash, senderAddress: envelope.senderAddress.toLowerCase(), receivedAt: envelope.receivedAt,
    subject: envelope.subject.slice(0, MAX_SUBJECT), hasAttachments: envelope.hasAttachments, classification,
  } as const;

  if (!classification.isServiceRequest) {
    const record = await buildRecord(ports, { ...base, status: 'ignored', statusReason: 'Copilot classified the message as not being a service request.' });
    const { intakeId } = await ports.persistence.persistIntake(record);
    return { kind: 'ignored', intakeId, correlationId };
  }

  const resolution = await ports.matcher.resolve({ envelope, classification });
  const needsTriage = classification.suspiciousContent
    || classification.confidence < policy.minimumConfidence
    || !policy.allowedCategories.includes(classification.category)
    || resolution.kind !== 'unique'
    || !policy.automaticTaskCreation;
  if (needsTriage) {
    const reason = classification.suspiciousContent ? 'Potential prompt injection or suspicious content requires human review.'
      : classification.confidence < policy.minimumConfidence ? 'Classification confidence is below the automatic-task threshold.'
      : !policy.allowedCategories.includes(classification.category) ? 'The service category is not approved for automatic task creation.'
      : resolution.kind !== 'unique' ? resolution.reason
      : 'Automatic task creation is disabled by policy.';
    const record = await buildRecord(ports, {
      ...base, status: 'triage_required', statusReason: reason,
      ...(resolution.kind === 'unique' ? { dealId: resolution.dealId, assigneeSystemUserId: resolution.assigneeSystemUserId } : {}),
    });
    const { intakeId } = await ports.persistence.persistIntake(record);
    return { kind: 'triage-required', intakeId, reason, correlationId };
  }

  const preTask = await buildRecord(ports, {
    ...base, status: 'task_created', statusReason: 'Policy authorized automatic monitored-task creation.',
    dealId: resolution.dealId, assigneeSystemUserId: resolution.assigneeSystemUserId,
  });
  const task = await ports.persistence.createMonitoredTask({
    correlationId, idempotencyKey, dealId: resolution.dealId,
    assigneeSystemUserId: resolution.assigneeSystemUserId,
    title: safeTitle(classification, envelope), dueAt: dueAt(classification, policy, now),
    source: 'copilot-email-service-request', intakeEvaluationHash: preTask.evaluationHash,
  });
  const record = await buildRecord(ports, { ...preTask, taskId: task.taskId });
  const { intakeId } = await ports.persistence.persistIntake(record);
  return { kind: 'task-created', intakeId, taskId: task.taskId, correlationId };
}
