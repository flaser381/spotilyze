import { playAVD } from "./avd";
import { classifyEnd } from "./metrics";
import type { SkipEvent } from "./parse";
import type { ArtistGenreMap, AVD, GenreAVDTable, Phase, Play } from "./types";

/**
 * The "behavioural signature": a handful of pre-extracted, high-confidence, specific
 * tells about a listener — the kind of facts that feel eerie when read back. We do the
 * pattern-mining deterministically here (LLMs are unreliable at it) and hand the model
 * crisp statements to interpret, not raw tables. Every signal has a support threshold;
 * a wrong "eerie" fact destroys trust, so we only emit ones the data strongly supports.
 */
export interface DaypartPersona {
  name: string; // "late night" | "morning" | "afternoon" | "evening"
  hours: string; // "0-6h"
  share: number; // share of all plays in this daypart (0..1)
  avd: AVD | null; // sonic character at this time of day
  artists: string[]; // artists you reach for disproportionately at this time
  genres: string[];
}
export interface SkipProofLove { name: string; plays: number; skipRate: number }
export interface AnchorSong { name: string; artist: string; months: number; firstYear: number; lastYear: number; plays: number }
export interface ArtistRelationships {
  lifers: { name: string; years: number; plays: number }[]; // recurring across years
  flings: { name: string; peak: string; plays: number }[]; // one intense burst, then gone
  throughline: { name: string; phases: number; ofPhases: number } | null; // a top artist in most phases
}
export interface ListenerSignature {
  dayparts: DaypartPersona[];
  skipProof: SkipProofLove[];
  anchors: AnchorSong[];
  relationships: ArtistRelationships;
}

const monthKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
function genreShares(p: Play, amap: ArtistGenreMap, table: GenreAVDTable): [string, number][] {
  const ag = amap[p.artist];
  if (!ag) return [];
  const kept = ag.genres.filter((g) => table[g.name]);
  const tot = kept.reduce((s, g) => s + g.weight, 0);
  if (!tot) return [];
  return kept.map((g) => [g.name, g.weight / tot]);
}

const DP = [["late night", "0-6h"], ["morning", "6-12h"], ["afternoon", "12-18h"], ["evening", "18-24h"]] as const;
const YEAR = 365.25 * 864e5;

