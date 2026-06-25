<script setup lang="ts">
import type { Persona, ReportData } from "@spotilyze/core";
import { computed, ref } from "vue";
import { fetchProfile, fetchReportData, getConfig } from "../api";
import { buildLLMReport } from "../report";
import { renderMarkdown } from "../markdown";
import { useAnalysis } from "../stores/analysis";

const store = useAnalysis();
const open = ref(false);
const copied = ref(false);
const rd = ref<ReportData | null>(null);
const loading = ref(false);

const PERSONAS: { id: Persona; label: string; hint: string }[] = [
  { id: "analyst", label: "Analyst", hint: "rich, specific personality profile" },
  { id: "ad", label: "Ad profile", hint: "what advertisers could infer & target you with" },
  { id: "dating", label: "Dating read", hint: "what it's like to know & date them" },
  { id: "roast", label: "Roast", hint: "funny, uncomfortably accurate" },
  { id: "recommend", label: "Recommendations", hint: "where to take their taste next" },
];
const persona = ref<Persona>("analyst");

// AI run (only if a working LLM provider is configured)
const llmReady = ref(false);
const llmProvider = ref("");
const llmModel = ref("");
const tab = ref<"prompt" | "ai">("prompt");
const aiText = ref("");
const aiLoading = ref(false);
const aiError = ref("");

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic",
  ollama: "Ollama (local)",
};
const providerLabel = computed(() => PROVIDER_LABEL[llmProvider.value] ?? llmProvider.value ?? "your model");
const modelLabel = computed(() => [providerLabel.value, llmModel.value].filter(Boolean).join(" · "));
const aiHtml = computed(() => (aiText.value ? renderMarkdown(aiText.value) : ""));

const text = computed(() =>
  store.full
    ? buildLLMReport(store.full, rd.value, { persona: persona.value, podcasts: store.usePodcasts ? store.podcasts : null })
    : "",
);

async function openModal() {
  open.value = true;
  if (store.offline) {
    // exported single-file build: copy-paste prompt only, no server-side AI
    rd.value = store.reportData;
    llmReady.value = false;
    return;
  }
  getConfig()
    .then((c) => {
      llmReady.value = c.llm.ready;
      llmProvider.value = c.llm.provider;
      llmModel.value = c.llm.model;
    })
    .catch(() => (llmReady.value = false));
  if (rd.value) return;
  loading.value = true;
  rd.value = await fetchReportData(); // monthly genres + emergence
  loading.value = false;
}

