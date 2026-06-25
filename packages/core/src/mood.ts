import type { SignalVector } from "./types";

/**
 * Personalized mood metric. Valence is the lead indicator (the only AVD axis the
 * MxMH survey validated against mental health). Instead of a fixed Mood = V − D —
 * which the research showed cancels the valence signal for many people — we learn,
 * PER USER, which other signals actually co-move with their valence over time and
 * fold those in (signed by their correlation). Co-moving proxies de-noise valence;
 * uncorrelated ones are dropped. This is a cleaner descriptive mood line, not a
 * wellbeing score.
 */
export type MoodSignal = "valence" | "arousal" | "depth" | "diversity" | "replay" | "volume";

const CANDIDATES: { key: Exclude<MoodSignal, "valence">; get: (s: SignalVector) => number; label: string }[] = [
  { key: "arousal", get: (s) => s.avd.a, label: "arousal" },
  { key: "depth", get: (s) => s.avd.d, label: "depth" },
  { key: "diversity", get: (s) => s.entropy, label: "diversity" },
  { key: "replay", get: (s) => s.replay, label: "replay" },
  { key: "volume", get: (s) => s.volume, label: "volume" },
];

export interface MoodDriver {
  signal: Exclude<MoodSignal, "valence">;
  r: number; // Pearson correlation with valence over the user's weeks
  weight: number; // signed weight folded into the mood (0 if below threshold)
  included: boolean;
}
export interface MoodModel {
  weights: Partial<Record<MoodSignal, number>>; // signed; valence = 1 (anchor)
  stats: Partial<Record<MoodSignal, { mean: number; std: number }>>; // per-signal, for z-scoring
  drivers: MoodDriver[];
  threshold: number;
  weeks: number;
}

const meanStd = (xs: number[]): { mean: number; std: number } => {
  const n = xs.length || 1;
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const std = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / n) || 0;
  return { mean, std };
};
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const d = Math.sqrt(sxx * syy);
  return d < 1e-12 ? 0 : sxy / d;
}

/**
 * Learn the per-user mood weighting from the weekly signal series. Each candidate
 * signal is correlated with valence; if |r| ≥ threshold it's folded in with weight
 * = r (sign carries direction). Valence is always the anchor (weight 1).
 */
export function learnMoodModel(signals: SignalVector[], opts: { threshold?: number; minWeeks?: number } = {}): MoodModel {
  const threshold = opts.threshold ?? 0.2;
  const minWeeks = opts.minWeeks ?? 12;
  const real = signals.filter((s) => !s.gap);
  const valence = real.map((s) => s.avd.v);
  const vStat = meanStd(valence);

  const weights: Partial<Record<MoodSignal, number>> = { valence: 1 };
  const stats: Partial<Record<MoodSignal, { mean: number; std: number }>> = { valence: vStat };
  const drivers: MoodDriver[] = [];

  for (const c of CANDIDATES) {
    const xs = real.map(c.get);
    const st = meanStd(xs);
    stats[c.key] = st;
    const r = real.length >= minWeeks && st.std > 1e-9 && vStat.std > 1e-9 ? +pearson(xs, valence).toFixed(3) : 0;
    const included = Math.abs(r) >= threshold;
    if (included) weights[c.key] = r;
    drivers.push({ signal: c.key, r, weight: included ? r : 0, included });
  }
  return { weights, stats, drivers, threshold, weeks: real.length };
}

/**
 * Composite mood ∈ [0,1] (0.5 = the user's own average) for any bucket carrying a
 * subset of the signals (e.g. month/hour views only have valence/arousal/depth).
 * Weighted, z-scored blend of whichever signals are present AND in the model.
 */
export function moodIndex(vals: Partial<Record<MoodSignal, number>>, model: MoodModel): number {
  let sum = 0, wsum = 0;
  for (const sig of Object.keys(model.weights) as MoodSignal[]) {
    const val = vals[sig];
    const st = model.stats[sig];
    const w = model.weights[sig];
    if (val == null || !st || w == null || st.std < 1e-9) continue;
    sum += w * ((val - st.mean) / st.std);
    wsum += Math.abs(w);
  }
  if (wsum === 0) return 0.5;
  return 1 / (1 + Math.exp(-(sum / wsum) * 1.6)); // logistic → 0..1, centred at user mean
}

/** Human-readable formula, e.g. "valence + depth ×−0.42 + volume ×+0.31". */
export function moodFormula(model: MoodModel): string {
  const parts = model.drivers
    .filter((d) => d.included)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .map((d) => `${d.signal} ×${d.weight >= 0 ? "+" : ""}${d.weight.toFixed(2)}`);
  return ["valence", ...parts].join(" + ");
}
