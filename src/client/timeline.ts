export type TimelineKind =
  | 'assistant'
  | 'reasoning'
  | 'tool'
  | 'permission'
  | 'command'
  | 'status'
  | 'error'
  | 'system';

export type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export type TimelinePresentation = {
  kind: TimelineKind;
  title: string;
  body: string;
  tone: TimelineTone;
  isCollapsible: boolean;
  isUserFacing: boolean;
};

type TimelineSourceEvent = {
  type?: string;
  data?: unknown;
};

const BODY_LIMIT = 1400;

export function formatTimelineEvent(event: TimelineSourceEvent): TimelinePresentation {
  const type = event.type ?? 'session.event';
  const data = asRecord(event.data);

  if (type === 'assistant.message' || type === 'assistant.message_delta') {
    return {
      kind: 'assistant',
      title: type.endsWith('_delta') ? 'Drafting reply' : 'Agent replied',
      body: eventBody(data, type),
      tone: 'info',
      isCollapsible: false,
      isUserFacing: !type.endsWith('_delta'),
    };
  }

  if (type === 'assistant.reasoning' || type === 'assistant.reasoning_delta') {
    return {
      kind: 'reasoning',
      title: type.endsWith('_delta') ? 'Planning response' : 'Planned next step',
      body: 'Internal reasoning is hidden.',
      tone: 'neutral',
      isCollapsible: false,
      isUserFacing: !type.endsWith('_delta'),
    };
  }

  if (type === 'session.start') {
    return {
      kind: 'status',
      title: 'Task started',
      body: 'Agent session started.',
      tone: 'info',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  if (type === 'tool.execution_start') {
    const toolName = fieldText(data, 'toolName') ?? fieldText(data, 'name') ?? 'Tool';
    return {
      kind: 'tool',
      title: `Running ${toolName}`,
      body: summarizeRecord(asRecord(data?.arguments) ?? asRecord(data?.args) ?? asRecord(data?.input)) || eventBody(data, type),
      tone: 'neutral',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  if (type === 'tool.execution_complete') {
    const toolName = fieldText(data, 'toolName') ?? fieldText(data, 'name') ?? 'Tool';
    const failed = data?.success === false || isNonZeroExitCode(data?.exitCode) || Boolean(data?.error);
    return {
      kind: 'tool',
      title: `${toolName} ${failed ? 'failed' : 'complete'}`,
      body: toolCompletionBody(data, type),
      tone: failed ? 'error' : 'success',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  if (type === 'permission.requested' || type === 'permission.pending') {
    const kind = fieldText(data, 'kind') ?? 'approval';
    const toolCallId = fieldText(data, 'toolCallId');
    return {
      kind: 'permission',
      title: 'Eli needs a decision',
      body: toolCallId ? `${permissionLabel(kind)}\n${toolCallId}` : permissionLabel(kind),
      tone: 'warning',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  if (type === 'permission.resolved') {
    return {
      kind: 'permission',
      title: 'Permission resolved',
      body: eventBody(data, type),
      tone: 'success',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  if (type === 'command.execute') {
    return {
      kind: 'command',
      title: fieldText(data, 'command') ?? 'Command',
      body: summarizeRecord(data) || eventBody(data, type),
      tone: 'neutral',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  if (type === 'session.error') {
    return {
      kind: 'error',
      title: 'Session error',
      body: eventBody(data, type),
      tone: 'error',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  if (type === 'session.idle') {
    return {
      kind: 'status',
      title: 'Agent finished',
      body: eventBody(data, 'Ready for the next instruction.'),
      tone: 'success',
      isCollapsible: false,
      isUserFacing: true,
    };
  }

  return {
    kind: 'system',
    title: 'System event',
    body: eventBody(data, type),
    tone: 'neutral',
    isCollapsible: true,
    isUserFacing: false,
  };
}

function permissionLabel(kind: string): string {
  if (kind === 'read') {
    return 'Read project files';
  }

  if (kind === 'edit' || kind === 'write') {
    return 'Change project files';
  }

  if (kind === 'shell' || kind === 'command') {
    return 'Run a command';
  }

  return 'Continue with a protected action';
}

function toolCompletionBody(data: Record<string, unknown> | undefined, fallback: string): string {
  if (!data) {
    return fallback;
  }

  const error = valueText(data.error);
  if (error) {
    return truncate(error);
  }

  const output = fieldText(data, 'output') ?? fieldText(data, 'result') ?? fieldText(data, 'content') ?? fieldText(data, 'message');
  if (output) {
    return truncate(output);
  }

  return summarizeRecord(data) || fallback;
}

function eventBody(data: Record<string, unknown> | undefined, fallback: string): string {
  if (!data || Object.keys(data).length === 0) {
    return fallback;
  }

  const body =
    fieldText(data, 'content') ??
    fieldText(data, 'deltaContent') ??
    fieldText(data, 'message') ??
    fieldText(data, 'command') ??
    fieldText(data, 'output') ??
    fieldText(data, 'result');

  return truncate(body ?? JSON.stringify(data, null, 2));
}

function summarizeRecord(record: Record<string, unknown> | undefined): string {
  if (!record) {
    return '';
  }

  return truncate(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${valueText(value) ?? ''}`)
      .join('\n'),
  );
}

function fieldText(record: Record<string, unknown> | undefined, field: string): string | undefined {
  if (!record) {
    return undefined;
  }

  return valueText(record[field]);
}

function valueText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function isNonZeroExitCode(value: unknown): boolean {
  return typeof value === 'number' && value !== 0;
}

function truncate(value: string): string {
  if (value.length <= BODY_LIMIT) {
    return value;
  }

  return `${value.slice(0, BODY_LIMIT - 1)}...`;
}
