import type { AgentTask, FolderRecord, ModelOption, PermissionDecision } from '../shared/types';
import type { ClientState } from './queryCache';

export async function getState(): Promise<ClientState> {
  return getJson('/api/state');
}

export async function getModels(): Promise<ModelOption[]> {
  return getJson('/api/models');
}

export async function addFolder(path: string): Promise<FolderRecord> {
  return postJson('/api/folders', { path });
}

export async function pickFolder(): Promise<FolderRecord> {
  return postJson('/api/folders/pick', {});
}

export async function rescanFolder(folderId: string): Promise<FolderRecord> {
  return postJson(`/api/folders/${encodeURIComponent(folderId)}/rescan`, {});
}

export async function startTask(input: {
  folderId: string;
  prompt: string;
  mode: AgentTask['mode'];
  commandMode: AgentTask['commandMode'];
  model: string;
  reasoningEffort?: AgentTask['reasoningEffort'];
  selectedAgentId?: string;
  selectedSkillIds: string[];
}): Promise<AgentTask> {
  return postJson('/api/tasks', input);
}

export async function abortTask(taskId: string): Promise<AgentTask> {
  return postJson(`/api/tasks/${encodeURIComponent(taskId)}/abort`, {});
}

export async function resolvePermission(permissionId: string, kind: PermissionDecision, feedback?: string): Promise<void> {
  await postJson(`/api/permissions/${encodeURIComponent(permissionId)}/resolve`, { kind, feedback });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed: ${response.status}`;
    throw new Error(error);
  }

  return payload as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed: ${response.status}`;
    throw new Error(error);
  }

  return payload as T;
}
