import { gunzipSync } from 'node:zlib';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';

const [, , inputArg = 'artifacts/agent-orchestrator.single.txt', outputArg = 'restored-agent-orchestrator'] = process.argv;
const inputPath = resolve(inputArg);
const outputRoot = resolve(outputArg);
const text = readFileSync(inputPath, 'utf8');
const [header, encoded] = text.split('\n---\n');

if (!header?.startsWith('AGENT_ORCHESTRATOR_SINGLE_FILE_V1') || !encoded) {
  throw new Error('Invalid single-file archive header.');
}

const payload = JSON.parse(gunzipSync(Buffer.from(encoded.replace(/\s+/g, ''), 'base64')).toString('utf8'));

if (payload.format !== 'agent-orchestrator-single-file' || payload.version !== 1 || !Array.isArray(payload.files)) {
  throw new Error('Unsupported single-file archive payload.');
}

for (const file of payload.files) {
  if (!file.path || isAbsolute(file.path) || file.path.includes('..')) {
    throw new Error(`Unsafe archive path: ${file.path}`);
  }

  const target = normalize(join(outputRoot, file.path));
  if (!target.startsWith(outputRoot)) {
    throw new Error(`Archive path escapes output directory: ${file.path}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  const content = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
  writeFileSync(target, content);

  if (typeof file.mode === 'number') {
    chmodSync(target, file.mode);
  }
}

console.log(`Restored ${payload.files.length} files to ${outputRoot}`);
