<script setup lang="ts">
import { computed, ref, watch } from "vue";
import VChart from "vue-echarts";
import { useAnalysis } from "../stores/analysis";
import { AVD, axisStyle, fmtMonth, grid, tooltip, zoom } from "../theme";
import HelpModal from "./HelpModal.vue";

const store = useAnalysis();
const selected = ref<number | null>(null);
const showHelp = ref(false);

// which signal lines are shown — default AVD; persisted across phase selections,
// kept in sync with the user's legend clicks via the legendselectchanged event.
// detection runs on the genre-derived AVD + entropy + novelty only.
const legendSel = ref<Record<string, boolean>>({
  Volume: false, Replay: false, Diversity: false, Arousal: true, Valence: true, Depth: true,
});
const onLegendChange = (e: { selected: Record<string, boolean> }) => {
  legendSel.value = e.selected;
};

// detection sensitivity (lower k = more phases); debounced re-detect
let sensTimer: ReturnType<typeof setTimeout>;
const onSens = (e: Event) => {
  const k = +(e.target as HTMLInputElement).value;
  clearTimeout(sensTimer);
  sensTimer = setTimeout(() => store.setSensitivity(k), 250);
};
// phase count changed (sensitivity) → clear any stale selection
watch(() => store.phases.length, () => { selected.value = null; });

const phases = computed(() => store.phases);
const boundaries = computed(() => store.boundaries);
const sig = computed(() => store.fullSignals);

const norm = (vals: number[]) => {
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const r = mx - mn || 1;
  return vals.map((v) => (v - mn) / r);
};

const option = computed(() => {
  const s = sig.value;
  const t = s.map((x) => x.weekStart);
  const sel = selected.value;
  const dim = sel != null;
  const selP = sel != null ? phases.value[sel] : null;

  // base line — faded to ~12% when a phase is selected
  const base = (v: (number | null)[], name: string, color: string, faint = false) => ({
    name,
    type: "line",
    showSymbol: false,
    smooth: true,
    connectNulls: true,
    lineStyle: { width: faint ? 1 : 1.7, color, opacity: (faint ? 0.45 : 1) * (dim ? 0.45 : 1) },
    areaStyle: faint ? { color, opacity: dim ? 0.015 : 0.08 } : undefined,
    itemStyle: { color },
    data: v.map((y, i) => [t[i], y == null ? null : Number(y.toFixed(3))]),
  });
  // bright copy drawn only inside the selected phase → full-opacity lines at the cutoff
  const hi = (v: (number | null)[], name: string, color: string, faint = false) => ({
    name,
    type: "line",
    showSymbol: false,
    smooth: true,
    connectNulls: true,
    z: 6,
    lineStyle: { width: faint ? 1.3 : 1.9, color, opacity: faint ? 0.7 : 1 },
    itemStyle: { color },
    data: v.map((y, i) => (selP && t[i]! >= selP.start && t[i]! < selP.end && y != null ? [t[i], Number(y.toFixed(3))] : [t[i], null])),
  });

  const avd = (k: "a" | "v" | "d") => s.map((x) => (x.gap ? null : x.avd[k]));
  const gapNull = (vals: number[]) => vals.map((v, i) => (s[i]!.gap ? null : v));
  const vol = norm(s.map((x) => Math.log1p(x.nPlays)));
  const rep = gapNull(norm(s.map((x) => Math.log(Math.max(1, x.replay)))));
  const ent = gapNull(norm(s.map((x) => x.entropy)));

  const bandColor = (i: number) =>
    sel == null
      ? i % 2 ? "rgba(255,255,255,0.035)" : "rgba(124,92,255,0.06)"
      : i === sel ? "rgba(124,92,255,0.16)" : i % 2 ? "rgba(255,255,255,0.025)" : "rgba(124,92,255,0.05)";
  const markArea = {
    silent: true,
    data: phases.value.map((p, i) => [{ xAxis: p.start, itemStyle: { color: bandColor(i) } }, { xAxis: p.end }]),
  };
  const markLine = {
    silent: true,
    symbol: "none",
    label: { show: false },
    data: boundaries.value.map((b) => ({
      xAxis: b.week,
      lineStyle: { color: "#ff6b6b", type: "dashed", width: 1, opacity: 0.3 + 0.6 * b.confidence },
    })),
  };
  // "song of the phase" — a ♪ pin at each phase start; the selected phase also shows its name
  const markPoint = {
    data: phases.value.map((p, i) => ({
      coord: [p.start, 0.82] as [number, number],
      symbol: "pin",
      symbolSize: i === sel ? 22 : 13,
      itemStyle: { color: i === sel ? "#ffb454" : "rgba(255,180,84,0.5)", borderColor: "#15161c", borderWidth: 1 },
      label:
        i === sel && p.entrySong
          ? { show: true, position: "bottom" as const, distance: 5, formatter: `♪ ${p.entrySong.name}`, color: "#ffb454", fontSize: 10, fontWeight: 600 as const, textBorderColor: "#0a0c12", textBorderWidth: 3 }
          : { show: true, position: "inside" as const, formatter: "♪", color: "#15161c", fontSize: i === sel ? 11 : 8, fontWeight: 700 as const },
    })),
  };

  const sigs: [(number | null)[], string, string, boolean][] = [
    [vol, "Volume", "#7c5cff", true],
    [rep, "Replay", "#34d6e6", false],
    [ent, "Diversity", "#ffb454", false],
    [avd("v"), "Valence", AVD.v, false],
    [avd("a"), "Arousal", AVD.a, false],
    [avd("d"), "Depth", AVD.d, false],
  ];
  const series: Record<string, unknown>[] = [];
  sigs.forEach(([v, name, color, faint]) => {
    series.push(base(v, name, color, faint));
    if (selP) series.push(hi(v, name, color, faint));
  });
  // always-present anchor carries the phase bands + boundary lines so they render
  // regardless of which signal lines are toggled (don't glue them to Volume)
  series.push({
    name: "_anchor",
    type: "line",
    data: t.length ? [[t[0], 2]] : [],
    symbol: "none",
    lineStyle: { opacity: 0 },
    silent: true,
    markArea,
    markLine,
    markPoint,
  });

  return {
    animation: false, // no draw-in animation on rebuild — looks functional, not flashy
    tooltip: { ...tooltip, trigger: "axis", valueFormatter: (v: number) => (v == null ? "—" : v.toFixed(2)) },
    legend: {
      top: 0,
      type: "scroll",
      data: ["Volume", "Replay", "Diversity", "Valence", "Arousal", "Depth"], // exclude _anchor
      textStyle: { color: "#8a91a6", fontSize: 11 },
      itemWidth: 14,
      itemHeight: 8,
      selected: legendSel.value,
    },
    grid: grid({ top: 30, bottom: 28 }),
    dataZoom: zoom(),
    xAxis: { type: "time", ...axisStyle },
    yAxis: { type: "value", min: 0, max: 1, ...axisStyle, axisLabel: { show: false }, splitLine: { show: false } },
    series,
  };
});

