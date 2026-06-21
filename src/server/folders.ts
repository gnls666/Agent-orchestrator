import { access, readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FolderRecord, GitHubCopilotAsset, GitInfo } from '../shared/types';

const execFileAsync = promisify(execFile);
const instructionFileCandidates = [
  'AGENTS.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
  'CLAUDE.md',
];

export async function scanFolder(inputPath: string): Promise<FolderRecord> {
  const resolvedPath = resolveInputPath(inputPath);
  const pathStat = await stat(resolvedPath);

  if (!pathStat.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  const [git, packageJson, instructionFiles, githubAssets] = await Promise.all([
    readGitInfo(resolvedPath),
    readPackageJson(resolvedPath),
    readInstructionFiles(resolvedPath),
    readGitHubCopilotAssets(resolvedPath),
  ]);

  return {
    id: stableFolderId(resolvedPath),
    name: path.basename(resolvedPath),
    path: resolvedPath,
    exists: true,
    git,
    packageManager: await detectPackageManager(resolvedPath),
    scripts: Object.keys(packageJson?.scripts ?? {}).sort(),
    instructionFiles,
    githubAssets,
    scannedAt: new Date().toISOString(),
  };
}

export async function pickFolder(): Promise<FolderRecord> {
  const selectedPath = await openFolderPicker();
  return scanFolder(selectedPath);
}

export function resolveInputPath(inputPath: string): string {
  const trimmed = inputPath.trim();

  if (!trimmed) {
    throw new Error('Path is required');
  }

  if (trimmed === '~') {
    return os.homedir();
  }

  if (trimmed.startsWith('~/')) {
    return path.resolve(os.homedir(), trimmed.slice(2));
  }

  return path.resolve(trimmed);
}

async function openFolderPicker(): Promise<string> {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync('osascript', [
        '-e',
        'POSIX path of (choose folder with prompt "Choose a workspace folder")',
      ]);
      return stdout.trim();
    }

    if (platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
        '$dialog.Description = "Choose a workspace folder";',
        '$dialog.ShowNewFolderButton = $false;',
        'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
        '  [Console]::WriteLine($dialog.SelectedPath)',
        '} else {',
        '  exit 1',
        '}',
      ].join(' ');
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script]);
      return stdout.trim();
    }

    const { stdout } = await execFileAsync('sh', [
      '-lc',
      'if command -v zenity >/dev/null 2>&1; then zenity --file-selection --directory --title="Choose a workspace folder"; elif command -v kdialog >/dev/null 2>&1; then kdialog --getexistingdirectory "$HOME"; else exit 127; fi',
    ]);
    return stdout.trim();
  } catch {
    throw new Error('Folder selection canceled or unavailable');
  }
}

function stableFolderId(folderPath: string): string {
  return Buffer.from(folderPath).toString('base64url');
}

async function readGitInfo(cwd: string): Promise<GitInfo> {
  const [root, branch, status] = await Promise.all([
    git(['rev-parse', '--show-toplevel'], cwd),
    git(['branch', '--show-current'], cwd),
    git(['status', '--porcelain'], cwd),
  ]);

  return {
    root: root || undefined,
    branch: branch || undefined,
    dirty: Boolean(status),
  };
}

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function readPackageJson(cwd: string): Promise<{ scripts?: Record<string, string> } | undefined> {
  try {
    const raw = await readFile(path.join(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw) as { scripts?: Record<string, string> };
  } catch {
    return undefined;
  }
}

async function detectPackageManager(cwd: string): Promise<FolderRecord['packageManager']> {
  const lockfiles: Array<[string, FolderRecord['packageManager']]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
    ['package.json', 'npm'],
  ];

  for (const [filename, manager] of lockfiles) {
    try {
      await access(path.join(cwd, filename));
      return manager;
    } catch {
      // Keep checking less-specific package manager signals.
    }
  }

  return undefined;
}

async function readInstructionFiles(cwd: string): Promise<string[]> {
  const found: string[] = [];

  for (const filename of instructionFileCandidates) {
    try {
      await access(path.join(cwd, filename));
      found.push(filename);
    } catch {
      // Missing instruction files are normal.
    }
  }

  return found;
}

async function readGitHubCopilotAssets(cwd: string): Promise<GitHubCopilotAsset[]> {
  const [agents, skills] = await Promise.all([
    readMarkdownAssets(cwd, 'agent', path.join('.github', 'agents')),
    readSkillAssets(cwd),
  ]);

  return [...agents, ...skills].sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));
}

async function readMarkdownAssets(cwd: string, kind: GitHubCopilotAsset['kind'], relativeDir: string): Promise<GitHubCopilotAsset[]> {
  const absoluteDir = path.join(cwd, relativeDir);

  try {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const markdownFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'));
    const assets = await Promise.all(
      markdownFiles.map(async (entry) => {
        const relativePath = path.join(relativeDir, entry.name);
        return readAssetFile(cwd, kind, relativePath, path.basename(entry.name, '.md')).catch(() => undefined);
      }),
    );
    return assets.filter((asset): asset is GitHubCopilotAsset => Boolean(asset));
  } catch {
    return [];
  }
}

async function readSkillAssets(cwd: string): Promise<GitHubCopilotAsset[]> {
  const skillsDir = path.join(cwd, '.github', 'skills');

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const assets = await Promise.all(
      entries.flatMap((entry) => {
        if (entry.isDirectory()) {
          const relativePath = path.join('.github', 'skills', entry.name, 'SKILL.md');
          return [readAssetFile(cwd, 'skill', relativePath, entry.name)];
        }

        if (entry.isFile() && entry.name.endsWith('.md')) {
          const relativePath = path.join('.github', 'skills', entry.name);
          return [readAssetFile(cwd, 'skill', relativePath, path.basename(entry.name, '.md'))];
        }

        return [];
      }),
    );
    return assets.filter((asset): asset is GitHubCopilotAsset => Boolean(asset));
  } catch {
    return [];
  }
}

async function readAssetFile(
  cwd: string,
  kind: GitHubCopilotAsset['kind'],
  relativePath: string,
  fallbackName: string,
): Promise<GitHubCopilotAsset> {
  const raw = await readFile(path.join(cwd, relativePath), 'utf8');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => line.startsWith('#'))?.replace(/^#+\s*/, '').trim();
  const description = lines.find((line) => !line.startsWith('#') && !line.startsWith('---'));
  const name = fallbackName;

  return {
    id: `${kind}:${relativePath}`,
    kind,
    name,
    path: relativePath,
    title: heading || name,
    description,
  };
}
