<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const list = computed(() => store.insights?.obsessions.slice(0, 12) ?? []);
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("en", { month: "short", year: "numeric" });
};
</script>

<template>
  <WidgetCard title="Obsessions" span="s6">
    <p class="cap muted">Songs you binged hard in a few weeks, then mostly let go.</p>
    <ul v-if="list.length" class="obs">
      <li v-for="o in list" :key="o.name + o.artist">
        <div class="meta">
          <span class="nm">{{ o.name || "(unknown)" }}</span>
          <span class="ar muted">{{ o.artist }}</span>
        </div>
        <div class="num">
          <span class="peak">{{ o.peakPlays }}×</span>
          <span class="when muted">{{ fmtMonth(o.peakMonth) }}</span>
        </div>
      </li>
    </ul>
    <p v-else class="muted empty">No clear binge-then-drop pattern found.</p>
  </WidgetCard>
</template>

<style scoped>
.cap { font-size: 12px; margin: 0 0 12px; line-height: 1.4; }
.obs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.obs li { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.meta { overflow: hidden; }
.nm { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.ar { display: block; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { text-align: right; flex: 0 0 auto; }
.peak { display: block; font-weight: 700; color: #ff8a5c; font-variant-numeric: tabular-nums; }
.when { display: block; font-size: 11px; }
.empty { font-size: 12px; text-align: center; padding: 30px 0; }
</style>
