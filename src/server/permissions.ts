import type { PermissionHandler, PermissionRequestResult } from '@github/copilot-sdk';
import type { PendingPermission, ServerEvent } from '../shared/types';

type PermissionDecision = Extract<PermissionRequestResult, { kind: string }>;
type PublishEvent = (event: ServerEvent) => void;

type PendingEntry = PendingPermission & {
  resolve: (decision: PermissionDecision) => void;
};

export class PermissionBroker {
  private pending = new Map<string, PendingEntry>();
  private trustedSessions = new Set<string>();

  constructor(private readonly publish: PublishEvent) {}

  request: PermissionHandler = (request, invocation) => {
    if (this.trustedSessions.has(invocation.sessionId)) {
      return { kind: 'approve-once' };
    }

    const pending: PendingPermission = {
      id: crypto.randomUUID(),
      sessionId: invocation.sessionId,
      kind: request.kind,
      toolCallId: request.toolCallId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const promise = new Promise<PermissionDecision>((resolve) => {
      this.pending.set(pending.id, { ...pending, resolve });
    });

    this.publish({ type: 'permission.pending', data: pending });
    return promise;
  };

  listPending(): PendingPermission[] {
    return [...this.pending.values()].map(({ resolve: _resolve, ...permission }) => permission);
  }

  resolve(id: string, decision: PermissionDecision): void {
    const pending = this.pending.get(id);

    if (!pending) {
      throw new Error('Permission request not found');
    }

    this.pending.delete(id);
    pending.resolve(decision);

    const resolved: PendingPermission = {
      id: pending.id,
      sessionId: pending.sessionId,
      kind: pending.kind,
      toolCallId: pending.toolCallId,
      status: 'resolved',
      createdAt: pending.createdAt,
    };
    this.publish({ type: 'permission.resolved', data: resolved });
  }

  resolveForRun(id: string): void {
    const pending = this.pending.get(id);

    if (!pending) {
      throw new Error('Permission request not found');
    }

    this.trustedSessions.add(pending.sessionId);
    this.resolve(id, { kind: 'approve-once' });
  }
}
