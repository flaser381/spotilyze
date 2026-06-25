<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { getConfig, saveConfig, systemCheck, testConfig, type SystemCheck } from "../api";

const props = withDefaults(defineProps<{ mode?: "first-run" | "settings" }>(), { mode: "first-run" });
const emit = defineEmits<{ done: [] }>();

type StepId = "welcome" | "ai" | "provider" | "config" | "finish";
type Cat = "builtin" | "ollama" | "openai";

// ── inline line-icons (no emoji) ──
const svg = (p: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const icons: Record<string, string> = {
  chip: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>'),
  terminal: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>'),
  cloud: svg('<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17 18H7z"/>'),
  chart: svg('<path d="M4 20V11M10 20V5M16 20v-6"/><path d="M3 20h18"/>'),
  spark: svg('<path d="M12 2 14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>'),
  music: svg('<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  gpu: svg('<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="12" r="2"/>'),
  ram: svg('<rect x="3" y="8" width="18" height="9" rx="1"/><path d="M7 8V6M11 8V6M15 8V6"/>'),
  disk: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="13" r="3.5"/><circle cx="12" cy="13" r="0.6"/>'),
  check: svg('<path d="M5 12l4 4 10-11"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};

// hosted OpenAI-compatible sub-providers (ollama/local are their own categories)
const PLACEHOLDER: Record<string, { model: string; base: string; needsKey: boolean }> = {
  openai: { model: "gpt-4o-mini", base: "https://api.openai.com/v1", needsKey: true },
  anthropic: { model: "claude-3-5-sonnet-latest", base: "https://api.anthropic.com", needsKey: true },
};

// provider comparison matrix (dots out of 3; "varies" for hardware-dependent speed)
const PROVIDERS: { cat: Cat; name: string; icon: string; tag: string; privacy: number; speed: number | "varies"; cost: string; setup: string; soon?: boolean }[] = [
  { cat: "builtin", name: "Built-in", icon: "chip", tag: "local", privacy: 3, speed: "varies", cost: "Free", setup: "One-time download", soon: true },
  { cat: "ollama", name: "Ollama", icon: "terminal", tag: "local", privacy: 3, speed: "varies", cost: "Free", setup: "Needs the Ollama app" },
  { cat: "openai", name: "Cloud API", icon: "cloud", tag: "cloud", privacy: 1, speed: 3, cost: "Paid", setup: "Paste an API key" },
];

const form = reactive({
  aiEnabled: false,
  category: "openai" as Cat,
  provider: "openai", // openai | anthropic (within the "openai" category)
  model: "",
  apiKey: "",
  baseUrl: "",
});
const existing = reactive({ keySet: false, genresBaked: false, localAvailable: false });
const idx = ref(0);
const error = ref("");

// ── hardware check (built-in model) ──
const spec = ref<SystemCheck | null>(null);
const specLoading = ref(false);
async function runSpec() {
  if (spec.value || specLoading.value) return;
  specLoading.value = true;
  try {
    spec.value = await systemCheck();
  } catch {
    /* ignore — panel shows nothing */
  } finally {
    specLoading.value = false;
  }
}

// ── connectivity test ──
type Check = { ok: boolean; error?: string; skipped?: boolean };
const testing = ref(false);
const tested = ref(false);
const result = reactive<{ llm: Check }>({ llm: { ok: false } });

const STEP_LABELS: Record<StepId, string> = { welcome: "Start", ai: "AI", provider: "Model", config: "Setup", finish: "Done" };
const steps = computed<StepId[]>(() => {
  const s: StepId[] = [];
  if (props.mode !== "settings") s.push("welcome");
  s.push("ai");
  if (form.aiEnabled) s.push("provider", "config");
  s.push("finish");
  return s;
});
const current = computed(() => steps.value[Math.min(idx.value, steps.value.length - 1)]!);
watch(steps, () => {
  if (idx.value > steps.value.length - 1) idx.value = steps.value.length - 1;
});

const phProvider = computed(() => PLACEHOLDER[form.provider] ?? PLACEHOLDER.openai!);
const needsKey = computed(() => form.category === "openai" && (PLACEHOLDER[form.provider]?.needsKey ?? true));
const aiNeedsTest = computed(() => form.aiEnabled && (form.category === "ollama" || form.category === "openai"));

onMounted(async () => {
  try {
    const c = await getConfig();
    existing.keySet = c.llm.keySet;
    existing.genresBaked = c.genresBaked;
    existing.localAvailable = c.localLlm.available;
    if (c.llm.model || c.llm.ready) {
      form.aiEnabled = true;
      const p = c.llm.provider;
      if (p === "ollama") {
        form.category = "ollama";
        form.provider = "ollama";
      } else if (p === "local") {
        form.category = "builtin";
        form.provider = "local";
      } else {
        form.category = "openai";
        form.provider = p || "openai";
      }
      form.model = c.llm.model;
      form.baseUrl = c.llm.baseUrl;
    }
  } catch {
    /* config endpoint unreachable — keep defaults */
  }
});

watch(
  () => [form.aiEnabled, form.category, form.provider, form.model, form.apiKey, form.baseUrl],
  () => {
    tested.value = false;
  },
);

function back() {
  if (idx.value > 0) idx.value--;
}
function next() {
  if (idx.value < steps.value.length - 1) idx.value++;
}
function chooseAi(enabled: boolean) {
  form.aiEnabled = enabled;
  next();
}
function pickCategory(cat: Cat) {
  form.category = cat;
  if (cat === "ollama") {
    form.provider = "ollama"; // critical: otherwise llmConfig treats it as a hosted provider needing a key
    if (!form.model.trim()) form.model = "gemma4:12b"; // our best-tested local default
  } else if (cat === "builtin") {
    form.provider = "local";
    void runSpec();
  } else if (form.provider === "ollama" || form.provider === "local") {
    form.provider = "openai";
  }
  next();
}

const canContinue = computed(() => {
  if (current.value !== "config") return true;
  if (form.category === "builtin") return true;
  if (form.category === "ollama") return form.model.trim().length > 0;
  return form.model.trim().length > 0 && (!needsKey.value || form.apiKey.trim().length > 0 || existing.keySet);
});
const canFinish = computed(() => !aiNeedsTest.value || (tested.value && result.llm.ok));

async function runTest() {
  error.value = "";
  testing.value = true;
  try {
    const r = await testConfig({
      llmEnabled: aiNeedsTest.value,
      llm: aiNeedsTest.value
        ? { provider: form.provider, model: form.model.trim(), apiKey: form.apiKey.trim() || undefined, baseUrl: form.baseUrl.trim() }
        : undefined,
    });
    result.llm = r.llm;
    tested.value = true;
  } catch (e) {
    error.value = `Test failed to run: ${String(e)}`;
  } finally {
    testing.value = false;
  }
}

const finishing = ref(false);
async function finish() {
  error.value = "";
  finishing.value = true;
  try {
    const body: Parameters<typeof saveConfig>[0] = { onboarded: true };
    if (!form.aiEnabled) body.llm = { model: "" };
    else if (form.category === "ollama") body.llm = { provider: "ollama", model: form.model.trim(), baseUrl: form.baseUrl.trim() };
    else if (form.category === "openai") body.llm = { provider: form.provider, model: form.model.trim(), apiKey: form.apiKey.trim() || undefined, baseUrl: form.baseUrl.trim() };
    await saveConfig(body);
    emit("done");
  } catch (e) {
    error.value = String(e);
  } finally {
    finishing.value = false;
  }
}

const tierClass = (s: SystemCheck) => (!s.verdict.runnable ? "bad" : s.verdict.tier === "slow-cpu" ? "warn" : "good");
const tierLabel = (s: SystemCheck) =>
  !s.verdict.runnable ? "Won't run here" : s.verdict.tier === "gpu" ? "Fast" : s.verdict.tier === "fast-cpu" ? "A few minutes" : "Slow, up to hours";
</script>

<template>
  <div class="wiz">
    <div class="card-wiz">
      <!-- header / stepper -->
      <div class="w-head">
        <div class="brand"><span class="logo">◈</span> Spotilyze</div>
        <ol class="steps">
          <li v-for="(s, i) in steps" :key="s" :class="{ on: i === idx, done: i < idx }">
            <span class="num"><span v-if="i < idx" class="ico mini" v-html="icons.check" /><template v-else>{{ i + 1 }}</template></span>
            <span class="slabel">{{ STEP_LABELS[s] }}</span>
          </li>
        </ol>
        <button v-if="props.mode === 'settings'" class="x" title="Close" @click="emit('done')"><span class="ico" v-html="icons.x" /></button>
      </div>

      <!-- ── WELCOME ── -->
      <section v-if="current === 'welcome'" class="step">
        <h1>Welcome to Spotilyze</h1>
        <p class="lead">Turn your Spotify history into a sound-profile and a personal recap.</p>
        <div class="flow">
          <div class="fnode"><span class="ico lg" v-html="icons.music" /><span>Your export</span></div>
          <span class="ico arrow" v-html="icons.arrow" />
          <div class="fnode accent"><span class="ico lg" v-html="icons.shield" /><span>Stays on your PC</span></div>
          <span class="ico arrow" v-html="icons.arrow" />
          <div class="fnode"><span class="ico lg" v-html="icons.chart" /><span>Profile &amp; Wrapped</span></div>
        </div>
        <p class="sub">Nothing is uploaded unless you pick a cloud AI. Genres are built in, no key needed. Takes about a minute.</p>
      </section>

      <!-- ── AI CHOICE ── -->
      <section v-else-if="current === 'ai'" class="step">
        <h2>Add an AI write-up?</h2>
        <p class="lead">AI turns your stats into a written read of who you are. Optional, the rest works without it.</p>
        <div class="cards two">
          <button class="choice tall" @click="chooseAi(true)">
            <span class="ico xl accent" v-html="icons.spark" />
            <div class="c-title">Yes, add AI</div>
            <div class="c-sub">Personalized profile in your Wrapped &amp; report.</div>
          </button>
          <button class="choice tall" @click="chooseAi(false)">
            <span class="ico xl" v-html="icons.chart" />
            <div class="c-title">No, stats only</div>
            <div class="c-sub">Full dashboard &amp; Wrapped, minus the written read.</div>
          </button>
        </div>
        <p class="sub">You can switch this on later from settings. Even without it, you can copy the profile and paste it into ChatGPT yourself.</p>
      </section>

      <!-- ── PROVIDER PICK ── -->
      <section v-else-if="current === 'provider'" class="step">
        <h2>Pick your AI</h2>
        <p class="lead">Same result, they differ in privacy, speed and cost.</p>
        <div class="cards three">
          <button v-for="p in PROVIDERS" :key="p.cat" class="choice pcard" :class="{ sel: form.category === p.cat, soon: p.soon }" :disabled="p.soon" @click="!p.soon && pickCategory(p.cat)">
            <div class="p-top">
              <span class="ico lg" v-html="icons[p.icon]" />
              <span class="p-name">{{ p.name }}</span>
              <span v-if="p.soon" class="badge soon">soon</span>
              <span v-else class="badge" :class="p.tag">{{ p.tag }}</span>
            </div>
            <ul class="attrs">
              <li>
                <span class="a-k">Privacy</span>
                <span class="dots"><i v-for="n in 3" :key="n" :class="{ on: n <= p.privacy }" /></span>
              </li>
              <li>
                <span class="a-k">Speed</span>
                <span v-if="p.speed === 'varies'" class="a-v muted">your hardware</span>
                <span v-else class="dots"><i v-for="n in 3" :key="n" :class="{ on: n <= (p.speed as number) }" /></span>
              </li>
              <li>
                <span class="a-k">Cost</span>
                <span class="pill" :class="p.cost === 'Free' ? 'free' : 'paid'">{{ p.cost }}</span>
              </li>
              <li>
                <span class="a-k">Setup</span>
                <span class="a-v muted">{{ p.setup }}</span>
              </li>
            </ul>
          </button>
        </div>
        <p class="legend">More dots means more private or faster. The built-in model is coming soon; Ollama also runs on your own computer.</p>
      </section>

      <!-- ── CONFIG ── -->
      <section v-else-if="current === 'config'" class="step">
        <!-- BUILT-IN -->
        <template v-if="form.category === 'builtin'">
          <h2>Your hardware</h2>
          <p class="lead">The built-in model runs on this machine, so its speed depends on your specs.</p>

          <div v-if="specLoading" class="muted">Checking…</div>
          <div v-else-if="spec" class="spec">
            <div class="gauge" :class="tierClass(spec)">
              <span class="g-badge">{{ tierLabel(spec) }}</span>
              <span class="g-note">{{ spec.verdict.note }}</span>
            </div>
            <div class="spec-grid">
              <div><span class="ico" v-html="icons.chip" /><span class="sg-k">CPU</span><span class="sg-v">{{ spec.cpu.cores }} cores</span></div>
              <div><span class="ico" v-html="icons.gpu" /><span class="sg-k">GPU</span><span class="sg-v">{{ spec.gpu.type === 'none' ? 'none' : spec.gpu.type.toUpperCase() + (spec.gpu.vramGB ? ' · ' + spec.gpu.vramGB + ' GB' : '') }}</span></div>
              <div><span class="ico" v-html="icons.ram" /><span class="sg-k">RAM</span><span class="sg-v">{{ spec.ram.totalGB }} GB</span></div>
              <div><span class="ico" v-html="icons.disk" /><span class="sg-k">Disk</span><span class="sg-v">{{ spec.disk.freeGB }} GB free</span></div>
            </div>
          </div>

          <p v-if="!existing.localAvailable" class="sub warnbox">
            The built-in model isn't switched on in this build yet, we're still finalizing which one ships. The check above shows what to
            expect. Continue to finish and enable it later, or pick Ollama or a cloud key to use AI today.
          </p>
        </template>

        <!-- OLLAMA -->
        <template v-else-if="form.category === 'ollama'">
          <h2>Connect Ollama</h2>
          <p class="lead">
            Runs a model on your own machine. <a href="https://ollama.com/download" target="_blank" rel="noreferrer">Install Ollama</a>,
            then pull a model (e.g. <code>ollama pull gemma4:12b</code>).
          </p>
          <label>Model<input v-model="form.model" placeholder="gemma4:12b" /></label>
          <label>Endpoint <span class="muted">(local default works)</span><input v-model="form.baseUrl" placeholder="http://localhost:11434/v1" /></label>
          <p class="tip">
            We tested <strong>gemma4:12b</strong> and it gives good results while staying small enough to run on most modern PCs
            (around 8 GB of VRAM or RAM). On lighter hardware, smaller models like <code>gemma3:4b</code> or
            <code>qwen3.5:4b</code> also work well.
          </p>
        </template>

        <!-- CLOUD -->
        <template v-else>
          <h2>Cloud API key</h2>
          <p class="lead">Any OpenAI-compatible service. Your key stays local, sent only to that provider.</p>
          <div class="row2">
            <label>Provider
              <select v-model="form.provider">
                <option value="openai">OpenAI-compatible</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label>Model<input v-model="form.model" :placeholder="phProvider.model" /></label>
          </div>
          <label>API key<input v-model="form.apiKey" type="password" :placeholder="existing.keySet ? '•••••• (leave blank to keep)' : 'provider API key'" /></label>
          <label>Endpoint <span class="muted">(optional)</span><input v-model="form.baseUrl" :placeholder="phProvider.base" /></label>
        </template>
      </section>

      <!-- ── FINISH ── -->
      <section v-else class="step">
        <h2>You're set</h2>
        <div class="summary">
          <span class="ico lg accent" v-html="form.aiEnabled ? (form.category === 'openai' ? icons.cloud : form.category === 'ollama' ? icons.terminal : icons.chip) : icons.chart" />
          <div>
            <div class="su-title">
              <template v-if="!form.aiEnabled">Stats only, no AI</template>
              <template v-else-if="form.category === 'builtin'">Built-in model</template>
              <template v-else-if="form.category === 'ollama'">Ollama · {{ form.model || 'not set' }}</template>
              <template v-else>{{ form.provider }} · {{ form.model || 'not set' }}</template>
            </div>
            <div class="su-sub muted">
              <template v-if="!form.aiEnabled">Enable AI anytime from settings.</template>
              <template v-else-if="form.category === 'builtin'">We'll enable it once it ships; Wrapped uses raw stats until then.</template>
              <template v-else>Run a quick test to confirm it works.</template>
            </div>
          </div>
        </div>

        <div v-if="aiNeedsTest" class="testbox">
          <button class="btn ghost" :disabled="testing || !form.model.trim()" @click="runTest">{{ testing ? "Testing…" : "Test connection" }}</button>
          <span v-if="tested" class="check-inline" :class="result.llm.ok ? 'pass' : 'fail'">
            <span class="ico mini" v-html="result.llm.ok ? icons.check : icons.x" />
            {{ result.llm.ok ? "Connected" : result.llm.error }}
          </span>
        </div>
      </section>

      <p v-if="error" class="err">{{ error }}</p>

      <!-- footer -->
      <div class="w-foot">
        <button v-if="idx > 0" class="btn ghost" @click="back">Back</button>
        <span class="spacer" />
        <button v-if="current === 'welcome'" class="btn" @click="next">Get started</button>
        <button v-else-if="current === 'config'" class="btn" :disabled="!canContinue" @click="next">Continue</button>
        <button v-else-if="current === 'finish'" class="btn" :disabled="!canFinish || finishing" @click="finish">{{ finishing ? "Saving…" : "Finish" }}</button>
        <span v-else class="muted hint">Choose to continue</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wiz { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.card-wiz { width: min(680px, 96vw); background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 20px 26px 16px; }

.ico { display: inline-flex; width: 20px; height: 20px; }
.ico :deep(svg) { width: 100%; height: 100%; }
.ico.mini { width: 14px; height: 14px; }
.ico.lg { width: 26px; height: 26px; }
.ico.xl { width: 34px; height: 34px; }
.ico.accent { color: var(--accent); }

/* header / stepper */
.w-head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
.brand { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; flex: 0 0 auto; }
.logo { color: var(--accent); font-size: 17px; }
.steps { list-style: none; display: flex; align-items: center; gap: 6px; margin: 0 0 0 auto; padding: 0; }
.steps li { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
.steps .num { width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 11px; }
.steps li.on .num { border-color: var(--accent); color: var(--accent); }
.steps li.on { color: var(--text); }
.steps li.done .num { background: #1ed793; border-color: #1ed793; color: #06140b; }
.steps .slabel { display: none; }
@media (min-width: 600px) { .steps li.on .slabel { display: inline; } }
.x { background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px; flex: 0 0 auto; }
.x:hover { color: var(--text); }

.step { min-height: 290px; }
.step h1 { font-size: 26px; margin-bottom: 6px; }
.step h2 { font-size: 21px; margin-bottom: 6px; }
.lead { color: var(--text); line-height: 1.5; margin: 0 0 18px; font-size: 14px; }
.sub { font-size: 12.5px; color: var(--muted); line-height: 1.55; margin-top: 16px; text-align: center; }
.tip { font-size: 12px; color: var(--muted); line-height: 1.55; margin: 2px 0 0; background: #0f1320; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.tip code { background: #0c0f18; padding: 1px 5px; border-radius: 5px; font-size: 11.5px; }
.sub.warnbox { background: #0f1320; border: 1px solid rgba(255,180,84,.4); border-radius: 10px; padding: 11px 13px; }
.small { font-size: 12px; }

/* welcome flow diagram */
.flow { display: flex; align-items: center; justify-content: center; gap: 8px; background: #0f1320; border: 1px solid var(--border); border-radius: 14px; padding: 22px 14px; }
.fnode { display: flex; flex-direction: column; align-items: center; gap: 9px; text-align: center; font-size: 12px; color: var(--muted); flex: 1; }
.fnode .ico { color: var(--text); }
.fnode.accent .ico { color: var(--accent); }
.flow .arrow { color: var(--border); flex: 0 0 auto; }
@media (max-width: 520px) { .flow .slabel, .fnode span:last-child { font-size: 11px; } }

/* choice cards */
.cards { display: grid; gap: 12px; }
.cards.two { grid-template-columns: 1fr 1fr; }
.cards.three { grid-template-columns: repeat(3, 1fr); }
@media (max-width: 600px) { .cards.two, .cards.three { grid-template-columns: 1fr; } }
.choice { text-align: left; background: var(--card2); border: 1px solid var(--border); border-radius: 14px; padding: 16px; cursor: pointer; color: var(--text); transition: border-color .15s, background .15s, transform .05s; }
.choice:hover { border-color: var(--accent); background: #1a2030; }
.choice:active { transform: translateY(1px); }
.choice.sel { border-color: var(--accent); background: #1e1b3a; }
.choice.tall { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; padding: 20px; }
.c-title { font-size: 15px; font-weight: 700; }
.c-sub { font-size: 12.5px; color: var(--muted); line-height: 1.45; }

/* provider comparison cards */
.pcard { display: flex; flex-direction: column; gap: 12px; }
.p-top { display: flex; align-items: center; gap: 8px; }
.p-name { font-size: 14px; font-weight: 700; }
.badge { margin-left: auto; font-size: 9.5px; font-weight: 700; border-radius: 6px; padding: 2px 6px; text-transform: uppercase; letter-spacing: .4px; }
.badge.local { color: #1ed793; border: 1px solid rgba(30,215,147,.4); }
.badge.cloud { color: #ffb454; border: 1px solid rgba(255,180,84,.4); }
.badge.soon { color: var(--muted); border: 1px solid var(--border); }
.choice.soon { opacity: .55; cursor: not-allowed; }
.choice.soon:hover { border-color: var(--border); background: var(--card2); }
.attrs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.attrs li { display: flex; align-items: center; justify-content: space-between; font-size: 12px; min-height: 22px; }
.a-k { color: var(--muted); }
.a-v { font-size: 11.5px; }
.dots { display: inline-flex; gap: 4px; }
.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--border); }
.dots i.on { background: var(--accent); }
.pill { font-size: 10.5px; font-weight: 600; border-radius: 6px; padding: 1px 7px; }
.pill.free { color: #1ed793; background: rgba(30,215,147,.12); }
.pill.paid { color: #ffb454; background: rgba(255,180,84,.12); }
.legend { font-size: 11.5px; color: var(--muted); margin-top: 14px; text-align: center; }

/* forms */
label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); margin-bottom: 12px; }
input, select { width: 100%; background: #0a0d15; border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; color: var(--text); font-size: 14px; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
code { background: #0c0f18; padding: 1px 6px; border-radius: 5px; font-size: 12px; }

/* hardware gauge */
.spec { background: #0f1320; border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
.gauge { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
.g-badge { font-size: 13px; font-weight: 700; padding: 5px 12px; border-radius: 9px; }
.gauge.good .g-badge { background: rgba(30,215,147,.15); color: #1ed793; }
.gauge.warn .g-badge { background: rgba(255,180,84,.15); color: #ffb454; }
.gauge.bad .g-badge { background: rgba(255,107,107,.15); color: #ff6b6b; }
.g-note { font-size: 12.5px; color: var(--muted); }
.spec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
.spec-grid > div { display: flex; align-items: center; gap: 9px; font-size: 13px; }
.spec-grid .ico { color: var(--muted); flex: 0 0 auto; }
.spec-grid .sg-k { color: var(--muted); }
.spec-grid .sg-v { margin-left: auto; font-weight: 600; }

/* finish */
.summary { display: flex; align-items: center; gap: 14px; background: #0f1320; border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
.su-title { font-size: 15px; font-weight: 700; }
.su-sub { font-size: 12.5px; margin-top: 3px; }
.testbox { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.check-inline { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
.check-inline.pass { color: #1ed793; }
.check-inline.fail { color: #ff6b6b; }
.adv { border-top: 1px solid var(--border); padding-top: 12px; }
.adv-toggle { background: none; border: none; color: var(--muted); font-size: 13px; cursor: pointer; padding: 0; }
.adv-toggle:hover { color: var(--text); }
.adv-body { margin-top: 10px; }
.adv-body p { line-height: 1.5; margin-bottom: 10px; }

.err { color: #ff6b6b; font-size: 13px; margin: 10px 0 0; }
.w-foot { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); }
.spacer { flex: 1; }
.w-foot .hint { font-size: 12px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
