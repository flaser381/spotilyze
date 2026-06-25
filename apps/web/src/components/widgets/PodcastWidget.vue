<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const p = computed(() => store.podcasts);
const shows = computed(() => p.value?.topShows.slice(0, 8) ?? []);
const maxHours = computed(() => Math.max(1, ...shows.value.map((s) => s.hours)));
const maxYear = computed(() => Math.max(1, ...(p.value?.byYear ?? []).map((y) => y.hours)));
const fmtMonth = (ts: number) => new Date(ts).toLocaleDateString("en", { month: "short", year: "2-digit" });
</script>

<template>
  <WidgetCard title="Podcasts &amp; spoken-word" span="s6">
    <div class="head">
      <p class="cap muted">
        {{ p?.totalHours }}h across {{ p?.nShows }} shows. The highest-signal slice of your history — interests, profession, headspace.
        <span :class="store.usePodcasts ? 'flag on' : 'flag off'">{{ store.usePodcasts ? "feeding the AI evaluation" : "kept out of the AI" }}</span>
      </p>
    </div>

    <div class="pod">
      <ul class="shows">
        <li v-for="s in shows" :key="s.show">
          <div class="line">
            <span class="nm">{{ s.show }}</span>
            <span class="hrs">{{ s.hours }}h</span>
          </div>
          <div class="track"><span class="fill" :style="{ width: (s.hours / maxHours) * 100 + '%' }" /></div>
          <span class="when muted">{{ s.plays }} eps · {{ fmtMonth(s.first) }} → {{ fmtMonth(s.last) }}</span>
        </li>
      </ul>

      <div class="years">
        <span class="yhead muted">Hours per year</span>
        <div class="ybars">
          <div v-for="y in p?.byYear ?? []" :key="y.year" class="ycol" :title="`${y.year}: ${y.hours}h, ${y.plays} eps`">
            <div class="ybar-wrap"><span class="ybar" :style="{ height: (y.hours / maxYear) * 100 + '%' }" /></div>
            <span class="ylab muted">{{ y.year.slice(2) }}</span>
          </div>
        </div>
      </div>
    </div>
  </WidgetCard>
</template>

<style scoped>
.head { margin-bottom: 12px; }
.cap { font-size: 12px; margin: 0; line-height: 1.45; }
.flag { font-size: 11px; padding: 1px 8px; border-radius: 999px; margin-left: 6px; white-space: nowrap; }
.flag.on { color: #1ed793; border: 1px solid rgba(30, 215, 147, 0.35); }
.flag.off { color: #8a91a6; border: 1px solid var(--border); }

/* minmax(0,…) instead of 1fr: a bare 1fr track is min-width:auto and a long show
   name would blow the grid wider than the card. minmax(0,…) lets it shrink. */
.pod { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 26px; }
.pod > * { min-width: 0; }
@media (max-width: 720px) { .pod { grid-template-columns: minmax(0, 1fr); } }

.shows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 11px; }
.line { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.nm { flex: 1; min-width: 0; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hrs { font-size: 12px; color: #b18cff; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.track { height: 6px; background: #1c2230; border-radius: 4px; overflow: hidden; margin: 4px 0 2px; }
.fill { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #7c5cff, #b18cff); }
.when { font-size: 10.5px; }

.years { display: flex; flex-direction: column; gap: 8px; }
.yhead { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
.ybars { display: flex; align-items: flex-end; gap: 6px; height: 120px; }
.ycol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
.ybar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.ybar { width: 100%; background: linear-gradient(180deg, #7c5cff, #4a3a9e); border-radius: 3px 3px 0 0; min-height: 2px; }
.ylab { font-size: 10px; }
</style>
