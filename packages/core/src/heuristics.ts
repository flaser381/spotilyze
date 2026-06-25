import type { AVD } from "./types";

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const round2 = (x: number): number => Math.round(x * 100) / 100;

// Ordered keyword → depth rules. First match wins, so high-depth/specific cues
// are listed before generic low-depth ones (e.g. "art pop" hits "art" before "pop").
const DEPTH_RULES: [string, number][] = [
  // very high: art-music / complex
  ["contemporary classical", 0.92], ["neoclassical", 0.9], ["neo-classical", 0.9],
  ["modern classical", 0.9], ["avant-garde", 0.9], ["avant", 0.88], ["free jazz", 0.9],
  ["baroque", 0.9], ["opera", 0.9], ["orchestra", 0.88], ["symphonic", 0.85],
  ["chamber", 0.85], ["string quartet", 0.88], ["classical", 0.9], ["minimalism", 0.85],
  ["raga", 0.85], ["carnatic", 0.85], ["jazz", 0.82], ["bebop", 0.82], ["fusion", 0.78],
  // high-ish: cerebral / textural
  ["post-rock", 0.72], ["post-metal", 0.7], ["drone", 0.72], ["krautrock", 0.7],
  ["experimental", 0.7], ["art rock", 0.7], ["art pop", 0.68], ["progressive rock", 0.68],
  ["prog", 0.65], ["math rock", 0.68], ["psychedelic", 0.62], ["shoegaze", 0.62],
  ["post-punk", 0.6], ["ambient", 0.65], ["new age", 0.6], ["neofolk", 0.65],
  ["trip hop", 0.6], ["trip-hop", 0.6], ["idm", 0.65],
  // mid-high: songwriter / acoustic / roots
  ["singer-songwriter", 0.68], ["songwriter", 0.66], ["folk", 0.65], ["blues", 0.68],
  ["soul", 0.55], ["soundtrack", 0.68], ["instrumental", 0.6], ["acoustic", 0.55],
  ["piano", 0.6], ["gospel", 0.55],
  // low: party / pop / functional
  ["nightcore", 0.15], ["happy hardcore", 0.15], ["hands up", 0.15], ["hardstyle", 0.2],
  ["eurodance", 0.15], ["europop", 0.2], ["eurobeat", 0.18], ["schlager", 0.18],
  ["bubblegum", 0.15], ["teen pop", 0.18], ["boy band", 0.18], ["idol", 0.2],
  ["big room", 0.2], ["dance pop", 0.25], ["dance-pop", 0.25], ["party", 0.2],
  ["dance", 0.28], ["pop", 0.3], ["disco", 0.3],
];

/** Heuristic Depth from a genre name (cognitive/sophistication axis). */
export function depthFromName(genre: string): number {
  const g = genre.toLowerCase();
  for (const [kw, d] of DEPTH_RULES) if (g.includes(kw)) return d;
  return 0.45;
}

const AROUSAL_HIGH = [
  "metalcore", "deathcore", "grindcore", "hardcore", "speedcore", "breakcore", "gabber",
  "thrash", "death metal", "black metal", "metal", "punk", "hardstyle", "drum and bass",
  "dnb", "dubstep", "screamo", "noise", "industrial", "hard rock", "hard dance", "power",
  "frenchcore", "happy hardcore", "rave",
];
const AROUSAL_LOW = [
  "ambient", "chill", "sleep", "meditation", "drone", "new age", "lullaby", "acoustic",
  "downtempo", "lo-fi", "lofi", "soft", "piano", "calm", "slowcore", "healing", "yoga",
  "lounge", "easy listening", "quiet",
];
const VALENCE_HIGH = [
  "happy", "pop", "dance", "disco", "funk", "ska", "reggae", "tropical", "summer",
  "eurodance", "party", "sunshine", "soca", "calypso", "afrobeat", "salsa", "merengue",
];
const VALENCE_LOW = [
  "sad", "depressive", "doom", "funeral", "black metal", "melanchol", "dark", "gothic",
  "blues", "emo", "gloom", "death", "sludge", "industrial", "grunge",
];

const hit = (g: string, kws: string[]) => kws.some((k) => g.includes(k));

