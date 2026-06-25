<script setup lang="ts">
import type { Compatibility } from "@spotilyze/core";
import { computed, ref } from "vue";
import { compareUpload } from "../api";

const open = ref(false);
const loading = ref(false);
const error = ref("");
const compat = ref<Compatibility | null>(null);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function reset() {
  compat.value = null;
  error.value = "";
}
function openModal() {
  open.value = true;
}

async function run(body: FormData) {
  loading.value = true;
  error.value = "";
  try {
    const r = await compareUpload(body);
    if (r.error || !r.compat) error.value = r.error ?? "comparison failed";
    else compat.value = r.compat;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}
function submitFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const fd = new FormData();
  for (const f of Array.from(files)) fd.append("files", f);
  run(fd);
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  submitFiles(e.dataTransfer?.files ?? null);
}

// score colour ramps red → amber → green
const scoreColor = computed(() => {
  const s = compat.value?.score ?? 0;
  return s >= 70 ? "#1ed793" : s >= 45 ? "#ffb454" : s >= 25 ? "#ff8a5c" : "#ff6b6b";
});
const ring = computed(() => {
  const s = compat.value?.score ?? 0;
  return `conic-gradient(${scoreColor.value} ${s * 3.6}deg, #1c2230 0deg)`;
});
const bars: { key: "genres" | "artists" | "mood"; label: string }[] = [
  { key: "genres", label: "Genres" },
  { key: "artists", label: "Artists" },
  { key: "mood", label: "Mood (AVD)" },
];
</script>

<template>
  <button class="btn ghost" @click="openModal">⇆ Compare taste</button>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="open = false">
      <div class="modal">
        <div class="m-head">
          <strong>Taste compatibility</strong>
          <div class="m-actions">
            <button v-if="compat" class="btn ghost" @click="reset">↺ Another</button>
            <button class="btn ghost" @click="open = false">Close</button>
          </div>
        </div>

        <!-- upload a friend's export -->
        <template v-if="!compat">
          <div
            class="drop"
            :class="{ over: dragging, busy: loading }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
            @click="!loading && fileInput?.click()"
          >
            <template v-if="loading">
              <div class="spinner" />
              <p>Resolving their genres &amp; scoring overlap…</p>
            </template>
            <template v-else>
              <div class="drop-icon">⤓</div>
              <p><strong>Drop a friend's Spotify export</strong></p>
              <p class="muted">their <code>.zip</code> or <code>Streaming_History_Audio_*.json</code> — used once, not stored</p>
            </template>
            <input ref="fileInput" type="file" multiple accept=".json,.zip" hidden @change="submitFiles(($event.target as HTMLInputElement).files)" />
          </div>
          <p v-if="error" class="err">{{ error }}</p>
        </template>

        <!-- result -->
        <template v-else>
          <div class="result">
            <div class="score">
              <div class="ring" :style="{ background: ring }">
                <div class="ring-in">
                  <span class="num" :style="{ color: scoreColor }">{{ compat.score }}</span>
                  <span class="pct muted">/100</span>
                </div>
              </div>
              <p class="blurb">{{ compat.blurb }}</p>
            </div>

            <div class="bars">
              <div v-for="b in bars" :key="b.key" class="bar-row">
                <span class="bl">{{ b.label }}</span>
                <span class="track"><span class="fill" :style="{ width: compat.breakdown[b.key] + '%', background: scoreColor }" /></span>
                <span class="bv">{{ compat.breakdown[b.key] }}</span>
              </div>
            </div>
          </div>

          <div class="cols">
            <div class="col">
              <h4>Shared artists</h4>
              <ul v-if="compat.sharedArtists.length">
                <li v-for="a in compat.sharedArtists" :key="a.name">
                  <span class="nm">{{ a.name }}</span>
                  <span class="muted plays">{{ a.aPlays }} · {{ a.bPlays }}</span>
                </li>
              </ul>
              <p v-else class="muted none">No top artists in common.</p>
            </div>
            <div class="col">
              <h4>Shared genres</h4>
              <ul v-if="compat.sharedGenres.length">
                <li v-for="g in compat.sharedGenres" :key="g.name">
                  <span class="nm">{{ g.name }}</span>
                  <span class="muted plays">{{ Math.round(g.aShare * 100) }}% · {{ Math.round(g.bShare * 100) }}%</span>
                </li>
              </ul>
              <p v-else class="muted none">No shared genres.</p>
            </div>
          </div>

          <div class="cols sig">
            <div class="col">
              <h4>Only you</h4>
              <p class="tags">
                <span v-for="n in compat.onlyA" :key="n" class="tag you">{{ n }}</span>
                <span v-if="!compat.onlyA.length" class="muted none">—</span>
              </p>
            </div>
            <div class="col">
              <h4>Only them</h4>
              <p class="tags">
                <span v-for="n in compat.onlyB" :key="n" class="tag them">{{ n }}</span>
                <span v-if="!compat.onlyB.length" class="muted none">—</span>
              </p>
            </div>
          </div>

          <p v-if="compat.sharedTracks.length" class="muted tracks-foot">
            Songs you both have on heavy rotation: {{ compat.sharedTracks.map((t) => `${t.name} (${t.artist})`).join(" · ") }}
          </p>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(4, 6, 12, 0.72); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px; }
.modal { width: min(720px, 96vw); max-height: 88vh; overflow-y: auto; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
.m-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.m-actions { display: flex; gap: 8px; }

.drop { padding: 40px; border: 1.5px dashed var(--border); border-radius: 16px; background: var(--card2); text-align: center; cursor: pointer; transition: border-color .15s; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.drop:hover, .drop.over { border-color: var(--accent); }
.drop.busy { cursor: default; }
.drop-icon { font-size: 30px; color: var(--accent); }
.drop code { background: #0c0f18; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.samples { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 12px; }
.err { color: #ff6b6b; text-align: center; margin-top: 12px; }
.spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.result { display: flex; align-items: center; gap: 26px; margin-bottom: 18px; }
.score { display: flex; flex-direction: column; align-items: center; gap: 10px; flex: 0 0 auto; }
.ring { width: 124px; height: 124px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.ring-in { width: 96px; height: 96px; border-radius: 50%; background: var(--card); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.num { font-size: 40px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.pct { font-size: 12px; }
.blurb { font-size: 13px; text-align: center; max-width: 150px; line-height: 1.4; }
.bars { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.bar-row { display: flex; align-items: center; gap: 12px; }
.bl { width: 86px; font-size: 13px; color: var(--muted); }
.track { flex: 1; height: 8px; background: #1c2230; border-radius: 5px; overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 5px; transition: width .4s; }
.bv { width: 24px; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; }

.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 6px; }
.cols.sig { margin-top: 14px; }
.col h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted); margin: 0 0 8px; }
.col ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.col li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plays { font-size: 11px; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.none { font-size: 12px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.tag { font-size: 12px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border); }
.tag.you { color: #5c8cff; border-color: #2d3a5c; }
.tag.them { color: #ff8a5c; border-color: #523428; }
.tracks-foot { font-size: 11px; margin: 16px 0 0; line-height: 1.5; }
@media (max-width: 560px) {
  .modal { padding: 14px; }
  .result { flex-direction: column; align-items: center; gap: 16px; }
  .bars { width: 100%; }
  .blurb { max-width: none; }
  .cols { grid-template-columns: 1fr; gap: 12px; }
}
</style>
