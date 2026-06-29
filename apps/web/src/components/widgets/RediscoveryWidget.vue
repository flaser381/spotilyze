<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const list = computed(() => store.insights?.rediscoveries.slice(0, 12) ?? []);
const fmtYear = (ts: number) => new Date(ts).getFullYear();
</script>

<template>
  <WidgetCard title="Rediscoveries" span="s6" help="Songs you stopped playing for a long time and then came back to later, sometimes after years away.">
    <p class="cap muted">Songs that vanished for years, then came back into rotation.</p>
    <ul v-if="list.length" class="rd">
      <li v-for="r in list" :key="r.name + r.artist">
        <div class="meta">
          <span class="nm">{{ r.name || "(unknown)" }}</span>
          <span class="ar muted">{{ r.artist }}</span>
        </div>
        <div class="num">
          <span class="gap">{{ r.gapYears }}y gap</span>
          <span class="when muted">{{ fmtYear(r.lastBefore) }} → {{ fmtYear(r.firstAfter) }}</span>
        </div>
      </li>
    </ul>
    <p v-else class="muted empty">Nothing came back after a long silence.</p>
  </WidgetCard>
</template>

<style scoped>
.cap { font-size: 12px; margin: 0 0 12px; line-height: 1.4; }
.rd { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.rd li { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.meta { overflow: hidden; }
.nm { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.ar { display: block; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { text-align: right; flex: 0 0 auto; }
.gap { display: block; font-weight: 700; color: #34d6e6; font-variant-numeric: tabular-nums; }
.when { display: block; font-size: 11px; }
.empty { font-size: 12px; text-align: center; padding: 30px 0; }
</style>