export function listenerSignature(
  plays: Play[],
  amap: ArtistGenreMap,
  table: GenreAVDTable,
  opts: { skips?: SkipEvent[]; phases?: Phase[] } = {},
): ListenerSignature {
  const skips = opts.skips ?? [];
  const phases = opts.phases ?? [];
  const N = plays.length;

  const dpCount = [0, 0, 0, 0];
  const dpAvd = [0, 1, 2, 3].map(() => ({ sa: 0, sv: 0, sd: 0, n: 0 }));
  const artistDp = new Map<string, number[]>(); // artist → plays per daypart
  const artistTotal = new Map<string, number>();
  const genreDp = new Map<string, number[]>(); // genre → weighted plays per daypart
  const genreTot = new Map<string, number>();
  const end = new Map<string, { decided: number; bail: number }>(); // reason_end per artist
  const rel = new Map<string, { plays: number; first: number; last: number; mc: Map<string, number> }>();
  const trk = new Map<string, { name: string; artist: string; plays: number; months: Set<string>; years: Set<number> }>();

  for (const p of plays) {
    const dp = Math.min(3, Math.floor(p.hourLocal / 6));
    dpCount[dp]!++;
    const av = playAVD(p, amap, table);
    if (av) { const d = dpAvd[dp]!; d.sa += av.a; d.sv += av.v; d.sd += av.d; d.n++; }

    artistTotal.set(p.artist, (artistTotal.get(p.artist) ?? 0) + 1);
    let ad = artistDp.get(p.artist); if (!ad) artistDp.set(p.artist, (ad = [0, 0, 0, 0])); ad[dp]!++;
    for (const [g, s] of genreShares(p, amap, table)) {
      let gd = genreDp.get(g); if (!gd) genreDp.set(g, (gd = [0, 0, 0, 0])); gd[dp]! += s;
      genreTot.set(g, (genreTot.get(g) ?? 0) + s);
    }

    const ec = classifyEnd(p.reasonEnd);
    if (ec !== "other") { let e = end.get(p.artist); if (!e) end.set(p.artist, (e = { decided: 0, bail: 0 })); e.decided++; if (ec !== "finished") e.bail++; }

    const mk = monthKey(p.ts);
    let r = rel.get(p.artist); if (!r) rel.set(p.artist, (r = { plays: 0, first: p.ts, last: p.ts, mc: new Map() }));
    r.plays++; if (p.ts < r.first) r.first = p.ts; if (p.ts > r.last) r.last = p.ts; r.mc.set(mk, (r.mc.get(mk) ?? 0) + 1);

    const key = p.uri ?? `${p.artist}|${p.track}`;
    let t = trk.get(key); if (!t) trk.set(key, (t = { name: p.track, artist: p.artist, plays: 0, months: new Set(), years: new Set() }));
    t.plays++; t.months.add(mk); t.years.add(new Date(p.ts).getUTCFullYear());
  }

  // ── time-of-day personas: artists/genres disproportionately tied to one daypart ──
  const artByDp: { name: string; lift: number; plays: number }[][] = [[], [], [], []];
  for (const [name, counts] of artistDp) {
    const tot = artistTotal.get(name)!;
    if (tot < 25) continue;
    let best = -1, bestLift = 0, bestPlays = 0;
    for (let dp = 0; dp < 4; dp++) {
      if (dpCount[dp]! < 1 || counts[dp]! < 12) continue;
      const lift = (counts[dp]! / dpCount[dp]!) / (tot / N);
      if (lift > bestLift) { bestLift = lift; best = dp; bestPlays = counts[dp]!; }
    }
    if (best >= 0 && bestLift >= 1.5) artByDp[best]!.push({ name, lift: bestLift, plays: bestPlays });
  }
  const genByDp: { name: string; lift: number }[][] = [[], [], [], []];
  for (const [name, w] of genreDp) {
    const tot = genreTot.get(name)!;
    if (tot < 40) continue;
    let best = -1, bestLift = 0;
    for (let dp = 0; dp < 4; dp++) {
      if (dpCount[dp]! < 1 || w[dp]! < 15) continue;
      const lift = (w[dp]! / dpCount[dp]!) / (tot / N);
      if (lift > bestLift) { bestLift = lift; best = dp; }
    }
    if (best >= 0 && bestLift >= 1.4) genByDp[best]!.push({ name, lift: bestLift });
  }
  const dayparts: DaypartPersona[] = DP.map(([name, hours], dp) => {
    const d = dpAvd[dp]!;
    return {
      name, hours,
      share: N ? +(dpCount[dp]! / N).toFixed(3) : 0,
      avd: d.n ? { a: +(d.sa / d.n).toFixed(2), v: +(d.sv / d.n).toFixed(2), d: +(d.sd / d.n).toFixed(2) } : null,
      artists: artByDp[dp]!.sort((a, b) => b.lift - a.lift).slice(0, 4).map((x) => x.name),
      genres: genByDp[dp]!.sort((a, b) => b.lift - a.lift).slice(0, 3).map((x) => x.name),
    };
  });

  // ── skip-proof loves: high play count, almost never skipped (quick-skips included) ──
  const quick = new Map<string, number>();
  for (const s of skips) quick.set(s.artist, (quick.get(s.artist) ?? 0) + 1);
  const skipProof: SkipProofLove[] = [];
  for (const [name, e] of end) {
    const q = quick.get(name) ?? 0;
    const surfaced = e.decided + q;
    if (surfaced < 30) continue;
    const rate = (e.bail + q) / surfaced;
    if (rate <= 0.08) skipProof.push({ name, plays: artistTotal.get(name) ?? e.decided, skipRate: +rate.toFixed(3) });
  }
  skipProof.sort((a, b) => b.plays - a.plays);
  skipProof.length = Math.min(5, skipProof.length);

  // ── anchor songs: returned to across many distinct months and ≥2 years (not a binge) ──
  const anchors: AnchorSong[] = [];
  for (const t of trk.values()) {
    if (t.plays < 10 || t.years.size < 2 || t.months.size < 6) continue;
    const yrs = [...t.years].sort((a, b) => a - b);
    anchors.push({ name: t.name, artist: t.artist, months: t.months.size, firstYear: yrs[0]!, lastYear: yrs.at(-1)!, plays: t.plays });
  }
  anchors.sort((a, b) => b.months - a.months || b.plays - a.plays);
  anchors.length = Math.min(5, anchors.length);

  // ── relationships: lifers (recur across years) vs flings (one burst) + the throughline ──
  const cand = [...rel.entries()].filter(([, r]) => r.plays >= 30).sort((a, b) => b[1].plays - a[1].plays).slice(0, 40);
  let lifers: ArtistRelationships["lifers"] = [];
  let flings: ArtistRelationships["flings"] = [];
  for (const [name, r] of cand) {
    const span = (r.last - r.first) / YEAR;
    if (span >= 2.5 && r.mc.size >= Math.max(8, span * 3)) lifers.push({ name, years: +span.toFixed(1), plays: r.plays });
    else if (span <= 0.6 && r.plays >= 50) {
      const peak = [...r.mc.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      flings.push({ name, peak, plays: r.plays });
    }
  }
  lifers = lifers.sort((a, b) => b.plays - a.plays).slice(0, 4);
  flings = flings.sort((a, b) => b.plays - a.plays).slice(0, 4);

  let throughline: ArtistRelationships["throughline"] = null;
  if (phases.length >= 3) {
    const cnt = new Map<string, number>();
    for (const ph of phases) for (const a of ph.topArtists.slice(0, 5)) cnt.set(a.name, (cnt.get(a.name) ?? 0) + 1);
    const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= Math.ceil(phases.length * 0.6)) throughline = { name: best[0], phases: best[1], ofPhases: phases.length };
  }

  return { dayparts, skipProof, anchors, relationships: { lifers, flings, throughline } };
}

