<script setup lang="ts">
import { learnMoodModel, moodFormula, moodIndex } from "@spotilyze/core";
import { computed, reactive } from "vue";
import VChart from "vue-echarts";
import { AVD, axisStyle, fmtDay, grid, tooltip } from "../../theme";
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

// plays-weighted AVD per period → mood (so coarser zoom = smoother averaged signal)
const series = computed(() => {
  const days = store.widgets?.moodTimeline ?? [];
  const res = resolution.value;
  const m = new Map<number, { sv: number; sa: number; sd: number; p: number }>();
  for (const d of days) {
    const k = bucketTs(d.ts, res);
    const e = m.get(k) ?? { sv: 0, sa: 0, sd: 0, p: 0 };
    e.sv += d.valence * d.plays; e.sa += d.arousal * d.plays; e.sd += d.depth * d.plays; e.p += d.plays;
    m.set(k, e);
  }
  const mood: [number, number][] = [];
  const val: [number, number][] = [];
  for (const [ts, e] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
    const v = e.sv / e.p, a = e.sa / e.p, dep = e.sd / e.p;
    mood.push([ts, +(moodIndex({ valence: v, arousal: a, depth: dep }, model.value) * 100).toFixed(1)]);
    val.push([ts, +(v * 100).toFixed(1)]);
  }
  return { mood, val };
});

const option = computed(() => {
  const { mood, val } = series.value;
  const res = resolution.value;
  const fmtTs = (ts: number) => (res === "year" ? `${new Date(ts).getUTCFullYear()}` : res === "month" ? new Date(ts).toLocaleDateString("en", { year: "numeric", month: "short" }) : fmtDay(ts));
  return {
    tooltip: {
      ...tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: "#3a4255" } },
      formatter: (ps: { axisValue: number; seriesName: string; value: [number, number]; color: string }[]) =>
        ps.length ? `<div style="margin-bottom:3px">${fmtTs(ps[0]!.axisValue)} · per ${RES_LABEL[res]}</div>` + ps.map((p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value[1]}</b>`).join("<br/>") : "",
    },
    legend: { data: ["Mood", "Valence"], textStyle: { color: "#8a91a6" }, top: 0, itemHeight: 8, itemWidth: 14 },
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
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(255,180,84,0.22)" }, { offset: 1, color: "rgba(255,180,84,0.01)" }] } },
      },
      { name: "Valence", type: "line", showSymbol: false, smooth: true, data: val, lineStyle: { width: 1, color: AVD.v, opacity: 0.45, type: "dashed" }, itemStyle: { color: AVD.v } },
    ],
  };
});
</script>

<template>
  <WidgetCard title="Mood over time" span="s12">
    <div class="mg">
      <p class="cap muted">
        Mood = <strong>{{ formula }}</strong> — valence (the validated tone axis), refined by the signals that track it in <em>your</em> listening. Higher = brighter, lower = heavier.
        Averaged <strong class="hl">per {{ RES_LABEL[resolution] }}</strong> — <strong class="hl">scroll or drag to zoom</strong> and it refines down to daily; the dashed line is raw valence. Follows the timeframe above.
      </p>
      <VChart :option="option" autoresize class="chart" @datazoom="onZoom" />
    </div>
  </WidgetCard>
</template>

<style scoped>
.mg { display: flex; flex-direction: column; height: 100%; }
.chart { flex: 1; min-height: 300px; width: 100%; }
.cap { font-size: 12px; margin: 0 0 8px; line-height: 1.5; }
.cap strong { color: #ffb454; font-weight: 600; }
.cap strong.hl { color: var(--text); }
</style>
