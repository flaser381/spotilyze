import { playAVD } from "./avd";
import type { SkipEvent } from "./parse";
import type { ArtistGenreMap, AVD, GenreAVDTable, Phase, Play } from "./types";

export interface Obsession {
  name: string;
  artist: string;
  totalPlays: number;
  peakPlays: number; // plays inside the hottest ~3-week window
  peakMonth: string; // YYYY-MM of that window
  spanDays: number; // first → last play
}
export interface Rediscovery {
  name: string;
  artist: string;
  gapYears: number;
  lastBefore: number;
  firstAfter: number;
  playsBefore: number;
  playsAfter: number;
}
export interface HourMood {
  hour: number;
  avd: AVD | null;
  plays: number;
}
export interface DayMood {
  day: number; // day-of-month 1..31
  valence: number;
  arousal: number;
  plays: number;
}
export interface DefiningTrack {
  name: string;
  artist: string;
  plays: number; // within the phase
  concentration: number; // share of the track's all-time plays that fell in this phase
}
export interface Outgrown {
  kind: "artist" | "track"; // artist = whole-catalogue rejection (ranks above tracks)
  name: string; // track name ("" for an artist-level entry)
  artist: string;
  lovePlays: number; // how many times it was fully played, back when
  lovedMonth: string; // YYYY-MM of the love peak
  lovePhase: number; // 1-based life-phase index the love fell in (0 = none)
  skipsAfter: number; // fast forward-button skips since the love faded
  lastSkipMonth: string; // YYYY-MM of the most recent skip
  avgSkipSec: number; // how fast they now bail (seconds)
  nTracks: number; // artist: distinct tracks now skipped; track: 1
  score: number;
}
export interface Insights {
  obsessions: Obsession[];
  rediscoveries: Rediscovery[];
  circadian: HourMood[]; // 24
  cycle: DayMood[]; // 31 (day-of-month — proxy for ~monthly mood cycles)
}

const DAY = 864e5;
const trackKey = (p: Play) => p.uri ?? `${p.artist}${p.track}`;
const monthOf = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

interface TrackAgg {
  name: string;
  artist: string;
  times: number[];
}
export function groupTracks(plays: Play[]): Map<string, TrackAgg> {
  const m = new Map<string, TrackAgg>();
  for (const p of plays) {
    const k = trackKey(p);
    let t = m.get(k);
    if (!t) m.set(k, (t = { name: p.track, artist: p.artist, times: [] }));
    t.times.push(p.ts);
  }
  for (const t of m.values()) t.times.sort((a, b) => a - b);
  return m;
}

/** Tracks binged hard in a short window then dropped (peak share of their plays). */
export function obsessions(tracks: Map<string, TrackAgg>, opts: { window?: number; minPeak?: number; minShare?: number } = {}): Obsession[] {
  const W = opts.window ?? 21 * DAY;
  const minPeak = opts.minPeak ?? 8;
  const minShare = opts.minShare ?? 0.5;
  const out: Obsession[] = [];
  for (const t of tracks.values()) {
    const n = t.times.length;
    if (n < 12) continue;
    let best = 0;
    let peakTs = t.times[0]!;
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (t.times[i]! - t.times[j]! > W) j++;
      const cnt = i - j + 1;
      if (cnt > best) {
        best = cnt;
        peakTs = t.times[Math.floor((i + j) / 2)]!;
      }
    }
    if (best >= minPeak && best / n >= minShare) {
      out.push({
        name: t.name,
        artist: t.artist,
        totalPlays: n,
        peakPlays: best,
        peakMonth: monthOf(peakTs),
        spanDays: Math.round((t.times[n - 1]! - t.times[0]!) / DAY),
      });
    }
  }
  return out.sort((a, b) => b.peakPlays - a.peakPlays).slice(0, 12);
}

