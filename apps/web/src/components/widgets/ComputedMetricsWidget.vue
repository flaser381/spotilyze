<script setup lang="ts">
import { learnMoodModel, moodFormula, moodIndex } from "@spotilyze/core";
import { computed, reactive } from "vue";
import VChart from "vue-echarts";
import { axisStyle, fmtDay, grid, tooltip } from "../../theme";
import { useAnalysis } from "../../stores/analysis";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
// learn weights from the weekly signals, but z-score the AVD axes by the MEASURED
// moodTimeline distribution it's actually plotted against — the signals use genre-AVD
// (narrow), so their mean/std would blow up the measured values and pin mood to 0.
const model = computed(() => {
  const base = learnMoodModel(store.full?.signals ?? []);
  const days = store.full?.widgets?.moodTimeline ?? [];
  if (days.length < 2) return base;
  const stat = (get: (d: (typeof days)[number]) => number) => {
    let sw = 0, s = 0;
    for (const d of days) { s += get(d) * d.plays; sw += d.plays; }
    const mean = sw ? s / sw : 0;
    let sv = 0;
    for (const d of days) sv += d.plays * (get(d) - mean) ** 2;
    return { mean, std: sw ? Math.sqrt(sv / sw) : 0 };
  };
  return { ...base, stats: { ...base.stats, valence: stat((d) => d.valence), arousal: stat((d) => d.arousal), depth: stat((d) => d.depth) } };
});
const formula = computed(() => moodFormula(model.value));

// current zoom window (% of the time axis); kept stable across resolution switches
const zoom = reactive({ start: 0, end: 100 });
const onZoom = (e: { start?: number; end?: number; batch?: { start: number; end: number }[] }) => {
  const z = e.batch?.[0] ?? e;
  if (z.start != null && z.end != null) { zoom.start = z.start; zoom.end = z.end; }
};

const DAY = 864e5, YEAR = 365.25 * DAY;
type Res = "day" | "week" | "month" | "year";

// pick resolution from the visible span: zoom out → coarser averaging
const resolution = computed<Res>(() => {
  const d = store.widgets?.moodTimeline ?? [];
  if (d.length < 2) return "day";
  const span = ((zoom.end - zoom.start) / 100) * (d[d.length - 1]!.ts - d[0]!.ts);
  return span >= 4 * YEAR ? "year" : span >= YEAR ? "month" : span >= 60 * DAY ? "week" : "day";
});
const RES_LABEL: Record<Res, string> = { day: "day", week: "week", month: "month", year: "year" };

