<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { useAnalysis } from "../../stores/analysis";
import { axisStyle, grid, PALETTE, tooltip, zoom } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const option = computed(() => {
  const g = store.widgets?.genresOverTime ?? { keys: [], rows: [] };
  return {
    tooltip: { ...tooltip, trigger: "axis", valueFormatter: (v: number) => `${(v ?? 0).toFixed(0)}%` },
    legend: { top: 0, textStyle: { color: "#8a91a6", fontSize: 11 }, itemWidth: 12, itemHeight: 8, type: "scroll" },
    grid: grid({ top: 34 }),
    dataZoom: zoom(),
    xAxis: { type: "category", boundaryGap: false, data: g.rows.map((r) => r.month), ...axisStyle, axisLabel: { ...axisStyle.axisLabel, hideOverlap: true } },
    yAxis: { type: "value", max: 100, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: "{value}%" } },
    series: g.keys.map((name, i) => ({
      name,
      type: "line",
      stack: "total",
      areaStyle: { opacity: 0.8, color: PALETTE[i % PALETTE.length] },
      lineStyle: { width: 0 },
      showSymbol: false,
      smooth: true,
      data: g.rows.map((r) => +((r.shares[i] ?? 0) * 100).toFixed(1)),
    })),
  };
});
</script>

<template>
  <WidgetCard title="Genres over time" span="s12">
    <VChart :option="option" autoresize style="height: 250px" />
  </WidgetCard>
</template>
