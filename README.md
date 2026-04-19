# Muninn

Personal Dropbox photo curator — keep/discard workflow, one folder at a time. Native macOS app.

## What it is

Muninn (Odin's raven of memory) is a Tauri v2 desktop app that connects to a Dropbox folder, fetches thumbnails via the Dropbox API, and presents a grid + sidebar-preview UI for curating photos. The user marks each photo keep or discard with keyboard shortcuts. Token lives in the macOS Keychain; curation flags persist as JSON files on disk. Future phases add compression, S3 Glacier Deep Archive archival, and a map view of trips.

## Quickstart

```bash
pnpm install
pnpm tauri:dev
```

Opens a native macOS window. You'll be prompted to enter a Dropbox access token on first run (saved to Keychain).

`pnpm dev` (browser-only) is also available for fast iteration on UI.

## Stack

- TypeScript + React 19 + Vite
- Tailwind v4 (`@tailwindcss/vite`)
- Tauri v2 (Rust host + WebView)
- Vitest + React Testing Library

## Docs

- `docs/onboard.md` — full project context for AI agents and new contributors

## Status

active — as of 2026-04-19
