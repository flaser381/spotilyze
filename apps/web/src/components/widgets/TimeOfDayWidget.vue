<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { useAnalysis } from "../../stores/analysis";
import { axisStyle, grid, tooltip } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const store = useAnalysis();
const option = computed(() => {
  const tod = store.widgets?.timeOfDay ?? [];
  const data: [number, number, number][] = [];
  let max = 1;
  tod.forEach((row, wd) =>
    row.forEach((c, h) => {
      data.push([h, wd, c]);
      if (c > max) max = c;
    }),
  );
  return {
    tooltip: { ...tooltip, formatter: (p: { value: [number, number, number] }) => `${DAYS[p.value[1]]} ${p.value[0]}:00 — ${p.value[2]} plays` },
    grid: grid({ left: 4, bottom: 4, top: 6 }),
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      { type: "inside", yAxisIndex: 0, filterMode: "none" },
    ],
    xAxis: { type: "category", data: [...Array(24).keys()], ...axisStyle, splitArea: { show: false }, axisLabel: { ...axisStyle.axisLabel, interval: 2 } },
    yAxis: { type: "category", data: DAYS, ...axisStyle, splitArea: { show: false } },
    visualMap: { min: 0, max, calculable: false, show: false, inRange: { color: ["#0e1320", "#243a6b", "#5c8cff", "#7c5cff", "#ff6b6b"] } },
    series: [{ type: "heatmap", data, itemStyle: { borderColor: "#0a0c12", borderWidth: 1 } }],
  };
});
</script>

<template>
  <WidgetCard title="When you listen" span="s3">
    <VChart :option="option" autoresize style="height: 250px" />
  </WidgetCard>
</template>
