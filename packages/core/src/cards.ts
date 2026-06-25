import { podcastBrief, type PodcastProfile } from "./podcasts";
import type { ReportData } from "./reportdata";
import type { AnalysisResult, Phase } from "./types";

/** A high-confidence phase boundary with the phases on either side. */
export interface PhaseShift {
  at: number; // boundary week ts
  confidence: number;
  from: Phase;
  to: Phase;
  drivers: { signal: string; z: number }[];
}

/** The n most distinct shifts (highest-confidence boundaries), chronological. */
export function topPhaseShifts(full: AnalysisResult, n = 3): PhaseShift[] {
  const all = full.boundaries
    .map((b, i) => ({ at: b.week, confidence: b.confidence, drivers: b.drivers, from: full.phases[i]!, to: full.phases[i + 1]! }))
    .filter((s) => !!s.from && !!s.to);
  return all
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, n)
    .sort((a, b) => a.at - b.at);
}

/** Structured "wow" cards the wrapped renders — produced by a JSON-mode LLM call. */
export interface ProfileCards {
  age: { estimate: number; range: string; confidence: "low" | "medium" | "high"; reason: string };
  status: { label: string; field: string; confidence: "low" | "medium" | "high"; reason: string };
  // Only openness is kept: it's the one Big Five trait robustly tied to listening
  // (music sophistication/diversity, Rentfrow & Gosling / Greenberg). 0 = traditional,
  // 1 = open. The others are too weak from listening data alone, so we dropped them.
  openness: { score: number; reason: string };
  traits: { label: string; reason: string }[];
  values: string[];
  wow: { title: string; detail: string }[];
  vibe: string;
  shifts?: { summary: string }[]; // one per shift in topPhaseShifts order
}

const fmtMonth = (ts: number) => new Date(ts).toLocaleDateString("en", { year: "numeric", month: "short" });
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const SCHEMA = `{
  "age":    { "estimate": <integer>, "range": "<e.g. 25-29>", "confidence": "low|medium|high", "reason": "<one sentence>" },
  "status": { "label": "in education|working|unclear", "field": "<likely field or profession, or ''>", "confidence": "low|medium|high", "reason": "<one sentence>" },
  "openness": { "score": <0..1>, "reason": "<one sentence: traditional vs open in worldview/nature, from the actual music>" },
  "traits": [ { "label": "<2-4 word punchy trait>", "reason": "<short, specific>" } ],   // exactly 4
  "values": [ "<single word or short phrase>" ],                                          // 3-5
  "wow":    [ { "title": "<short headline>", "detail": "<1-2 sentences, specific & genuinely revealing>" } ],  // 3
  "vibe":   "<one punchy sentence that captures this person>",
  "shifts": [ { "summary": "<1-2 sentences: how this period shifted in mood and genre, and the most likely real-life reason>" } ]  // one per listed shift, SAME order
}`;

/**
 * Prompt for a JSON-only card profile. Same neutral-data + honesty discipline as
 * the prose report, but the model must output the schema above and nothing else.
 */
