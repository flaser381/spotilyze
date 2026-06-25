<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAnalysis } from "../stores/analysis";
import { fmtMonth } from "../theme";

const store = useAnalysis();

// month boundaries across the full span (+1 sentinel end)
const months = computed<number[]>(() => {
  if (!store.fullSpan) return [];
  const [a, b] = store.fullSpan;
  const out: number[] = [];
  let t = Date.UTC(new Date(a).getUTCFullYear(), new Date(a).getUTCMonth(), 1);
  while (t <= b) {
    out.push(t);
    const nd = new Date(t);
    t = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 1);
  }
  out.push(b + 1);
  return out;
});

const lo = ref(0);
const hi = ref(0);
watch(months, (m) => { lo.value = 0; hi.value = Math.max(0, m.length - 1); }, { immediate: true });

const fromTs = computed(() => months.value[lo.value] ?? store.fullSpan?.[0] ?? 0);
const toTs = computed(() => (months.value[hi.value] ?? (store.fullSpan?.[1] ?? 0) + 1) - 1);

let timer: ReturnType<typeof setTimeout>;
const commit = () => {
  clearTimeout(timer);
  timer = setTimeout(() => store.setTimeframe(fromTs.value, toTs.value), 250);
};
function onLo(e: Event) {
  lo.value = Math.min(+(e.target as HTMLInputElement).value, hi.value - 1);
  commit();
}
function onHi(e: Event) {
  hi.value = Math.max(+(e.target as HTMLInputElement).value, lo.value + 1);
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
      <button v-if="!isFull" class="btn ghost tf-reset" @click="resetRange">All time</button>
      <span v-if="store.rangeLoading" class="muted tf-loading">updating…</span>
    </div>
    <div class="tf-sliders">
      <input type="range" :min="0" :max="months.length - 1" :value="lo" @input="onLo" />
      <input type="range" :min="0" :max="months.length - 1" :value="hi" @input="onHi" />
    </div>
  </div>
</template>

<style scoped>
.tf { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; }
.tf-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.tf-range { font-weight: 650; font-size: 15px; }
.tf-reset { padding: 4px 10px; font-size: 12px; }
.tf-loading { font-size: 12px; }
.tf-sliders { position: relative; display: grid; }
.tf-sliders input { width: 100%; accent-color: var(--accent); margin: 2px 0; }
</style>
