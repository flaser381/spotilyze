<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getConfig } from "./api";
import { useAnalysis } from "./stores/analysis";
import Dashboard from "./views/Dashboard.vue";
import Landing from "./views/Landing.vue";
import OnboardingWizard from "./views/OnboardingWizard.vue";
import Upload from "./views/Upload.vue";
import Wrapped from "./views/Wrapped.vue";

const store = useAnalysis();
const onboarded = ref<boolean | null>(null); // null while loading; false → first-run (landing → wizard)
const landingDone = ref(false); // first-run: landing seen → show the wizard
const showSetup = ref(false); // ⚙ gear → wizard in settings mode (skips the landing)

onMounted(async () => {
  if (store.offline) {
    onboarded.value = true; // exported single-file build — no server to configure
    return;
  }
  try {
    const c = await getConfig();
    onboarded.value = c.onboarded;
    store.llmReady = c.llm.ready;
  } catch {
    onboarded.value = true; // don't hard-block if the config endpoint is unreachable
  }
});

async function onConfigured() {
  onboarded.value = true;
  showSetup.value = false;
  await store.refreshLlmStatus(); // did they just turn a working provider on?
  // if AI is now available and cards aren't built yet, regenerate in the background so the
  // dashboard's "Replay Wrapped" + AI summary light up without another click.
  if (store.hasData && !store.offline && store.llmReady && store.cardsState !== "ready" && store.cardsState !== "loading") {
    void store.prepareWrapped(true);
  }
}
</script>

<template>
  <Landing v-if="onboarded === false && !showSetup && !landingDone" @continue="landingDone = true" />
  <OnboardingWizard
    v-else-if="onboarded === false || showSetup"
    :mode="showSetup ? 'settings' : 'first-run'"
    @done="onConfigured"
  />
  <template v-else-if="onboarded">
    <Wrapped v-if="store.hasData && store.wrapped" />
    <Dashboard v-else-if="store.hasData" />
    <Upload v-else />
    <button v-if="!(store.hasData && store.wrapped) && !store.offline" class="gear" title="Settings" @click="showSetup = true">⚙</button>
  </template>
</template>

<style scoped>
.gear {
  position: fixed; bottom: 16px; left: 16px; z-index: 40;
  width: 38px; height: 38px; border-radius: 50%; cursor: pointer;
  background: var(--card2); border: 1px solid var(--border); color: var(--muted); font-size: 16px;
}
.gear:hover { color: var(--text); border-color: var(--accent); }
</style>
