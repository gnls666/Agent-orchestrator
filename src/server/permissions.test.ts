import { describe, expect, it } from 'vitest';
import { PermissionBroker } from './permissions';

describe('PermissionBroker', () => {
  it('publishes a pending permission and resolves it from a UI decision', async () => {
    const published: unknown[] = [];
    const broker = new PermissionBroker((event) => published.push(event));

    const requestPromise = broker.request({ kind: 'write', toolCallId: 'tool-1' }, { sessionId: 'session-1' });
    const pending = broker.listPending();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: 'write',
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      status: 'pending',
    });
    expect(published).toEqual([
      expect.objectContaining({
        type: 'permission.pending',
        data: expect.objectContaining({ kind: 'write' }),
      }),
    ]);

    broker.resolve(pending[0].id, { kind: 'approve-once' });

    await expect(requestPromise).resolves.toEqual({ kind: 'approve-once' });
    expect(broker.listPending()).toHaveLength(0);
  });

  it('rejects an unknown permission id', () => {
    const broker = new PermissionBroker(() => undefined);

    expect(() => broker.resolve('missing', { kind: 'reject', feedback: 'No' })).toThrow('Permission request not found');
  });

  it('approves future permission requests in the same session after allowing a run', async () => {
    const published: unknown[] = [];
    const broker = new PermissionBroker((event) => published.push(event));

    const firstRequest = broker.request({ kind: 'shell', toolCallId: 'tool-1' }, { sessionId: 'session-1' });
    const [pending] = broker.listPending();

    broker.resolveForRun(pending.id);

    await expect(firstRequest).resolves.toEqual({ kind: 'approve-once' });
    expect(broker.listPending()).toHaveLength(0);

    const secondRequest = broker.request({ kind: 'write', toolCallId: 'tool-2' }, { sessionId: 'session-1' });

    await expect(Promise.resolve(secondRequest)).resolves.toEqual({ kind: 'approve-once' });
    expect(broker.listPending()).toHaveLength(0);
    expect(published).toEqual([
      expect.objectContaining({ type: 'permission.pending' }),
      expect.objectContaining({ type: 'permission.resolved' }),
    ]);
  });
});
