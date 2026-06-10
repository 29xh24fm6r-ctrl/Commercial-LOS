import { describe, it, expect } from 'vitest';
import {
  DRILL_PARAM,
  MAX_TARGET_ID_LENGTH,
  buildDrillThroughSearch,
  buildDrillThroughUrl,
  isValidDrillThroughTargetId,
  parseDrillThroughTargetId,
  removeDrillThroughParam,
  sanitizeDrillThroughTargetId,
} from './drillThroughDeepLink';

describe('Phase 144D — sanitizeDrillThroughTargetId', () => {
  it('accepts safe ids (letters, numbers, colon, dash, underscore, period)', () => {
    for (const id of ['portfolio-kpi-blocked', 'manager:kpi:blocked-deals', 'chart-seg-risk.distribution_1', 'A1:b2-c3']) {
      expect(sanitizeDrillThroughTargetId(id)).toBe(id);
      expect(isValidDrillThroughTargetId(id)).toBe(true);
    }
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeDrillThroughTargetId('  portfolio-kpi-blocked  ')).toBe('portfolio-kpi-blocked');
  });

  it('rejects empty / non-string', () => {
    for (const bad of ['', '   ', null, undefined, 123 as unknown as string]) {
      expect(sanitizeDrillThroughTargetId(bad as string)).toBeNull();
    }
  });

  it('rejects slashes, angle brackets, quotes, spaces, and query fragments', () => {
    for (const bad of ['a/b', 'a\\b', '<script>', 'a"b', "a'b", 'a b', 'a?b=1', 'a&b', 'a#x', 'a%20b']) {
      expect(sanitizeDrillThroughTargetId(bad)).toBeNull();
    }
  });

  it('rejects protocol / payload-ish ids even though the charset allows colon', () => {
    for (const bad of ['javascript:alert', 'JavaScript:alert', 'data:text', 'vbscript:x', 'a-script-b', 'a://b']) {
      expect(sanitizeDrillThroughTargetId(bad)).toBeNull();
    }
  });

  it('rejects overly long ids', () => {
    const tooLong = 'a'.repeat(MAX_TARGET_ID_LENGTH + 1);
    expect(sanitizeDrillThroughTargetId(tooLong)).toBeNull();
    expect(sanitizeDrillThroughTargetId('a'.repeat(MAX_TARGET_ID_LENGTH))).not.toBeNull();
  });
});

describe('Phase 144D — parse / build / remove', () => {
  it('parses a valid drill param from a search string or URLSearchParams', () => {
    expect(parseDrillThroughTargetId('?drill=portfolio-kpi-blocked')).toBe('portfolio-kpi-blocked');
    expect(parseDrillThroughTargetId(new URLSearchParams('drill=portfolio-kpi-blocked'))).toBe('portfolio-kpi-blocked');
    expect(parseDrillThroughTargetId('?foo=1')).toBeNull();
  });

  it('parsing an unsafe drill param fails closed', () => {
    expect(parseDrillThroughTargetId('?drill=javascript:alert')).toBeNull();
    expect(parseDrillThroughTargetId('?drill=a/b')).toBeNull();
  });

  it('builds a search string with the drill param, preserving unrelated params', () => {
    const out = buildDrillThroughSearch('?banker=lee&tab=exposure', 'portfolio-kpi-blocked');
    const params = new URLSearchParams(out.slice(1));
    expect(params.get('banker')).toBe('lee');
    expect(params.get('tab')).toBe('exposure');
    expect(params.get(DRILL_PARAM)).toBe('portfolio-kpi-blocked');
  });

  it('building with an unsafe id removes the drill param (fail closed)', () => {
    const out = buildDrillThroughSearch('?drill=old&banker=lee', 'javascript:alert');
    const params = new URLSearchParams(out.slice(1));
    expect(params.has(DRILL_PARAM)).toBe(false);
    expect(params.get('banker')).toBe('lee');
  });

  it('removes the drill param on close, preserving unrelated params', () => {
    const out = removeDrillThroughParam('?banker=lee&drill=portfolio-kpi-blocked&tab=exposure');
    const params = new URLSearchParams(out.slice(1));
    expect(params.has(DRILL_PARAM)).toBe(false);
    expect(params.get('banker')).toBe('lee');
    expect(params.get('tab')).toBe('exposure');
  });

  it('removing the only param yields an empty search', () => {
    expect(removeDrillThroughParam('?drill=portfolio-kpi-blocked')).toBe('');
  });

  it('builds a SAME-PAGE relative url with no protocol/host (never external)', () => {
    const url = buildDrillThroughUrl({ pathname: '/workspace/portfolio', search: '?banker=lee' }, 'portfolio-kpi-blocked');
    expect(url.startsWith('/workspace/portfolio')).toBe(true);
    expect(url).toContain(`${DRILL_PARAM}=portfolio-kpi-blocked`);
    expect(url).not.toMatch(/https?:|:\/\//);
  });
});
