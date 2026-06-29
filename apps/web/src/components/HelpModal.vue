<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

defineProps<{ title: string; text: string; open: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <Transition name="hm">
      <div v-if="open" class="hm-backdrop" @click.self="emit('close')">
        <div class="hm" role="dialog" aria-modal="true">
          <div class="hm-head">
            <span class="hm-q">?</span>
            <h3>{{ title }}</h3>
            <button class="hm-x" aria-label="Close" @click="emit('close')">×</button>
          </div>
          <p class="hm-body">{{ text }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.hm-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(6, 8, 14, 0.66); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.hm {
  width: min(520px, 100%); max-height: 80vh; overflow-y: auto;
  background: var(--card2, #12151f); border: 1px solid var(--accent);
  border-radius: 14px; padding: 20px 22px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
}
.hm-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.hm-q {
  flex: none; width: 24px; height: 24px; border-radius: 50%;
  display: grid; place-items: center; font-weight: 800; font-size: 13px;
  color: var(--accent); border: 1.5px solid var(--accent);
}
.hm-head h3 { flex: 1; font-size: 16px; font-weight: 700; color: var(--text); margin: 0; text-transform: none; letter-spacing: 0; }
.hm-x {
  flex: none; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer;
}
.hm-x:hover { color: var(--text); border-color: var(--accent); }
.hm-body { font-size: 13.5px; line-height: 1.65; color: var(--text); margin: 0; white-space: pre-line; }
.hm-enter-active, .hm-leave-active { transition: opacity .16s ease; }
.hm-enter-from, .hm-leave-to { opacity: 0; }
</style>
