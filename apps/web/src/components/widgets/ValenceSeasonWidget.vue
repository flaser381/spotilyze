<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { useAnalysis } from "../../stores/analysis";
import { AVD, axisStyle, grid, tooltip, zoom } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const store = useAnalysis();
const option = computed(() => {
  const m = store.widgets?.valenceByMonth ?? [];
  const ser = (k: "valence" | "arousal", color: string, name: string) => ({
    name,
    type: "line",
    smooth: true,
    showSymbol: true,
    symbolSize: 5,
    lineStyle: { width: 2, color },
    itemStyle: { color },
    areaStyle: k === "valence" ? { color: "rgba(30,215,147,0.12)" } : undefined,
    data: m.map((x) => Number(x[k].toFixed(3))),
  });
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    legend: { top: 0, right: 0, textStyle: { color: "#8a91a6" }, itemWidth: 14, itemHeight: 8 },
    grid: grid({ top: 28 }),
    dataZoom: zoom(),
    xAxis: { type: "category", boundaryGap: false, data: MONTHS, ...axisStyle },
    yAxis: { type: "value", min: 0, max: 1, ...axisStyle },
    series: [ser("valence", AVD.v, "Valence"), ser("arousal", AVD.a, "Arousal")],
  };
});
</script>

<template>
  <WidgetCard title="Seasonality · valence by month" span="s4" help="Your average mood for each calendar month, so you can see whether your music tends to get brighter in summer or heavier in winter.">
    <VChart :option="option" autoresize style="height: 230px" />
  </WidgetCard>
</template>
