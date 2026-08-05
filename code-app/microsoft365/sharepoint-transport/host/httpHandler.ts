import type { ServerIdentityContext, SharePointTransportOperation } from '../contract/types.js';
import type { SharePointTransportHost } from './sharePointTransportHost.js';

export interface AuthenticatedTransportHttpRequest {
  readonly operation: SharePointTransportOperation;
  readonly body: unknown;
  /** Supplied by the authenticated platform boundary, never parsed from body. */
  readonly identityContext: ServerIdentityContext;
}

const operations = new Set<SharePointTransportOperation>(['ensureFolder', 'upload', 'verifyFolder', 'verifyFile']);
const forbiddenClaims = new Set(['actorSystemUserId', 'authorized', 'isAdmin', 'role', 'roles', 'systemUserId', 'tenantId', 'userId', 'connectorIdentity', 'claims']);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function decodeBase64(value: unknown): Uint8Array | undefined {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.toString('base64') === value ? new Uint8Array(bytes) : undefined;
  } catch { return undefined; }
}

/**
 * Azure Function/custom-connector style dispatch. The deployment MUST require
 * Entra authentication; no anonymous trigger configuration is included here.
 */
export async function handleAuthenticatedTransportRequest(host: SharePointTransportHost, request: AuthenticatedTransportHttpRequest): Promise<unknown> {
  if (!operations.has(request.operation)) throw new Error('OPERATION_NOT_SUPPORTED');
  const body = record(request.body);
  if (!body || Object.keys(body).some((key) => forbiddenClaims.has(key))) throw new Error('UNTRUSTED_AUTHORIZATION_INPUT');
  if (request.operation === 'upload') {
    const content = decodeBase64(body.contentBase64);
    if (!content || 'content' in body) throw new Error('MALFORMED_BINARY_CONTENT');
    const fields = { ...body };
    delete fields.contentBase64;
    return host.upload({ ...fields, content } as never, request.identityContext);
  }
  if (request.operation === 'ensureFolder') return host.ensureFolder(body as never, request.identityContext);
  if (request.operation === 'verifyFolder') return host.verifyFolder(body as never, request.identityContext);
  return host.verifyFile(body as never, request.identityContext);
}