export function buildCardsPrompt(full: AnalysisResult, rd?: ReportData | null, podcasts?: PodcastProfile | null): string {
  const { meta, widgets: w, signals, phases } = full;
  const real = signals.filter((s) => !s.gap);
  const span = ((meta.span[1] - meta.span[0]) / (365.25 * 864e5)).toFixed(1);
  const L: string[] = [];
  const p = (s = "") => L.push(s);

  p("You are a sharp, honest music-psychology analyst. From ONE person's real Spotify listening history below, infer a profile.");
  p("");
  p("OUTPUT RULES — read carefully:");
  p("- Respond with ONLY a single valid JSON object, no markdown fences, no commentary before or after.");
  p("- It must match this exact shape (comments show constraints; do not include the comments):");
  p(SCHEMA);
  p("");
  p("Reasoning rules:");
  p("- AVD is the measured SONIC profile. Valence = sound brightness, NOT emotion (blues/oldschool-rap score high valence); never read low valence as sadness — judge emotion from genres, lyrics and obsessions.");
  p("- Reason from the artists, songs, genres, emergence and behaviour, and your own knowledge of these scenes/lyrics.");
  p("- `openness.score` is 0..1 (0.5 = average): 0 = traditional/conventional taste, 1 = open/exploratory. It's the one personality trait the music actually supports — judge it from genre breadth, discovery, and how adventurous the catalogue is, not from mood. Be honest, not flattering; high openness ≠ automatically good.");
  p("- The `wow` items must be SPECIFIC and genuinely revealing (cite a real pattern), not generic horoscope lines. Build the emotional arc and at least ONE `wow` from the AVD-trajectory, obsessions, outgrown and podcasts below — not from the top lists.");
  p("- Infer chronotype (night-owl / early-riser / weekday-structured) ONLY from the 'When they listen' line. Do NOT guess it from genre.");
  p("- Do NOT invent facts about a podcast/show/track you don't actually recognize — infer only from its title, language and genre. Never assert what an unknown show is \"about\" or where the person lives from a show's name. High podcast hours are usually comedy/entertainment, not profession. A wrong confident claim about a top item ruins the read.");
  p("- A FALLING valence = the SOUND got less bright/groovy, NOT the person got sadder. Never label someone melancholic/depressed from low or dropping valence; read emotion from genres, lyrics, obsessions, outgrown and podcasts instead.");
  p("");
  p("--- DATA ---");
  p(`Span: ${fmtMonth(meta.span[0])} → ${fmtMonth(meta.span[1])} (~${span} years), ${Math.round(meta.totalHours)} h, ${meta.totalPlays} plays, ${meta.nArtists} artists.`);
  p(`Behaviour: repeat ${mean(real.map((s) => s.replay)).toFixed(2)}, genre-diversity ${mean(real.map((s) => s.entropy)).toFixed(2)}, taste-stability ${(mean(signals.filter((s, i) => i > 0 && !s.gap).map((s) => s.stability)) * 100).toFixed(0)}%, discovery ${(mean(real.map((s) => s.novelty)) * 100).toFixed(0)}%.`);
  p(`AVD (measured sonic profile — valence = sound brightness, NOT emotion): A=${w.avdOverall.a.toFixed(2)} V=${w.avdOverall.v.toFixed(2)} D=${w.avdOverall.d.toFixed(2)}.`);
  p(`Top artists: ${w.topArtists.slice(0, 12).map((a) => a.name).join(", ")}.`);
  p(`Top songs: ${w.topTracks.slice(0, 10).map((t) => `${t.name} (${t.artist})`).join("; ")}.`);
  p(`Top genres: ${w.topGenres.slice(0, 12).map((g) => `${g.name} ${Math.round(g.share * 100)}%`).join(", ")}.`);
  if (rd?.emerging.length) p(`New genres emerging over time (durable shifts → new contexts): ${rd.emerging.map((e) => `${e.month} ${e.name}`).join(" · ")}.`);
  if (rd?.yearly.length) {
    const arc = rd.yearly.filter((y) => y.avd).map((y) => `${y.year} A${y.avd!.a.toFixed(2)}/V${y.avd!.v.toFixed(2)}/D${y.avd!.d.toFixed(2)}`);
    if (arc.length) p(`AVD trajectory by year (sonic arc — watch arousal/depth drift): ${arc.join(" · ")}.`);
    const peaks = [...new Set(rd.yearly.map((y) => y.peak).filter((s) => s && s !== "—"))];
    if (peaks.length) p(`When they listen (chronotype, measured from hourly heatmaps): ${peaks.slice(0, 3).join(" → ")}.`);
  }
  if (rd?.obsessions.length) {
    p(`Obsessions (short intense binges — emotional anchors / specific moments): ${rd.obsessions.slice(0, 8).map((o) => `“${o.name || "?"}” by ${o.artist} (${o.peakPlays}× in ~3wk around ${o.peakMonth})`).join(" · ")}.`);
  }
  if (rd?.outgrown.length) {
    p(`Outgrown (loved then reflexively skipped — identity shifts): ${rd.outgrown.slice(0, 6).map((o) => `${o.kind === "artist" ? o.artist : `“${o.name}”`} (loved ~${o.lovedMonth}, now skipped ${o.skipsAfter}×)`).join(" · ")}.`);
  }
  if (podcasts?.totalPlays) {
    p("");
    p("PODCASTS (high-signal — these name interests, profession, life events and current state directly):");
    p(podcastBrief(podcasts));
  }
  p("Listening periods:");
  phases.forEach((ph, idx) =>
    p(`  ${idx + 1}. ${fmtMonth(ph.start)}→${fmtMonth(ph.end)} — ${ph.topGenres.slice(0, 3).map((g) => g.name).join("/")} (${ph.topArtists.slice(0, 2).map((a) => a.name).join(", ")}); vol ${ph.levels.volume}, diversity ${ph.levels.diversity}`),
  );
  const shifts = topPhaseShifts(full, 3);
  if (shifts.length) {
    const avdStr = (c: { a: number; v: number; d: number }) => `A${c.a.toFixed(2)}/V${c.v.toFixed(2)}/D${c.d.toFixed(2)}`;
    p("");
    p('Three biggest shifts — produce one "shifts" summary per item below, in THIS exact order:');
    shifts.forEach((s, idx) =>
      p(
        `  ${idx + 1}. around ${fmtMonth(s.at)}: mood ${avdStr(s.from.centroid)} → ${avdStr(s.to.centroid)}; genres ${s.from.topGenres.slice(0, 3).map((g) => g.name).join("/")} → ${s.to.topGenres.slice(0, 3).map((g) => g.name).join("/")}; main drivers ${s.drivers.slice(0, 2).map((d) => `${d.signal} ${d.z >= 0 ? "up" : "down"}`).join(", ")}`,
      ),
    );
  }
  p("");
  p("Output the JSON now.");
  return L.join("\n");
}

/** Tolerant parse: strip fences / surrounding prose, extract the first {...}. */
export function parseCards(text: string): ProfileCards | null {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try {
    const o = JSON.parse(t) as ProfileCards;
    if (!o.age || !o.openness) return null;
    return o;
  } catch {
    return null;
  }
}
