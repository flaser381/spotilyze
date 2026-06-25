import type { PodcastPlay } from "./parse";

export interface PodcastShow {
  show: string;
  plays: number;
  hours: number;
  first: number; // epoch ms of first listen
  last: number; // epoch ms of last listen
}

export interface PodcastProfile {
  totalPlays: number;
  totalHours: number;
  nShows: number;
  topShows: PodcastShow[]; // by hours listened
  byYear: { year: string; plays: number; hours: number }[];
}

const yearOf = (ts: number) => String(new Date(ts).getUTCFullYear());

/** Aggregate podcast/audiobook listening into a compact profile. */
export function podcastProfile(pods: PodcastPlay[]): PodcastProfile {
  const byShow = new Map<string, { plays: number; ms: number; first: number; last: number }>();
  const byYearMap = new Map<string, { plays: number; ms: number }>();
  let totalMs = 0;

  for (const p of pods) {
    totalMs += p.msPlayed;
    const s = byShow.get(p.show) ?? { plays: 0, ms: 0, first: p.ts, last: p.ts };
    s.plays++;
    s.ms += p.msPlayed;
    s.first = Math.min(s.first, p.ts);
    s.last = Math.max(s.last, p.ts);
    byShow.set(p.show, s);

    const y = yearOf(p.ts);
    const yr = byYearMap.get(y) ?? { plays: 0, ms: 0 };
    yr.plays++;
    yr.ms += p.msPlayed;
    byYearMap.set(y, yr);
  }

  const topShows: PodcastShow[] = [...byShow.entries()]
    .map(([show, s]) => ({ show, plays: s.plays, hours: +(s.ms / 3.6e6).toFixed(1), first: s.first, last: s.last }))
    .sort((a, b) => b.hours - a.hours || b.plays - a.plays)
    .slice(0, 15);

  const byYear = [...byYearMap.entries()]
    .map(([year, y]) => ({ year, plays: y.plays, hours: +(y.ms / 3.6e6).toFixed(1) }))
    .sort((a, b) => a.year.localeCompare(b.year));

  return {
    totalPlays: pods.length,
    totalHours: +(totalMs / 3.6e6).toFixed(1),
    nShows: byShow.size,
    topShows,
    byYear,
  };
}

const fmtMonth = (ts: number) => new Date(ts).toLocaleDateString("en", { year: "numeric", month: "short" });

/**
 * Compact, neutral podcast summary for the LLM prompt. Podcasts are the single
 * highest-signal slice of the export — shows name interests, profession, life
 * events and current preoccupations far more directly than music. Opt-in only.
 */
export function podcastBrief(p: PodcastProfile): string {
  if (!p.totalPlays) return "";
  const L: string[] = [];
  L.push(`Podcasts & spoken-word (${p.totalHours}h across ${p.nShows} shows — interpret these directly; they reveal interests, profession, life events and current state):`);
  for (const s of p.topShows) L.push(`- ${s.show} — ${s.hours}h, ${s.plays} eps (${fmtMonth(s.first)}→${fmtMonth(s.last)})`);
  if (p.byYear.length) L.push(`By year: ${p.byYear.map((y) => `${y.year} ${y.hours}h`).join(", ")}.`);
  return L.join("\n");
}
