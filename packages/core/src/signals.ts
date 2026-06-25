import { genreOnlyAVD } from "./avd";
import type { ArtistGenreMap, AVD, GenreAVDTable, Play, SignalVector } from "./types";

export const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Monday 00:00 UTC of the ISO week containing `ts`. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
}

export interface SignalOpts {
  noveltyLookbackWeeks?: number; // window for "new artist" (default 8)
  topK?: number; // top-K artists for taste-stability Jaccard (default 20)
  gapMaxPlays?: number; // bins with <= this many plays flagged as gaps (default 4)
}

const shannon = (weights: number[]): number => {
  const tot = weights.reduce((s, w) => s + w, 0);
  if (tot <= 0) return 0;
  let h = 0;
  for (const w of weights) {
    if (w <= 0) continue;
    const p = w / tot;
    h -= p * Math.log(p);
  }
  return h;
};

function topKArtists(plays: Play[], k: number): Set<string> {
  const c = new Map<string, number>();
  for (const p of plays) c.set(p.artist, (c.get(p.artist) ?? 0) + 1);
  return new Set(
    [...c.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([a]) => a),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// any timestamp in sorted `times` falling in [lo, hi)?
function existsInRange(times: number[], lo: number, hi: number): boolean {
  let a = 0;
  let b = times.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (times[m]! < lo) a = m + 1;
    else b = m;
  }
  return a < times.length && times[a]! < hi;
}

/**
 * Weekly behavioural signal matrix over the full span (empty weeks included as
 * gaps). All channels are raw here; z-scoring/smoothing happens in M3.
 */
export function computeSignals(
  plays: Play[],
  amap: ArtistGenreMap,
  table: GenreAVDTable,
  opts: SignalOpts = {},
): SignalVector[] {
  if (plays.length === 0) return [];
  const lookback = (opts.noveltyLookbackWeeks ?? 8) * WEEK_MS;
  const topK = opts.topK ?? 20;
  const gapMax = opts.gapMaxPlays ?? 4;

  // artist → sorted play timestamps (for novelty lookups)
  const artistTimes = new Map<string, number[]>();
  for (const p of plays) (artistTimes.get(p.artist) ?? artistTimes.set(p.artist, []).get(p.artist)!).push(p.ts);
  for (const t of artistTimes.values()) t.sort((x, y) => x - y);

  // group into weekly bins
  const bins = new Map<number, Play[]>();
  for (const p of plays) (bins.get(weekStart(p.ts)) ?? bins.set(weekStart(p.ts), []).get(weekStart(p.ts))!).push(p);

  const first = weekStart(plays[0]!.ts);
  const last = weekStart(plays.at(-1)!.ts);

  const out: SignalVector[] = [];
  let prevTopK: Set<string> | null = null;

  for (let w = first; w <= last; w += WEEK_MS) {
    const ps = bins.get(w) ?? [];
    const n = ps.length;

    if (n === 0) {
      out.push({
        weekStart: w, nPlays: 0,
        avd: { a: 0.5, v: 0.5, d: 0.5 },
        volume: 0, replay: 0, entropy: 0, novelty: 0,
        stability: prevTopK ? 0 : 0, night: 0, skip: 0, shuffle: 0, gap: true,
      });
      continue;
    }

    // AVD (play-weighted over resolved) + genre distribution (for entropy)
    let sa = 0, sv = 0, sd = 0, resolved = 0;
    const genreW = new Map<string, number>();
    let newPlays = 0, nightPlays = 0, skipPlays = 0, shufflePlays = 0;
    const tracks = new Set<string>();

    for (const p of ps) {
      // detection channels use genre AVD (smooth, stylistic) — NOT measured p.avd (noisy)
      const avd = genreOnlyAVD(p, amap, table);
      if (avd) {
        sa += avd.a; sv += avd.v; sd += avd.d; resolved++;
      }
      const ag = amap[p.artist];
      if (ag) {
        const kept = ag.genres.filter((g) => table[g.name]); // table-genres only (skip junk tags)
        const tot = kept.reduce((s, g) => s + g.weight, 0);
        if (tot > 0) for (const g of kept) genreW.set(g.name, (genreW.get(g.name) ?? 0) + g.weight / tot);
      }
      tracks.add(p.uri ?? `${p.artist}|${p.track}`);
      if (p.hourLocal < 6) nightPlays++;
      if (p.skipped) skipPlays++;
      if (p.shuffle) shufflePlays++;
      // novelty: artist unseen in the prior lookback window
      if (!existsInRange(artistTimes.get(p.artist)!, w - lookback, w)) newPlays++;
    }

    const avd: AVD = resolved
      ? { a: sa / resolved, v: sv / resolved, d: sd / resolved }
      : { a: 0.5, v: 0.5, d: 0.5 };
    const curTopK = topKArtists(ps, topK);

    out.push({
      weekStart: w, nPlays: n,
      avd,
      volume: n,
      replay: n / tracks.size,
      entropy: shannon([...genreW.values()]),
      novelty: newPlays / n,
      stability: prevTopK ? jaccard(curTopK, prevTopK) : 1,
      night: nightPlays / n,
      skip: skipPlays / n,
      shuffle: shufflePlays / n,
      gap: n <= gapMax,
    });
    prevTopK = curTopK;
  }

  return out;
}
