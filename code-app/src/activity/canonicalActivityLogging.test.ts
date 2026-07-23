import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_TYPE_OPTIONS,
  ACTIVITY_TYPE_TO_DEAL_TIMELINE_EVENT_TYPE,
  foldOutcomeAndFollowUp,
  appendFoldedOutcomeAndFollowUp,
} from './canonicalActivityLogging';

describe('canonicalActivityLogging', () => {
  it('exposes exactly the four canonical activity types, each with a label and a unique deal-timeline eventtype code', () => {
    expect(CANONICAL_ACTIVITY_TYPES).toEqual(['call', 'email', 'meeting', 'note']);
    for (const type of CANONICAL_ACTIVITY_TYPES) {
      expect(ACTIVITY_TYPE_LABEL[type]).toBeTruthy();
      expect(typeof ACTIVITY_TYPE_TO_DEAL_TIMELINE_EVENT_TYPE[type]).toBe('number');
    }
    const codes = CANONICAL_ACTIVITY_TYPES.map((t) => ACTIVITY_TYPE_TO_DEAL_TIMELINE_EVENT_TYPE[t]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ACTIVITY_TYPE_OPTIONS mirrors CANONICAL_ACTIVITY_TYPES/label 1:1, in order', () => {
    expect(ACTIVITY_TYPE_OPTIONS.map((o) => o.value)).toEqual([...CANONICAL_ACTIVITY_TYPES]);
    for (const opt of ACTIVITY_TYPE_OPTIONS) {
      expect(opt.label).toBe(ACTIVITY_TYPE_LABEL[opt.value]);
    }
  });

  describe('foldOutcomeAndFollowUp', () => {
    it('returns empty string when both are absent', () => {
      expect(foldOutcomeAndFollowUp(undefined, undefined)).toBe('');
      expect(foldOutcomeAndFollowUp('  ', '   ')).toBe('');
    });

    it('renders outcome only', () => {
      expect(foldOutcomeAndFollowUp('Left voicemail', undefined)).toBe('Outcome: Left voicemail');
    });

    it('renders next-follow-up only', () => {
      expect(foldOutcomeAndFollowUp(undefined, '2026-08-01')).toBe('Next follow-up: 2026-08-01');
    });

    it('renders both, separated by a middle dot', () => {
      expect(foldOutcomeAndFollowUp('Connected', '2026-08-01')).toBe(
        'Outcome: Connected · Next follow-up: 2026-08-01',
      );
    });
  });

  describe('appendFoldedOutcomeAndFollowUp', () => {
    it('returns the base string unchanged when nothing folds in', () => {
      expect(appendFoldedOutcomeAndFollowUp('Client called.', undefined, undefined)).toBe('Client called.');
    });

    it('appends the folded text with a separator when present', () => {
      expect(appendFoldedOutcomeAndFollowUp('Client called.', 'Connected', undefined)).toBe(
        'Client called. · Outcome: Connected',
      );
    });
  });
});
