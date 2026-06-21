import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { scanFolder } from './folders';

const execFileAsync = promisify(execFile);

describe('scanFolder', () => {
  it('reads project metadata from a valid folder path', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agent-orchestrator-'));

    try {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: 'sample-agent-target',
          scripts: {
            test: 'vitest run',
            build: 'tsc -p tsconfig.json',
          },
        }),
      );
      await writeFile(path.join(dir, 'AGENTS.md'), '# Local agent rules');
      await mkdir(path.join(dir, '.github', 'agents'), { recursive: true });
      await mkdir(path.join(dir, '.github', 'skills', 'reviewer'), { recursive: true });
      await writeFile(path.join(dir, '.github', 'agents', 'frontend.md'), '# Frontend Agent\nUse MUI carefully.');
      await writeFile(path.join(dir, '.github', 'skills', 'reviewer', 'SKILL.md'), '# Reviewer Skill\nCheck risks first.');
      await execFileAsync('git', ['init'], { cwd: dir });
      await execFileAsync('git', ['checkout', '-b', 'feature/local'], { cwd: dir });

      const folder = await scanFolder(dir);

      expect(folder.path).toBe(dir);
      expect(folder.name).toBe(path.basename(dir));
      expect(folder.exists).toBe(true);
      expect(folder.git.branch).toBe('feature/local');
      expect(folder.packageManager).toBe('npm');
      expect(folder.scripts).toEqual(['build', 'test']);
      expect(folder.instructionFiles).toEqual(['AGENTS.md']);
      expect(folder.githubAssets).toEqual([
        {
          id: 'agent:.github/agents/frontend.md',
          kind: 'agent',
          name: 'frontend',
          path: '.github/agents/frontend.md',
          title: 'Frontend Agent',
          description: 'Use MUI carefully.',
        },
        {
          id: 'skill:.github/skills/reviewer/SKILL.md',
          kind: 'skill',
          name: 'reviewer',
          path: '.github/skills/reviewer/SKILL.md',
          title: 'Reviewer Skill',
          description: 'Check risks first.',
        },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a path that is not a directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agent-orchestrator-'));
    const filePath = path.join(dir, 'notes.txt');

    try {
      await writeFile(filePath, 'not a directory');

      await expect(scanFolder(filePath)).rejects.toThrow('Path is not a directory');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
