export type GitInfo = {
  root?: string;
  branch?: string;
  dirty: boolean;
};

export type GitHubCopilotAsset = {
  id: string;
  kind: 'agent' | 'skill';
  name: string;
  path: string;
  title: string;
  description?: string;
};

export type FolderRecord = {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  git: GitInfo;
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
  scripts: string[];
  instructionFiles: string[];
  githubAssets: GitHubCopilotAsset[];
  scannedAt: string;
};

export type TaskStatus = 'queued' | 'running' | 'idle' | 'failed' | 'aborted';
export type TaskPhase = 'queued' | 'running' | 'waiting' | 'paused' | 'terminal';
export type TaskWaitReason = 'approval' | 'input' | 'external' | 'budget' | 'operator';
export type TaskOutcome = 'succeeded' | 'failed' | 'canceled';
export type TaskCommandMode = 'enqueue' | 'immediate';

export type AgentTask = {
  id: string;
  folderId: string;
  prompt: string;
  mode: 'plan' | 'run';
  commandMode: TaskCommandMode;
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  status: TaskStatus;
  phase: TaskPhase;
  waitReason: TaskWaitReason | null;
  outcome: TaskOutcome | null;
  sessionId?: string;
  selectedAgentId?: string;
  selectedSkillIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  error?: string;
};

export type PermissionStatus = 'pending' | 'resolved';

export type PendingPermission = {
  id: string;
  sessionId: string;
  kind: string;
  toolCallId?: string;
  status: PermissionStatus;
  createdAt: string;
};

export type PermissionDecision = 'approve-once' | 'approve-run' | 'reject';

export type ModelOption = {
  id: string;
  name: string;
  supportsReasoningEffort: boolean;
  supportsVision: boolean;
  supportedReasoningEfforts: Array<'low' | 'medium' | 'high' | 'xhigh'>;
  defaultReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  billingMultiplier?: number;
};

export type ServerEvent =
  | { type: 'snapshot'; data: { folders: FolderRecord[]; tasks: AgentTask[]; permissions: PendingPermission[] } }
  | { type: 'folder.updated'; data: FolderRecord }
  | { type: 'task.updated'; data: AgentTask }
  | { type: 'session.event'; data: { taskId: string; sessionId: string; event: unknown } }
  | { type: 'permission.pending'; data: PendingPermission }
  | { type: 'permission.resolved'; data: PendingPermission };
