<script setup lang="ts">
import { ref } from "vue";
import { useAnalysis } from "../stores/analysis";

const store = useAnalysis();
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const usePodcasts = ref(true); // feed podcasts into Wrapped + the AI report

function submitFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const fd = new FormData();
  for (const f of Array.from(files)) fd.append("files", f);
  fd.append("usePodcasts", String(usePodcasts.value));
  store.upload(fd);
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  submitFiles(e.dataTransfer?.files ?? null);
}
</script>

<template>
  <div class="hero">
    <div class="brand">
      <div class="logo">◈</div>
      <h1>Spotilyze</h1>
      <p class="muted tag">Your sound, over time — AVD profile &amp; listening-phase detection from your Spotify history.</p>
    </div>

    <div
      class="drop"
      :class="{ over: dragging, busy: store.loading }"
      @dragover.prevent="!store.loading && (dragging = true)"
      @dragleave.prevent="dragging = false"
      @drop.prevent="!store.loading && onDrop($event)"
      @click="!store.loading && fileInput?.click()"
    >
      <template v-if="store.loading">
        <div class="console" @click.stop>
          <div class="console-head"><span class="led" /> analyzing your history</div>
          <ul class="loglines">
            <li v-for="(l, idx) in store.progress" :key="idx" class="logline" :class="{ active: idx === store.progress.length - 1 }">
              <span class="dot">{{ idx === store.progress.length - 1 ? "▸" : "✓" }}</span>
              <span class="lmsg">{{ l.msg }}</span>
              <div v-if="l.pct != null" class="pbar"><span class="pfill" :style="{ width: l.pct + '%' }" /><b>{{ l.pct }}%</b></div>
            </li>
            <li v-if="!store.progress.length" class="logline active"><span class="dot">▸</span><span class="lmsg">Uploading your export…</span></li>
          </ul>
        </div>
      </template>
      <template v-else>
        <div class="drop-icon">⤓</div>
        <p><strong>Drop your Spotify export</strong> here</p>
        <p class="muted">the <code>.zip</code> export, or the <code>Streaming_History_Audio_*.json</code> / <code>StreamingHistory_*.json</code> files (or click to choose)</p>
        <p class="muted hint">Works with both Spotify exports: <strong>Extended streaming history</strong> (full history, recommended) and the standard <strong>Account data</strong> (~last year).</p>
      </template>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".json,.zip"
        hidden
        @change="submitFiles(($event.target as HTMLInputElement).files)"
      />
    </div>

    <label class="podcast-opt" v-if="!store.loading">
      <input type="checkbox" v-model="usePodcasts" />
      <span>
        <strong>Use my podcasts in the AI evaluation</strong> (Wrapped &amp; report).
        <span class="muted">Podcasts reveal a lot — profession, interests, life events, current headspace. Uncheck to keep them out of the AI prompts; your dashboard still shows them.</span>
      </span>
    </label>

    <p v-if="store.error" class="err">{{ store.error }}</p>
  </div>
</template>

<style scoped>
.hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; padding: 24px; }
.brand { text-align: center; }
.logo { font-size: 40px; color: var(--accent); }
.brand h1 { font-size: 38px; letter-spacing: -0.5px; margin-top: 6px; }
.tag { max-width: 440px; margin: 10px auto 0; line-height: 1.5; }
.drop {
  width: min(560px, 92vw); padding: 44px; border: 1.5px dashed var(--border);
  border-radius: 20px; background: var(--card); text-align: center; cursor: pointer;
  transition: border-color .15s, background .15s; display: flex; flex-direction: column; gap: 10px; align-items: center;
}
.drop:hover, .drop.over { border-color: var(--accent); background: var(--card2); }
.drop.busy { cursor: default; padding: 22px; border-style: solid; }

.console { width: 100%; text-align: left; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.console-head { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
.led { width: 9px; height: 9px; border-radius: 50%; background: #1ed793; box-shadow: 0 0 8px #1ed793; animation: pulse 1.1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }
.loglines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; max-height: 260px; overflow-y: auto; }
.logline { display: grid; grid-template-columns: 16px 1fr; gap: 8px; font-size: 12.5px; line-height: 1.5; color: #707892; align-items: start; animation: rise .25s ease; }
.logline.active { color: #dfe4f0; }
.logline .dot { color: #5c8cff; }
.logline.active .dot { color: #1ed793; }
.lmsg { word-break: break-word; }
.pbar { grid-column: 2; display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.pbar .pfill { height: 6px; border-radius: 4px; background: linear-gradient(90deg, #7c5cff, #1ed793); transition: width .25s; min-width: 2px; }
.pbar b { font-size: 11px; color: var(--muted); font-weight: 600; flex: 0 0 auto; }
@keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.drop-icon { font-size: 34px; color: var(--accent); }
.drop code { background: #0c0f18; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.drop .hint { font-size: 12px; margin-top: 6px; max-width: 460px; }
.podcast-opt { display: flex; gap: 10px; align-items: flex-start; max-width: 540px; font-size: 13px; line-height: 1.45; cursor: pointer; }
.podcast-opt input { margin-top: 3px; flex: 0 0 auto; accent-color: var(--accent); width: 16px; height: 16px; cursor: pointer; }
.podcast-opt .muted { display: block; font-size: 12px; margin-top: 2px; }
.samples { display: flex; gap: 10px; align-items: center; }
.err { color: var(--a); }
.spinner { width: 30px; height: 30px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
