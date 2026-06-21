import type { AgentTask, FolderRecord, PendingPermission, ServerEvent } from '../shared/types';

export type ClientState = {
  folders: FolderRecord[];
  tasks: AgentTask[];
  permissions: PendingPermission[];
};

export const queryKeys = {
  state: ['state'] as const,
  models: ['models'] as const,
};

export const emptyClientState: ClientState = {
  folders: [],
  tasks: [],
  permissions: [],
};

export function applyServerEventToState(current: ClientState | undefined, event: ServerEvent): ClientState {
  const state = current ?? emptyClientState;

  if (event.type === 'snapshot') {
    return event.data;
  }

  if (event.type === 'folder.updated') {
    return {
      ...state,
      folders: upsertById(state.folders, event.data),
    };
  }

  if (event.type === 'task.updated') {
    return {
      ...state,
      tasks: upsertById(state.tasks, event.data).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  if (event.type === 'permission.pending') {
    return {
      ...state,
      permissions: upsertById(state.permissions, event.data),
    };
  }

  if (event.type === 'permission.resolved') {
    return {
      ...state,
      permissions: state.permissions.filter((permission) => permission.id !== event.data.id),
    };
  }

  return state;
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((current) => current.id === item.id);

  if (index === -1) {
    return [item, ...items];
  }

  const next = [...items];
  next[index] = item;
  return next;
}