/** Render the signature as a compact, lead-with-this markdown block. Empty string if nothing fired. */
export function signatureBrief(sig: ListenerSignature): string {
  const L: string[] = [];
  const personas = sig.dayparts.filter((d) => d.artists.length || d.genres.length);
  if (personas.length) {
    L.push("- **Time-of-day selves** (artists/genres you reach for disproportionately at that hour):");
    for (const d of personas) {
      const bits = [d.artists.join(", "), d.genres.length ? `(${d.genres.join(", ")})` : ""].filter(Boolean).join(" ");
      const a = d.avd ? ` · sound A${d.avd.a}/V${d.avd.v}/D${d.avd.d}` : "";
      L.push(`  - ${d.name} (${d.hours}, ${Math.round(d.share * 100)}% of plays${a}): ${bits}`);
    }
  }
  if (sig.skipProof.length) {
    L.push(`- **Never-skipped loves** (played a lot, almost never skipped — real devotion): ${sig.skipProof.map((s) => `${s.name} (${s.plays} plays, ${Math.round(s.skipRate * 100)}% skipped)`).join(" · ")}`);
  }
  if (sig.anchors.length) {
    L.push(`- **Anchor songs** (returned to across years, not one binge): ${sig.anchors.map((a) => `“${a.name || "(unknown)"}” — ${a.artist} (across ${a.months} months, ${a.firstYear}–${a.lastYear}, ${a.plays}×)`).join(" · ")}`);
  }
  const r = sig.relationships;
  if (r.lifers.length || r.flings.length || r.throughline) {
    const parts: string[] = [];
    if (r.lifers.length) parts.push(`lifers (with them for years): ${r.lifers.map((l) => `${l.name} (${l.years}y, ${l.plays}×)`).join(", ")}`);
    if (r.flings.length) parts.push(`flings (one intense burst then gone): ${r.flings.map((f) => `${f.name} (peak ${f.peak}, ${f.plays}×)`).join(", ")}`);
    if (r.throughline) parts.push(`throughline: ${r.throughline.name} (a top artist in ${r.throughline.phases} of ${r.throughline.ofPhases} phases)`);
    L.push(`- **Artist relationships** — ${parts.join(" · ")}`);
  }
  return L.join("\n");
}
