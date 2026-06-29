import { podcastBrief, type PodcastProfile } from "./podcasts";
import type { AnalysisResult } from "./types";
import type { ReportData } from "./reportdata";

const fmtMonth = (ts: number) => new Date(ts).toLocaleDateString("en", { year: "numeric", month: "short" });
const yearsBetween = (a: number, b: number) => ((b - a) / (365.25 * 864e5)).toFixed(1);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export type Persona = "analyst" | "dating" | "roast" | "recommend" | "ad";

interface PersonaText {
  intro: string;
  task: string;
  closing: string;
}
const PERSONAS: Record<Persona, PersonaText> = {
  analyst: {
    intro:
      "You are an expert music-psychology and behavioural analyst. Below is ONE person's real Spotify listening history, summarized. Build a rich, specific profile of this person.",
    task:
      "Write a cohesive, flowing **written profile** of this person — a synthesis in a few well-structured paragraphs, NOT an exhaustive datapoint-by-datapoint breakdown. Weave your reasoning into the prose and lead with your strongest, most specific inferences.",
    closing: "Now produce the profile.",
  },
  dating: {
    intro:
      "You are a perceptive writer. Below is ONE person's real Spotify listening history. Write what it would be like to *know and date* this person, inferred from their music.",
    task:
      "Write a vivid, honest **\"what it's like to date them\"** piece: their vibe and emotional patterns, what they value, green flags and red flags, how they'd likely show up in a relationship. Cohesive prose, specific, grounded in the data — not flattery.",
    closing: "Now write the dating read.",
  },
  roast: {
    intro:
      "You are a sharp, funny music critic. Below is ONE person's real Spotify listening history. Roast them.",
    task:
      "**Roast this person** based on their taste — clever, funny, and uncomfortably accurate. Go after the patterns, the cringe, the try-hard and the basic. Stay witty, not cruel, and ground every joke in the actual data (name specific artists/songs/periods).",
    closing: "Now roast them.",
  },
  recommend: {
    intro:
      "You are an expert music curator with deep catalogue knowledge. Below is ONE person's real Spotify listening history.",
    task:
      "First give a short, sharp read of their taste and where it's heading; then recommend **specific directions and artists to explore next** (with one line each on *why*, tied to their patterns and the gaps in their listening). Avoid the obvious; respect the depth they already have.",
    closing: "Now give the read + recommendations.",
  },
  ad: {
    intro:
      "You are an ad-targeting / data-broker profiling engine. Below is ONE person's real Spotify listening history. Build the marketing profile a platform would assemble to sell ads against this person — the whole point is to show THEM, plainly, how much their listening alone gives away.",
    task:
      [
        "Produce an **ad-targeting profile** as semi-structured labelled fields (NOT prose). For each field give a short value, a confidence in (parentheses: low/med/high), and a few words of why. Use exactly these sections and labels:",
        "",
        "**Identity**",
        "- Age:",
        "- Life stage:",
        "- Occupation / field:",
        "- Location / culture hints:",
        "- Languages:",
        "- Household / relationship:",
        "",
        "**Psychographics**",
        "- Personality:",
        "- Values / worldview:",
        "- Current mindset:",
        "",
        "**Interests & subcultures** — a tagged list, each `tag (confidence)`.",
        "",
        "**Inferred interest categories** — the broad ad-taxonomy buckets a platform would assign (e.g. Electronic Music, Festivals & Live Events, Gaming, Mental Health & Wellness, Tech/IT, Fitness).",
        "",
        "**Likely product / ad categories** — concrete things they're plausibly in-market for, each with a one-line rationale (e.g. festival tickets, DJ / production gear, headphones, gaming hardware, meditation or therapy apps, energy drinks). Name product *types* and brand *categories*, never invented specific facts.",
        "",
        "**How an advertiser would target this** — 1 to 2 sentences on the segments and angle they'd land in.",
        "",
        "Ground every line in the actual data and be honest about confidence; flag guesses as guesses. This is an illustration of how profiling works, not verified fact.",
      ].join("\n"),
    closing: "Now produce the ad profile.",
  },
};

/**
 * Build a copy-paste / LLM-API prompt. Separates NEUTRAL listening data (artists,
 * songs, genres, behaviour over time) from the genre-derived AVD, which is marked
 * as a weak hypothesis — so the model reasons from the raw signals and its own
 * knowledge rather than rubber-stamping our crude emotion numbers. `persona`
 * reframes the task (profile / dating / roast / recommendations).
 */
