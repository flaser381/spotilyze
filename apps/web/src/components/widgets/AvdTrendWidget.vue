<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { useAnalysis } from "../../stores/analysis";
import { AVD, axisStyle, grid, tooltip, zoom } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const line = (k: "a" | "v" | "d", name: string) => ({
  name,
  type: "line",
  showSymbol: false,
  smooth: true,
  connectNulls: true,
  lineStyle: { width: 1.8, color: AVD[k] },
  itemStyle: { color: AVD[k] },
  data: store.signals.map((s) => [s.weekStart, s.gap ? null : Number(s.avd[k].toFixed(3))]),
});
const option = computed(() => ({
  tooltip: { ...tooltip, trigger: "axis" },
  legend: { top: 0, right: 0, textStyle: { color: "#8a91a6" }, itemWidth: 14, itemHeight: 8 },
  grid: grid({ top: 28 }),
  dataZoom: zoom(),
  xAxis: { type: "time", ...axisStyle },
  yAxis: { type: "value", min: 0, max: 1, ...axisStyle },
  series: [line("a", "Arousal"), line("v", "Valence"), line("d", "Depth")],
}));
</script>

<template>
  <WidgetCard title="AVD over time · listening phase preview" span="s6" help="Your sound profile, made of Arousal, Valence and Depth, drifting over time. It is a preview of how the listening phases below are detected.">
    <VChart :option="option" autoresize style="height: 240px" />
  </WidgetCard>
</template>
