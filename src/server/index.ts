import http from 'node:http';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CopilotClient, type CopilotSession } from '@github/copilot-sdk';
import { WebSocketServer, type WebSocket } from 'ws';
import { pickFolder, scanFolder } from './folders';
import { normalizeModels } from './models';
import { PermissionBroker } from './permissions';
import { buildTaskPrompt } from './tasks';
import type { AgentTask, FolderRecord, PermissionDecision, ServerEvent } from '../shared/types';

const PORT = Number(process.env.PORT ?? 4317);
const folders = new Map<string, FolderRecord>();
const tasks = new Map<string, AgentTask>();
const sessions = new Map<string, CopilotSession>();
const sockets = new Set<WebSocket>();

let copilotClient: CopilotClient | undefined;

function publish(event: ServerEvent): void {
  if (event.type === 'permission.pending') {
    updateTaskBySession(event.data.sessionId, { phase: 'waiting', waitReason: 'approval' });
  }

  if (event.type === 'permission.resolved') {
    updateTaskBySession(event.data.sessionId, { phase: 'running', waitReason: null });
  }

  const payload = JSON.stringify(event);

  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

const permissionBroker = new PermissionBroker(publish);

const server = http.createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unexpected server error',
    });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname !== '/api/events') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    sockets.add(ws);
    ws.send(JSON.stringify(snapshot()));
    ws.on('close', () => sockets.delete(ws));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Agent Orchestrator API listening on http://127.0.0.1:${PORT}`);
});

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});