/** Songs that vanished for a long time then came back. */
export function rediscoveries(tracks: Map<string, TrackAgg>, opts: { minGap?: number; minSide?: number } = {}): Rediscovery[] {
  const minGap = opts.minGap ?? 365 * DAY;
  const minSide = opts.minSide ?? 3;
  const out: Rediscovery[] = [];
  for (const t of tracks.values()) {
    const n = t.times.length;
    if (n < 2 * minSide) continue;
    let gi = -1;
    let gap = 0;
    for (let i = 1; i < n; i++) {
      const g = t.times[i]! - t.times[i - 1]!;
      if (g > gap) {
        gap = g;
        gi = i - 1;
      }
    }
    const before = gi + 1;
    const after = n - before;
    if (gap >= minGap && before >= minSide && after >= minSide) {
      out.push({
        name: t.name,
        artist: t.artist,
        gapYears: +(gap / (365.25 * DAY)).toFixed(1),
        lastBefore: t.times[gi]!,
        firstAfter: t.times[gi + 1]!,
        playsBefore: before,
        playsAfter: after,
      });
    }
  }
  return out.sort((a, b) => b.gapYears - a.gapYears).slice(0, 12);
}

/** Mean AVD by hour of day (is your 2am sound different?). */
export function circadian(plays: Play[], amap: ArtistGenreMap, table: GenreAVDTable): HourMood[] {
  const acc = Array.from({ length: 24 }, () => ({ a: 0, v: 0, d: 0, n: 0, plays: 0 }));
  for (const p of plays) {
    const b = acc[p.hourLocal]!;
    b.plays++;
    const avd = playAVD(p, amap, table);
    if (avd) {
      b.a += avd.a;
      b.v += avd.v;
      b.d += avd.d;
      b.n++;
    }
  }
  return acc.map((b, hour) => ({
    hour,
    plays: b.plays,
    avd: b.n ? { a: +(b.a / b.n).toFixed(3), v: +(b.v / b.n).toFixed(3), d: +(b.d / b.n).toFixed(3) } : null,
  }));
}

/** Mean mood by day-of-month — a rough proxy for ~monthly mood cycles. */
export function cycleMood(plays: Play[], amap: ArtistGenreMap, table: GenreAVDTable): DayMood[] {
  const acc = Array.from({ length: 31 }, () => ({ v: 0, a: 0, n: 0 }));
  for (const p of plays) {
    const avd = playAVD(p, amap, table);
    if (!avd) continue;
    const day = new Date(p.ts).getUTCDate() - 1;
    const b = acc[day]!;
    b.v += avd.v;
    b.a += avd.a;
    b.n++;
  }
  return acc.map((b, i) => ({
    day: i + 1,
    valence: b.n ? +(b.v / b.n).toFixed(3) : 0,
    arousal: b.n ? +(b.a / b.n).toFixed(3) : 0,
    plays: b.n,
  }));
}

export function computeInsights(plays: Play[], amap: ArtistGenreMap, table: GenreAVDTable): Insights {
  const tracks = groupTracks(plays);
  return {
    obsessions: obsessions(tracks),
    rediscoveries: rediscoveries(tracks),
    circadian: circadian(plays, amap, table),
    cycle: cycleMood(plays, amap, table),
  };
}

/** Tracks that DEFINE each phase — high plays in-phase AND concentrated there. */
export function phaseDefiningTracks(plays: Play[], phases: Phase[]): DefiningTrack[][] {
  const totals = new Map<string, number>();
  for (const p of plays) totals.set(trackKey(p), (totals.get(trackKey(p)) ?? 0) + 1);
  return phases.map((ph) => {
    const inPhase = new Map<string, { name: string; artist: string; plays: number }>();
    for (const p of plays) {
      if (p.ts < ph.start || p.ts >= ph.end) continue;
      const k = trackKey(p);
      const e = inPhase.get(k) ?? { name: p.track, artist: p.artist, plays: 0 };
      e.plays++;
      inPhase.set(k, e);
    }
    return [...inPhase.entries()]
      .map(([k, e]) => ({ ...e, concentration: e.plays / (totals.get(k) ?? e.plays) }))
      .filter((t) => t.plays >= 4)
      .map((t) => ({ name: t.name, artist: t.artist, plays: t.plays, concentration: +t.concentration.toFixed(2), score: t.plays * t.concentration }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ name, artist, plays, concentration }) => ({ name, artist, plays, concentration }));
  });
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const keyOf = (x: { uri: string | null; artist: string; track: string }) => x.uri ?? `${x.artist}${x.track}`;

