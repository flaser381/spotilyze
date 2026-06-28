import { avdCoverage } from "./avd";
import { slidingChangepoints, smooth, zNormalize } from "./changepoint";
import { computeWidgets } from "./metrics";
import type { ArtistGenreMap, AVD, Boundary, GenreAVDTable, Level, Phase, Play, SignalVector } from "./types";

// Detection channels: emotional sound-profile (AVD, genre-derived & smooth) +
// genre-width (entropy) + exploration (novelty). Volume & replay are EXCLUDED —
// engagement, not life-change.
const CHANNELS = ["arousal", "valence", "depth", "entropy", "novelty"];

export interface LifePhaseOpts {
  window?: number; // sliding half-window in weeks (default 10)
  k?: number; // detection sensitivity: threshold in MADs (default 2; lower = more phases)
  minLen?: number; // min phase length / boundary spacing in weeks (default 9)
  smoothWin?: number; // rolling-mean window (default 3)
  explainWin?: number; // half-window for boundary "what changed" (default 6)
}

/** Per-bin [a, v, d, entropy, novelty]; gaps carried forward so values don't dip. */
function buildChannels(signals: SignalVector[]): number[][] {
  const raw: number[][] = [];
  let last: number[] | null = null;
  for (const s of signals) {
    let row: number[];
    if (s.gap && last) row = [...last];
    else {
      row = [s.avd.a, s.avd.v, s.avd.d, s.entropy, s.novelty];
      last = row;
    }
    raw.push(row);
  }
  return raw;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const level = (x: number, base: number): Level => (x > base * 1.4 ? "high" : x < base * 0.66 ? "low" : "mid");

/** Mean AVD over (non-gap) signal weeks — genre-derived, matching the detector & graph lines. */
const meanAVD = (sigs: SignalVector[]): AVD =>
  sigs.length
    ? {
        a: sigs.reduce((s, x) => s + x.avd.a, 0) / sigs.length,
        v: sigs.reduce((s, x) => s + x.avd.v, 0) / sigs.length,
        d: sigs.reduce((s, x) => s + x.avd.d, 0) / sigs.length,
      }
    : { a: 0.5, v: 0.5, d: 0.5 };

function explainBoundaries(
  M: number[][],
  times: number[],
  cps: number[],
  scores: number[],
  threshold: number,
  half: number,
): Boundary[] {
  const d = M[0]?.length ?? 0;
  const meanWin = (lo: number, hi: number): number[] => {
    const m = new Array(d).fill(0);
    const n = Math.max(1, hi - lo);
    for (let i = lo; i < hi; i++) for (let k = 0; k < d; k++) m[k] += M[i]![k]! / n;
    return m;
  };
  return cps.map((b) => {
    const before = meanWin(Math.max(0, b - half), b);
    const after = meanWin(b, Math.min(M.length, b + half));
    const drivers = CHANNELS.map((signal, k) => ({ signal, z: +(after[k] - before[k]).toFixed(2) })).sort(
      (x, y) => Math.abs(y.z) - Math.abs(x.z),
    );
    const confidence = +Math.min(1, (scores[b] ?? threshold) / (2 * threshold || 1)).toFixed(2);
    return { week: times[b]!, confidence, drivers: drivers.slice(0, 4) };
  });
}

function phaseLabel(c: AVD, base: AVD, levels: Phase["levels"]): string {
  const energy = c.a > base.a + 0.04 ? "Energetic" : c.a < base.a - 0.04 ? "Calm" : "Balanced";
  const mood = c.v > base.v + 0.04 ? "upbeat" : c.v < base.v - 0.04 ? "melancholic" : "steady";
  const depth = c.d > base.d + 0.04 ? " · reflective" : c.d < base.d - 0.04 ? " · visceral" : "";
  const beh =
    levels.diversity === "high" ? "exploratory"
    : levels.replay === "high" ? "on-repeat"
    : levels.volume === "high" ? "immersive"
    : levels.volume === "low" ? "quiet"
    : levels.diversity === "low" ? "focused"
    : "settled";
  return `${energy} · ${mood}${depth} — ${beh}`;
}

/** Detect life-phases via sliding-window divergence over the AVD+genre signal matrix. */
export function detectLifePhases(
  plays: Play[],
  signals: SignalVector[],
  amap: ArtistGenreMap,
  table: GenreAVDTable,
  opts: LifePhaseOpts = {},
): { boundaries: Boundary[]; phases: Phase[] } {
  if (signals.length === 0 || plays.length === 0) return { boundaries: [], phases: [] };
  const window = opts.window ?? 10;
  const minLen = opts.minLen ?? 9;
  const times = signals.map((s) => s.weekStart);

  let cps: number[] = [];
  let boundaries: Boundary[] = [];
  if (signals.length >= 2 * window) {
    const M = zNormalize(smooth(buildChannels(signals), opts.smoothWin ?? 3));
    const res = slidingChangepoints(M, { window, k: opts.k ?? 2, minDist: minLen });
    cps = res.indices;
    boundaries = explainBoundaries(M, times, cps, res.scores, res.threshold, opts.explainWin ?? 6);
  }

  // baselines for levels + label
  const valid = signals.filter((s) => !s.gap);
  const base = {
    avd: meanAVD(valid), // genre-derived baseline (matches phase centroids below)
    vol: median(valid.map((s) => s.nPlays)),
    rep: median(valid.map((s) => s.replay)),
    ent: median(valid.map((s) => s.entropy)),
  };

  const bounds = [0, ...cps, signals.length];
  const phases: Phase[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const segStart = bounds[i]!;
    const segEnd = bounds[i + 1]!;
    const startTs = times[segStart]!;
    const endTs = segEnd < times.length ? times[segEnd]! : plays.at(-1)!.ts + 1;
    const segPlays = plays.filter((p) => p.ts >= startTs && p.ts < endTs);
    const segSignals = signals.slice(segStart, segEnd);
    const phase = characterize(segPlays, segSignals, amap, table, { startTs, endTs, base });
    phase.changeFromPrev = i === 0 ? [] : (boundaries[i - 1]?.drivers ?? []).map((x) => ({ signal: x.signal, delta: x.z }));
    phases.push(phase);
  }
  return { boundaries, phases };
}

function characterize(
  segPlays: Play[],
  segSignals: SignalVector[],
  amap: ArtistGenreMap,
  table: GenreAVDTable,
  ctx: { startTs: number; endTs: number; base: { avd: AVD; vol: number; rep: number; ent: number } },
): Phase {
  const w = computeWidgets(segPlays, amap, table, { topN: 12 });
  const real = segSignals.filter((s) => !s.gap);
  const centroid = meanAVD(real); // genre-derived — same signal the detector & graph lines use
  const sd = (sel: (s: SignalVector) => number, m: number) =>
    real.length ? Math.sqrt(real.reduce((acc, s) => acc + (sel(s) - m) ** 2, 0) / real.length) : 0;
  const spread: AVD = {
    a: +sd((s) => s.avd.a, centroid.a).toFixed(3),
    v: +sd((s) => s.avd.v, centroid.v).toFixed(3),
    d: +sd((s) => s.avd.d, centroid.d).toFixed(3),
  };

  const meanVol = real.length ? real.reduce((a, s) => a + s.nPlays, 0) / real.length : 0;
  const meanRep = real.length ? real.reduce((a, s) => a + s.replay, 0) / real.length : 0;
  const meanEnt = real.length ? real.reduce((a, s) => a + s.entropy, 0) / real.length : 0;
  const { base } = ctx;
  const levels = {
    volume: level(meanVol, base.vol || 1),
    replay: level(meanRep, base.rep || 1),
    diversity: level(meanEnt, base.ent || 1),
  };

  // "song of the phase": most-played track in the first 2 weeks (capped to phase length),
  // requiring ≥2 plays so it's a track you actually sat with entering the phase, not a
  // one-off. Ties broken by earliest first play — the one that opened the window.
  const entrySong = phaseEntrySong(segPlays, ctx.startTs, ctx.endTs);

  return {
    start: ctx.startTs,
    end: ctx.endTs,
    weeks: segSignals.length,
    centroid,
    spread,
    topGenres: w.topGenres.map((g) => ({ name: g.name, share: +g.share.toFixed(3) })),
    topArtists: w.topArtists.map((a) => ({ name: a.name, plays: a.plays })),
    topTracks: w.topTracks.map((t) => ({ name: t.name, artist: t.artist, plays: t.plays })),
    levels,
    label: phaseLabel(centroid, base.avd, levels),
    changeFromPrev: [],
    resolvedShare: +avdCoverage(segPlays, amap, table).share.toFixed(3),
    entrySong,
  };
}

const ENTRY_WINDOW = 14 * 864e5; // 2 weeks from the phase start

/** Most-played track (≥2 plays) in the phase's opening window. `segPlays` must be ascending. */
function phaseEntrySong(segPlays: Play[], startTs: number, endTs: number): Phase["entrySong"] {
  const winEnd = Math.min(endTs, startTs + ENTRY_WINDOW);
  const seen = new Map<string, { name: string; artist: string; plays: number; first: number }>();
  for (const p of segPlays) {
    if (p.ts >= winEnd) break; // ascending → nothing past the window remains
    const key = p.uri ?? `${p.artist}|${p.track}`;
    const e = seen.get(key);
    if (e) e.plays++;
    else seen.set(key, { name: p.track, artist: p.artist, plays: 1, first: p.ts });
  }
  let best: { name: string; artist: string; plays: number; first: number } | null = null;
  for (const e of seen.values()) {
    if (e.plays < 2) continue;
    if (!best || e.plays > best.plays || (e.plays === best.plays && e.first < best.first)) best = e;
  }
  return best ? { name: best.name, artist: best.artist, plays: best.plays } : null;
}
