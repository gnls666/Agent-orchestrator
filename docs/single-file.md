# Single-File Archive

The repository includes a text archive that compresses the project files into one portable file:

```bash
artifacts/agent-orchestrator.single.txt
```

The same archive is also emitted as two smaller text parts:

```bash
artifacts/agent-orchestrator.single.part1.txt
artifacts/agent-orchestrator.single.part2.txt
```

The archive is gzip-compressed JSON encoded as base64. Binary files such as PNG assets are stored as base64 entries inside the JSON payload.

## Create Or Refresh The Archive

Run this after code, docs, or asset changes:

```bash
npm run bundle:single
```

The script excludes `.git`, `node_modules`, `dist`, and the existing archive itself.

## Merge Split Parts

The two part files are plain text chunks of the full archive. Keep the order exactly as `part1` then `part2`.

On macOS or Linux:

```bash
cat artifacts/agent-orchestrator.single.part1.txt artifacts/agent-orchestrator.single.part2.txt > artifacts/agent-orchestrator.single.txt
```

On Windows:

```powershell
cmd /c copy /b artifacts\agent-orchestrator.single.part1.txt+artifacts\agent-orchestrator.single.part2.txt artifacts\agent-orchestrator.single.txt
```

## Restore The Archive

To unfold the archive into a new directory:

```bash
node scripts/restore-single-file.mjs artifacts/agent-orchestrator.single.txt restored-agent-orchestrator
```

The restore script accepts archives copied through tools that convert line endings to CRLF or insert whitespace into the base64 body. It also validates every archived path, including Windows absolute paths, before writing files under the output directory.

Then install and run normally:

```bash
cd restored-agent-orchestrator
npm install
npm run build
```

## Asset Placement After Restore

Image assets are restored into `src/client/assets/`. To replace or add Eli artwork, put the PNG/WebP in that directory and update the corresponding `new URL('./assets/name.png', import.meta.url).href` import.
