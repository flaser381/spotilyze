import { playAVD } from "./avd";
import type { SkipEvent } from "./parse";
import type { ArtistGenreMap, GenreAVDTable, Play, Widgets } from "./types";

export type { Widgets };

const monthKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// reason_start → "did you choose this track, or did the queue?"
const DELIBERATE = new Set(["clickrow", "playbtn", "clickside"]); // picked from a list / library / search
/** Classify a play's start. `null`/unknown reasons (appload, remote, trackerror…) → "other" (uncounted). */
export function classifyStart(rs?: string | null): "deliberate" | "replay" | "autoplay" | "skip" | "other" {
  if (!rs) return "other";
  if (DELIBERATE.has(rs)) return "deliberate";
  if (rs === "backbtn") return "replay"; // went back to hear it again
  if (rs === "trackdone") return "autoplay"; // queue/autoplay rolled into it
  if (rs === "fwdbtn") return "skip"; // skipped forward onto it
  return "other";
}

// reason_end → "did you let the track finish, or bail?" The honest, track-level signal:
// fwdbtn/backbtn mean you navigated away; trackdone means it ran out. endplay/logout/
// unexpected-exit are session-ends (you stopped listening, not a verdict on the track) → excluded.
/** Classify a play's end into a navigation decision, or "other" (session-end / unknown). */
export function classifyEnd(re?: string | null): "finished" | "skipped" | "back" | "other" {
  if (re === "trackdone") return "finished";
  if (re === "fwdbtn") return "skipped"; // skipped forward off it
  if (re === "backbtn") return "back"; // left it to go back
  return "other";
}

/**
 * Distribute one play across its artist's genres (weights normalized to sum 1).
 * Only genres present in the AVD table count — junk tags excluded from the table
 * are ignored here too, so widgets show real genres, not "german"/"seen live".
 */
function genreShares(p: Play, amap: ArtistGenreMap, table: GenreAVDTable): [string, number][] {
  const ag = amap[p.artist];
  if (!ag) return [];
  const kept = ag.genres.filter((g) => table[g.name]);
  const tot = kept.reduce((s, g) => s + g.weight, 0);
  if (tot === 0) return [];
  return kept.map((g) => [g.name, g.weight / tot]);
}

