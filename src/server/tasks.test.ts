import { describe, expect, it } from 'vitest';
import { buildTaskPrompt } from './tasks';

describe('buildTaskPrompt', () => {
  it('adds planning constraints for plan mode', () => {
    const prompt = buildTaskPrompt({
      mode: 'plan',
      userPrompt: 'Add a login page',
      folderPath: '/tmp/project',
    });

    expect(prompt).toContain('You are working in /tmp/project.');
    expect(prompt).toContain('Plan mode');
    expect(prompt).toContain('Do not edit files or run mutating commands');
    expect(prompt).toContain('Add a login page');
  });

  it('adds execution constraints for run mode', () => {
    const prompt = buildTaskPrompt({
      mode: 'run',
      userPrompt: 'Fix failing tests',
      folderPath: '/tmp/project',
    });

    expect(prompt).toContain('Execution mode');
    expect(prompt).toContain('Make the requested changes');
    expect(prompt).toContain('Fix failing tests');
  });

  it('adds selected project Copilot assets to the task prompt', () => {
    const prompt = buildTaskPrompt({
      mode: 'plan',
      userPrompt: 'Review the UI',
      folderPath: '/tmp/project',
      selectedAgentPath: '.github/agents/frontend.md',
      selectedSkillPaths: ['.github/skills/reviewer/SKILL.md'],
    });

    expect(prompt).toContain('Project-defined Copilot assets selected by the user');
    expect(prompt).toContain('Agent: .github/agents/frontend.md');
    expect(prompt).toContain('Skill: .github/skills/reviewer/SKILL.md');
  });
});