export function buildLLMReport(
  full: AnalysisResult,
  rd?: ReportData | null,
  opts: { persona?: Persona; compact?: boolean; podcasts?: PodcastProfile | null } = {},
): string {
  const { meta, widgets: w, signals, phases } = full;
  const pr = PERSONAS[opts.persona ?? "analyst"] ?? PERSONAS.analyst;
  const real = signals.filter((s) => !s.gap);
  const repeat = mean(real.map((s) => s.replay));
  const entropy = mean(real.map((s) => s.entropy));
  const novelty = mean(real.map((s) => s.novelty));
  const stability = mean(signals.filter((s, i) => i > 0 && !s.gap).map((s) => s.stability)) * 100;
  const span = yearsBetween(meta.span[0], meta.span[1]);

  const L: string[] = [];
  const p = (s = "") => L.push(s);

  p("# Spotify Listening History — Analysis Request");
  p();
  p(`${pr.intro} (~${span} years of data.)`);
  p();
  p("## Your task");
  p(pr.task);
  p();
  p("Use, where the data supports it:");
  p("- approximate **age**");
  p("- whether they're in **education** (school/university) or **working** — and a plausible field");
  p("- core **interests & subcultures**");
  p("- **personality & behavioural** tendencies");
  p("- **key life events / turning points**");
  p("- **values & beliefs** (from the actual lyrical themes, ethos and subculture of the top artists/songs — not their marketing)");
  p();
  p("### How to read this data");
  p("- **AVD = Arousal · Valence · Depth**, measured from the actual recordings (Spotify energy & valence + a derived depth/sophistication axis), nearly all tracks resolved. It's the **sonic profile** — use it as such.");
  p("- **Important — valence ≠ emotion:** valence measures the musical brightness/groove of the SOUND, not lyrical or emotional content. Blues, oldschool hip-hop and many heartbreak songs score HIGH valence because they groove. Never read low valence as \"sad person\" — judge emotion from genres, lyrics, obsessions and the arc; use AVD for sonic character only. (Don't synthesize a single \"mood\" from it.)");
  p("- **Re-interpret the raw timelines yourself.** The **year-by-year evolution** and **monthly genres+mood** show the actual arc. Watch: **newly emerging genres** (a genre durably entering the rotation = a new context — friends, scene, place, relationship, mood); **obsessions** (short intense binges = emotional anchors / specific moments); **outgrown** music (what they left behind = identity shifts / growth).");
  p("- **When-you-listen** (per-year heatmaps) reveals lifestyle & chronotype: night-owl vs early riser, weekday-structured (school / 9-5) vs irregular, weekend-heavy.");
  p("- Don't just restate the auto-detected \"periods\" — they're only a starting point.");
  p("- Reason from the data + your own knowledge of what these specific artists, scenes and lyrics represent. Be concrete, cite specifics, state your confidence.");
  p("- **Do NOT invent facts about a specific podcast, show, artist or track you don't actually recognize.** If a name is unfamiliar, infer ONLY from its title, language and genre, and say you're inferring — never assert what an unknown show is \"about\" or fabricate its topic/host/setting. A wrong confident claim about a top item poisons the whole read. (Note: high podcast hours are often comedy/entertainment background-listening, not study.)");
  p(
    "- **Be honest, not diplomatic** — in both directions. Don't sanitize, flatter, or default to the artist's PR reading; but don't overclaim links the data can't support. People are drawn to music for unflattering reasons as readily as admirable ones.",
  );
  p();
  p("---");
  p("## Neutral data");
  p();
  p("### Overview");
  p(`- Span: ${fmtMonth(meta.span[0])} → ${fmtMonth(meta.span[1])} (~${span} years)`);
  p(`- Total listening: ${Math.round(meta.totalHours).toLocaleString()} hours`);
  p(`- Unique artists: ${meta.nArtists.toLocaleString()} · unique tracks: ${meta.nTracks.toLocaleString()}`);
  p(`- Average plays per day: ${w.summary.perDay.toFixed(1)}`);
  p();
  p("### Top artists (all-time)");
  w.topArtists.slice(0, 15).forEach((a, i) => p(`${i + 1}. ${a.name} — ${a.plays} plays, ${Math.round(a.hours)}h`));
  p();
  p("### Top songs (all-time)");
  w.topTracks.slice(0, 15).forEach((t, i) => p(`${i + 1}. ${t.name || "(unknown)"} — ${t.artist} (${t.plays}×)`));
  p();
  p("### Top genres (all-time, share of resolved plays)");
  w.topGenres.slice(0, 12).forEach((x) => p(`- ${x.name} (${(x.share * 100).toFixed(0)}%)`));
  p();
  if (rd) {
    if (rd.yearly.length) {
      p("### Year-by-year evolution (the arc — read the trajectory of mood, taste & lifestyle)");
      const DW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
      for (const y of rd.yearly) {
        const a = y.avd;
        p();
        p(`**${y.year}** — ${y.plays.toLocaleString()} plays, ${y.hours}h${a ? ` · AVD A${a.a.toFixed(2)}/V${a.v.toFixed(2)}/D${a.d.toFixed(2)}` : ""} · ${y.peak}`);
        p(`- top genres: ${y.topGenres.map((g) => `${g.name} ${Math.round(g.share * 100)}%`).join(", ") || "—"}`);
        if (!opts.compact) {
          p("- when you listened (rows Mon→Sun · cols 0,3,6,9,12,15,18,21h · 0–9 intensity):");
          const max = Math.max(1, ...y.heatmap.flat());
          y.heatmap.forEach((row, wd) => p(`    ${DW[wd]} ${row.map((c) => Math.min(9, Math.round((c / max) * 9))).join("")}`));
        }
      }
      p();
    }
    if (!opts.compact && rd.monthlyGenres.length) {
      p("### Monthly timeline (top genres + measured AVD each month)");
      for (const m of rd.monthlyGenres) {
        const a = m.avd;
        p(`- ${m.month}: ${m.top.map((t) => `${t.name} ${Math.round(t.share * 100)}%`).join(", ")}${a ? `  · AVD ${a.a.toFixed(2)}/${a.v.toFixed(2)}/${a.d.toFixed(2)}` : ""}`);
      }
      p();
    }
    if (rd.emerging.length) {
      p("### Newly emerging genres (durably entered the rotation — each marks a new context)");
      for (const e of rd.emerging) {
        const a = e.avd;
        p(`- ${e.month}: **${e.name}** (reached ${Math.round(e.share * 100)}%${a ? `, AVD ${a.a.toFixed(2)}/${a.v.toFixed(2)}/${a.d.toFixed(2)}` : ""})${e.stuck ? " — still present now" : " — later faded"}`);
      }
      p();
    }
  }
  const pod = opts.podcasts ? podcastBrief(opts.podcasts) : "";
  if (pod) {
    p("### Podcasts & spoken-word (HIGH-SIGNAL — weigh heavily)");
    p(pod);
    p();
  }
  p("### Listening behaviour (averages over the whole span)");
  p(`- Repeat behaviour (avg plays per unique track per week): ${repeat.toFixed(2)}`);
  p(`- Genre diversity (avg entropy — higher = broader taste): ${entropy.toFixed(2)}`);
  p(`- Taste stability (week-to-week overlap of top artists): ${stability.toFixed(0)}%`);
  p(`- Discovery rate (share of plays from newly-found artists): ${(novelty * 100).toFixed(0)}%`);
  p();
  if (rd?.obsessions.length) {
    p("### Obsessions (binged hard in a short window — emotional anchors / specific moments)");
    rd.obsessions.slice(0, 10).forEach((o) => p(`- “${o.name || "(unknown)"}” — ${o.artist}: ${o.peakPlays} plays in ~3 weeks around ${o.peakMonth} (${o.totalPlays} all-time)`));
    p();
  }
  if (rd?.outgrown.length) {
    p("### Outgrown (loved back then, now reflexively skipped — signals identity shifts / growth)");
    rd.outgrown.slice(0, 10).forEach((o) => {
      const what = o.kind === "artist" ? `${o.artist} (whole catalogue — ${o.nTracks} tracks)` : `“${o.name}” — ${o.artist}`;
      p(`- ${what}: loved ~${o.lovedMonth} (${o.lovePlays} plays), now skipped ${o.skipsAfter}× through ${o.lastSkipMonth}`);
    });
    p();
  }
  p("### Listening periods (stretches where behaviour shifted — candidate listening phases)");
  p("Neutral framing — dates + what dominated each stretch. Interpret transitions as possible life events.");
  phases.forEach((ph, i) => {
    p();
    p(`**Period ${i + 1}: ${fmtMonth(ph.start)} → ${fmtMonth(ph.end)}** (${ph.weeks} weeks)`);
    p(`- Sound-profile (AVD): A${ph.centroid.a.toFixed(2)}/V${ph.centroid.v.toFixed(2)}/D${ph.centroid.d.toFixed(2)}`);
    p(`- Top genres: ${ph.topGenres.slice(0, 5).map((x) => x.name).join(", ") || "—"}`);
    p(`- Top artists: ${ph.topArtists.slice(0, 5).map((x) => x.name).join(", ") || "—"}`);
    p(`- Listening volume: ${ph.levels.volume} · repeat: ${ph.levels.replay} · genre diversity: ${ph.levels.diversity}`);
  });
  p();
  p("---");
  p("## Overall measured sound-profile");
  p(`- Arousal ${w.avdOverall.a.toFixed(2)} · Valence ${w.avdOverall.v.toFixed(2)} · Depth ${w.avdOverall.d.toFixed(2)} (0–1, measured across all resolved tracks).`);
  p("- Reminder: high valence = bright / groovy SOUND, not a happy person — judge emotion from the genres, lyrics, obsessions and the year-by-year arc above.");
  p();
  p("Before you write: (1) a FALLING valence is the SOUND getting less bright/groovy — NOT the person getting sadder; never phrase a valence drop as emotional decline or \"protecting oneself\". (2) Do not state any fact about a show/artist/track you don't genuinely recognize.");
  p(pr.closing);
  return L.join("\n");
}
