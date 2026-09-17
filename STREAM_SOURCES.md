# Stream Sources Implementation

This document explains how the stream resolution system works and how to add new stream sources.

## Overview

When a user clicks on a movie/episode in the app, the `usePlayItem` hook calls `resolveStream()` which:

1. Checks all registered stream sources
2. Asks each source if it can resolve the item
3. Collects all candidates from applicable sources
4. Ranks them by quality
5. Navigates to the player with the best options

## Built-in Stream Sources

### 1. Stored Stream Source (`storedStream.ts`)

- **ID**: `stored`
- **Purpose**: Uses pre-stored stream URLs from the database
- **When Active**: When `item.stream !== null`
- **TTL**: 1 hour
- **Source**: Database records

### 2. External Stream Source (`externalStream.ts`)

- **ID**: `external`
- **Purpose**: Generic external API integration
- **When Active**: When `REACT_APP_EXTERNAL_STREAM_API` is configured and item has no stored stream
- **TTL**: 5 minutes
- **Configuration**: Set `REACT_APP_EXTERNAL_STREAM_API` environment variable

**Expected API Response Format:**

```json
[
  {
    "url": "https://stream.example.com/video.mp4",
    "quality": "1080p",
    "codec": "H.264",
    "format": "MP4",
    "resolutions": "1080,720,480",
    "headers": {
      "Authorization": "Bearer token"
    }
  }
]
```

### 3. MovieBox Stream Source (`movieboxStream.ts`)

- **ID**: `moviebox`
- **Purpose**: MovieBox API integration (like MovieBox-Tui)
- **When Active**: When `REACT_APP_MOVIEBOX_API` is configured
- **TTL**: 5 minutes
- **Configuration**: Set `REACT_APP_MOVIEBOX_API` environment variable
- **Features**:
  - Automatic quality extraction from resolutions
  - Support for DASH and HLS protocols
  - Cookie-based authentication headers
  - Codec and format detection

**Expected API Response Format:**

```json
{
  "data": {
    "list": [
      {
        "url": "https://stream.example.com/manifest.mpd",
        "quality": "1080p",
        "format": "DASH",
        "codecName": "H.265",
        "resolutions": "1080,720,480",
        "signCookie": "session=abc123; path=/;"
      }
    ]
  }
}
```

## Configuration

### Environment Variables

Create or update `.env` file:

```env
REACT_APP_EXTERNAL_STREAM_API=https://api.example.com/v1
REACT_APP_MOVIEBOX_API=https://api.moviebox.com/v1
```

## Creating a Custom Stream Source

To add your own stream source:

1. Create a new file in `src/services/sources/`:

```typescript
import type { ContentItem } from '../../types/content';
import type { StreamCandidate, StreamSource } from '../streamResolver';

export const customStreamSource: StreamSource = {
  id: 'custom-provider',

  canResolve: (item: ContentItem) => {
    // Return true if this source can provide streams for this item
    return item.kind === 'movie' && item.stream === null;
  },

  resolve: async (item: ContentItem): Promise<StreamCandidate[]> => {
    // Fetch streams from your provider
    const streams = await fetchStreamsFromProvider(item);

    return streams.map(stream => ({
      stream: {
        url: stream.url,
        protocol: 'hls' as const,
        headers: stream.headers,
        isLive: false,
      },
      label: `${stream.quality} ${stream.codec}`,
      quality: stream.quality,
    }));
  },

  ttlMs: 5 * 60 * 1000,
};
```

2. Register it in `src/services/sources/index.ts`:

```typescript
import { customStreamSource } from './customStream';

export function installStreamSources(): void {
  registerSource(storedStreamSource);
  registerSource(externalStreamSource);
  registerSource(movieboxStreamSource);
  registerSource(customStreamSource); // Add your source
}
```

## Stream Resolution Flow

```
User clicks movie
    ↓
usePlayItem() hook
    ↓
resolveStream(item) called
    ↓
For each registered source:
  - Check if canResolve(item)
  - If yes, call resolve(item)
  - Collect all StreamCandidate[]
    ↓
Deduplicate by URL
    ↓
Rank by quality (4K > 2K > HD > SD)
    ↓
Cache result (with TTL)
    ↓
Navigate to Player with Playback
```

## Stream Protocol Support

Supported protocols in `PlayableProtocol`:

- `hls` - HTTP Live Streaming (.m3u8)
- `dash` - Dynamic Adaptive Streaming (.mpd)
- `mp4` - MPEG-4 Video
- `mkv` - Matroska Video
- `webm` - WebM Video

## Headers and Authentication

Stream sources can include custom headers (e.g., for authentication):

```typescript
const candidate: StreamCandidate = {
  stream: {
    url: 'https://secure-stream.com/video.mp4',
    protocol: 'mp4',
    headers: {
      Authorization: 'Bearer token123',
      'User-Agent': 'Vistora/1.0',
      Cookie: 'session=abc123',
    },
    isLive: false,
  },
  label: '1080p H.264',
  quality: '1080p',
};
```

## Caching

Stream resolution results are cached using TTL (Time To Live):

- Default TTL: 5 minutes
- Cache key format: `{kind}:{id}` (e.g., `movie:123`)
- When multiple sources contribute: shortest TTL is used

To invalidate cache manually:

```typescript
import { invalidateResolution } from '../services/streamResolver';
invalidateResolution(item);
```

## Debugging

Enable console logs by checking `usePlayItem` and `streamResolver` for debug messages.

Stream resolution status is tracked in `src/state/playbackResolution.ts` and prevents duplicate resolution attempts.
