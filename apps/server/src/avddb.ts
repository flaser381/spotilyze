import { Database } from "bun:sqlite";
import type { AVD, Play } from "@spotilyze/core";

/**
 * Reader for the measured AVD dataset (artist tier only). Resolves per-play AVD by
 * artist (normalized name) — measured Spotify audio analysis, averaged per artist.
 * Falls through (p.avd = null) so the core's genre path still covers anything the
 * dataset doesn't know. Per-track resolution and audio features are no longer
 * supported; we ship a slim artist-resolution table instead.
 */
let db: Database | null = null;
let artistStmt: ReturnType<Database["query"]> | null = null;

interface AvdRow {
  a: number;
  v: number;
  d: number;
}
const COLS = "a, v, d";

export function openAvdDb(path: string): boolean {
  try {
    db = new Database(path, { readonly: true });
    artistStmt = db.query(`SELECT ${COLS} FROM artist_avd WHERE artist_key = ?`);
    return true;
  } catch {
    db = null;
    return false;
  }
}

export interface AvdCoverage {
  artist: number;
  miss: number;
  total: number;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Set `p.avd` on each play (measured, artist tier). Cached per normalized name. */
export function resolveAvd(plays: Play[]): AvdCoverage {
  const cov: AvdCoverage = { artist: 0, miss: 0, total: plays.length };
  if (!db || !artistStmt) {
    for (const p of plays) p.avd = null;
    cov.miss = plays.length;
    return cov;
  }
  const cache = new Map<string, AVD | null>();
  for (const p of plays) {
    const key = norm(p.artist);
    let avd = cache.get(key);
    if (avd === undefined) {
      const r = artistStmt.get(key) as AvdRow | null;
      avd = r ? { a: r.a, v: r.v, d: r.d } : null;
      cache.set(key, avd);
    }
    if (avd) { p.avd = avd; cov.artist++; }
    else { p.avd = null; cov.miss++; }
  }
  return cov;
}
