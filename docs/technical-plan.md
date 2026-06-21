# Agent Orchestrator Technical Plan

## Purpose

Agent Orchestrator is a local workbench for running GitHub Copilot SDK tasks against selected project folders. The UI keeps three concerns separate: workspace selection, task configuration/progress, and pending permission decisions.

## Stack

- Client: React 19, Vite, MUI, TanStack Query.
- Server: Node.js TypeScript via `tsx`, WebSocket event stream, local filesystem scanning.
- Agent runtime: `@github/copilot-sdk` for model discovery and task sessions.
- Tests: Vitest with focused client/server unit tests.

## Runtime Shape

The browser client fetches `/api/state` and subscribes to `/api/events`. Server events are merged into the TanStack Query cache by `applyServerEventToState`, while session timeline events are formatted locally for user-facing activity.

Permission requests stay explicit. The right rail lists pending decisions, and the server only resolves them after a user action sends `approve-once`, `approve-run`, or `reject`.

## UI Direction

The interface uses a restrained product palette outside of Eli brand moments. Header and active running states use the blue Eli visual system. General panels use tinted neutrals, low-contrast borders, and compact rows so the working surface remains scannable.

The running status card uses real blue-background image assets for Eli. This preserves the blue-ground shadow from the reference artwork instead of applying a white-background drop shadow on top of a blue surface.

## Asset Strategy

Project image assets live in `src/client/assets/` and are imported with `new URL(..., import.meta.url).href` so Vite fingerprints them at build time.

Current Eli assets:

- `eli-agent.png`: transparent Eli mark for light surfaces.
- `eli-agent-blink.png`: retained compatibility asset with the same mark.
- `eli-blue-idle.png`: blue-background ordinary state.
- `eli-blue-active.png`: blue-background active animation frame.

For new image assets, place source PNG/WebP files under `src/client/assets/`, import them from `src/client/App.tsx` or the consuming component, then run `npm run build` to verify Vite can bundle them.