const bucketTs = (ts: number, res: Res): number => {
  const d = new Date(ts);
  if (res === "day") return ts;
  if (res === "week") return ts - (ts % (7 * DAY)); // 7-day bins
  if (res === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return Date.UTC(d.getUTCFullYear(), 0, 1);
};

// all three lines bucketed at the same resolution so coarser zoom = smoother averages.
const series = computed(() => {
  const res = resolution.value;

  // mood — plays-weighted AVD per period → mood index (0..100)
  const days = store.widgets?.moodTimeline ?? [];
  const mm = new Map<number, { sv: number; sa: number; sd: number; p: number }>();
  for (const d of days) {
    const k = bucketTs(d.ts, res);
    const e = mm.get(k) ?? { sv: 0, sa: 0, sd: 0, p: 0 };
    e.sv += d.valence * d.plays; e.sa += d.arousal * d.plays; e.sd += d.depth * d.plays; e.p += d.plays;
    mm.set(k, e);
  }
  const mood: [number, number][] = [...mm.entries()].sort((a, b) => a[0] - b[0]).map(([ts, e]) => {
    const v = e.sv / e.p, a = e.sa / e.p, dep = e.sd / e.p;
    return [ts, +(moodIndex({ valence: v, arousal: a, depth: dep }, model.value) * 100).toFixed(1)];
  });

  // taste stability — weekly top-artist Jaccard, nPlays-weighted into each bucket.
  // first bin has no predecessor and gaps are meaningless → excluded (as in the stat widget).
  const sm = new Map<number, { s: number; w: number }>();
  store.signals.forEach((sig, i) => {
    if (i === 0 || sig.gap) return;
    const k = bucketTs(sig.weekStart, res);
    const e = sm.get(k) ?? { s: 0, w: 0 };
    e.s += sig.stability * sig.nPlays; e.w += sig.nPlays;
    sm.set(k, e);
  });
  const stability: [number, number][] = [...sm.entries()].sort((a, b) => a[0] - b[0]).filter(([, e]) => e.w > 0).map(([ts, e]) => [ts, +((e.s / e.w) * 100).toFixed(1)]);

  // restlessness — bail / total tracks surfaced per bucket (incl. sub-30s quick-skips)
  const rt = store.widgets?.restlessTimeline ?? [];
  const rm = new Map<number, { b: number; t: number }>();
  for (const d of rt) {
    const k = bucketTs(d.ts, res);
    const e = rm.get(k) ?? { b: 0, t: 0 };
    e.b += d.bail; e.t += d.total;
    rm.set(k, e);
  }
  const restless: [number, number][] = [...rm.entries()].sort((a, b) => a[0] - b[0]).filter(([, e]) => e.t > 0).map(([ts, e]) => [ts, +((e.b / e.t) * 100).toFixed(1)]);

  return { mood, stability, restless };
});

const option = computed(() => {
  const { mood, stability, restless } = series.value;
  const res = resolution.value;
  const fmtTs = (ts: number) => (res === "year" ? `${new Date(ts).getUTCFullYear()}` : res === "month" ? new Date(ts).toLocaleDateString("en", { year: "numeric", month: "short" }) : fmtDay(ts));
  return {
    tooltip: {
      ...tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: "#3a4255" } },
      formatter: (ps: { axisValue: number; seriesName: string; value: [number, number]; color: string }[]) =>
        ps.length ? `<div style="margin-bottom:3px">${fmtTs(ps[0]!.axisValue)} · per ${RES_LABEL[res]}</div>` + ps.map((p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value[1]}</b>`).join("<br/>") : "",
    },
    legend: { data: ["Mood", "Taste stability", "Restlessness"], textStyle: { color: "#8a91a6" }, top: 0, itemHeight: 8, itemWidth: 14 },
    grid: grid({ top: 30, bottom: 58 }),
    xAxis: { type: "time", ...axisStyle },
    yAxis: { type: "value", min: 0, max: 100, ...axisStyle, splitLine: { show: false } },
    dataZoom: [
      { type: "inside", filterMode: "none", start: zoom.start, end: zoom.end, zoomOnMouseWheel: true, moveOnMouseMove: true },
      { type: "slider", filterMode: "none", start: zoom.start, end: zoom.end, height: 20, bottom: 14, borderColor: "#2a3040", fillerColor: "rgba(124,92,255,0.18)", textStyle: { color: "#6f7892", fontSize: 10 }, handleStyle: { color: "#7c5cff" }, dataBackground: { lineStyle: { color: "#2a3040" }, areaStyle: { color: "#161b29" } } },
    ],
    series: [
      {
        name: "Mood", type: "line", showSymbol: false, smooth: true, z: 3,
        data: mood, lineStyle: { width: 2.4, color: "#ffb454" }, itemStyle: { color: "#ffb454" },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(255,180,84,0.18)" }, { offset: 1, color: "rgba(255,180,84,0.01)" }] } },
      },
      { name: "Taste stability", type: "line", showSymbol: false, smooth: true, data: stability, lineStyle: { width: 2, color: "#34d6e6" }, itemStyle: { color: "#34d6e6" } },
      { name: "Restlessness", type: "line", showSymbol: false, smooth: true, data: restless, lineStyle: { width: 2, color: "#ff6b6b" }, itemStyle: { color: "#ff6b6b" } },
    ],
  };
});
</script>

<template>
  <WidgetCard title="Computed metrics" span="s12">
    <div class="mg">
      <p class="cap muted">
        <strong style="color: #ffb454">Mood</strong> = {{ formula }} (higher = brighter) ·
        <strong style="color: #34d6e6">Taste stability</strong> = week-to-week overlap of your top artists ·
        <strong style="color: #ff6b6b">Restlessness</strong> = share of tracks you bail on early.
        All 0–100, averaged <strong class="hl">per {{ RES_LABEL[resolution] }}</strong> — <strong class="hl">scroll or drag to zoom</strong> and it refines down to daily. Follows the timeframe above.
      </p>
      <VChart :option="option" autoresize class="chart" @datazoom="onZoom" />
    </div>
  </WidgetCard>
</template>

<style scoped>
.mg { display: flex; flex-direction: column; height: 100%; }
.chart { flex: 1; min-height: 300px; width: 100%; }
.cap { font-size: 12px; margin: 0 0 8px; line-height: 1.5; }
.cap strong { font-weight: 600; }
.cap strong.hl { color: var(--text); }
</style>
