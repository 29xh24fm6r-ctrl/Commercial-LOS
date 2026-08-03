import crypto from 'node:crypto';

const json = (status, body) => ({ status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body });
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:@-]{1,200}$/.test(value);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function principal(req) {
  const encoded = req.headers?.['x-ms-client-principal'];
  if (!encoded) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    const id = claims.find(c => c.typ === 'http://schemas.microsoft.com/identity/claims/objectidentifier')?.val;
    const tenant = claims.find(c => c.typ === 'http://schemas.microsoft.com/identity/claims/tenantid')?.val;
    const groupClaimTypes = new Set(['groups', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups']);
    const groupIds = claims
      .filter(claim => groupClaimTypes.has(claim.typ) && safeId(claim.val))
      .map(claim => claim.val);
    return safeId(id) && safeId(tenant)
      ? { id, tenant, principalIds: [...new Set([id, ...groupIds])] }
      : undefined;
  } catch { return undefined; }
}

async function managedIdentityToken(resource) {
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const header = process.env.IDENTITY_HEADER;
  if (!endpoint || !header) throw new Error('Managed identity is unavailable.');
  const url = new URL(endpoint);
  url.searchParams.set('api-version', '2019-08-01');
  url.searchParams.set('resource', resource);
  const response = await fetch(url, { headers: { 'X-IDENTITY-HEADER': header } });
  if (!response.ok) throw new Error('Managed identity token acquisition failed.');
  return (await response.json()).access_token;
}

async function searchEvidence(input, actor) {
  if (!safeId(input.bankId)) throw new Error('Invalid authorized search scope.');
  const token = await managedIdentityToken('https://search.azure.com');
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const index = process.env.AZURE_SEARCH_INDEX;
  const principals = actor.principalIds.map(id => id.replaceAll("'", "''")).join(',');
  const filter = `bankId eq '${input.bankId.replaceAll("'", "''")}' and principals/any(p: search.in(p, '${principals}'))`;
  const response = await fetch(`${endpoint}/indexes/${encodeURIComponent(index)}/docs/search?api-version=2025-09-01`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ search: String(input.query ?? '').slice(0, 1000), filter, top: Math.min(Number(input.top) || 10, 25), select: 'id,title,locator,contentHash,retrievedAt,sourceId,content' }),
  });
  if (!response.ok) throw new Error('Permission-filtered search failed.');
  return response.json();
}

async function analyzeDocument(input) {
  const source = new URL(String(input.blobUrl ?? ''));
  if (source.protocol !== 'https:' || source.hostname !== process.env.EVIDENCE_STORAGE_HOST) throw new Error('Document source is outside governed storage.');
  const token = await managedIdentityToken('https://cognitiveservices.azure.com');
  const model = safeId(input.modelId) ? input.modelId : 'prebuilt-layout';
  const response = await fetch(`${process.env.DOCUMENT_INTELLIGENCE_ENDPOINT}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze?api-version=2024-11-30`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ urlSource: source.toString() }),
  });
  if (response.status !== 202) throw new Error('Document analysis could not be started.');
  const operation = response.headers.get('operation-location');
  if (!operation) throw new Error('Document analysis operation was not returned.');
  return { status: 'accepted', operation, documentHash: safeId(input.documentHash) ? input.documentHash : undefined, requiresHumanValidation: true };
}

export default async function (context, req) {
  const actor = principal(req);
  if (!actor) { context.res = json(401, { code: 'ACTOR_UNRESOLVED' }); return; }
  const operation = context.bindingData.operation;
  const correlationId = req.body?.correlationId;
  if (!safeId(correlationId)) { context.res = json(400, { code: 'CORRELATION_REQUIRED' }); return; }
  try {
    const result = operation === 'search' ? await searchEvidence(req.body, actor)
      : operation === 'analyze-document' ? await analyzeDocument(req.body)
      : undefined;
    if (!result) { context.res = json(404, { code: 'OPERATION_NOT_ALLOWLISTED' }); return; }
    context.res = json(200, { correlationId, actorObjectId: actor.id, retrievedAt: new Date().toISOString(), responseHash: sha256(JSON.stringify(result)), result });
  } catch (error) {
    context.log.warn(`Governed evidence request blocked correlationId=${correlationId}`);
    context.res = json(403, { correlationId, code: 'EVIDENCE_REQUEST_BLOCKED', message: 'The governed evidence request was blocked.' });
  }
}

export const _test = { principal, safeId, sha256 };
