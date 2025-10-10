# PlexDownloader

A robust mobile application for downloading media from Plex Media Server with improved stability and transparency.

## Project Status

**Current Phase:** Core infrastructure complete

### Completed

- Development environment setup
- Project structure and source control
- Type definitions for Plex API
- SQLite database schema and operations
- Plex API client with authentication
- Download service with queue management
- Error handling utilities
- App initialization

### Next Steps

1. Build authentication UI (PIN-based login)
2. Create server selection screen
3. Build library browser
4. Implement download UI with progress tracking
5. Add settings and configuration
6. Testing on physical devices

## Architecture Overview

The application implements the design proposal with the following key components:

### Database Layer (`src/database/`)

The SQLite database is the single source of truth for all downloaded content, addressing the "forgotten downloads" problem.

**Tables:**
- `downloads`: Tracks all download jobs with status and metadata
- `servers`: Stores server connection information
- `download_queue`: Manages server-side transcode queues
- `queue_items`: Tracks individual items in transcode queues

### API Layer (`src/api/`)

The Plex API client handles all communication with Plex servers.

**Key Features:**
- PIN-based authentication
- Server discovery
- Library browsing
- Direct and transcoded downloads
- Server health monitoring

### Service Layer (`src/services/`)

The download service orchestrates the download process.

**Download Strategies:**
1. **Direct Play** (Original Quality): Direct file transfer for maximum stability
2. **Transcoded** (Other Qualities): Server-side transcoding via Download Queue API

**Key Features:**
- Resumable downloads using native download manager
- Progress tracking
- Queue polling for transcode jobs
- Automatic retry logic

## Development Setup

### Prerequisites

- Node.js 20.x LTS
- Android Studio (for Android SDK)
- Git
- Expo Go app on test devices

### Installation

```bash
# Clone repository
git clone https://github.com/Dacilla/PlexDownloader.git
cd PlexDownloader

# Install dependencies
npm install

# Start development server
npm start
```

### Testing on Devices

1. Install Expo Go on your test device
2. Enable USB debugging in Developer Options
3. Connect device via USB or scan QR code
4. App will reload automatically on code changes