const phaseOf = (phases: Phase[], ts: number) => {
  const i = phases.findIndex((ph) => ts >= ph.start && ts < ph.end);
  return i >= 0 ? i + 1 : 0;
};

/**
 * "Outgrown" — music you genuinely loved in an earlier life-phase (played in
 * full, many times, long ago) that you now reflexively forward-button when it
 * surfaces. Two levels:
 *  - ARTIST: you outgrew a whole act (an old favourite whose every track you now
 *    skip fast, across ≥2 songs). Aggregated over the catalogue, so it surfaces
 *    even when no single song clears the per-track bar — and always ranks ABOVE
 *    individual tracks.
 *  - TRACK: a specific song you've soured on (its artist not already flagged).
 * Signal for both = real past love + repeated recent fast-skips after it faded +
 * essentially no recent real listens.
 */
export function outgrownEntries(
  plays: Play[],
  skips: SkipEvent[],
  phases: Phase[],
  opts: {
    minLove?: number;
    minSkips?: number;
    artistMinLove?: number;
    artistMinSkips?: number;
    artistMinTracks?: number;
    loveAgeDays?: number;
    recentDays?: number;
    artistLimit?: number;
    trackLimit?: number;
  } = {},
): Outgrown[] {
  const minLove = opts.minLove ?? 5;
  const minSkips = opts.minSkips ?? 3;
  const aMinLove = opts.artistMinLove ?? 12;
  const aMinSkips = opts.artistMinSkips ?? 5;
  const aMinTracks = opts.artistMinTracks ?? 2;
  const loveAge = (opts.loveAgeDays ?? 365) * DAY;
  const recent = (opts.recentDays ?? 540) * DAY; // ~18 months
  const aLimit = opts.artistLimit ?? 5;
  const tLimit = opts.trackLimit ?? 5;

  const end = Math.max(plays.at(-1)?.ts ?? 0, skips.at(-1)?.ts ?? 0);
  const avgSec = (ms: number[]) => +(ms.reduce((s, x) => s + x, 0) / (ms.length || 1) / 1000).toFixed(1);
  const fastFactor = (sec: number) => Math.max(0, 1 - sec / 30); // bail speed 0..1 (faster = higher)

  // ── per-track love + skip aggregates ──
  const loveByTrack = new Map<string, { name: string; artist: string; times: number[] }>();
  for (const p of plays) {
    const k = keyOf(p);
    let e = loveByTrack.get(k);
    if (!e) loveByTrack.set(k, (e = { name: p.track, artist: p.artist, times: [] }));
    e.times.push(p.ts);
  }
  const skipByTrack = new Map<string, { ts: number; ms: number }[]>();
  for (const s of skips) {
    const k = keyOf(s);
    (skipByTrack.get(k) ?? skipByTrack.set(k, []).get(k)!).push({ ts: s.ts, ms: s.msPlayed });
  }

  // ── per-artist love + skip aggregates (skips carry their track key for breadth) ──
  const loveByArtist = new Map<string, number[]>();
  for (const p of plays) (loveByArtist.get(p.artist) ?? loveByArtist.set(p.artist, []).get(p.artist)!).push(p.ts);
  const skipByArtist = new Map<string, { ts: number; ms: number; tk: string }[]>();
  for (const s of skips) (skipByArtist.get(s.artist) ?? skipByArtist.set(s.artist, []).get(s.artist)!).push({ ts: s.ts, ms: s.msPlayed, tk: keyOf(s) });

  // ── ARTIST-level outgrown (whole catalogue abandoned) ──
  const artistOut: Outgrown[] = [];
  const flaggedArtists = new Set<string>();
  for (const [artist, loves] of loveByArtist) {
    if (loves.length < aMinLove) continue;
    const S = skipByArtist.get(artist);
    if (!S || S.length < aMinSkips) continue;
    const med = median(loves);
    if (end - med < loveAge) continue;
    const after = S.filter((x) => x.ts > med);
    if (after.length < aMinSkips) continue;
    const distinct = new Set(after.map((x) => x.tk)).size;
    if (distinct < aMinTracks) continue; // must span the catalogue, not one song
    const lastSkip = Math.max(...after.map((x) => x.ts));
    if (end - lastSkip > recent) continue;
    const recentLove = loves.filter((t) => end - t <= recent).length;
    if (recentLove / loves.length >= 0.12) continue; // you've genuinely moved on

    const sec = avgSec(after.map((x) => x.ms));
    artistOut.push({
      kind: "artist",
      name: "",
      artist,
      lovePlays: loves.length,
      lovedMonth: monthOf(med),
      lovePhase: phaseOf(phases, med),
      skipsAfter: after.length,
      lastSkipMonth: monthOf(lastSkip),
      avgSkipSec: sec,
      nTracks: distinct,
      // breadth multiplier makes a whole-artist rejection massively outweigh one song
      score: +(loves.length * after.length * distinct * (0.4 + 0.6 * fastFactor(sec))).toFixed(1),
    });
    flaggedArtists.add(artist);
  }

  // ── TRACK-level outgrown (artist not already flagged) ──
  const trackOut: Outgrown[] = [];
  for (const [k, L] of loveByTrack) {
    if (L.times.length < minLove || flaggedArtists.has(L.artist)) continue;
    const S = skipByTrack.get(k);
    if (!S || S.length < minSkips) continue;
    const med = median(L.times);
    if (end - med < loveAge) continue;
    const after = S.filter((x) => x.ts > med);
    if (after.length < minSkips) continue;
    const lastSkip = Math.max(...after.map((x) => x.ts));
    if (end - lastSkip > recent) continue;
    const recentLove = L.times.filter((t) => end - t <= recent).length;
    if (recentLove > 1) continue;

    const sec = avgSec(after.map((x) => x.ms));
    trackOut.push({
      kind: "track",
      name: L.name,
      artist: L.artist,
      lovePlays: L.times.length,
      lovedMonth: monthOf(med),
      lovePhase: phaseOf(phases, med),
      skipsAfter: after.length,
      lastSkipMonth: monthOf(lastSkip),
      avgSkipSec: sec,
      nTracks: 1,
      score: +(L.times.length * after.length * (0.4 + 0.6 * fastFactor(sec))).toFixed(1),
    });
  }

  const byScore = (a: Outgrown, b: Outgrown) => b.score - a.score;
  // artists always ahead of tracks; separate caps so both levels get airtime
  return [...artistOut.sort(byScore).slice(0, aLimit), ...trackOut.sort(byScore).slice(0, tLimit)];
}

/** A short rule-based one-liner per phase (the LLM wrapped expands on it). */
export function phaseNarrative(ph: Phase, defining: DefiningTrack[]): string {
  const when = new Date(ph.start).toLocaleDateString("en", { year: "numeric", month: "short" });
  const genre = ph.topGenres[0]?.name;
  const artist = ph.topArtists[0]?.name;
  const def = defining[0]?.name;
  const mood = ph.label.split(" — ")[0] ?? ph.label;
  const change = ph.changeFromPrev[0];
  const dir = change ? `${change.signal} ${change.delta >= 0 ? "rose" : "fell"}` : "";
  const bits = [
    `From ${when}, ${mood.toLowerCase()}`,
    genre ? ` — ${genre}-leaning${artist ? ` (${artist})` : ""}` : "",
    def ? `, with “${def}” on repeat` : "",
    dir ? `; ${dir} at the start` : "",
  ];
  return `${bits.join("")}.`;
}
