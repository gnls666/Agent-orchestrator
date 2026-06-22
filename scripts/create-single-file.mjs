import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const archiveFile = 'artifacts/agent-orchestrator.single.txt';
const splitArchiveFiles = [
  'artifacts/agent-orchestrator.single.part1.txt',
  'artifacts/agent-orchestrator.single.part2.txt',
];
const outPath = join(root, archiveFile);
const splitOutPaths = splitArchiveFiles.map((path) => join(root, path));
const excludedDirs = new Set(['.git', 'node_modules', 'dist']);
const excludedFiles = new Set([
  archiveFile,
  ...splitArchiveFiles,
  'restored-agent-orchestrator',
]);

function toPosix(path) {
  return path.split(sep).join('/');
}

function isBinary(buffer) {
  if (buffer.includes(0)) {
    return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspicious += 1;
    }
  }
  return sample.length > 0 && suspicious / sample.length > 0.08;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const rel = toPosix(relative(root, absolute));

    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name) && !excludedFiles.has(rel)) {
        walk(absolute, files);
      }
      continue;
    }

    if (!entry.isFile() || excludedFiles.has(rel)) {
      continue;
    }

    files.push(rel);
  }

  return files;
}

function splitTextByLine(text) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const midpoint = Math.ceil(lines.length / 2);
  return [
    lines.slice(0, midpoint).join(''),
    lines.slice(midpoint).join(''),
  ];
}

const files = walk(root).sort().map((path) => {
  const absolute = join(root, path);
  const buffer = readFileSync(absolute);
  const stat = statSync(absolute);
  const encoding = isBinary(buffer) ? 'base64' : 'utf8';

  return {
    path,
    mode: stat.mode & 0o777,
    encoding,
    content: encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf8'),
  };
});

const payload = {
  format: 'agent-orchestrator-single-file',
  version: 1,
  createdAt: new Date().toISOString(),
  fileCount: files.length,
  files,
};

const compressed = gzipSync(Buffer.from(JSON.stringify(payload)));
const body = compressed.toString('base64').match(/.{1,96}/g)?.join('\n') ?? '';
const output = [
  'AGENT_ORCHESTRATOR_SINGLE_FILE_V1',
  `createdAt=${payload.createdAt}`,
  `fileCount=${payload.fileCount}`,
  'encoding=gzip+base64+json',
  '---',
  body,
  '',
].join('\n');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, output);
const splitOutputs = splitTextByLine(output);
if (splitOutputs.join('') !== output) {
  throw new Error('Split archive parts do not reconstruct the full archive.');
}
splitOutPaths.forEach((path, index) => {
  writeFileSync(path, splitOutputs[index]);
});
console.log(`Wrote ${toPosix(relative(root, outPath))} with ${files.length} files.`);
splitOutPaths.forEach((path) => {
  console.log(`Wrote ${toPosix(relative(root, path))}.`);
});