async function runAI() {
  tab.value = "ai";
  aiLoading.value = true;
  aiError.value = "";
  aiText.value = "";
  try {
    const r = await fetchProfile(persona.value);
    if (r.error || !r.profile) aiError.value = r.error ?? "the model returned nothing";
    else aiText.value = r.profile;
  } catch (e) {
    aiError.value = String(e);
  } finally {
    aiLoading.value = false;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(tab.value === "ai" ? aiText.value : text.value);
  } catch {
    /* clipboard blocked — user can still select the textarea */
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <button class="btn" @click="openModal">✦ LLM report</button>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="open = false">
      <div class="modal">
        <div class="m-head">
          <div>
            <strong>LLM analysis</strong>
            <span class="muted">{{ loading ? "— loading monthly data…" : tab === "ai" ? `— via ${providerLabel}` : "— paste into ChatGPT / Claude" }}</span>
          </div>
          <div class="m-actions">
            <button class="btn" @click="copy">{{ copied ? "Copied ✓" : "Copy" }}</button>
            <button class="btn ghost" @click="open = false">Close</button>
          </div>
        </div>

        <!-- persona switcher -->
        <div class="personas">
          <button
            v-for="p in PERSONAS"
            :key="p.id"
            class="chip"
            :class="{ on: persona === p.id }"
            :title="p.hint"
            @click="persona = p.id; tab = 'prompt'; aiText = ''; aiError = ''"
          >
            {{ p.label }}
          </button>
        </div>
        <p class="muted phint">{{ PERSONAS.find((p) => p.id === persona)?.hint }}</p>

        <!-- prompt vs AI result -->
        <div class="tabs" v-if="llmReady">
          <button class="tab" :class="{ on: tab === 'prompt' }" @click="tab = 'prompt'">Copy-paste prompt</button>
          <button class="tab" :class="{ on: tab === 'ai' }" @click="tab = 'ai'">AI result</button>
        </div>

        <template v-if="tab === 'ai'">
          <div v-if="aiLoading" class="ai-busy"><div class="spinner" /><span>Generating with {{ modelLabel || providerLabel }}…</span></div>
          <!-- eslint-disable-next-line vue/no-v-html — rendered from our own escaped markdown -->
          <div v-else-if="aiText" class="ai-out md" v-html="aiHtml" />
          <!-- no result yet: explicit trigger (only shown because llmReady gates the tab) -->
          <div v-else class="ai-gen">
            <p v-if="aiError" class="err small">{{ aiError }}</p>
            <button class="btn" @click="runAI">✦ {{ aiError ? "Try again" : "Generate result" }}</button>
            <p class="muted hint">Runs your configured model ({{ modelLabel || providerLabel }}) on this prompt.</p>
          </div>
        </template>
        <textarea
          v-else
          readonly
          :value="text"
          class="m-text"
          spellcheck="false"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />

        <div class="m-foot">
          <p class="muted">
            Neutral listening data + a weak AVD hypothesis (flagged as such). The model is told to draw its own conclusions about age, profession, interests, life events and values.
          </p>
          <p class="disclaimer">
            ⚠ For fun, not fact. No LLM can build an accurate profile of a real person from Spotify history alone — this is
            guesswork from listening patterns, often confidently wrong, and not a psychological, medical or factual assessment.
            Take it as a playful suggestion, nothing more.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(4, 6, 12, 0.72); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px;
}
.modal {
  width: min(760px, 96vw); max-height: 88vh; display: flex; flex-direction: column;
  background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 18px;
}
.m-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.m-actions { display: flex; gap: 8px; }

.personas { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  font-size: 12px; padding: 5px 12px; border-radius: 999px; cursor: pointer;
  background: var(--card2); color: var(--muted); border: 1px solid var(--border);
}
.chip:hover { color: #e6e9f0; }
.chip.on { background: var(--accent); color: #0a0c12; border-color: var(--accent); font-weight: 600; }
.phint { font-size: 11px; margin: 8px 0 12px; }

.tabs { display: flex; gap: 4px; margin-bottom: 10px; }
.tab { font-size: 12px; padding: 4px 12px; border-radius: 8px 8px 0 0; cursor: pointer; background: transparent; color: var(--muted); border: 1px solid transparent; border-bottom: 2px solid transparent; }
.tab.on { color: #e6e9f0; border-bottom-color: var(--accent); }

.m-text {
  flex: 1; min-height: 320px; resize: vertical; width: 100%;
  background: #0a0d15; color: #cfd6e6; border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; line-height: 1.5;
}
.ai-out {
  flex: 1; min-height: 320px; max-height: 52vh; overflow-y: auto; width: 100%; white-space: pre-wrap;
  background: #0a0d15; color: #dfe4f0; border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; font-size: 13.5px; line-height: 1.6;
}
/* rendered markdown: block elements, so no pre-wrap whitespace collapsing */
.ai-out.md { white-space: normal; }
.md :first-child { margin-top: 0; }
.md :last-child { margin-bottom: 0; }
.md h1, .md h2, .md h3, .md h4 { color: #fff; line-height: 1.3; margin: 18px 0 8px; }
.md h1 { font-size: 19px; } .md h2 { font-size: 17px; } .md h3 { font-size: 15px; } .md h4 { font-size: 13.5px; }
.md p { margin: 0 0 10px; }
.md ul, .md ol { margin: 0 0 10px; padding-left: 22px; }
.md li { margin: 3px 0; }
.md strong { color: #fff; font-weight: 650; }
.md em { color: #e8ecf6; }
.md a { color: var(--accent); text-decoration: underline; }
.md code { background: #161b29; border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px; }
.md blockquote { margin: 0 0 10px; padding: 4px 0 4px 14px; border-left: 3px solid var(--accent); color: #c2c9da; font-style: italic; }
.md hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
.ai-gen { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 320px; text-align: center; }
.ai-gen .hint { font-size: 12px; margin: 0; }
.ai-gen .err { min-height: 0; }
.err.small { font-size: 12.5px; max-width: 460px; }
.ai-busy { display: flex; align-items: center; gap: 12px; min-height: 320px; justify-content: center; color: var(--muted); }
.spinner { width: 24px; height: 24px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.err { color: #ff6b6b; min-height: 320px; }

.m-foot { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.m-foot p { font-size: 11px; margin: 0; }
.m-foot .disclaimer { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 11px; line-height: 1.5; color: #ffb454; }
.btn.small { font-size: 12px; padding: 6px 12px; flex: 0 0 auto; }
@media (max-width: 560px) {
  .overlay { padding: 12px; }
  .modal { padding: 14px; max-height: 92vh; }
  .m-head { flex-wrap: wrap; }
  .m-text, .ai-out { min-height: 240px; }
  .m-foot { flex-direction: column; align-items: flex-start; gap: 10px; }
}
</style>
