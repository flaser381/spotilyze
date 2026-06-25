import type { AVD, ArtistGenreMap, GenreAVDTable, Play, WeightedGenre } from "./types";

/** Weight-averaged AVD over resolved genres; null if none are in the table. */
export function genresAVD(genres: WeightedGenre[], table: GenreAVDTable): AVD | null {
  let wa = 0,
    wv = 0,
    wd = 0,
    w = 0;
  for (const g of genres) {
    const e = table[g.name];
    if (!e) continue;
    wa += e.a * g.weight;
    wv += e.v * g.weight;
    wd += e.d * g.weight;
    w += g.weight;
  }
  if (w === 0) return null;
  return { a: wa / w, v: wv / w, d: wd / w };
}

/**
 * Per-play AVD. Resolution order:
 *   1. pre-resolved `p.avd` — the Spotify track→artist dataset (measured features), set by the server.
 *   2. fallback: artist → baked genre tags → genre-AVD table (the original approach).
 * null if unresolved by either.
 */
export function playAVD(p: Play, amap: ArtistGenreMap, table: GenreAVDTable): AVD | null {
  if (p.avd) return p.avd;
  return genreOnlyAVD(p, amap, table);
}

/**
 * Genre-derived AVD only, ignoring any measured `p.avd`. Used by the life-phase
 * DETECTOR: measured track AVD is accurate but noisy week-to-week, which drowns
 * sustained life-shifts after z-normalization. The genre signal is smoother and
 * tracks stylistic change (the thing life-phases are about) far better. Measured
 * AVD stays the source for the displayed sound-profile / mood / comparisons.
 */
export function genreOnlyAVD(p: Play, amap: ArtistGenreMap, table: GenreAVDTable): AVD | null {
  const ag = amap[p.artist];
  if (!ag) return null;
  return genresAVD(ag.genres, table);
}

export interface AVDCoverage {
  resolvedPlays: number;
  totalPlays: number;
  share: number; // resolvedPlays / totalPlays
  mean: AVD | null; // play-weighted mean over resolved plays
}

/** Coverage + play-weighted mean AVD across a set of plays. */
export function avdCoverage(plays: Play[], amap: ArtistGenreMap, table: GenreAVDTable): AVDCoverage {
  let n = 0,
    sa = 0,
    sv = 0,
    sd = 0;
  for (const p of plays) {
    const a = playAVD(p, amap, table);
    if (!a) continue;
    n++;
    sa += a.a;
    sv += a.v;
    sd += a.d;
  }
  return {
    resolvedPlays: n,
    totalPlays: plays.length,
    share: plays.length ? n / plays.length : 0,
    mean: n ? { a: sa / n, v: sv / n, d: sd / n } : null,
  };
}
