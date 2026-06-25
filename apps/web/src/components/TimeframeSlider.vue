<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAnalysis } from "../stores/analysis";
import { fmtMonth } from "../theme";

const store = useAnalysis();

// month-start timestamps across the full span (+1 sentinel end)
const months = computed<number[]>(() => {
  const sp = store.fullSpan;
  if (!sp) return [];
  const out: number[] = [];
  let t = Date.UTC(new Date(sp[0]).getUTCFullYear(), new Date(sp[0]).getUTCMonth(), 1);
  while (t <= sp[1]) {
    out.push(t);
    const d = new Date(t);
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  out.push(sp[1] + 1);
  return out;
});
const N = computed(() => Math.max(1, months.value.length - 1));

const lo = ref(0);
const hi = ref(0);
watch(months, (m) => { lo.value = 0; hi.value = Math.max(0, m.length - 1); }, { immediate: true });

const fromTs = computed(() => months.value[lo.value] ?? store.fullSpan?.[0] ?? 0);
const toTs = computed(() => (months.value[hi.value] ?? (store.fullSpan?.[1] ?? 0) + 1) - 1);
const loPct = computed(() => (lo.value / N.value) * 100);
const hiPct = computed(() => (hi.value / N.value) * 100);

// phase bands positioned by time, coloured by AVD (arousal→R, valence→G, depth→B)
const span = computed(() => store.fullSpan ?? [0, 1]);
const timePct = (ts: number) => ((ts - span.value[0]) / (span.value[1] - span.value[0] || 1)) * 100;
// single accent colour; opacity varies by how much each phase's AVD differs from
// the all-time baseline (distinct emotional periods stand out, baseline ones fade).
const segs = computed(() => {
  const ps = store.phases;
  if (!ps.length) return [];
  const base = {
    a: ps.reduce((s, p) => s + p.centroid.a, 0) / ps.length,
    v: ps.reduce((s, p) => s + p.centroid.v, 0) / ps.length,
    d: ps.reduce((s, p) => s + p.centroid.d, 0) / ps.length,
  };
  const dist = ps.map((p) => Math.hypot(p.centroid.a - base.a, p.centroid.v - base.v, p.centroid.d - base.d));
  const mn = Math.min(...dist);
  const r = Math.max(...dist) - mn || 1;
  return ps.map((p, i) => ({
    left: timePct(p.start),
    width: Math.max(0.4, timePct(p.end) - timePct(p.start)),
    alpha: 0.2 + ((dist[i]! - mn) / r) * 0.75,
    label: p.label,
    p,
  }));
});


let timer: ReturnType<typeof setTimeout>;
const commit = () => {
  clearTimeout(timer);
  timer = setTimeout(() => store.setTimeframe(fromTs.value, toTs.value), 200);
};

const trackEl = ref<HTMLElement | null>(null);
let dragging: "lo" | "hi" | null = null;
const idxFromClient = (clientX: number): number => {
  const r = trackEl.value!.getBoundingClientRect();
  return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * N.value);
};
function onMove(e: PointerEvent) {
  if (!dragging) return;
  const i = idxFromClient(e.clientX);
  if (dragging === "lo") lo.value = Math.min(i, hi.value - 1);
  else hi.value = Math.max(i, lo.value + 1);
  commit();
}
function startDrag(which: "lo" | "hi", e: PointerEvent) {
  dragging = which;
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", () => { dragging = null; window.removeEventListener("pointermove", onMove); }, { once: true });
}
function selectPhase(p: { start: number; end: number }) {
  const nearest = (ts: number) => months.value.reduce((best, m, i) => (Math.abs(m - ts) < Math.abs(months.value[best]! - ts) ? i : best), 0);
  lo.value = nearest(p.start);
  hi.value = Math.max(nearest(p.end), lo.value + 1);
  commit();
}
function resetRange() {
  lo.value = 0;
  hi.value = months.value.length - 1;
  commit();
}
const isFull = computed(() => lo.value === 0 && hi.value === months.value.length - 1);
</script>

<template>
  <div class="tf">
    <div class="tf-head">
      <span class="tf-range">{{ fmtMonth(fromTs) }} — {{ fmtMonth(toTs) }}</span>
      <div class="tf-actions">
        <span class="muted tf-hint">filters the widgets below · drag the handles or tap a phase band</span>
        <span v-if="store.rangeLoading" class="muted tf-upd">updating…</span>
        <button v-if="!isFull" class="btn ghost tf-reset" @click="resetRange">All time</button>
      </div>
    </div>
    <div ref="trackEl" class="track">
      <div class="phases">
        <div
          v-for="(s, i) in segs"
          :key="i"
          class="seg"
          :class="{ first: i === 0 }"
          :style="{ left: s.left + '%', width: s.width + '%', background: `rgba(124,92,255,${s.alpha})` }"
          :title="s.label"
          @click="selectPhase(s.p)"
        />
      </div>
      <div class="veil" :style="{ width: loPct + '%' }" />
      <div class="veil right" :style="{ left: hiPct + '%' }" />
      <div class="sel" :style="{ left: loPct + '%', width: hiPct - loPct + '%' }" />
      <div class="thumb" :style="{ left: loPct + '%' }" @pointerdown.prevent="startDrag('lo', $event)" />
      <div class="thumb" :style="{ left: hiPct + '%' }" @pointerdown.prevent="startDrag('hi', $event)" />
    </div>
  </div>
</template>

<style scoped>
.tf { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px 18px; }
/* space-between pins the actions to the right edge, so the changing date range
   on the left grows into the middle gap without nudging anything (no jitter). */
.tf-head { display: flex; align-items: center; justify-content: space-between; gap: 8px 14px; margin-bottom: 12px; flex-wrap: wrap; }
.tf-range { flex: 0 0 auto; font-weight: 650; font-size: 15px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tf-actions { display: flex; align-items: center; gap: 12px; min-width: 0; }
.tf-hint { font-size: 12px; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf-upd { font-size: 12px; flex: 0 0 auto; }
.tf-reset { padding: 4px 10px; font-size: 12px; flex: 0 0 auto; }
@media (max-width: 640px) {
  .tf { padding: 11px 12px 16px; }
  .tf-hint { display: none; }
  .tf-range { font-size: 14px; }
}
.track { position: relative; height: 30px; border-radius: 8px; background: #0c0f18; user-select: none; touch-action: none; }
.phases { position: absolute; inset: 0; border-radius: 8px; overflow: hidden; filter: saturate(1.3) blur(0.5px); }
.phases::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 55%); }
.seg { position: absolute; top: 0; bottom: 0; border-left: 1px solid rgba(0, 0, 0, 0.4); cursor: pointer; transition: filter 0.12s; }
.seg.first { border-left: none; }
.seg:hover { filter: brightness(1.35); }
.veil { position: absolute; top: 0; bottom: 0; left: 0; background: rgba(8, 10, 16, 0.74); pointer-events: none; border-radius: 8px 0 0 8px; }
.veil.right { left: auto; right: 0; border-radius: 0 8px 8px 0; }
.sel { position: absolute; top: -1px; bottom: -1px; border: 2px solid #fff; border-radius: 5px; pointer-events: none; }
.thumb { position: absolute; top: -4px; width: 12px; height: 38px; margin-left: -6px; background: #fff; border-radius: 4px; cursor: ew-resize; box-shadow: 0 1px 5px rgba(0, 0, 0, 0.55); z-index: 2; }
.thumb:hover { background: #dfe3ee; }
</style>
