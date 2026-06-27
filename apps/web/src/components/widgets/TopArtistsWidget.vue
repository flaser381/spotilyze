<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import { fmtHours, fmtNum } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const artists = computed(() => (store.widgets?.topArtists ?? []).slice(0, 10));
const max = computed(() => artists.value[0]?.plays ?? 1);
</script>

<template>
  <WidgetCard title="Top artists" span="s3">
    <div class="rows">
      <div v-for="(a, i) in artists" :key="a.name" class="row">
        <span class="rank">{{ i + 1 }}</span>
        <div class="art">
          <span class="name">{{ a.name }}</span>
          <div class="bar" :style="{ width: (a.plays / max) * 100 + '%' }" />
        </div>
        <span class="val">{{ fmtNum(a.plays) }} · {{ fmtHours(a.hours) }}</span>
      </div>
    </div>
  </WidgetCard>
</template>

<style scoped>
.art { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.art .bar { background: linear-gradient(90deg, #7c5cff, #5c8cff); }
.val { font-size: 11px; white-space: nowrap; }
</style>
