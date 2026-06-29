<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import { fmtNum } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const tracks = computed(() => (store.widgets?.topTracks ?? []).slice(0, 10));
</script>

<template>
  <WidgetCard title="Most played tracks" span="s3" help="The individual songs you played the most in the selected time range, with the number of plays shown next to each one.">
    <div class="rows">
      <div v-for="(t, i) in tracks" :key="t.name + t.artist" class="row">
        <span class="rank">{{ i + 1 }}</span>
        <div class="trk">
          <span class="name">{{ t.name || "(unknown)" }}</span>
          <span class="artist muted">{{ t.artist }}</span>
        </div>
        <span class="val">{{ fmtNum(t.plays) }}×</span>
      </div>
    </div>
  </WidgetCard>
</template>

<style scoped>
.trk { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.trk .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trk .artist { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
