/**
 * PELT-style optimal change-point detection for a multivariate series.
 *
 * Minimises  Σ_segments segmentCost + β·(#changepoints), where segmentCost is the
 * within-segment sum of squared deviations from the per-dimension mean (Gaussian
 * mean-shift, unit variance — inputs are expected z-normalised). Segment cost is
 * O(d) via prefix sums of x and x². Exact DP (T≈600 ⇒ trivial), with a minimum
 * segment length so we get life-phases, not weekly noise.
 */
export interface PeltOpts {
  minLen?: number; // minimum segment length in bins (default 8)
  penalty?: number; // β; higher → fewer changepoints
}

/** Returns the changepoint indices (start bin of each new segment), ascending. */
export function pelt(X: number[][], opts: PeltOpts = {}): number[] {
  const T = X.length;
  if (T === 0) return [];
  const d = X[0]!.length;
  const minLen = Math.max(1, opts.minLen ?? 8);
  const beta = opts.penalty ?? d * Math.log(T);

  // prefix sums per dimension: p1[k][i] = Σ_{j<i} X[j][k], p2[k][i] = Σ x²
  const p1 = Array.from({ length: d }, () => new Float64Array(T + 1));
  const p2 = Array.from({ length: d }, () => new Float64Array(T + 1));
  for (let i = 0; i < T; i++)
    for (let k = 0; k < d; k++) {
      const x = X[i]![k]!;
      p1[k]![i + 1] = p1[k]![i]! + x;
      p2[k]![i + 1] = p2[k]![i]! + x * x;
    }

  const cost = (s: number, t: number): number => {
    const n = t - s;
    let c = 0;
    for (let k = 0; k < d; k++) {
      const s1 = p1[k]![t]! - p1[k]![s]!;
      const s2 = p2[k]![t]! - p2[k]![s]!;
      c += s2 - (s1 * s1) / n;
    }
    return c;
  };

  const F = new Float64Array(T + 1);
  const prev = new Int32Array(T + 1).fill(0);
  F[0] = -beta;

  for (let t = 1; t <= T; t++) {
    let best = Number.POSITIVE_INFINITY;
    let bestS = 0;
    for (let s = 0; s <= t - minLen; s++) {
      if (s > 0 && s < minLen) continue; // a boundary at s would make a <minLen first segment
      const val = F[s]! + cost(s, t) + beta;
      if (val < best) {
        best = val;
        bestS = s;
      }
    }
    if (!Number.isFinite(best)) {
      // t < minLen: single short prefix, no boundary
      F[t] = F[0]! + cost(0, t) + beta;
      prev[t] = 0;
    } else {
      F[t] = best;
      prev[t] = bestS;
    }
  }

  // backtrack
  const cps: number[] = [];
  let t = T;
  while (prev[t]! > 0) {
    cps.push(prev[t]!);
    t = prev[t]!;
  }
  return cps.reverse();
}

export interface SlidingOpts {
  window?: number; // half-window (bins before / after) — default 10
  k?: number; // threshold in MADs above median score — default 2
  minDist?: number; // min spacing between boundaries — default = window
}
export interface SlidingResult {
  indices: number[]; // boundary bin indices
  scores: number[]; // per-bin before/after divergence
  threshold: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/**
 * Sliding-window divergence change-point detection. For each bin, the Euclidean
 * distance between the mean of the preceding window and the following window is a
 * change score; peaks above an adaptive (median + k·MAD) threshold, with
 * non-maximum suppression, are boundaries. Unlike a global-penalty method this
 * judges each event LOCALLY and self-tunes to the series' own noise — so events of
 * very different magnitude are all caught. Inputs expected z-normalised.
 */
export function slidingChangepoints(X: number[][], opts: SlidingOpts = {}): SlidingResult {
  const T = X.length;
  const W = opts.window ?? 10;
  const k = opts.k ?? 2;
  const minDist = opts.minDist ?? W;
  const d = T ? X[0]!.length : 0;
  const scores = new Array<number>(T).fill(0);

  for (let t = W; t <= T - W; t++) {
    let s = 0;
    for (let c = 0; c < d; c++) {
      let mb = 0;
      let ma = 0;
      for (let i = t - W; i < t; i++) mb += X[i]![c]! / W;
      for (let i = t; i < t + W; i++) ma += X[i]![c]! / W;
      s += (ma - mb) ** 2;
    }
    scores[t] = Math.sqrt(s);
  }

  const vals = scores.slice(W, Math.max(W, T - W)).filter((x) => x > 0);
  const m = median(vals);
  const mad = median(vals.map((x) => Math.abs(x - m))) * 1.4826 || 1;
  const threshold = m + k * mad;

  const indices: number[] = [];
  for (let t = W; t <= T - W; t++) {
    if (scores[t]! < threshold) continue;
    let isMax = true;
    for (let j = Math.max(0, t - minDist); j <= Math.min(T - 1, t + minDist); j++)
      if (scores[j]! > scores[t]!) {
        isMax = false;
        break;
      }
    if (isMax && (indices.length === 0 || t - indices[indices.length - 1]! >= minDist)) indices.push(t);
  }
  return { indices, scores, threshold };
}

/** Column-wise z-normalisation (std 0 → 1 to avoid div-by-zero). */
export function zNormalize(X: number[][]): number[][] {
  const T = X.length;
  if (T === 0) return [];
  const d = X[0]!.length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const row of X) for (let k = 0; k < d; k++) mean[k] += row[k]! / T;
  for (const row of X) for (let k = 0; k < d; k++) std[k] += (row[k]! - mean[k]) ** 2 / T;
  for (let k = 0; k < d; k++) std[k] = Math.sqrt(std[k]) || 1;
  return X.map((row) => row.map((x, k) => (x - mean[k]) / std[k]));
}

/** Centered rolling-mean smoothing per column (denoise weekly jitter). */
export function smooth(X: number[][], window = 3): number[][] {
  const T = X.length;
  if (T === 0 || window <= 1) return X;
  const d = X[0]!.length;
  const half = Math.floor(window / 2);
  const out: number[][] = [];
  for (let i = 0; i < T; i++) {
    const row = new Array(d).fill(0);
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(T - 1, i + half); j++) {
      for (let k = 0; k < d; k++) row[k] += X[j]![k]!;
      n++;
    }
    out.push(row.map((v) => v / n));
  }
  return out;
}
