import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const sourceScriptPath = path.resolve('scripts', 'create-single-file.mjs');

describe('single-file artifacts', () => {
  it('publishes split archive parts that concatenate to the full archive exactly', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agent-orchestrator-bundle-'));
    const scriptPath = path.join(dir, 'scripts', 'create-single-file.mjs');

    try {
      await mkdir(path.dirname(scriptPath), { recursive: true });
      await cp(sourceScriptPath, scriptPath);
      await writeFile(path.join(dir, 'README.md'), '# Fixture\n');
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await writeFile(path.join(dir, 'src', 'index.ts'), 'console.log("fixture");\n');

      await execFileAsync(process.execPath, [scriptPath], { cwd: dir });

      const artifactsDir = path.join(dir, 'artifacts');
      const fullArchive = await readFile(path.join(artifactsDir, 'agent-orchestrator.single.txt'), 'utf8');
      const part1 = await readFile(path.join(artifactsDir, 'agent-orchestrator.single.part1.txt'), 'utf8');
      const part2 = await readFile(path.join(artifactsDir, 'agent-orchestrator.single.part2.txt'), 'utf8');

      expect(part1.length).toBeGreaterThan(0);
      expect(part2.length).toBeGreaterThan(0);
      expect(part1 + part2).toBe(fullArchive);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