async function route(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, undefined);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/state') {
    sendJson(response, 200, snapshot().data);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/models') {
    const client = await getCopilotClient();
    const models = await client.listModels();
    sendJson(response, 200, normalizeModels(models));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/folders') {
    const body = await readJson<{ path?: string }>(request);
    const folder = await scanFolder(body.path ?? '');
    folders.set(folder.id, folder);
    publish({ type: 'folder.updated', data: folder });
    sendJson(response, 201, folder);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/folders/pick') {
    const folder = await pickFolder();
    folders.set(folder.id, folder);
    publish({ type: 'folder.updated', data: folder });
    sendJson(response, 201, folder);
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/folders/') && url.pathname.endsWith('/rescan')) {
    const folderId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
    const existing = folders.get(folderId);

    if (!existing) {
      sendJson(response, 404, { error: 'Folder not found' });
      return;
    }

    const folder = await scanFolder(existing.path);
    folders.set(folder.id, folder);
    publish({ type: 'folder.updated', data: folder });
    sendJson(response, 200, folder);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/tasks') {
    const body = await readJson<{
      folderId?: string;
      prompt?: string;
      mode?: AgentTask['mode'];
      model?: string;
      reasoningEffort?: AgentTask['reasoningEffort'];
      commandMode?: AgentTask['commandMode'];
      selectedAgentId?: string;
      selectedSkillIds?: string[];
    }>(request);
    const task = await startTask(body);
    sendJson(response, 201, task);
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/abort')) {
    const taskId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
    const task = await abortTask(taskId);
    sendJson(response, 200, task);
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/permissions/') && url.pathname.endsWith('/resolve')) {
    const permissionId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
    const body = await readJson<{ kind?: PermissionDecision; feedback?: string }>(request);

    if (body.kind !== 'approve-once' && body.kind !== 'approve-run' && body.kind !== 'reject') {
      sendJson(response, 400, { error: 'Unsupported permission decision' });
      return;
    }

    if (body.kind === 'approve-run') {
      permissionBroker.resolveForRun(permissionId);
    } else {
      permissionBroker.resolve(
        permissionId,
        body.kind === 'reject' ? { kind: 'reject', feedback: body.feedback } : { kind: 'approve-once' },
      );
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

async function startTask(input: {
  folderId?: string;
  prompt?: string;
  mode?: AgentTask['mode'];
  model?: string;
  reasoningEffort?: AgentTask['reasoningEffort'];
  commandMode?: AgentTask['commandMode'];
  selectedAgentId?: string;
  selectedSkillIds?: string[];
}): Promise<AgentTask> {
  const folder = input.folderId ? folders.get(input.folderId) : undefined;
  const prompt = input.prompt?.trim();

  if (!folder) {
    throw new Error('Folder is required');
  }

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  const selectedAgent = input.selectedAgentId
    ? folder.githubAssets.find((asset) => asset.kind === 'agent' && asset.id === input.selectedAgentId)
    : undefined;
  const selectedSkills = (input.selectedSkillIds ?? [])
    .map((skillId) => folder.githubAssets.find((asset) => asset.kind === 'skill' && asset.id === skillId))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  const now = new Date().toISOString();
  const task: AgentTask = {
    id: crypto.randomUUID(),
    folderId: folder.id,
    prompt,
    mode: input.mode ?? 'run',
    commandMode: input.commandMode ?? 'enqueue',
    model: input.model?.trim() || 'gpt-5',
    reasoningEffort: input.reasoningEffort,
    status: 'running',
    phase: 'running',
    waitReason: null,
    outcome: null,
    selectedAgentId: selectedAgent?.id,
    selectedSkillIds: selectedSkills.map((skill) => skill.id),
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(task.id, task);
  publish({ type: 'task.updated', data: task });

  void runTask(task, folder).catch((error) => {
    updateTask(task.id, {
      status: 'failed',
      phase: 'terminal',
      waitReason: null,
      outcome: 'failed',
      error: error instanceof Error ? error.message : 'Task failed',
    });
  });

  return task;
}

async function runTask(task: AgentTask, folder: FolderRecord): Promise<void> {
  const client = await getCopilotClient();
  const selectedAgent = task.selectedAgentId
    ? folder.githubAssets.find((asset) => asset.id === task.selectedAgentId)
    : undefined;
  const selectedSkills = task.selectedSkillIds
    .map((skillId) => folder.githubAssets.find((asset) => asset.id === skillId))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  const customAgents = selectedAgent
    ? [
        {
          name: selectedAgent.name,
          displayName: selectedAgent.title,
          description: selectedAgent.description,
          prompt: await readFile(path.join(folder.path, selectedAgent.path), 'utf8'),
          skills: selectedSkills.map((skill) => skill.name),
        },
      ]
    : undefined;
  const skillDirectories = selectedSkills.length > 0 ? [path.join(folder.path, '.github', 'skills')] : undefined;
  const session = await client.createSession({
    clientName: 'agent-orchestrator',
    model: task.model,
    reasoningEffort: task.reasoningEffort,
    workingDirectory: folder.path,
    streaming: true,
    enableConfigDiscovery: true,
    customAgents,
    agent: selectedAgent?.name,
    skillDirectories,
    onPermissionRequest: permissionBroker.request,
  });

  sessions.set(task.id, session);
  updateTask(task.id, { sessionId: session.sessionId });

  session.on((event) => {
    publish({
      type: 'session.event',
      data: {
        taskId: task.id,
        sessionId: session.sessionId,
        event,
      },
    });

    if (event.type === 'assistant.message') {
      updateTask(task.id, { lastMessage: event.data.content });
    }

    if (event.type === 'session.idle') {
      updateTask(task.id, { status: 'idle', phase: 'waiting', waitReason: 'operator' });
    }

    if (event.type === 'session.error') {
      updateTask(task.id, { status: 'failed', phase: 'terminal', waitReason: null, outcome: 'failed', error: event.data.message });
    }
  });

  await session.send({
    prompt: buildTaskPrompt({
      mode: task.mode,
      userPrompt: task.prompt,
      folderPath: folder.path,
      selectedAgentPath: selectedAgent?.path,
      selectedSkillPaths: selectedSkills.map((skill) => skill.path),
    }),
    mode: task.commandMode,
  });
}

async function abortTask(taskId: string): Promise<AgentTask> {
  const task = tasks.get(taskId);

  if (!task) {
    throw new Error('Task not found');
  }

  const session = sessions.get(taskId);
  await session?.abort();
  return updateTask(taskId, { status: 'aborted', phase: 'terminal', waitReason: null, outcome: 'canceled' });
}

async function getCopilotClient(): Promise<CopilotClient> {
  if (!copilotClient) {
    copilotClient = new CopilotClient({
      logLevel: 'info',
      useLoggedInUser: true,
    });
    await copilotClient.start();
  }

  return copilotClient;
}

function updateTask(taskId: string, patch: Partial<AgentTask>): AgentTask {
  const current = tasks.get(taskId);

  if (!current) {
    throw new Error('Task not found');
  }

  const next: AgentTask = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  tasks.set(taskId, next);
  publish({ type: 'task.updated', data: next });
  return next;
}

function updateTaskBySession(sessionId: string, patch: Partial<AgentTask>): void {
  const task = [...tasks.values()].find((candidate) => candidate.sessionId === sessionId);

  if (task) {
    updateTask(task.id, patch);
  }
}

function snapshot(): ServerEvent {
  return {
    type: 'snapshot',
    data: {
      folders: [...folders.values()],
      tasks: [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      permissions: permissionBroker.listPending(),
    },
  };
}

async function readJson<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

async function shutdown(): Promise<void> {
  for (const session of sessions.values()) {
    await session.disconnect().catch(() => undefined);
  }

  if (copilotClient) {
    await copilotClient.stop().catch(() => []);
  }

  server.close(() => process.exit(0));
}
