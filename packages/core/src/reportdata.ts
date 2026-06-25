import { playAVD } from "./avd";
import { groupTracks, obsessions, outgrownEntries, type Obsession, type Outgrown } from "./insights";
import type { SkipEvent } from "./parse";
import type { ArtistGenreMap, AVD, GenreAVDTable, Phase, Play } from "./types";

export interface MonthlyGenres {
  month: string; // YYYY-MM
  plays: number;
  top: { name: string; share: number }[];
  avd: AVD | null; // play-weighted measured AVD that month (sonic profile, not "mood")
}
export interface EmergingGenre {
  month: string; // first month it became a sustained part of the rotation
  name: string;
  share: number; // its share that month
  avd: AVD | null; // the genre's measured AVD (sonic character it pulled toward)
  stuck: boolean; // still prominent in the final stretch (vs a phase that faded)
}
export interface YearSummary {
  year: number;
  plays: number;
  hours: number;
  avd: AVD | null; // play-weighted measured AVD for the year (sonic profile)
  topGenres: { name: string; share: number }[];
  heatmap: number[][]; // [7 weekday Mon..Sun][8 three-hour blocks 0-3h…21-24h] play counts
  peak: string; // short human summary of when they listened that year
}
export interface ReportData {
  monthlyGenres: MonthlyGenres[];
  /** genres that newly + durably entered the rotation (sustained, not one-off blips) */
  emerging: EmergingGenre[];
  yearly: YearSummary[];
  obsessions: Obsession[]; // intense binges (all-time)
  outgrown: Outgrown[]; // loved-then-abandoned (all-time; [] without skips)
}

const monthKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** kept (table-present) genres of a play, weights normalised to sum 1. */
function genreShares(p: Play, amap: ArtistGenreMap, table: GenreAVDTable): [string, number][] {
  const ag = amap[p.artist];
  if (!ag) return [];
  const kept = ag.genres.filter((g) => table[g.name]);
  const tot = kept.reduce((s, g) => s + g.weight, 0);
  if (!tot) return [];
  return kept.map((g) => [g.name, g.weight / tot]);
}

// local weekday (Mon=0) + 3-hour block (0..7) — best-effort from ts(UTC)+hourLocal.
function whenCell(p: Play): { wd: number; block: number } {
  const utcH = new Date(p.ts).getUTCHours();
  let off = p.hourLocal - utcH;
  if (off > 12) off -= 24;
  else if (off < -12) off += 24;
  const wd = (new Date(p.ts + off * 3600e3).getUTCDay() + 6) % 7;
  return { wd, block: Math.floor(p.hourLocal / 3) };
}

interface Acc { gw: Map<string, number>; sa: number; sv: number; sd: number; n: number; plays: number }
const newAcc = (): Acc => ({ gw: new Map(), sa: 0, sv: 0, sd: 0, n: 0, plays: 0 });
const accAvd = (a: Acc): AVD | null => (a.n ? { a: +(a.sa / a.n).toFixed(3), v: +(a.sv / a.n).toFixed(3), d: +(a.sd / a.n).toFixed(3) } : null);
const topG = (gw: Map<string, number>, k: number) => {
  const tot = [...gw.values()].reduce((s, x) => s + x, 0) || 1;
  return [...gw.entries()].map(([name, w]) => ({ name, share: +(w / tot).toFixed(3) })).sort((a, b) => b.share - a.share).slice(0, k);
};

const BLOCK_LABEL = ["night (0-6h)", "morning (6-12h)", "afternoon (12-18h)", "evening (18-24h)"];
function peakSummary(h: number[][]): string {
  let total = 0, weekend = 0;
  const period = [0, 0, 0, 0]; // night, morning, afternoon, evening
  for (let wd = 0; wd < 7; wd++) for (let b = 0; b < 8; b++) {
    const c = h[wd]![b]!;
    total += c;
    if (wd >= 5) weekend += c;
    period[Math.floor(b / 2)]! += c;
  }
  if (!total) return "—";
  const dom = period.indexOf(Math.max(...period));
  const night = period[0]! / total;
  const wkndShare = weekend / total;
  const lean = wkndShare > 0.36 ? "weekend-heavy" : wkndShare < 0.24 ? "weekday-driven" : "even across the week";
  const nightNote = night > 0.15 ? `, ${Math.round(night * 100)}% late-night` : "";
  return `mostly ${BLOCK_LABEL[dom]}, ${lean}${nightNote}`;
}

