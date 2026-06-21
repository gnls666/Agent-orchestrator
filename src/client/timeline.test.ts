import { describe, expect, it } from 'vitest';
import { formatTimelineEvent } from './timeline';

describe('formatTimelineEvent', () => {
  it('turns assistant content into a readable message event', () => {
    expect(
      formatTimelineEvent({
        type: 'assistant.message',
        data: { content: 'I inspected the project and found the API boundary.' },
      }),
    ).toMatchObject({
      kind: 'assistant',
      title: 'Agent replied',
      body: 'I inspected the project and found the API boundary.',
      tone: 'info',
      isCollapsible: false,
      isUserFacing: true,
    });
  });

  it('keeps streaming deltas out of the main activity feed', () => {
    expect(
      formatTimelineEvent({
        type: 'assistant.message_delta',
        data: { deltaContent: 'partial text' },
      }),
    ).toMatchObject({
      kind: 'assistant',
      title: 'Drafting reply',
      body: 'partial text',
      isUserFacing: false,
    });
  });

  it('turns session lifecycle events into product activity', () => {
    expect(formatTimelineEvent({ type: 'session.start', data: {} })).toMatchObject({
      kind: 'status',
      title: 'Task started',
      body: 'Agent session started.',
      tone: 'info',
      isUserFacing: true,
    });

    expect(formatTimelineEvent({ type: 'session.idle', data: {} })).toMatchObject({
      kind: 'status',
      title: 'Agent finished',
      body: 'Ready for the next instruction.',
      tone: 'success',
      isUserFacing: true,
    });
  });

  it('shows reasoning as a generic planning step without exposing internals', () => {
    expect(
      formatTimelineEvent({
        type: 'assistant.reasoning',
        data: { content: 'private chain of thought' },
      }),
    ).toMatchObject({
      kind: 'reasoning',
      title: 'Planned next step',
      body: 'Internal reasoning is hidden.',
      isUserFacing: true,
    });
  });

  it('summarizes tool start events around the tool name and arguments', () => {
    expect(
      formatTimelineEvent({
        type: 'tool.execution_start',
        data: {
          toolName: 'shell',
          args: { command: 'npm test', cwd: '/tmp/project' },
        },
      }),
    ).toMatchObject({
      kind: 'tool',
      title: 'Running shell',
      body: 'command: npm test\ncwd: /tmp/project',
      tone: 'neutral',
      isCollapsible: false,
      isUserFacing: true,
    });
  });

  it('marks failed tool completions as error events', () => {
    expect(
      formatTimelineEvent({
        type: 'tool.execution_complete',
        data: {
          toolName: 'shell',
          exitCode: 1,
          output: 'Tests failed',
        },
      }),
    ).toMatchObject({
      kind: 'tool',
      title: 'shell failed',
      body: 'Tests failed',
      tone: 'error',
      isCollapsible: false,
      isUserFacing: true,
    });
  });

  it('promotes permission events into a clear gate', () => {
    expect(
      formatTimelineEvent({
        type: 'permission.requested',
        data: { kind: 'shell', toolCallId: 'tool-123' },
      }),
    ).toMatchObject({
      kind: 'permission',
      title: 'Eli needs a decision',
      body: 'Run a command\ntool-123',
      tone: 'warning',
      isCollapsible: false,
      isUserFacing: true,
    });
  });

  it('uses useful status copy when a status event has an empty payload', () => {
    expect(
      formatTimelineEvent({
        type: 'session.idle',
        data: {},
      }),
    ).toMatchObject({
      kind: 'status',
      title: 'Agent finished',
      body: 'Ready for the next instruction.',
      tone: 'success',
      isCollapsible: false,
      isUserFacing: true,
    });
  });

  it('hides SDK bookkeeping events from the main activity feed', () => {
    expect(formatTimelineEvent({ type: 'assistant.turn_end', data: {} })).toMatchObject({
      kind: 'system',
      title: 'System event',
      isUserFacing: false,
      isCollapsible: true,
    });
  });

  it('keeps unknown events inspectable without making them look primary', () => {
    const formatted = formatTimelineEvent({
      type: 'custom.event',
      data: { deeply: { nested: true } },
    });

    expect(formatted.kind).toBe('system');
    expect(formatted.title).toBe('System event');
    expect(formatted.tone).toBe('neutral');
    expect(formatted.isCollapsible).toBe(true);
    expect(formatted.isUserFacing).toBe(false);
    expect(formatted.body).toContain('"nested": true');
  });
});
