import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const restoreScript = path.resolve('scripts', 'restore-single-file.mjs');

describe('restore-single-file', () => {
  it('restores CRLF copied archives with whitespace and binary files intact', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agent-orchestrator-restore-'));
    const archivePath = path.join(dir, 'archive.txt');
    const outputPath = path.join(dir, 'restored project');

    try {
      await writeFile(archivePath, makeArchive([
        {
          path: 'src/index.ts',
          mode: 0o644,
          encoding: 'utf8',
          content: 'console.log("hello");\n',
        },
        {
          path: 'src/client/assets/pixel.bin',
          mode: 0o644,
          encoding: 'base64',
          content: Buffer.from([0, 1, 2, 255]).toString('base64'),
        },
      ]));

      await execFileAsync(process.execPath, [restoreScript, archivePath, outputPath]);

      await expect(readFile(path.join(outputPath, 'src', 'index.ts'), 'utf8')).resolves.toBe('console.log("hello");\n');
      await expect(readFile(path.join(outputPath, 'src', 'client', 'assets', 'pixel.bin'))).resolves.toEqual(Buffer.from([0, 1, 2, 255]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects Windows absolute archive paths on every host platform', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'agent-orchestrator-restore-'));
    const archivePath = path.join(dir, 'archive.txt');
    const outputPath = path.join(dir, 'restored');

    try {
      await writeFile(archivePath, makeArchive([
        {
          path: 'C:\\Users\\Ada\\escape.txt',
          mode: 0o644,
          encoding: 'utf8',
          content: 'escape',
        },
      ]));

      await expect(execFileAsync(process.execPath, [restoreScript, archivePath, outputPath])).rejects.toThrow('Unsafe archive path');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function makeArchive(files: Array<{ path: string; mode: number; encoding: 'utf8' | 'base64'; content: string }>): string {
  const payload = {
    format: 'agent-orchestrator-single-file',
    version: 1,
    files,
  };
  const encoded = gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64');
  const copiedBody = encoded.match(/.{1,12}/g)?.map((chunk) => ` ${chunk} `).join('\r\n') ?? encoded;

  return [
    'AGENT_ORCHESTRATOR_SINGLE_FILE_V1',
    'createdAt=2026-01-01T00:00:00.000Z',
    `fileCount=${files.length}`,
    'encoding=gzip+base64+json',
    '---',
    copiedBody,
    '',
  ].join('\r\n');
}
