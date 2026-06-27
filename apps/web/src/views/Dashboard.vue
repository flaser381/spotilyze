<script setup lang="ts">
import CompareButton from "../components/CompareButton.vue";
import PhaseGraph from "../components/PhaseGraph.vue";
import ReportButton from "../components/ReportButton.vue";
import TimeframeSlider from "../components/TimeframeSlider.vue";
import AvdRadarWidget from "../components/widgets/AvdRadarWidget.vue";
import OutgrownWidget from "../components/widgets/OutgrownWidget.vue";
import GenresOverTimeWidget from "../components/widgets/GenresOverTimeWidget.vue";
import ComputedMetricsWidget from "../components/widgets/ComputedMetricsWidget.vue";
import ObsessionWidget from "../components/widgets/ObsessionWidget.vue";
import PodcastWidget from "../components/widgets/PodcastWidget.vue";
import RediscoveryWidget from "../components/widgets/RediscoveryWidget.vue";
import SummaryWidget from "../components/widgets/SummaryWidget.vue";
import TasteStabilityWidget from "../components/widgets/TasteStabilityWidget.vue";
import TimeOfDayWidget from "../components/widgets/TimeOfDayWidget.vue";
import RestlessnessWidget from "../components/widgets/RestlessnessWidget.vue";
import TopArtistsWidget from "../components/widgets/TopArtistsWidget.vue";
import TopGenresWidget from "../components/widgets/TopGenresWidget.vue";
import TopTracksWidget from "../components/widgets/TopTracksWidget.vue";
import { useAnalysis } from "../stores/analysis";
import { ref } from "vue";

const store = useAnalysis();
const exporting = ref(false);

// download a single self-contained HTML profile (no external libs) — shareable anywhere.
// fetch as a blob so the Share button can show a spinner until the file is ready.
async function exportProfile() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const res = await fetch("/api/export");
    if (!res.ok) throw new Error(`export failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "spotilyze-profile.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    store.error = String(e);
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="dash">
    <header class="top">
      <div class="title"><span class="logo">◈</span> Spotilyze</div>
      <div class="head-actions">
        <!-- Generate only appears once AI is actually available but cards aren't built yet
             (i.e. the user turned a working provider on after a no-AI upload). Otherwise: Replay. -->
        <button
          v-if="store.cardsState !== 'ready' && store.llmReady && !store.offline"
          class="btn ghost"
          @click="store.regenerateWrapped()"
        >
          ✦ Generate AI Wrapped
        </button>
        <button v-else class="btn ghost" @click="store.replayWrapped()">✦ Replay Wrapped</button>
        <ReportButton />
        <template v-if="!store.offline">
          <CompareButton />
          <button class="btn ghost" :disabled="exporting" @click="exportProfile">
            <span v-if="exporting" class="spin" /> {{ exporting ? "Preparing…" : "⬇ Share" }}
          </button>
          <button class="btn ghost" @click="store.reset()">↺ New upload</button>
        </template>
        <span v-else class="shared-tag">shared</span>
      </div>
    </header>

    <PhaseGraph />

    <div class="section">
      <span class="section-line" />
      <span class="section-label">Explore your metrics — filtered by timeframe</span>
      <span class="section-line" />
    </div>

    <TimeframeSlider />

    <div class="grid" style="margin-top: 16px">
      <SummaryWidget />
      <AvdRadarWidget />
      <TasteStabilityWidget />
      <RestlessnessWidget />
      <TopGenresWidget />
      <TopArtistsWidget />
      <TopTracksWidget />
      <TimeOfDayWidget />
      <ComputedMetricsWidget />
      <GenresOverTimeWidget />
      <OutgrownWidget />
      <ObsessionWidget />
      <RediscoveryWidget />
      <PodcastWidget v-if="store.podcasts?.totalPlays" />
    </div>

    <p class="muted foot">
      AVD = Arousal · Valence · Depth (Greenberg 2016), derived from your genres.
    </p>
  </div>
</template>

<style scoped>
.top { display: flex; align-items: center; justify-content: space-between; gap: 10px 14px; margin-bottom: 16px; flex-wrap: wrap; }
.head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.spin { display: inline-block; width: 11px; height: 11px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }
.shared-tag { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; }
.title { font-size: 20px; font-weight: 700; }
@media (max-width: 640px) {
  .title { font-size: 18px; }
  .head-actions { gap: 7px; width: 100%; }
  .head-actions .btn { padding: 7px 11px; font-size: 12.5px; flex: 1 1 auto; white-space: nowrap; }
}
.logo { color: var(--accent); margin-right: 6px; }
.section { display: flex; align-items: center; gap: 16px; margin: 26px 2px 18px; }
.section-line { flex: 1; height: 1px; background: var(--border); }
.section-label { font-size: 12px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
.foot { text-align: center; margin: 26px 0 10px; font-size: 12px; }
</style>
