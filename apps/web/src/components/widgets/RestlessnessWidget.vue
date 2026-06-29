<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import { fmtNum } from "../../theme";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();

// of every track that surfaced (finished, sampled-then-skipped, or quick-skipped),
// how often did you let it finish? quick-skips (<30s bail) are the strongest rejection
// and are included — without them, heavy skippers would look misleadingly patient.
// session-ends (closed app, logout) are excluded upstream — not a verdict on the track.
const stats = computed(() => {
  const r = store.widgets?.restlessness ?? { finished: 0, skipped: 0, back: 0, decided: 0, quickSkips: 0, loveHate: [] };
  const total = r.decided + r.quickSkips;
  const bail = r.skipped + r.back + r.quickSkips;
  const seg = (n: number) => (total ? (n / total) * 100 : 0);
  return {
    has: total > 0,
    finishPct: seg(r.finished),
    bailPct: seg(bail),
    oneIn: bail ? Math.round(total / bail) : 0,
    parts: [
      { key: "finished", label: "Finished", n: r.finished, pct: seg(r.finished), color: "#34d6e6" },
      { key: "quick", label: "Skipped <30s", n: r.quickSkips, pct: seg(r.quickSkips), color: "#ff6b6b" },
      { key: "skipped", label: "Skipped later", n: r.skipped, pct: seg(r.skipped), color: "#ffb454" },
      { key: "back", label: "Went back", n: r.back, pct: seg(r.back), color: "#7c5cff" },
    ],
    loveHate: r.loveHate.slice(0, 5),
  };
});
</script>

<template>
  <WidgetCard title="Restlessness" span="s3" help="This shows how patient you are with a song. Every time a track comes on you either let it finish or you skip it. Restlessness is the share of tracks you skip before they end, and it includes the very quick skips where you bail within the first half minute. The love and hate list calls out artists you play a lot but also skip a lot, which usually means you love a few of their songs and instantly skip the rest.">
    <div v-if="stats.has" class="rl">
      <div class="hero">
        <span class="pct">{{ stats.bailPct.toFixed(0) }}<small>%</small></span>
        <span class="cap muted">of tracks you <b>bail on</b> early<template v-if="stats.oneIn"> — ~1 in {{ stats.oneIn }}</template>; the rest you let finish</span>
      </div>
      <div class="bar">
        <span v-for="p in stats.parts" :key="p.key" class="seg" :style="{ width: p.pct + '%', background: p.color }" :title="`${p.label}: ${fmtNum(p.n)}`" />
      </div>
      <div v-if="stats.loveHate.length" class="lh">
        <span class="lh-h muted">Love–hate — play a lot, skip a lot</span>
        <div v-for="a in stats.loveHate" :key="a.name" class="row">
          <span class="name">{{ a.name }}</span>
          <span class="meta muted">{{ fmtNum(a.plays) }}× · skip {{ (a.bailRate * 100).toFixed(0) }}%</span>
        </div>
      </div>
    </div>
    <p v-else class="muted empty">Needs the <b>Extended</b> streaming history (the standard export omits why each track ended).</p>
  </WidgetCard>
</template>

<style scoped>
.rl { display: flex; flex-direction: column; height: 100%; gap: 12px; }
.hero { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 4px; }
.pct { font-size: 48px; font-weight: 750; color: #ffb454; line-height: 1; font-variant-numeric: tabular-nums; }
.pct small { font-size: 22px; opacity: 0.7; }
.cap { font-size: 12px; text-align: center; max-width: 230px; line-height: 1.4; }
.bar { display: flex; width: 100%; height: 10px; border-radius: 999px; overflow: hidden; background: var(--border); }
.seg { height: 100%; }
.lh { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
.lh-h { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
.row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.row .name { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .meta { font-size: 11px; white-space: nowrap; flex: none; }
.empty { font-size: 12px; text-align: center; line-height: 1.5; align-self: center; }
</style>
