import { describe, it, expect, vi } from 'vitest';
import { generateDestinationStageWork, type DealTaskCreator } from './generateDestinationStageWork';

/**
 * Destination-stage work generation. Pins: advancing to Underwriting seeds that stage's standard
 * tasks as real governed rows, assigned to the acting banker and associated to the deal; it is
 * idempotent by title; a failed create is captured, never thrown.
 */

describe('generateDestinationStageWork', () => {
  it('creates the destination stage standard tasks, assigned to the banker + on the deal', async () => {
    const create = vi.fn(async (_input: unknown) => ({ kind: 'success' as const, taskId: 't' }));
    const res = await generateDestinationStageWork(
      { dealId: 'deal-1', stageCode: 'UNDERWRITING', actorSystemUserId: 'sys-1', actorEmail: 'banker@bank.com' },
      create as unknown as DealTaskCreator,
    );
    expect(res.created).toEqual(['Document intake review', 'Underwriting analysis']);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({
      dealId: 'deal-1',
      taskName: 'Document intake review',
      assigneeSystemUserId: 'sys-1',
      actorEmail: 'banker@bank.com',
    });
  });

  it('is idempotent by title — skips work already open on the deal', async () => {
    const create = vi.fn(async (_input: unknown) => ({ kind: 'success' as const, taskId: 't' }));
    const res = await generateDestinationStageWork(
      { dealId: 'deal-1', stageCode: 'UNDERWRITING', actorSystemUserId: 'sys-1', actorEmail: 'b', existingOpenTaskTitles: ['document intake review'] },
      create as unknown as DealTaskCreator,
    );
    expect(res.skipped).toContain('Document intake review');
    expect(res.created).toEqual(['Underwriting analysis']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('counts a governance-partial create as created (the task row IS persisted)', async () => {
    const create = vi.fn(async () => ({ kind: 'governance-partial' as const, taskId: 't', auditError: 'x', timelineError: undefined }));
    const res = await generateDestinationStageWork(
      { dealId: 'deal-1', stageCode: 'UNDERWRITING', actorSystemUserId: 'sys-1', actorEmail: 'b' },
      create as unknown as DealTaskCreator,
    );
    expect(res.created).toEqual(['Document intake review', 'Underwriting analysis']);
    expect(res.failed).toEqual([]);
  });

  it('captures a failed create without throwing', async () => {
    const create = vi.fn(async () => ({ kind: 'task-create-failed' as const, taskError: 'boom' }));
    const res = await generateDestinationStageWork(
      { dealId: 'deal-1', stageCode: 'UNDERWRITING', actorSystemUserId: 'sys-1', actorEmail: 'b' },
      create as unknown as DealTaskCreator,
    );
    expect(res.created).toEqual([]);
    expect(res.failed.map((f) => f.title)).toEqual(['Document intake review', 'Underwriting analysis']);
    expect(res.failed[0].error).toBe('boom');
  });

  it('generates nothing for an unrecognized stage', async () => {
    const create = vi.fn(async (_input: unknown) => ({ kind: 'success' as const, taskId: 't' }));
    const res = await generateDestinationStageWork(
      { dealId: 'deal-1', stageCode: 'NOPE', actorSystemUserId: 'sys-1', actorEmail: 'b' },
      create as unknown as DealTaskCreator,
    );
    expect(res.created).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});
