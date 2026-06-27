<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { useAnalysis } from "../../stores/analysis";
import { axisStyle, grid, PALETTE, tooltip } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const option = computed(() => {
  const g = (store.widgets?.topGenres ?? []).slice(0, 14).reverse();
  return {
    tooltip: { ...tooltip, trigger: "axis", valueFormatter: (v: number) => `${v.toFixed(1)}%` },
    dataZoom: [{ type: "inside", yAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseWheel: false, filterMode: "none" }],
    grid: grid({ left: 4 }),
    xAxis: { type: "value", ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: "{value}%" } },
    yAxis: { type: "category", data: g.map((x) => x.name), ...axisStyle, splitLine: { show: false } },
    series: [
      {
        type: "bar",
        data: g.map((x, i) => ({ value: +(x.share * 100).toFixed(1), itemStyle: { color: PALETTE[(g.length - 1 - i) % PALETTE.length] } })),
        barWidth: "62%",
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };
});
</script>

<template>
  <WidgetCard title="Top genres" span="s3">
    <VChart :option="option" autoresize class="chart" />
  </WidgetCard>
</template>
