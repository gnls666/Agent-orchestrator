import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledSkillDirectory, readBundledSkillAssets, skillDirectoriesForSelectedSkills } from './builtinSkills';
import type { GitHubCopilotAsset } from '../shared/types';

describe('bundled skills', () => {
  it('describes the built-in Python FastAPI, React, and TypeScript skills', async () => {
    const skills = await readBundledSkillAssets();

    expect(skills.map((skill) => skill.name)).toEqual(['python-fastapi', 'react', 'typescript']);
    expect(skills.every((skill) => skill.kind === 'skill')).toBe(true);
    expect(skills.every((skill) => skill.path.startsWith('builtin/skills/'))).toBe(true);
  });

  it('resolves selected project and bundled skill directories', () => {
    const projectSkill: GitHubCopilotAsset = {
      id: 'skill:.github/skills/reviewer/SKILL.md',
      kind: 'skill',
      name: 'reviewer',
      path: '.github/skills/reviewer/SKILL.md',
      title: 'Reviewer',
    };
    const bundledSkill: GitHubCopilotAsset = {
      id: 'skill:builtin/skills/react/SKILL.md',
      kind: 'skill',
      name: 'react',
      path: 'builtin/skills/react/SKILL.md',
      title: 'React',
    };

    expect(skillDirectoriesForSelectedSkills('/tmp/project', [])).toBeUndefined();
    expect(skillDirectoriesForSelectedSkills('/tmp/project', [projectSkill])).toEqual([path.join('/tmp/project', '.github', 'skills')]);
    expect(skillDirectoriesForSelectedSkills('/tmp/project', [bundledSkill])).toEqual([bundledSkillDirectory]);
    expect(skillDirectoriesForSelectedSkills('/tmp/project', [projectSkill, bundledSkill])).toEqual([
      path.join('/tmp/project', '.github', 'skills'),
      bundledSkillDirectory,
    ]);
  });
});
