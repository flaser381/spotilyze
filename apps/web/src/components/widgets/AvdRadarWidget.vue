<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { useAnalysis } from "../../stores/analysis";
import { tooltip } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const option = computed(() => {
  const avd = store.widgets?.avdOverall ?? { a: 0.5, v: 0.5, d: 0.5 };
  return {
    tooltip,
    radar: {
      indicator: [
        { name: "Arousal", max: 1 },
        { name: "Valence", max: 1 },
        { name: "Depth", max: 1 },
      ],
      radius: "66%",
      axisName: { color: "#cfd4e2", fontSize: 12 },
      splitLine: { lineStyle: { color: "#222a3a" } },
      splitArea: { areaStyle: { color: ["#11151f", "#0d111a"] } },
      axisLine: { lineStyle: { color: "#222a3a" } },
    },
    series: [
      {
        type: "radar",
        data: [{ value: [avd.a, avd.v, avd.d], name: "AVD" }],
        symbolSize: 5,
        lineStyle: { color: "#7c5cff", width: 2 },
        areaStyle: { color: "rgba(124,92,255,0.25)" },
        itemStyle: { color: "#7c5cff" },
      },
    ],
  };
});
</script>

<template>
  <WidgetCard title="Sound profile" span="s3">
    <VChart :option="option" autoresize style="height: 230px" />
  </WidgetCard>
</template>
