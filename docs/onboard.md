# Muninn

## Purpose

Muninn is a personal photo curator built as a **native macOS app** using Tauri v2. It connects to a Dropbox folder, fetches thumbnails via the Dropbox API (`files/list_folder` + `files/get_thumbnail_v2`), and presents a grid + sidebar-preview UI so the user can mark photos keep or discard. Named after Muninn, Odin's raven of memory. v1 focuses on the curation workflow for a single folder at a time. Future phases add compression of kept photos, archival of originals to S3 Glacier Deep Archive, Dropbox cleanup, and a map view of trips.

## Status

active — as of 2026-04-21. Core curation loop is fully working end-to-end:

- Dropbox OAuth2 PKCE auth, token stored in macOS Keychain (MUN-2)
- Folder tree picker + file listing (MUN-3)
- Virtualized thumbnail grid with keep/discard flagging (MUN-4)
- Browse tab: click a thumbnail → preview panel with K/D/arrow key controls; flags persist to per-folder curation JSON on disk
- Flagged tab: aggregates all flagged photos across every visited folder; filterable by All / Keep / Discard; same preview panel + keyboard controls (MUN-14)

Next: grouping / categorisation epic (MUN-20+), map view epic (MUN-17+).

## Stack

- Language / runtime: TypeScript on Node (frontend) + Rust (Tauri host)
- Framework: Tauri v2 + Vite + React 19
- Styling: Tailwind v4 (`@tailwindcss/vite`)
- Tests: Vitest + React Testing Library + jsdom
- Package manager: pnpm
- Run native: `pnpm tauri:dev` → opens a native macOS window
- Run browser-only (fast iteration): `pnpm dev` → http://localhost:5175/ (port 5175 — avoids collision with Ratatoskr on 5173)
- Build native: `pnpm tauri:build` → `Muninn.app` under `src-tauri/target/release/bundle/macos/`
- Tests: `pnpm test` (run once) / `pnpm test:watch` (watch mode)

## Required toolchain (for Tauri builds)

In addition to Node + pnpm:

```sh
# Rust (one-time install)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

Verify: `rustc --version` (expect 1.77+), `cargo --version`.

> **Note:** The first `pnpm tauri:dev` cold-compiles all Rust dependencies (~1–3 min). Subsequent runs are fast. This is normal Tauri/Cargo behaviour, not a project bug.

## Structure

- `src/` — React app source (App.tsx, main.tsx, index.css, setupTests.ts)
  - `src/auth/` — Keychain IPC wrappers + SetupScreen
  - `src/dropbox/` — Dropbox API client (validateToken, etc.)
  - `src/curator/` — Curator shell (folder picker + virtualized thumbnail grid)
- `src-tauri/` — Tauri host (Rust); `src/keychain.rs` holds the 3 Keychain commands
- `public/` — static assets
- `docs/` — project documentation
- `.meta/ratatoskr/` — Ratatoskr task metadata (gitignored). Prefix: `MUN`.

## Key context for AI

- **Native macOS app, not a browser SPA.** Decision pivoted on 2026-04-19 because storing the Dropbox token in localStorage was unsafe and the file system is a much stronger store for curation state. See MUN-1 for architecture summary.
- **No backend / no sidecar.** Unlike ratatoskr, Muninn does not need a Hono server — Dropbox API calls go straight from the WebView, and persistence uses Tauri plugins (Keychain + fs).
- **Token in macOS Keychain.** Stored under service `com.huang.muninn`, account `dropbox_access_token`, via the `keyring` Rust crate (custom Tauri commands). **Never** store the access token in localStorage, sessionStorage, or any plain file.
- **Curation state on disk.** Per-folder JSON files under the app's data dir. One file per Dropbox folder, keyed by a hash of the folder path. Human-readable and editable outside the app.
- **Group membership is implicit "keep".** A photo is always in exactly one of three states: **unprocessed** (no `flag`, no `groupId`), **flagged** (keep/discard, no `groupId`), or **grouped** (implicit keep — `groupId` set, no `flag`). `flag` and `groupId` are never both set. Transitions: assigning to a group clears `flag` and sets `groupId`; deleting a group clears both `flag` and `groupId`, returning the photo to unprocessed.
- **Test folder:** `/Photos/2026-04-12 France, Lyon` — 482 files. Use this for end-to-end manual testing once features land.
- **Spike artifacts:** `scratch/photo-curator-spike/` has Node scripts that proved Dropbox API works for metadata + thumbnails but not GPS. Do not reuse them; the `.env` there contains a Dropbox token — leave it alone.
- **GPS note:** user's ASUS phone does not write GPS to EXIF. The map view is deferred to a future epic; v1 is curation-only.
- **Tailwind v4 pattern:** single `@import "tailwindcss";` in `src/index.css`. No `tailwind.config.*` or PostCSS config — the `@tailwindcss/vite` plugin handles everything.
- **Ticket work:** use the Ratatoskr MCP tools (`mcp__ratatoskr__create_ticket`, `mcp__ratatoskr__patch_ticket`, etc.) for all ticket operations. Prefer MCP over direct edits to `.meta/ratatoskr/tasks/`.

## Related docs

- Spec / design history: `scratch/20260419_handoff-muninn-scaffold.md`
- Ratatoskr workflow: `references/ticket-workflow.md`
- Tauri packaging reference: `projects/ratatoskr/docs/onboard.md` (the "Desktop packaging" section mirrors Muninn's setup)