const sel = computed(() => (selected.value == null ? null : phases.value[selected.value] ?? null));
const fmtRange = (a: number, b: number) => `${fmtMonth(a)} – ${fmtMonth(b)}`;
const lvlColor = (l: string) => (l === "high" ? "#1ed793" : l === "low" ? "#ff6b6b" : "#8a91a6");
</script>

<template>
  <section class="card s12 pg">
    <div class="pg-head">
      <div class="pg-title">
        <h3>AVD &amp; behaviour · listening phases</h3>
        <button class="help-btn" aria-label="What is this?" @click="showHelp = true">?</button>
      </div>
      <div class="sens">
        <span class="muted">more</span>
        <input type="range" min="1.2" max="3.2" step="0.1" :value="store.k" @input="onSens" />
        <span class="muted">fewer</span>
        <span class="cnt">{{ store.phases.length }} phases <span v-if="store.phasesLoading" class="spin" /></span>
      </div>
    </div>
    <HelpModal
      :open="showHelp"
      title="Listening phases"
      text="The app looks for stretches of time where your listening changed direction and calls each one a listening phase. These shifts often line up with real changes in your life, like a move, a breakup, a new job, or a new group of friends. The shaded bands are the phases and the dashed red lines mark the weeks where something changed. Drag the slider to split your history into more or fewer phases. Click any phase to see its sound profile, its top genres and artists, what changed at its start, and the songs tied to it."
      @close="showHelp = false"
    />
    <VChart
      :option="option"
      :update-options="{ replaceMerge: ['series'] }"
      autoresize
      style="height: 300px"
      @legendselectchanged="onLegendChange"
    />

    <div class="pg-body">
      <div class="pg-detail">
        <div v-if="sel" class="panel">
          <div class="p-head">
            <div>
              <div class="p-label">{{ sel.label }}</div>
              <div class="muted p-range">{{ fmtRange(sel.start, sel.end) }} · {{ sel.weeks }} weeks</div>
            </div>
            <div class="p-levels">
              <span class="lvl" :style="{ color: lvlColor(sel.levels.volume) }">vol {{ sel.levels.volume }}</span>
              <span class="lvl" :style="{ color: lvlColor(sel.levels.replay) }">replay {{ sel.levels.replay }}</span>
              <span class="lvl" :style="{ color: lvlColor(sel.levels.diversity) }">diversity {{ sel.levels.diversity }}</span>
            </div>
          </div>

          <div v-if="sel.entrySong || sel.topTracks[0]" class="songbox">
            <span class="song-ic">♪</span>
            <div class="song-meta">
              <template v-if="sel.entrySong">
                <span class="song-k">Brought you here</span>
                <span class="song-name">{{ sel.entrySong.name }}</span>
                <span class="song-artist muted">{{ sel.entrySong.artist }} · {{ sel.entrySong.plays }}× in the first 2 weeks</span>
                <span v-if="sel.topTracks[0] && sel.topTracks[0].name !== sel.entrySong.name" class="opener muted">
                  <b>Song of the phase:</b> {{ sel.topTracks[0].name }} — {{ sel.topTracks[0].artist }} ({{ sel.topTracks[0].plays }}× overall)
                </span>
              </template>
              <template v-else>
                <span class="song-k">Song of the phase</span>
                <span class="song-name">{{ sel.topTracks[0]?.name }}</span>
                <span class="song-artist muted">{{ sel.topTracks[0]?.artist }} · {{ sel.topTracks[0]?.plays }}× across the phase</span>
              </template>
            </div>
          </div>

          <div class="p-grid">
            <div class="p-col">
              <div class="p-sub">AVD</div>
              <div v-for="ax in (['a', 'v', 'd'] as const)" :key="ax" class="avdrow">
                <span class="albl" :style="{ color: AVD[ax] }">{{ ax.toUpperCase() }}</span>
                <div class="track"><div class="fill" :style="{ width: sel.centroid[ax] * 100 + '%', background: AVD[ax] }" /></div>
                <span class="anum">{{ sel.centroid[ax].toFixed(2) }}</span>
              </div>
            </div>
            <div class="p-col">
              <div class="p-sub">Top genres <span class="muted" style="text-transform: none">· {{ ((1 - sel.resolvedShare) * 100).toFixed(0) }}% untagged artists</span></div>
              <div class="tags">
                <span v-for="g in sel.topGenres.slice(0, 10)" :key="g.name" class="tag">{{ g.name }} <i>{{ (g.share * 100).toFixed(0) }}%</i></span>
              </div>
              <div class="p-sub" style="margin-top: 10px">Top artists</div>
              <div class="muted small">{{ sel.topArtists.slice(0, 5).map((a) => a.name).join(" · ") }}</div>
            </div>
            <div class="p-col">
              <div class="p-sub">What changed at the start</div>
              <div v-if="sel.changeFromPrev.length" class="drivers">
                <span v-for="d in sel.changeFromPrev" :key="d.signal" class="drv" :class="d.delta >= 0 ? 'up' : 'dn'">
                  {{ d.signal }} {{ d.delta >= 0 ? "▲" : "▼" }} {{ Math.abs(d.delta).toFixed(1) }}
                </span>
              </div>
              <div v-else class="muted small">First phase — your baseline.</div>
            </div>
          </div>
        </div>
        <p v-else class="muted hint">Shaded bands = detected listening phases · dashed red = change-points (opacity ∝ confidence) · click a phase for details. Toggle legend lines to overlay mood (Valence, Arousal, Depth) and behaviour (Volume, Replay, Diversity) — detection runs on mood + diversity.</p>
      </div>

      <div class="pg-list">
        <button
          v-for="(p, i) in phases"
          :key="i"
          class="chip"
          :class="{ active: i === selected }"
          @click="selected = selected === i ? null : i"
        >
          <span class="chip-range">{{ fmtRange(p.start, p.end) }}</span>
          <span class="chip-label">{{ p.label }}</span>
          <span v-if="p.entrySong || p.topTracks[0]" class="chip-song">♪ {{ (p.entrySong ?? p.topTracks[0])?.name }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pg { gap: 8px; }
.pg-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.pg-title { display: flex; align-items: center; gap: 8px; }
.help-btn {
  flex: none; width: 18px; height: 18px; border-radius: 50%;
  border: 1px solid var(--border); background: transparent; color: var(--muted);
  font-size: 11px; font-weight: 700; line-height: 1; cursor: pointer; padding: 0;
  transition: color .15s, border-color .15s;
}
.help-btn:hover { color: var(--accent); border-color: var(--accent); }
.sens { display: flex; align-items: center; gap: 8px; font-size: 11px; flex-wrap: wrap; }
.sens input { width: 130px; accent-color: var(--accent); max-width: 38vw; }
.sens .cnt { color: var(--text); min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
.spin { display: inline-block; width: 10px; height: 10px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) {
  .pg-head h3 { font-size: 12px; }
}
/* below the graph: detail on the left, vertically-scrolled phase list on the right */
.pg-body {
  display: grid; grid-template-columns: 1fr 250px; gap: 16px;
  margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--border);
}
.pg-detail { min-width: 0; height: 400px; overflow-y: auto; padding-right: 4px; }
.pg-list {
  display: flex; flex-direction: column; gap: 8px;
  overflow-y: auto; max-height: 400px; padding: 2px;
}
.chip {
  width: 100%; background: var(--card2); border: 1px solid var(--border); border-radius: 10px;
  padding: 7px 11px; cursor: pointer; text-align: left; color: var(--text); transition: border-color .15s, background .15s;
  display: flex; flex-direction: column; gap: 2px;
}
.chip:hover { border-color: var(--accent); }
.chip.active { border-color: var(--accent); background: #1e1b3a; }
.chip-range { font-size: 11px; color: var(--muted); }
.chip-label { font-size: 12px; font-weight: 600; }
.chip-song { font-size: 11px; color: #ffb454; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 760px) {
  .pg-body { grid-template-columns: 1fr; }
  .pg-detail { order: 2; height: auto; overflow: visible; }
  .pg-list { order: 1; flex-direction: row; max-height: none; overflow-x: auto; overflow-y: visible; padding: 2px 2px 6px; }
  .chip { flex: 0 0 auto; min-width: 130px; }
}
.panel { padding-top: 2px; }
.p-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.p-label { font-size: 17px; font-weight: 700; }
.p-range { font-size: 12px; margin-top: 2px; }
.p-levels { display: flex; gap: 12px; font-size: 12px; }
.lvl { text-transform: capitalize; }
.songbox { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 10px 14px; min-height: 86px; background: rgba(255,180,84,0.08); border: 1px solid rgba(255,180,84,0.25); border-radius: 10px; }
.song-ic { font-size: 22px; color: #ffb454; flex: none; }
.song-meta { display: flex; flex-direction: column; min-width: 0; }
.song-k { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #ffb454; }
.song-name { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-artist { font-size: 12px; }
.opener { font-size: 11px; margin-top: 5px; line-height: 1.4; }
.opener b { color: #ffb454; font-weight: 600; }
.p-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 14px; }
@media (max-width: 860px) { .p-grid { grid-template-columns: 1fr; } }
.p-sub { font-size: 11px; text-transform: uppercase; letter-spacing: .3px; color: var(--muted); margin-bottom: 8px; }
.avdrow { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.albl { width: 16px; font-weight: 700; font-size: 12px; }
.track { flex: 1; height: 7px; background: #0c0f18; border-radius: 6px; overflow: hidden; }
.fill { height: 100%; border-radius: 6px; }
.anum { width: 30px; text-align: right; font-size: 12px; color: var(--muted); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { background: #0f1320; border: 1px solid var(--border); border-radius: 8px; padding: 3px 8px; font-size: 12px; }
.tag i { color: var(--muted); font-style: normal; }
.small { font-size: 12px; line-height: 1.5; }
.drivers { display: flex; flex-direction: column; gap: 6px; }
.drv { font-size: 12px; padding: 3px 8px; border-radius: 7px; width: fit-content; }
.drv.up { background: rgba(30,215,147,0.12); color: #1ed793; }
.drv.dn { background: rgba(255,107,107,0.12); color: #ff6b6b; }
.hint { font-size: 12px; margin: 8px 0 2px; }
</style>
