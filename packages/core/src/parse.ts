import type { Play, RawPlay } from "./types";

/** Spotify's own "a stream counts" threshold; also filters skips/previews. */
export const MIN_MS = 30_000;

/** A track that came up and got the forward-button before it counted as a stream. */
export interface SkipEvent {
  ts: number;
  artist: string;
  track: string;
  uri: string | null;
  msPlayed: number;
}

/** A podcast / audiobook episode listen (no music artist). Highest-signal context. */
export interface PodcastPlay {
  ts: number;
  show: string;
  episode: string;
  uri: string | null;
  msPlayed: number;
}

export interface ParseStats {
  rawRows: number;
  validPlays: number;
  skipEvents: number;
  podcastPlays: number;
  dropped: { noArtist: number; tooShort: number; badTs: number };
}

export interface ParseResult {
  plays: Play[];
  skips: SkipEvent[]; // fast forward-button skips (sub-stream) — kept for the outgrown detector
  podcasts: PodcastPlay[]; // podcast/audiobook episodes — opt-in context for the LLM
  stats: ParseStats;
}

/**
 * Normalize a raw row to the Extended-history shape we read.
 *
 * Spotify's *standard* "Account Data" export ships the older `StreamingHistory_*`
 * schema — `{ endTime, artistName, trackName, msPlayed }` for music and
 * `{ endTime, podcastName, episodeName, msPlayed }` for podcasts — instead of the
 * Extended export's `{ ts, ms_played, master_metadata_* }`. We map it so the same
 * pipeline works. Caveats vs Extended: only ~12 months, no track URIs, no
 * reason_end (so no fast-skip detection), and endTime is local minute-precision
 * (we tag it UTC) — but artist/track/timestamp/ms are enough for the core analysis.
 */
function normalizeRow(r: RawPlay): RawPlay {
  if (typeof r.endTime === "string" && r.ts === undefined) {
    return {
      ts: `${r.endTime.replace(" ", "T")}:00Z`,
      ms_played: typeof r.msPlayed === "number" ? r.msPlayed : 0,
      master_metadata_album_artist_name: (r.artistName as string | undefined) ?? null,
      master_metadata_track_name: (r.trackName as string | undefined) ?? null,
      master_metadata_album_album_name: null,
      spotify_track_uri: null,
      episode_show_name: r.podcastName,
      episode_name: r.episodeName,
    };
  }
  return r;
}

/**
 * Pure transform: raw Spotify streaming-history rows → cleaned Play[].
 * Accepts both the Extended export and the standard Account Data export (normalized).
 * - keeps only music rows with an artist and msPlayed >= MIN_MS
 * - drops ip_addr / platform (privacy); keeps coarse country for TZ refinement
 * - output sorted ascending by timestamp
 */
export function parsePlays(rawRows: RawPlay[]): ParseResult {
  const plays: Play[] = [];
  const skips: SkipEvent[] = [];
  const podcasts: PodcastPlay[] = [];
  const dropped = { noArtist: 0, tooShort: 0, badTs: 0 };

  for (const raw of rawRows) {
    const r = normalizeRow(raw);
    const artist = r.master_metadata_album_artist_name;
    if (!artist) {
      // no music artist → podcast / audiobook episode (or junk). Capture real episode listens.
      const show = r.episode_show_name as string | undefined;
      if (show && r.ts) {
        const t = Date.parse(r.ts);
        const ms = r.ms_played ?? 0;
        if (!Number.isNaN(t) && ms >= MIN_MS) {
          podcasts.push({ ts: t, show, episode: (r.episode_name as string) ?? "", uri: (r.spotify_episode_uri as string) ?? null, msPlayed: ms });
        }
      }
      dropped.noArtist++;
      continue;
    }
    if (!r.ts) {
      dropped.badTs++;
      continue;
    }
    const t = Date.parse(r.ts);
    if (Number.isNaN(t)) {
      dropped.badTs++;
      continue;
    }
    const ms = r.ms_played ?? 0;
    if (ms < MIN_MS) {
      dropped.tooShort++;
      // bailed via the forward-button before it became a stream → a real skip
      if (r.reason_end === "fwdbtn") {
        skips.push({ ts: t, artist, track: r.master_metadata_track_name ?? "", uri: r.spotify_track_uri ?? null, msPlayed: ms });
      }
      continue;
    }
    plays.push({
      ts: t,
      artist,
      track: r.master_metadata_track_name ?? "",
      album: r.master_metadata_album_album_name ?? "",
      uri: r.spotify_track_uri ?? null,
      msPlayed: ms,
      skipped: r.skipped === true,
      shuffle: r.shuffle === true,
      country: r.conn_country ?? null,
      hourLocal: new Date(t).getUTCHours(), // UTC for now; refine via country→TZ later
    });
  }

  plays.sort((a, b) => a.ts - b.ts);
  skips.sort((a, b) => a.ts - b.ts);
  podcasts.sort((a, b) => a.ts - b.ts);
  return {
    plays,
    skips,
    podcasts,
    stats: { rawRows: rawRows.length, validPlays: plays.length, skipEvents: skips.length, podcastPlays: podcasts.length, dropped },
  };
}
