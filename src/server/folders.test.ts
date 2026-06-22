import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { normalizePickedFolderPath, scanFolder } from './folders';

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
          id: 'skill:builtin/skills/python-fastapi/SKILL.md',
          kind: 'skill',
          name: 'python-fastapi',
          path: 'builtin/skills/python-fastapi/SKILL.md',
          title: 'Python FastAPI',
          description: 'Use when building or changing Python FastAPI services.',
        },
        {
          id: 'skill:builtin/skills/react/SKILL.md',
          kind: 'skill',
          name: 'react',
          path: 'builtin/skills/react/SKILL.md',
          title: 'React',
          description: 'Use when building or changing React user interfaces.',
        },
        {
          id: 'skill:.github/skills/reviewer/SKILL.md',
          kind: 'skill',
          name: 'reviewer',
          path: '.github/skills/reviewer/SKILL.md',
          title: 'Reviewer Skill',
          description: 'Check risks first.',
        },
        {
          id: 'skill:builtin/skills/typescript/SKILL.md',
          kind: 'skill',
          name: 'typescript',
          path: 'builtin/skills/typescript/SKILL.md',
          title: 'TypeScript',
          description: 'Use when building or changing TypeScript code.',
        },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('adds bundled skills when the project has no GitHub Copilot skills', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agent-orchestrator-'));

    try {
      await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'empty-target' }));

      const folder = await scanFolder(dir);
      const bundledSkills = folder.githubAssets.filter((asset) => asset.kind === 'skill' && asset.path.startsWith('builtin/skills/'));

      expect(bundledSkills.map((skill) => skill.name)).toEqual(['python-fastapi', 'react', 'typescript']);
      expect(bundledSkills.map((skill) => skill.title)).toEqual(['Python FastAPI', 'React', 'TypeScript']);
      expect(bundledSkills.map((skill) => skill.id)).toEqual([
        'skill:builtin/skills/python-fastapi/SKILL.md',
        'skill:builtin/skills/react/SKILL.md',
        'skill:builtin/skills/typescript/SKILL.md',
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

describe('normalizePickedFolderPath', () => {
  it('keeps native Windows paths unchanged on Windows', () => {
    expect(normalizePickedFolderPath('C:\\Users\\Ada\\project\r\n', 'win32')).toBe('C:\\Users\\Ada\\project');
    expect(normalizePickedFolderPath('C:\\Users\\Ada Lovelace\\My Project\r\n', 'win32')).toBe('C:\\Users\\Ada Lovelace\\My Project');
    expect(normalizePickedFolderPath('\\\\server\\share\\project\r\n', 'win32')).toBe('\\\\server\\share\\project');
  });

  it('maps Windows drive paths to WSL mount paths on Linux', () => {
    expect(normalizePickedFolderPath('C:\\Users\\Ada\\project\r\n', 'linux')).toBe('/mnt/c/Users/Ada/project');
    expect(normalizePickedFolderPath('D:/work/repo', 'linux')).toBe('/mnt/d/work/repo');
  });

  it('maps WSL UNC paths to Linux paths', () => {
    expect(normalizePickedFolderPath('\\\\wsl.localhost\\Ubuntu\\home\\ada\\repo', 'linux')).toBe('/home/ada/repo');
  });
});
