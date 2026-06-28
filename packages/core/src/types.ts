// ── Raw Spotify Extended Streaming History row (subset we read) ──────────────
export interface RawPlay {
  ts?: string;
  ms_played?: number;
  master_metadata_album_artist_name?: string | null;
  master_metadata_track_name?: string | null;
  master_metadata_album_album_name?: string | null;
  spotify_track_uri?: string | null;
  conn_country?: string | null;
  skipped?: boolean | null;
  shuffle?: boolean | null;
  // ip_addr / platform / episode_* / audiobook_* intentionally ignored (privacy / non-music)
  [k: string]: unknown;
}

// ── Cleaned play (post engagement-filter, IP dropped) ───────────────────────
export interface Play {
  ts: number; // epoch ms (UTC)
  artist: string;
  track: string;
  album: string;
  uri: string | null;
  msPlayed: number;
  skipped: boolean;
  shuffle: boolean;
  country: string | null; // kept (coarse) for TZ refinement, not stored per-user
  hourLocal: number; // 0-23, best-effort
  avd?: AVD | null; // pre-resolved AVD (Spotify artist dataset, measured). If set, wins over genre derivation.
  reasonStart?: string | null; // why the track started: clickrow/playbtn/backbtn/trackdone/fwdbtn/… (Extended export only)
  reasonEnd?: string | null; // why it ended: trackdone/fwdbtn/endplay/… (Extended export only)
}

// ── Genre / AVD ─────────────────────────────────────────────────────────────
export interface WeightedGenre {
  name: string;
  weight: number;
}
export interface ArtistGenres {
  genres: WeightedGenre[];
}
export type ArtistGenreMap = Record<string, ArtistGenres>;

export interface AVD {
  a: number; // arousal 0..1
  v: number; // valence 0..1
  d: number; // depth   0..1
}
export type GenreAVDTable = Record<string, AVD & { _source?: "muse" | "hand" }>;

// ── Behavioural signal matrix ───────────────────────────────────────────────
export interface SignalVector {
  weekStart: number; // epoch ms, start of ISO week
  nPlays: number;
  avd: AVD;
  volume: number; // plays in bin
  replay: number; // plays / uniqueTracks
  entropy: number; // Shannon entropy of genre dist (nats)
  novelty: number; // share of plays from artists unseen in prior window
  stability: number; // Jaccard top-K artists vs previous window
  night: number; // share of plays 00:00-05:00
  skip: number; // skip rate
  shuffle: number; // shuffle rate
  gap: boolean; // sparse/empty bin
}

// ── Change-points & phases ──────────────────────────────────────────────────
export interface Boundary {
  week: number; // epoch ms of boundary bin
  confidence: number; // 0..1
  drivers: { signal: string; z: number }[]; // which signals diverged (sorted |z| desc)
}
export interface Phase {
  start: number;
  end: number;
  weeks: number;
  centroid: AVD;
  spread: AVD;
  topGenres: { name: string; share: number }[];
  topArtists: { name: string; plays: number }[];
  topTracks: { name: string; artist: string; plays: number }[]; // overall most-played in the phase; [0] = "song of the phase"
  levels: { volume: Level; replay: Level; diversity: Level };
  label: string;
  changeFromPrev: { signal: string; delta: number }[];
  resolvedShare: number; // fraction of phase plays with a known genre (rest = untagged artists)
  entrySong: { name: string; artist: string; plays: number } | null; // most-played track in the phase's first 2 weeks — the song that opened the phase
}
export type Level = "low" | "mid" | "high";

// ── Top-level result ────────────────────────────────────────────────────────
export interface AnalysisMeta {
  span: [number, number];
  totalPlays: number;
  totalHours: number;
  nArtists: number;
  nTracks: number;
  unresolvedGenreShare: number;
}
export interface Widgets {
  summary: {
    totalPlays: number;
    totalHours: number;
    span: [number, number];
    nArtists: number;
    nTracks: number;
    perDay: number;
  };
  avdOverall: AVD;
  topGenres: { name: string; plays: number; share: number }[];
  topArtists: { name: string; plays: number; hours: number }[];
  topTracks: { name: string; artist: string; plays: number }[];
  timeOfDay: number[][]; // [weekday 0=Mon..6=Sun][hour 0..23]
  valenceByMonth: { month: number; valence: number; depth: number; arousal: number; plays: number }[];
  moodByDay: { day: number; valence: number; depth: number; arousal: number; plays: number }[]; // day-of-month 1..31
  moodTimeline: { ts: number; valence: number; depth: number; arousal: number; plays: number }[]; // hourly chronological
  restlessTimeline: { ts: number; bail: number; total: number }[]; // daily bail/total counts → restlessness % over time (buckets like moodTimeline)
  genresOverTime: { keys: string[]; rows: { month: string; shares: number[] }[] };
  // restlessness — how tracks END (reason_end). Did you let it finish, or bail early?
  // Only navigation decisions count; session-ends (endplay/logout/exit) are excluded.
  restlessness: {
    finished: number; // trackdone — let it play to the end
    skipped: number; // fwdbtn — skipped forward off it (after ≥30s)
    back: number; // backbtn — left it to go back
    decided: number; // finished + skipped + back (plays where you made a fwd/back decision)
    quickSkips: number; // sub-30s fast-skips (track surfaced, bailed within 30s) — strongest rejection
    // most-played artists you also bail on most — "love-hate" (play a lot, skip a lot)
    loveHate: { name: string; plays: number; bailRate: number }[];
  };
}

export interface AnalysisResult {
  meta: AnalysisMeta;
  signals: SignalVector[];
  boundaries: Boundary[];
  phases: Phase[];
  widgets: Widgets;
}
