# Single-File Archive

The repository includes a text archive that compresses the project files into one portable file:

```bash
artifacts/agent-orchestrator.single.txt
```

The archive is gzip-compressed JSON encoded as base64. Binary files such as PNG assets are stored as base64 entries inside the JSON payload.

## Create Or Refresh The Archive

Run this after code, docs, or asset changes:

```bash
npm run bundle:single
```

The script excludes `.git`, `node_modules`, `dist`, and the existing archive itself.

## Restore The Archive

To unfold the archive into a new directory:

```bash
node scripts/restore-single-file.mjs artifacts/agent-orchestrator.single.txt restored-agent-orchestrator
```

Then install and run normally:

```bash
cd restored-agent-orchestrator
npm install
npm run build
```

## Asset Placement After Restore

Image assets are restored into `src/client/assets/`. To replace or add Eli artwork, put the PNG/WebP in that directory and update the corresponding `new URL('./assets/name.png', import.meta.url).href` import.
