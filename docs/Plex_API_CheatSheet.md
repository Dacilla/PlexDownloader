# Plex Media Server API (v1.2.0) - Architectural Overview

**System Note for AI/Claude:** This document is a high-level summary of the Plex Media Server API. For exact payload schemas, schema `$ref` definitions, and exhaustive parameter lists, please refer to the primary `Plex_API_openapi.json` specification. 

## 1. Core Server & Connection Details
* **Base URL Pattern:** `https://{IP-description}.{identifier}.plex.direct:{port}`
    * *IP-description:* `-` separated IP (e.g., `1-2-3-4`)
    * *identifier:* Unique PMS machine identifier.
    * *port:* Default is `32400`.
* **Authentication:** * All requests require the `X-Plex-Token` HTTP header.
    * Tokens are obtained from `plex.tv` via PIN/JWK flow or legacy Auth App flow.
* **Required Headers:** `X-Plex-Client-Identifier` is universally required to uniquely identify the client device.
* **Response Format:** Defaults to XML. Send `Accept: application/json` to receive JSON (preferred for modern clients).

## 2. Standard Data Structures
* **MediaContainer:** Almost all successful responses are wrapped in a root `MediaContainer` object. It contains pagination info (`size`, `totalSize`, `offset`) and metadata arrays.
* **Metadata:** Represents an item in the library (movie, show, episode, track, etc.). Contains data like `ratingKey`, `title`, `summary`, `type`.
* **Media:** A child of `Metadata`, representing the actual playable file(s). Includes codec, resolution, bitrate, etc.
* **Part:** A child of `Media`, representing the physical file on disk (e.g., CD1 vs CD2).
* **Stream:** A child of `Part`, representing the internal tracks (video, audio, subtitles).

## 3. Pagination & Querying
* **Headers:** Use `X-Plex-Container-Start` (offset) and `X-Plex-Container-Size` (limit).
* **Media Queries:** Complex filtering is supported via query strings (e.g., `type=4&sourceType=2&title=24` means "all episodes where the show title is 24").

## 4. Key API Feature Areas & Endpoints

### 4.1 Server Identity & Status
* `GET /` - Root server info, capabilities, and settings.
* `GET /identity` - Basic server identity (machineIdentifier, version).
* `GET /status/sessions` - Currently active playback sessions.
* `GET /status/sessions/history/all` - Global playback history.

### 4.2 Libraries & Content (The "Media Provider" API)
* `GET /media/providers` - Get available providers (Library, EPG, etc.).
* `GET /library/sections` - List all library sections (e.g., "Movies", "TV Shows").
* `GET /library/sections/{id}/all` - List content within a library section.
* `GET /library/metadata/{ids}` - Get detailed metadata/media info for a specific item(s).
* `PUT /library/metadata/{ids}` - Edit metadata for an item.

### 4.3 Playback & Timelines
* `POST /playQueues` - Create a new play queue from a URI or Playlist.
* `GET /playQueues/{id}` - Fetch a play queue.
* `POST /:/timeline` - Report playback progress (heartbeat/scrobble).
* `PUT /:/scrobble` / `PUT /:/unscrobble` - Manually mark an item as played/unplayed.

### 4.4 Hubs & Discovery (Home Screen)
* `GET /hubs` - Get global discovery hubs (Recently Added, On Deck, etc.).
* `GET /hubs/continueWatching` - Global Continue Watching hub.
* `GET /hubs/search` - Universal search endpoint (returns matches organized by hubs).

### 4.5 Live TV & DVR
* `GET /livetv/dvrs` - List configured DVRs.
* `GET /livetv/epg/channels` - Get EPG channel data.
* `GET /media/subscriptions` - View recording schedules/subscriptions.

### 4.6 Transcoder
* `GET /{transcodeType}/:/transcode/universal/start.*` - Initiate a transcoded streaming session (MPEG-DASH, HLS, or MKV).
* `GET /photo/:/transcode` - Image transcoder (resizes/blurs posters/art on the fly).