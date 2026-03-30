# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start           # Start Expo dev server
npm run android     # Run on Android device/emulator
npm run ios         # Run on iOS simulator
npm test            # Run Jest unit tests
```

No lint or typecheck scripts are configured. TypeScript strict mode is enabled (`tsconfig.json`).

## Architecture Overview

PlexDownloader is a **React Native + Expo** mobile app that downloads media from Plex Media Servers. It targets iOS, Android, and Web via Expo SDK 54.

### Navigation Model

There is no React Navigation stack in use. `App.tsx` manages all navigation through local state — the `AppContent` component conditionally renders screens based on `appState` enum and flags like `activeServer`, `selectedLibrary`, `selectedMedia`, `isViewingDownloads`. Screens are rendered as full-screen components, not routes.

### Layer Structure

| Layer | Location | Responsibility |
|---|---|---|
| Screens | `src/screens/` | All UI, uses hooks for local state |
| Services | `src/services/downloadService.ts` | Download orchestration, concurrency, retry logic |
| API | `src/api/plexClient.ts` | Plex API communication via axios |
| Database | `src/database/` | SQLite schema + CRUD operations |
| Types | `src/types/plex.ts` | Shared TypeScript interfaces |
| Utils | `src/utils/` | Constants, formatters, network monitor, error types |

### Download Strategies

Two strategies based on quality selection:

- **Direct Play** (Original quality): Direct file transfer via `FileSystem.DownloadResumable`. Simple, no server processing.
- **Transcoded Download** (1080p/720p/480p): Creates a Plex server-side download queue, polls every 5s (`TRANSCODE_POLL_INTERVAL_MS`) until transcode completes, then downloads the resulting file.

Downloads are tracked in SQLite with status transitions: `PENDING → DOWNLOADING → COMPLETED` (or `FAILED`). Resume data (savepoints) is stored as JSON in the database for interrupted downloads.

### Key Constants (in `src/utils/constants.ts`)

- `MAX_CONCURRENT_DOWNLOADS`: 3
- `MAX_RETRY_ATTEMPTS`: 3
- `PAGE_SIZE`: 48 items per library page load

### Database

SQLite via `expo-sqlite`. Four tables: `downloads`, `servers`, `app_state` (key-value store for auth token), `db_version` (migration tracking). The database is the single source of truth for all downloaded content.

### Authentication

PIN-based OAuth flow against Plex API. Token is persisted in the `app_state` table and restored on app init. Token expiry is checked with a 24-hour buffer.

### Testing

Unit tests exist only for `DownloadService` (file name sanitization, retry logic, concurrency tracking). All external dependencies are mocked. Run with `npm test`.
