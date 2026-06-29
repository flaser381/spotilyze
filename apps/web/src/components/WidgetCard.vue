<script setup lang="ts">
import { ref } from "vue";
import HelpModal from "./HelpModal.vue";
defineProps<{ title: string; span?: string; help?: string }>();
const showHelp = ref(false);
</script>

<template>
  <section class="card" :class="span ?? 's4'">
    <div class="card-head">
      <h3>{{ title }}</h3>
      <button v-if="help" class="help-btn" :aria-label="`What is ${title}?`" @click="showHelp = true">?</button>
    </div>
    <div class="body"><slot /></div>
    <HelpModal v-if="help" :open="showHelp" :title="title" :text="help" @close="showHelp = false" />
  </section>
</template>

<style scoped>
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
/* h3 keeps its global margin-bottom so the body spacing is unchanged */
.help-btn {
  flex: none; width: 18px; height: 18px; margin-top: -1px; border-radius: 50%;
  border: 1px solid var(--border); background: transparent; color: var(--muted);
  font-size: 11px; font-weight: 700; line-height: 1; cursor: pointer; padding: 0;
  transition: color .15s, border-color .15s;
}
.help-btn:hover { color: var(--accent); border-color: var(--accent); }
</style>
