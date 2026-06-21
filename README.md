# Agent Orchestrator

Local workbench for running GitHub Copilot SDK tasks against selected project folders.

## Development

```bash
npm install
npm run dev
```

The client runs through Vite and the server exposes local API/WebSocket endpoints used by the React app.

## Build And Test

```bash
npm run build
npm test
```

## Single-File Archive

Create the portable single-file archive:

```bash
npm run bundle:single
```

Restore it into a directory:

```bash
node scripts/restore-single-file.mjs artifacts/agent-orchestrator.single.txt restored-agent-orchestrator
```

See `docs/single-file.md` for details.
