<script setup lang="ts">
import { computed } from "vue";
import { useAnalysis } from "../../stores/analysis";
import WidgetCard from "../WidgetCard.vue";

const store = useAnalysis();
const list = computed(() => store.insights?.outgrown ?? []);
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("en", { month: "short", year: "numeric" });
};
const bail = (s: number) => (s < 1 ? "<1s" : `${Math.round(s)}s`);
</script>

<template>
  <WidgetCard title="Outgrown" span="s6">
    <p class="cap muted">
      Music you once played to death — now you forward-button it the second it comes on. Acts you've dropped wholesale rank above single songs you've soured on.
    </p>
    <ul v-if="list.length" class="cr">
      <li v-for="c in list" :key="c.kind + c.artist + c.name" :class="{ artist: c.kind === 'artist' }">
        <div class="meta">
          <span class="nm">
            <span v-if="c.kind === 'artist'" class="tag">ARTIST</span>
            {{ c.kind === "artist" ? c.artist : c.name || "(unknown)" }}
          </span>
          <span class="ar muted">{{ c.kind === "artist" ? `whole catalogue · ${c.nTracks} tracks dropped` : c.artist }}</span>
        </div>
        <div class="arc">
          <span class="loved">♥ {{ c.lovePlays }}× · {{ fmtMonth(c.lovedMonth) }}</span>
          <span class="arrow">→</span>
          <span class="skip">⏭ {{ c.skipsAfter }}× · bails {{ bail(c.avgSkipSec) }}</span>
        </div>
      </li>
    </ul>
    <p v-else class="muted empty">
      Nothing outgrown yet — either you still stand by your old favourites, or this export has no skip data.
    </p>
  </WidgetCard>
</template>

<style scoped>
.cap { font-size: 12px; margin: 0 0 12px; line-height: 1.45; }
.cr { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
/* every row shares the same box so names + metrics line up; artist rows only differ by tint */
.cr li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; min-height: 40px; }
.cr li.artist { background: rgba(255, 92, 157, 0.07); }
.meta { overflow: hidden; min-width: 0; }
.nm { display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.tag { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; color: #ff5c9d; border: 1px solid rgba(255, 92, 157, 0.4); border-radius: 4px; padding: 1px 4px; flex: 0 0 auto; }
.ar { display: block; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arc { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; font-size: 11px; font-variant-numeric: tabular-nums; }
.loved { color: #ff5c9d; }
.arrow { color: var(--muted); }
.skip { color: #ffb454; }
.empty { font-size: 12px; text-align: center; padding: 30px 0; line-height: 1.5; }
</style>
