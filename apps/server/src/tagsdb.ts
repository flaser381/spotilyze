import { Database } from "bun:sqlite";
import type { ArtistGenreMap, WeightedGenre } from "@spotilyze/core";

/**
 * Reader for data/lastfm-tags.sqlite3 — the baked artist→genre tags (scraped once
 * from Last.fm's community tags, normalized, and shipped). This is the SOLE genre
 * source at runtime: no per-user key, no live API. Keyed by normalized
 * (lowercased/trimmed) artist name. Optional file: absent → null.
 */
let db: Database | null = null;
let stmt: ReturnType<Database["query"]> | null = null;

export function openTagsDb(path: string): boolean {
  try {
    const d = new Database(path, { readonly: true });
    d.query("SELECT 1 FROM artist_tags LIMIT 1").get(); // throws if table missing
    db = d;
    stmt = d.query("SELECT genres FROM artist_tags WHERE artist_key = ?");
    return true;
  } catch {
    db = null;
    stmt = null;
    return false;
  }
}

const norm = (s: string): string => s.trim().toLowerCase();

// Per-process memo (norm name → parsed genres). The baked DB is read-only and static,
// so this never needs invalidation. Without it every amap[artist] access — millions per
// timeframe/k recompute — hit SQLite + JSON.parse; with it, only the first per artist does.
const cache = new Map<string, WeightedGenre[] | null>();

/** Genres for one artist (by name), or null if unknown to the baked set. Memoized. */
export function tagsFor(artist: string): WeightedGenre[] | null {
  if (!stmt) return null;
  const key = norm(artist);
  const cached = cache.get(key);
  if (cached !== undefined) return cached; // null is also a cached (miss) result
  const row = stmt.get(key) as { genres: string } | null;
  let val: WeightedGenre[] | null = null;
  if (row) {
    try {
      const g = JSON.parse(row.genres) as WeightedGenre[];
      val = g.length ? g : null;
    } catch {
      val = null;
    }
  }
  cache.set(key, val);
  return val;
}

/**
 * Build an ArtistGenreMap (keyed by the ORIGINAL play.artist string, matching the
 * core's convention) for the given artist names. Misses are left out so callers can
 * fall back. Returns { map, hit, miss }.
 */
export function buildTagsAmap(artists: string[]): { map: ArtistGenreMap; hit: number; miss: number } {
  const map: ArtistGenreMap = {};
  let hit = 0;
  let miss = 0;
  for (const a of artists) {
    const g = tagsFor(a);
    if (g) { map[a] = { genres: g }; hit++; }
    else miss++;
  }
  return { map, hit, miss };
}

export const tagsReady = (): boolean => !!db;