/** Coarse fallback AVD for a genre with no dataset coverage (long-tail safety net). */
export function heuristicAVD(genre: string): AVD {
  const g = genre.toLowerCase();
  const a = hit(g, AROUSAL_HIGH) ? 0.8 : hit(g, AROUSAL_LOW) ? 0.22 : 0.5;
  const v = hit(g, VALENCE_HIGH) ? 0.7 : hit(g, VALENCE_LOW) ? 0.32 : 0.5;
  return { a, v, d: depthFromName(genre) };
}

// Modifier words shift a base AVD (e.g. "melodic dubstep" = dubstep + brighter).
// Applied only to DERIVED genres (inherited/heuristic), never to MuSe/hand anchors.
const MODIFIERS: [string, Partial<AVD>][] = [
  ["melodic", { a: -0.08, v: 0.12, d: 0.06 }],
  ["uplifting", { a: 0.05, v: 0.15 }],
  ["happy", { v: 0.18 }],
  ["feel good", { v: 0.16 }],
  ["chill", { a: -0.28, d: 0.08 }],
  ["chilled", { a: -0.28, d: 0.08 }],
  ["ambient", { a: -0.22, d: 0.14 }],
  ["atmospheric", { a: -0.1, d: 0.12 }],
  ["ethereal", { a: -0.12, d: 0.1 }],
  ["deep", { a: -0.08, d: 0.08 }],
  ["minimal", { a: -0.12, d: 0.04 }],
  ["dark", { v: -0.16, d: 0.04 }],
  ["heavy", { a: 0.1, v: -0.08 }],
  ["hard", { a: 0.12, v: -0.05 }],
  ["brutal", { a: 0.15, v: -0.12 }],
  ["aggressive", { a: 0.12, v: -0.1 }],
  ["raw", { a: 0.08, v: -0.06 }],
  ["epic", { a: 0.08, d: 0.05 }],
  ["liquid", { a: -0.06, v: 0.08 }],
  ["experimental", { a: -0.03, d: 0.15 }],
  ["progressive", { d: 0.08 }],
  ["psychedelic", { a: 0.04, d: 0.08 }],
];

/** Does `kw` appear as a whole word in `genre` (hyphens/slashes treated as spaces)? */
const hasWord = (genre: string, kw: string): boolean =>
  ` ${genre.toLowerCase().replace(/[-/]/g, " ")} `.includes(` ${kw} `);

// Artists the baked tags don't cover (meditation/healing/sleep niche) but whose NAME
// is unmistakable. Used only as a fallback when tag resolution yields nothing.
const MEDITATION_NAME = [
  "healing", "meditat", "mindful", "chakra", "reiki", "mantra", "tibetan", "solfeggio",
  "binaural", "lullab", "serenity", "tranquil", "sound bath", "breathwork", "breathe",
  "singing bowl", "sound healing", "white noise", "nature sound", "jnana", "sangha",
  "dharma", "spirit garden", "auraloom", "koshi", "handpan", "hang drum", "buddh",
  "spa music", "deep sleep", "sleep music", "relaxation", "432hz", "528hz",
  "frequency", "zen ", "yoga ", "namaste", "sound therapy",
];
const LOFI_NAME = ["lo-fi", "lofi", "lo fi", "chillhop", "chill beats"];

/** Infer a genre from an artist name when there are no usable tags. null if no match. */
export function inferGenreFromName(name: string): string | null {
  const n = ` ${name.toLowerCase()} `;
  if (MEDITATION_NAME.some((k) => n.includes(k))) return "meditation";
  if (LOFI_NAME.some((k) => n.includes(k))) return "lo-fi";
  return null;
}

/**
 * Apply modifier-word deltas to a base AVD. Returns the adjusted AVD plus the list
 * of modifiers that fired (for transparency / _source labelling).
 */
export function modifyAVD(genre: string, base: AVD): { avd: AVD; applied: string[] } {
  let { a, v, d } = base;
  const applied: string[] = [];
  for (const [kw, delta] of MODIFIERS) {
    if (!hasWord(genre, kw)) continue;
    a += delta.a ?? 0;
    v += delta.v ?? 0;
    d += delta.d ?? 0;
    applied.push(kw);
  }
  return { avd: { a: round2(clamp01(a)), v: round2(clamp01(v)), d: round2(clamp01(d)) }, applied };
}
