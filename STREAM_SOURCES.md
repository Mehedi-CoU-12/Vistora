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
- **Purpose**: MovieBox API integration, ported from the Rust client in MovieBox-Tui
- **When Active**: Always, for any non-channel item with no stream of its own
- **TTL**: 5 minutes
- **Configuration**: None. The host pool is built in.

The implementation lives in [`src/services/sources/moviebox/`](src/services/sources/moviebox/):

| File         | Responsibility                                                 |
| ------------ | -------------------------------------------------------------- |
| `crypto.ts`  | MD5, HMAC-MD5, base64 and the request signing the API requires |
| `session.ts` | Visitor bearer tokens and their JWT expiry                     |
| `client.ts`  | Host pool, retry, session lifecycle                            |
| `adapt.ts`   | Payload to `StreamCandidate` mapping, title normalization      |

**How a resolve works**

The API is keyed by its own `subjectId`, not by Vistora's content id, so
resolving an item takes two calls:

1. `POST /wefeed-mobile-bff/subject-api/search/v2` with the item's title
   (the _series_ title for an episode) to find the subject.
2. `GET /wefeed-mobile-bff/subject-api/play-info/v2?subjectId={id}`, plus
   `&se={season}&ep={episode}` for an episode.

Both calls are signed and carry a visitor bearer token obtained from
`POST /wefeed-mobile-bff/user-api/visitor-login`. Unsigned or unauthenticated
requests are rejected.

**Requirements the API imposes**

- **Signing.** Every request carries `x-tr-signature` (HMAC-MD5 over a
  canonical form of method, headers, sorted query, body hash and timestamp)
  and `x-client-token` (the timestamp plus the MD5 of its reverse), alongside
  `x-client-info`, `x-client-status` and `x-forwarded-for`.
- **Host pool.** Seven interchangeable hosts; a request walks the pool,
  rotating past `403/406/407/429/500/502/503/504` and honouring `Retry-After`.
- **Session rotation.** A rotated token can arrive on any response in the
  `x-user` header. Exhausting the whole pool is treated as a rejected session
  and triggers exactly one re-authentication.

**Stream extraction**

`play-info` returns a `streams[]` array. For each entry the DASH manifest is
recovered from the `CloudFront-Policy` in `signCookie` where present — the
policy names the directory holding every rendition, while the plain `url` is a
single one — and the signing cookie is passed through as a request header.
Streams that resolve to MovieBox's "app deprecated" notice clip are dropped.

**Example `play-info` payload:**

```json
{
  "data": {
    "title": "Sample Movie",
    "displayResolutions": "480,720,1080",
    "streams": [
      {
        "id": "9999",
        "format": "MP4",
        "codecName": "hevc",
        "resolutions": "1080,720,480",
        "url": "https://macdn.example.com/video.mp4",
        "signCookie": "CloudFront-Policy=...;CloudFront-Signature=...;"
      }
    ]
  }
}
```

## Configuration

### Environment Variables

Create or update `.env` file:

```env
# Optional. Base URL for the generic external stream API; empty disables that source.
REACT_APP_EXTERNAL_STREAM_API=

```

It is read through `@env` (react-native-dotenv) and surfaced on the `env`
object in [`src/config/env.ts`](src/config/env.ts). `.env` is read at build
time, so restart Metro with `npm start -- --reset-cache` after changing it.

The MovieBox source needs no configuration -- its host pool is built in.

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
