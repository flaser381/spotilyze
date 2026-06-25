<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();

// taste stability = mean week-to-week Jaccard overlap of top artists, over the
// selected timeframe (first bin has no predecessor → excluded; gaps excluded).
const stats = computed(() => {
  const valid = store.signals.filter((s, i) => i > 0 && !s.gap);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    stability: mean(valid.map((s) => s.stability)) * 100,
    discovery: mean(valid.map((s) => s.novelty)) * 100,
    weeks: valid.length,
  };
});
</script>

<template>
  <WidgetCard title="Taste stability" span="s3">
    <div class="ts">
      <div class="hero">
        <span class="pct">{{ stats.stability.toFixed(0) }}<small>%</small></span>
        <span class="cap muted">week-to-week overlap of your top artists</span>
      </div>
      <div class="sub">
        <div class="metric">
          <span class="v" style="color: #ffb454">{{ stats.discovery.toFixed(0) }}%</span>
          <span class="k muted">new artists / week</span>
        </div>
        <div class="metric">
          <span class="v">{{ stats.weeks }}</span>
          <span class="k muted">active weeks</span>
        </div>
      </div>
      <p class="hint muted">Higher = more consistent taste. Dips mark shifts in what you listen to.</p>
    </div>
  </WidgetCard>
</template>

<style scoped>
.ts { display: flex; flex-direction: column; height: 100%; justify-content: center; gap: 16px; }
.hero { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.pct { font-size: 56px; font-weight: 750; color: #34d6e6; line-height: 1; font-variant-numeric: tabular-nums; }
.pct small { font-size: 24px; opacity: 0.7; }
.cap { font-size: 12px; text-align: center; max-width: 220px; }
.sub { display: flex; justify-content: center; gap: 34px; }
.metric { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.metric .v { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.metric .k { font-size: 11px; }
.hint { font-size: 11px; text-align: center; line-height: 1.4; }
</style>
