import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GitHubCopilotAsset } from '../shared/types';

export const bundledSkillDirectory = fileURLToPath(new URL('./builtin-skills', import.meta.url));
const bundledSkillPathPrefix = 'builtin/skills/';

export async function readBundledSkillAssets(): Promise<GitHubCopilotAsset[]> {
  const entries = await readdir(bundledSkillDirectory, { withFileTypes: true });
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const relativePath = `${bundledSkillPathPrefix}${entry.name}/SKILL.md`;
        const raw = await readFile(path.join(bundledSkillDirectory, entry.name, 'SKILL.md'), 'utf8');
        const { title, description } = parseSkillSummary(raw, entry.name);

        return {
          id: `skill:${relativePath}`,
          kind: 'skill' as const,
          name: entry.name,
          path: relativePath,
          title,
          description,
        };
      }),
  );

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function skillDirectoriesForSelectedSkills(folderPath: string, selectedSkills: GitHubCopilotAsset[]): string[] | undefined {
  const directories = new Set<string>();

  if (selectedSkills.some((skill) => skill.path.startsWith('.github/skills/'))) {
    directories.add(path.join(folderPath, '.github', 'skills'));
  }

  if (selectedSkills.some((skill) => skill.path.startsWith(bundledSkillPathPrefix))) {
    directories.add(bundledSkillDirectory);
  }

  return directories.size ? [...directories] : undefined;
}

function parseSkillSummary(raw: string, fallbackName: string): { title: string; description?: string } {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => line.startsWith('#'))?.replace(/^#+\s*/, '').trim();
  const description = lines.find((line) => !line.startsWith('#') && !line.startsWith('---'));

  return {
    title: heading || fallbackName,
    description,
  };
}
