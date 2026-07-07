// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveCrmCertificationAttribution,
  isCrmCertificationAttributed,
  validateCandidateCrmSmoke,
  CRM_LIVE_PERSISTENCE_EVIDENCE_SLOT,
} from './crmCertificationAttribution';
import { deriveUnifiedCrmReadiness } from '../readiness/unifiedCrmReadiness';

const ROOT = resolve(__dirname, '..', '..', '..');
const committedSmoke = JSON.parse(
  readFileSync(resolve(ROOT, CRM_LIVE_PERSISTENCE_EVIDENCE_SLOT.path), 'utf8').replace(/^﻿/, ''),
);

describe('CRM-H — CRM certification attribution guard', () => {
  it('the committed smoke is now attributed (CRM-K) and CAN certify', () => {
    const a = deriveCrmCertificationAttribution();
    // CRM-K re-captured the smoke under an attributable operator (real identity, not faked).
    expect(committedSmoke.operatorUpn).toBe('mpaller@oldglorybank.com');
    expect(committedSmoke.operatorSystemUserId).toBeTruthy();
    expect(a.operatorUpn).toBe('mpaller@oldglorybank.com');
    expect(a.attributable).toBe(true);
    expect(a.confidence).toBe('HIGH');
    expect(a.ready).toBe(true);
    expect(a.blocking).toBe(false);
    expect(isCrmCertificationAttributed()).toBe(true);
  });

  it('the attributed operator certifies unified CRM team readiness (attribution dimension ready)', () => {
    const r = deriveUnifiedCrmReadiness();
    const attribution = r.dimensions.find((d) => d.key === 'certification-attribution');
    expect(attribution?.status).toBe('ready');
    expect(r.teamReady).toBe(true);
  });

  it('an injected unattributable verdict still blocks (the guard remains fail-closed)', () => {
    const r = deriveUnifiedCrmReadiness({ certificationAttributionHigh: false });
    expect(r.dimensions.find((d) => d.key === 'certification-attribution')?.status).toBe('blocked');
    expect(r.teamReady).toBe(false);
  });

  it('exposes an operator evidence slot for the corrected live smoke', () => {
    expect(CRM_LIVE_PERSISTENCE_EVIDENCE_SLOT.path).toMatch(/crmLivePersistence\.json$/);
    expect(CRM_LIVE_PERSISTENCE_EVIDENCE_SLOT.requirement).toMatch(/attributable UPN/i);
  });

  it('rejects a candidate smoke that keeps a sentinel operator (never certifiable)', () => {
    const candidate = { ...committedSmoke, operatorUpn: 'unknown-operator' };
    const v = validateCandidateCrmSmoke(candidate);
    expect(v.ok).toBe(false);
    expect(v.attributable).toBe(false);
  });

  it('accepts a candidate smoke ONLY when it carries an attributable operator + machine proof at HIGH confidence', () => {
    const corrected = {
      ...committedSmoke,
      operatorUpn: 'banker.ops@bank.com',
      completedAtIso: '2026-06-25T20:48:12.9971028Z', // real (non-round) machine clock
      affectedRecordIds: ['fa1e612c-d770-f111-ab0d-70a8a59be491'],
    };
    const v = validateCandidateCrmSmoke(corrected);
    expect(v.attributable).toBe(true);
    expect(v.confidence).toBe('HIGH');
    expect(v.ok).toBe(true);
  });

  it('a corrected attribution flips the unified attribution dimension ready (injection proves the wiring)', () => {
    const r = deriveUnifiedCrmReadiness({ certificationAttributionHigh: true });
    expect(r.dimensions.find((d) => d.key === 'certification-attribution')?.status).toBe('ready');
  });
});
