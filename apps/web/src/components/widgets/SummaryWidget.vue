<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import { AVD, fmtHours, fmtNum } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const w = computed(() => store.widgets);
const axes = ["a", "v", "d"] as const;
</script>

<template>
  <WidgetCard v-if="w" title="Overview" span="s3" help="A quick snapshot of the time range you have selected. It shows how many times you pressed play in total, how many hours that adds up to, how many different artists and tracks you heard, and your average sound profile. Use it to get the big picture before digging into the other cards.">
    <div class="stats">
      <div class="stat"><div class="k">Plays</div><div class="v">{{ fmtNum(w.summary.totalPlays) }}</div></div>
      <div class="stat"><div class="k">Listening</div><div class="v">{{ fmtHours(w.summary.totalHours) }}</div></div>
      <div class="stat"><div class="k">Artists</div><div class="v">{{ fmtNum(w.summary.nArtists) }}</div></div>
      <div class="stat"><div class="k">Per day</div><div class="v">{{ w.summary.perDay.toFixed(1) }}</div></div>
    </div>
    <div class="avd">
      <div v-for="ax in axes" :key="ax" class="avdrow">
        <span class="lbl" :style="{ color: AVD[ax] }">{{ ax.toUpperCase() }}</span>
        <div class="track"><div class="fill" :style="{ width: w.avdOverall[ax] * 100 + '%', background: AVD[ax] }" /></div>
        <span class="num">{{ w.avdOverall[ax].toFixed(2) }}</span>
      </div>
    </div>
  </WidgetCard>
</template>

<style scoped>
.avd { margin-top: 16px; display: flex; flex-direction: column; gap: 9px; }
.avdrow { display: flex; align-items: center; gap: 8px; }
.lbl { width: 16px; font-weight: 700; font-size: 12px; }
.track { flex: 1; height: 8px; background: #0c0f18; border-radius: 6px; overflow: hidden; }
.fill { height: 100%; border-radius: 6px; }
.num { width: 30px; text-align: right; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