/**
 * Rich report data for the LLM profile: monthly genres + measured AVD, a per-year
 * evolution (AVD, top genres, when-you-listen heatmap), durable genre emergence,
 * plus all-time obsessions and outgrown music. Computed from raw plays. AVD is the
 * raw measured sonic profile — we do NOT derive a single "mood" from it (valence
 * tracks sonic brightness, not emotion).
 */
export function buildReportData(
  plays: Play[],
  amap: ArtistGenreMap,
  table: GenreAVDTable,
  opts: { topPerMonth?: number; emergeShare?: number; minMonthPlays?: number; skips?: SkipEvent[]; phases?: Phase[] } = {},
): ReportData {
  const topN = opts.topPerMonth ?? 5;
  const emergeShare = opts.emergeShare ?? 0.05;
  const minPlays = opts.minMonthPlays ?? 15;

  const byMonth = new Map<string, Acc>();
  const byYear = new Map<number, Acc>();
  const yearHeat = new Map<number, number[][]>();
  const yearMs = new Map<number, number>();

  for (const p of plays) {
    const mk = monthKey(p.ts);
    const yr = new Date(p.ts).getUTCFullYear();
    let mm = byMonth.get(mk); if (!mm) byMonth.set(mk, (mm = newAcc()));
    let ym = byYear.get(yr); if (!ym) byYear.set(yr, (ym = newAcc()));
    mm.plays++; ym.plays++;
    yearMs.set(yr, (yearMs.get(yr) ?? 0) + p.msPlayed);

    for (const [g, s] of genreShares(p, amap, table)) { mm.gw.set(g, (mm.gw.get(g) ?? 0) + s); ym.gw.set(g, (ym.gw.get(g) ?? 0) + s); }

    const avd = playAVD(p, amap, table);
    if (avd) { mm.sa += avd.a; mm.sv += avd.v; mm.sd += avd.d; mm.n++; ym.sa += avd.a; ym.sv += avd.v; ym.sd += avd.d; ym.n++; }

    let h = yearHeat.get(yr); if (!h) yearHeat.set(yr, (h = Array.from({ length: 7 }, () => new Array(8).fill(0))));
    const { wd, block } = whenCell(p);
    h[wd]![block]!++;
  }

  const months = [...byMonth.keys()].sort();
  const monthlyGenres: MonthlyGenres[] = months.map((m) => {
    const a = byMonth.get(m)!;
    return { month: m, plays: a.plays, top: topG(a.gw, topN), avd: accAvd(a) };
  });

  // ── genres prominent in the final stretch (for the "stuck" flag) ──
  const stuckSet = new Set<string>();
  for (const m of months.slice(-3)) for (const g of topG(byMonth.get(m)!.gw, 50)) if (g.share >= emergeShare) stuckSet.add(g.name);

  // ── durable emergence: first month a genre crosses the bar AND sustains it ──
  // (≥ emergeShare in ≥2 of the next up-to-3 qualifying months → not a one-off spike)
  const sharesByMonth = months.map((m) => {
    const a = byMonth.get(m)!;
    const tot = [...a.gw.values()].reduce((s, x) => s + x, 0) || 1;
    return { m, plays: a.plays, share: new Map([...a.gw].map(([g, w]) => [g, w / tot] as const)) };
  });
  const emerging: EmergingGenre[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < sharesByMonth.length; i++) {
    const cur = sharesByMonth[i]!;
    if (cur.plays < minPlays) continue;
    for (const [g, sh] of cur.share) {
      if (sh < emergeShare || seen.has(g)) continue;
      const window = sharesByMonth.slice(i, i + 4).filter((x) => x.plays >= minPlays);
      if (window.filter((x) => (x.share.get(g) ?? 0) >= emergeShare).length >= 2) {
        emerging.push({ month: cur.m, name: g, share: +sh.toFixed(3), avd: table[g] ? { a: table[g]!.a, v: table[g]!.v, d: table[g]!.d } : null, stuck: stuckSet.has(g) });
        seen.add(g);
      }
    }
  }

  const yearly: YearSummary[] = [...byYear.keys()].sort().map((year) => {
    const a = byYear.get(year)!;
    return { year, plays: a.plays, hours: +((yearMs.get(year) ?? 0) / 3.6e6).toFixed(0), avd: accAvd(a), topGenres: topG(a.gw, 6), heatmap: yearHeat.get(year)!, peak: peakSummary(yearHeat.get(year)!) };
  });

  return {
    monthlyGenres,
    emerging,
    yearly,
    obsessions: obsessions(groupTracks(plays)),
    outgrown: opts.skips ? outgrownEntries(plays, opts.skips, opts.phases ?? []) : [],
  };
}