export function computeWidgets(
  plays: Play[],
  amap: ArtistGenreMap,
  table: GenreAVDTable,
  opts: { topN?: number; streamGenres?: number; skips?: SkipEvent[] } = {},
): Widgets {
  const topN = opts.topN ?? 15;
  const streamGenres = opts.streamGenres ?? 8;
  const skips = opts.skips ?? [];

  const artistPlays = new Map<string, number>();
  const artistMs = new Map<string, number>();
  const trackPlays = new Map<string, { name: string; artist: string; plays: number }>();
  const genrePlays = new Map<string, number>();
  const tod: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const byMonthOfYear = new Map<number, { sv: number; sd: number; sa: number; n: number }>();
  const byDayOfMonth = new Map<number, { sv: number; sd: number; sa: number; n: number }>(); // 1..31 — monthly mood cycle
  const byDay = new Map<number, { sv: number; sd: number; sa: number; n: number; plays: number }>(); // day-bucket ts → mood timeline
  const byCalMonth = new Map<string, Map<string, number>>(); // month → genre → share-sum

  let sa = 0, sv = 0, sd = 0, resolved = 0, totalMs = 0;
  const rest = { finished: 0, skipped: 0, back: 0, decided: 0 };
  const artistEnd = new Map<string, { decided: number; bail: number }>(); // for the love-hate ranking

  for (const p of plays) {
    const ec = classifyEnd(p.reasonEnd);
    if (ec !== "other") {
      rest[ec]++;
      rest.decided++;
      const ae = artistEnd.get(p.artist) ?? { decided: 0, bail: 0 };
      ae.decided++;
      if (ec !== "finished") ae.bail++; // skipped or back = bailed on this artist
      artistEnd.set(p.artist, ae);
    }
    artistPlays.set(p.artist, (artistPlays.get(p.artist) ?? 0) + 1);
    artistMs.set(p.artist, (artistMs.get(p.artist) ?? 0) + p.msPlayed);
    totalMs += p.msPlayed;

    const tk = p.uri ?? `${p.artist}|${p.track}`;
    const t = trackPlays.get(tk);
    if (t) t.plays++;
    else trackPlays.set(tk, { name: p.track, artist: p.artist, plays: 1 });

    const d = new Date(p.ts);
    tod[(d.getUTCDay() + 6) % 7]![d.getUTCHours()]!++;
    const db = p.ts - (p.ts % 864e5); // day bucket (chronological, UTC)
    let de = byDay.get(db);
    if (!de) byDay.set(db, (de = { sv: 0, sd: 0, sa: 0, n: 0, plays: 0 }));
    de.plays++;

    const shares = genreShares(p, amap, table);
    for (const [g, s] of shares) genrePlays.set(g, (genrePlays.get(g) ?? 0) + s);

    const mk = monthKey(p.ts);
    let gm = byCalMonth.get(mk);
    if (!gm) byCalMonth.set(mk, (gm = new Map()));
    for (const [g, s] of shares) gm.set(g, (gm.get(g) ?? 0) + s);

    const avd = playAVD(p, amap, table);
    if (avd) {
      sa += avd.a; sv += avd.v; sd += avd.d; resolved++;
      const moy = d.getUTCMonth() + 1;
      const e = byMonthOfYear.get(moy) ?? { sv: 0, sd: 0, sa: 0, n: 0 };
      e.sv += avd.v; e.sd += avd.d; e.sa += avd.a; e.n++;
      byMonthOfYear.set(moy, e);
      const dom = d.getUTCDate();
      const f = byDayOfMonth.get(dom) ?? { sv: 0, sd: 0, sa: 0, n: 0 };
      f.sv += avd.v; f.sd += avd.d; f.sa += avd.a; f.n++;
      byDayOfMonth.set(dom, f);
      de.sv += avd.v; de.sd += avd.d; de.sa += avd.a; de.n++;
    }
  }

  // fold sub-30s fast-skips into restlessness: a track surfaced and you bailed within 30s
  // (the strongest rejection). Without these, heavy skippers look patient (their skips
  // never became "plays"). Counted per-artist too, so love-hate reflects quick-skips.
  for (const s of skips) {
    const ae = artistEnd.get(s.artist) ?? { decided: 0, bail: 0 };
    ae.decided++;
    ae.bail++;
    artistEnd.set(s.artist, ae);
  }
  const quickSkips = skips.length;

  const totalPlays = plays.length;
  const topGenres = [...genrePlays.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, plays]) => ({ name, plays: Math.round(plays), share: plays / (resolved || 1) }));

  const topArtists = [...artistPlays.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, plays]) => ({ name, plays, hours: (artistMs.get(name) ?? 0) / 3.6e6 }));

  const topTracks = [...trackPlays.values()].sort((a, b) => b.plays - a.plays).slice(0, topN);

  // love-hate: artists you genuinely keep coming back to AND skip a lot — a real split,
  // not "outgrown". A lopsided skip rate (you bail almost every time it surfaces) means
  // you don't love it anymore, it just lingers in a playlist → NOT love-hate.
  //   • finished ≥ 15      — proof of genuine love (you complete them often)
  //   • 0.25 ≤ bail ≤ 0.6  — both pulling; above 0.6 = rejected/outgrown, excluded
  //   • rank by tension = min(finished, bail) — both sides must be large to score high
  const loveHate = [...artistEnd.entries()]
    .map(([name, e]) => {
      const finished = e.decided - e.bail;
      const bailRate = e.decided ? e.bail / e.decided : 0;
      return { name, plays: artistPlays.get(name) ?? e.decided, finished, bailRate, tension: Math.min(finished, e.bail) };
    })
    .filter((x) => x.finished >= 15 && x.bailRate >= 0.25 && x.bailRate <= 0.6)
    .sort((a, b) => b.tension - a.tension)
    .slice(0, 6)
    .map(({ name, plays, bailRate }) => ({ name, plays, bailRate }));

  const valenceByMonth = [...Array(12)].map((_, i) => {
    const e = byMonthOfYear.get(i + 1);
    return {
      month: i + 1,
      valence: e ? e.sv / e.n : 0.5,
      depth: e ? e.sd / e.n : 0.5,
      arousal: e ? e.sa / e.n : 0.5,
      plays: e?.n ?? 0,
    };
  });

  // average mood per day-of-month (1..31) — proxy for ~monthly cycles, timeframe-filtered
  const moodByDay = [...Array(31)].map((_, i) => {
    const e = byDayOfMonth.get(i + 1);
    return {
      day: i + 1,
      valence: e ? e.sv / e.n : 0.5,
      depth: e ? e.sd / e.n : 0.5,
      arousal: e ? e.sa / e.n : 0.5,
      plays: e?.n ?? 0,
    };
  });

  // chronological mood timeline at daily resolution (only days with resolved AVD)
  // — base for the zoomable mood graph; the UI averages up to week/month/year.
  const moodTimeline = [...byDay.entries()]
    .filter(([, e]) => e.n > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([ts, e]) => ({
      ts,
      valence: +(e.sv / e.n).toFixed(3),
      depth: +(e.sd / e.n).toFixed(3),
      arousal: +(e.sa / e.n).toFixed(3),
      plays: e.plays,
    }));

  // streamgraph: top global genres' monthly share
  const streamKeys = topGenres.slice(0, streamGenres).map((g) => g.name);
  const months = [...byCalMonth.keys()].sort();
  const rows = months.map((m) => {
    const gm = byCalMonth.get(m)!;
    const tot = [...gm.values()].reduce((s, x) => s + x, 0) || 1;
    return { month: m, shares: streamKeys.map((k) => (gm.get(k) ?? 0) / tot) };
  });

  return {
    summary: {
      totalPlays,
      totalHours: totalMs / 3.6e6,
      span: [plays[0]?.ts ?? 0, plays.at(-1)?.ts ?? 0],
      nArtists: artistPlays.size,
      nTracks: trackPlays.size,
      perDay:
        totalPlays && plays.length > 1
          ? totalPlays / Math.max(1, (plays.at(-1)!.ts - plays[0]!.ts) / 86_400_000)
          : 0,
    },
    avdOverall: resolved ? { a: sa / resolved, v: sv / resolved, d: sd / resolved } : { a: 0.5, v: 0.5, d: 0.5 },
    topGenres,
    topArtists,
    topTracks,
    timeOfDay: tod,
    valenceByMonth,
    moodByDay,
    moodTimeline,
    genresOverTime: { keys: streamKeys, rows },
    restlessness: { ...rest, quickSkips, loveHate },
  };
}
