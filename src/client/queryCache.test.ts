import { describe, expect, it } from 'vitest';
import { applyServerEventToState, emptyClientState } from './queryCache';
import type { AgentTask, FolderRecord, PendingPermission } from '../shared/types';

describe('applyServerEventToState', () => {
  it('hydrates from a snapshot and upserts later folder/task updates', () => {
    const folder = makeFolder('folder-1');
    const task = makeTask('task-1');

    const hydrated = applyServerEventToState(emptyClientState, {
      type: 'snapshot',
      data: {
        folders: [folder],
        tasks: [task],
        permissions: [],
      },
    });

    const updatedTask = { ...task, status: 'idle' as const, updatedAt: '2026-01-01T00:01:00.000Z' };
    const next = applyServerEventToState(hydrated, { type: 'task.updated', data: updatedTask });

    expect(next.folders).toEqual([folder]);
    expect(next.tasks).toEqual([updatedTask]);
    expect(next.permissions).toEqual([]);
  });

  it('adds and removes pending permissions', () => {
    const permission: PendingPermission = {
      id: 'permission-1',
      sessionId: 'session-1',
      kind: 'shell',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    const withPermission = applyServerEventToState(emptyClientState, {
      type: 'permission.pending',
      data: permission,
    });
    const resolved = applyServerEventToState(withPermission, {
      type: 'permission.resolved',
      data: { ...permission, status: 'resolved' },
    });

    expect(withPermission.permissions).toEqual([permission]);
    expect(resolved.permissions).toEqual([]);
  });
});

function makeFolder(id: string): FolderRecord {
  return {
    id,
    name: 'Project',
    path: '/tmp/project',
    exists: true,
    git: { branch: 'main', dirty: false },
    packageManager: 'npm',
    scripts: ['test'],
    instructionFiles: [],
    githubAssets: [],
    scannedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeTask(id: string): AgentTask {
  return {
    id,
    folderId: 'folder-1',
    prompt: 'Test',
    mode: 'plan',
    commandMode: 'enqueue',
    model: 'gpt-5',
    status: 'running',
    phase: 'running',
    waitReason: null,
    outcome: null,
    selectedSkillIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
