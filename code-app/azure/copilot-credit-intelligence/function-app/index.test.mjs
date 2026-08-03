import assert from 'node:assert/strict';
import test from 'node:test';
import { _test } from './index.mjs';

function encodedPrincipal(objectId = 'actor-123', tenantId = 'tenant-456') {
  return Buffer.from(JSON.stringify({ claims: [
    { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: objectId },
    { typ: 'http://schemas.microsoft.com/identity/claims/tenantid', val: tenantId },
  ] })).toString('base64');
}

test('resolves only a complete Easy Auth principal', () => {
  assert.deepEqual(_test.principal({ headers: { 'x-ms-client-principal': encodedPrincipal() } }), {
    id: 'actor-123',
    tenant: 'tenant-456',
    principalIds: ['actor-123'],
  });
  assert.equal(_test.principal({ headers: {} }), undefined);
  assert.equal(_test.principal({ headers: { 'x-ms-client-principal': encodedPrincipal('bad id') } }), undefined);
});

test('security identifiers reject filter and path metacharacters', () => {
  assert.equal(_test.safeId('valid-user_1@example.com'), true);
  assert.equal(_test.safeId("x' or true"), false);
  assert.equal(_test.safeId('../secret'), false);
});

test('response hashes are deterministic and do not contain source content', () => {
  const first = _test.sha256('{"id":"evidence-1"}');
  assert.equal(first, _test.sha256('{"id":"evidence-1"}'));
  assert.equal(first.length, 64);
  assert.equal(first.includes('evidence-1'), false);
});
