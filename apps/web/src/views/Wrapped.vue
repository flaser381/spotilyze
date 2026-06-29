<script setup lang="ts">
import { topPhaseShifts, type PhaseShift } from "@spotilyze/core";
import { computed, onMounted, ref } from "vue";
import { useAnalysis } from "../stores/analysis";
import { AVD, fmtHours, fmtMonth, fmtNum } from "../theme";

const store = useAnalysis();
const i = ref(0);
// cards + insights are generated once on upload and cached in the store (replays never regenerate)
const insights = computed(() => store.insights);
const cards = computed(() => store.cards);
const cardsState = computed(() => store.cardsState);
const cardsError = computed(() => store.cardsError);

const full = computed(() => store.full!);
const w = computed(() => full.value.widgets);
const avd = computed(() => w.value.avdOverall);
const shifts = computed<PhaseShift[]>(() => (store.full ? topPhaseShifts(store.full, 3) : []));

// only START the slides once the LLM has finished evaluating (or AI is off / errored).
const preparing = computed(() => cardsState.value === "loading");
onMounted(() => {
  if (store.cardsState === "idle") void store.prepareWrapped(); // safety net (e.g. replay before cards loaded)
});

const years = computed(() => Math.round((full.value.meta.span[1] - full.value.meta.span[0]) / (365.25 * 864e5)));
const topObsession = computed(() => insights.value?.obsessions[0] ?? null);
const avdTagline = computed(() => {
  const { a, v, d } = avd.value;
  return `${a > 0.62 ? "high-energy" : a < 0.42 ? "calm" : "balanced"} · ${v > 0.6 ? "upbeat" : v < 0.46 ? "melancholic" : "even-keeled"} · ${d > 0.6 ? "deep" : d < 0.36 ? "immediate" : "grounded"}`;
});

// Openness is the only Big Five trait the listening data actually supports
// (genre breadth / discovery). 0 = traditional, 1 = open in worldview & nature.
// tolerate cached/old-shape cards (pre-rename had `bigfive.openness`, no `openness`)
const openness = computed(() => {
  const o = cards.value?.openness;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = (cards.value as any)?.bigfive?.openness;
  return o ?? (typeof legacy === "number" ? { score: legacy, reason: "" } : { score: 0.5, reason: "" });
});
const opennessWord = computed(() => {
  const s = openness.value.score;
  return s >= 0.66 ? "Open" : s >= 0.55 ? "Curious" : s <= 0.34 ? "Traditional" : s <= 0.45 ? "Grounded" : "Balanced";
});

const slideKinds = computed(() => [
  "hero", "artists", "obsession", "genres", "avd",
  "age", "personality", "occupation", "wow", "values",
  ...shifts.value.map((_, k) => `shift${k}`),
  "outro",
]);
const SLIDES = computed(() => slideKinds.value.length);
const kind = computed(() => slideKinds.value[i.value] ?? "outro");
const isCardKind = computed(() => ["age", "personality", "occupation", "wow", "values"].includes(kind.value));
const shiftIdx = computed(() => (kind.value.startsWith("shift") ? +kind.value.slice(5) : -1));
const curShift = computed(() => (shiftIdx.value >= 0 ? shifts.value[shiftIdx.value] : null));
const curSummary = computed(() => (cardsState.value === "ready" ? cards.value?.shifts?.[shiftIdx.value]?.summary : null));

const BG = [
  "radial-gradient(900px 600px at 30% 10%, #2a1b54 0%, #0a0c12 60%)",
  "radial-gradient(900px 600px at 70% 20%, #143a4a 0%, #0a0c12 60%)",
  "radial-gradient(900px 600px at 40% 80%, #4a1d3a 0%, #0a0c12 60%)",
  "radial-gradient(900px 600px at 70% 70%, #1d3a4a 0%, #0a0c12 60%)",
  "radial-gradient(900px 600px at 30% 30%, #3a2a5a 0%, #0a0c12 60%)",
  "radial-gradient(1000px 700px at 50% 0%, #3a1d54 0%, #0a0c12 62%)",
  "radial-gradient(1000px 700px at 50% 100%, #1d2a5a 0%, #0a0c12 62%)",
  "radial-gradient(900px 600px at 30% 70%, #143a4a 0%, #0a0c12 60%)",
  "radial-gradient(900px 600px at 70% 30%, #4a2a1d 0%, #0a0c12 60%)",
  "radial-gradient(900px 600px at 50% 50%, #2a2350 0%, #0a0c12 62%)",
];

const next = () => !preparing.value && i.value < SLIDES.value - 1 && i.value++;
const prev = () => i.value > 0 && i.value--;
const explore = () => store.dismissWrapped();
const arrow = (d: number) => (Math.abs(d) < 0.015 ? "→" : d > 0 ? "▲" : "▼");
const axisCol = (d: number) => (Math.abs(d) < 0.015 ? "#8a91a6" : d > 0 ? "#1ed793" : "#ff6b6b");
</script>

<template>
  <div class="wrap" :style="{ background: BG[i % BG.length] }" @click="next">
    <!-- gate: don't start the slides until the LLM has finished; offer a direct skip -->
    <div v-if="preparing" class="prep" @click.stop>
      <div class="prep-inner">
        <div class="spinner big" />
        <p class="kicker">building your wrapped</p>
        <h2>Reading {{ years }} years of your listening…</h2>
        <p class="sub">The AI is writing your personality cards — a few seconds.</p>
        <button class="btn stop" @click="explore">Skip straight to the dashboard →</button>
      </div>
    </div>

    <template v-else>
    <div class="bars" @click.stop>
      <span v-for="n in SLIDES" :key="n" class="bar" :class="{ on: n - 1 <= i }" @click="i = n - 1" />
    </div>
    <button class="skip" @click.stop="explore">Skip →</button>

    <div class="stage">
      <section v-if="kind === 'hero'" class="slide">
        <p class="kicker">your sound, unwrapped</p>
        <h1>{{ years }} years.<br />{{ fmtHours(full.meta.totalHours) }} of listening.</h1>
        <p class="sub">{{ fmtNum(full.meta.totalPlays) }} plays · {{ fmtNum(full.meta.nArtists) }} artists · {{ fmtMonth(full.meta.span[0]) }} → {{ fmtMonth(full.meta.span[1]) }}</p>
        <p class="tap">tap to continue</p>
      </section>

      <section v-else-if="kind === 'artists'" class="slide">
        <p class="kicker">the ones you couldn't quit</p>
        <h2>Your top artists</h2>
        <ol class="big-list"><li v-for="a in w.topArtists.slice(0, 5)" :key="a.name"><span>{{ a.name }}</span><b>{{ fmtNum(a.plays) }}</b></li></ol>
      </section>

      <section v-else-if="kind === 'obsession'" class="slide">
        <template v-if="topObsession">
          <p class="kicker">your hardest obsession</p>
          <h1>“{{ topObsession.name }}”</h1>
          <p class="sub">{{ topObsession.artist }}</p>
          <p class="huge">{{ topObsession.peakPlays }}×</p>
          <p class="sub">in ~3 weeks around {{ topObsession.peakMonth }} — then you basically stopped.</p>
        </template>
        <template v-else>
          <p class="kicker">on repeat</p>
          <h1>“{{ w.topTracks[0]?.name }}”</h1>
          <p class="sub">{{ w.topTracks[0]?.artist }} · {{ w.topTracks[0]?.plays }}×</p>
        </template>
      </section>

      <section v-else-if="kind === 'genres'" class="slide">
        <p class="kicker">what you actually listen to</p>
        <h2>Your genres</h2>
        <div class="chips"><span v-for="g in w.topGenres.slice(0, 8)" :key="g.name" class="chip" :style="{ fontSize: 14 + g.share * 90 + 'px' }">{{ g.name }}</span></div>
      </section>

      <section v-else-if="kind === 'avd'" class="slide">
        <p class="kicker">your emotional sound-profile</p>
        <h2 class="tagline">{{ avdTagline }}</h2>
        <div class="avd">
          <div v-for="ax in (['a', 'v', 'd'] as const)" :key="ax" class="ar">
            <span class="al" :style="{ color: AVD[ax] }">{{ { a: 'Arousal', v: 'Valence', d: 'Depth' }[ax] }}</span>
            <div class="tk"><div class="fl" :style="{ width: avd[ax] * 100 + '%', background: AVD[ax] }" /></div>
            <span class="an">{{ avd[ax].toFixed(2) }}</span>
          </div>
        </div>
      </section>

      <!-- LLM personality cards -->
      <template v-else-if="isCardKind">
        <section v-if="cardsState === 'loading'" class="slide" @click.stop>
          <div class="ai-load"><div class="spinner" /><p class="sub">Reading {{ years }} years of your listening…<br /><span class="muted">tap the bars to revisit other slides while it thinks</span></p></div>
        </section>
        <section v-else-if="cardsState !== 'ready'" class="slide" @click.stop>
          <p class="kicker">the AI read</p>
          <template v-if="cardsState === 'off'">
            <h2>AI is off — no problem</h2>
            <p class="sub">Spotilyze still has you covered. Two ways to unlock this deeper read:</p>
            <ol class="off-paths">
              <li>
                <strong>Turn AI on.</strong> Add a provider in <span class="tag">⚙ settings</span>, then hit
                <span class="tag">✦ Generate AI Wrapped</span> on the dashboard and these cards fill themselves in.
              </li>
              <li>
                <strong>Or bring your own chat.</strong> Spotilyze builds a prompt packed with all your relevant data —
                paste it into ChatGPT, Claude or any AI chat of your choice for the same analysis. No setup needed: it's the
                <span class="tag">✦ LLM report</span> button on the dashboard.
              </li>
            </ol>
            <button class="btn go" @click="explore">Take me to the dashboard →</button>
          </template>
          <template v-else>
            <h2>Couldn’t generate it</h2>
            <p class="sub">{{ cardsError }}</p>
            <p class="sub muted">You can still grab the copy-paste <span class="tag">✦ LLM report</span> prompt on the dashboard.</p>
            <button class="btn go" @click="explore">Go to the dashboard →</button>
          </template>
        </section>
        <template v-else-if="cards">
          <section v-if="kind === 'age'" class="slide">
            <p class="kicker">your music thinks you're</p>
            <p class="huge">{{ cards.age.estimate }}</p>
            <p class="sub">most likely {{ cards.age.range }} · {{ cards.age.confidence }} confidence</p>
            <p class="reason">“{{ cards.age.reason }}”</p>
          </section>
          <section v-else-if="kind === 'personality'" class="slide">
            <p class="kicker">in your worldview &amp; nature, you lean</p>
            <h1 class="cap">{{ opennessWord }}</h1>
            <div class="open-scale">
              <span class="pole lo">Traditional</span>
              <div class="line"><div class="dot" :style="{ left: (openness.score * 100) + '%' }" /></div>
              <span class="pole hi">Open</span>
            </div>
            <p v-if="openness.reason" class="reason">“{{ openness.reason }}”</p>
          </section>
          <section v-else-if="kind === 'occupation'" class="slide">
            <p class="kicker">in your day-to-day, you're probably</p>
            <h1 class="cap">{{ cards.status.label }}</h1>
            <p v-if="cards.status.field" class="sub">— likely {{ cards.status.field }} ({{ cards.status.confidence }})</p>
            <div class="traitchips"><span v-for="t in cards.traits.slice(0, 4)" :key="t.label" class="tchip" :title="t.reason">{{ t.label }}</span></div>
          </section>
          <section v-else-if="kind === 'wow'" class="slide">
            <p class="kicker">what your music quietly reveals</p>
            <div class="wow-list"><div v-for="ww in cards.wow.slice(0, 3)" :key="ww.title" class="wow-card"><div class="wt">{{ ww.title }}</div><div class="wd">{{ ww.detail }}</div></div></div>
          </section>
          <section v-else class="slide">
            <p class="kicker">what you seem to value</p>
            <div class="chips vals"><span v-for="v in cards.values.slice(0, 5)" :key="v" class="chip val">{{ v }}</span></div>
            <p class="vibe">“{{ cards.vibe }}”</p>
          </section>
        </template>
      </template>

      <!-- phase-shift cards -->
      <section v-else-if="curShift" class="slide" @click.stop="next">
        <p class="kicker">a turning point · {{ fmtMonth(curShift.at) }}</p>
        <h2>How your sound shifted</h2>
        <div class="shift">
          <div class="shift-mood">
            <div v-for="ax in (['a', 'v', 'd'] as const)" :key="ax" class="srow">
              <span class="al" :style="{ color: AVD[ax] }">{{ { a: 'Arousal', v: 'Valence', d: 'Depth' }[ax] }}</span>
              <span class="sv">{{ curShift.from.centroid[ax].toFixed(2) }}</span>
              <span class="sarr" :style="{ color: axisCol(curShift.to.centroid[ax] - curShift.from.centroid[ax]) }">{{ arrow(curShift.to.centroid[ax] - curShift.from.centroid[ax]) }}</span>
              <span class="sv">{{ curShift.to.centroid[ax].toFixed(2) }}</span>
            </div>
          </div>
          <div class="shift-genre">
            <span class="gset">{{ curShift.from.topGenres.slice(0, 3).map((g) => g.name).join(", ") || "—" }}</span>
            <span class="garr">→</span>
            <span class="gset hi">{{ curShift.to.topGenres.slice(0, 3).map((g) => g.name).join(", ") || "—" }}</span>
          </div>
        </div>
        <p v-if="curSummary" class="reason">“{{ curSummary }}”</p>
        <p v-else-if="cardsState === 'loading'" class="muted small">AI summary loading…</p>
        <p v-else-if="cardsState === 'off'" class="muted small">enable AI in ⚙ settings — or grab the copy-paste LLM report prompt on the dashboard</p>
      </section>

      <section v-else class="slide">
        <p class="kicker">that's the surface</p>
        <h1>Ready for the full picture?</h1>
        <p class="sub">The scrollable listening-phase graph, every metric, and the full AI report.</p>
        <button class="btn explore" @click.stop="explore">Explore the dashboard →</button>
      </section>
    </div>

    <button v-if="i > 0" class="nav prev" @click.stop="prev">‹</button>
    <button v-if="i < SLIDES - 1" class="nav next" @click.stop="next">›</button>
    </template>
  </div>
</template>

<style scoped>
.wrap { position: fixed; inset: 0; z-index: 60; color: #fff; transition: background .5s; display: flex; flex-direction: column; cursor: pointer; user-select: none; }
.bars { display: flex; gap: 4px; padding: 14px 16px 0; }
.bar { flex: 1; height: 3px; border-radius: 3px; background: rgba(255,255,255,.18); cursor: pointer; transition: background .3s; }
.bar.on { background: #fff; }
.skip { position: absolute; top: 26px; right: 18px; background: none; border: none; color: rgba(255,255,255,.7); font-size: 13px; cursor: pointer; }
.skip:hover { color: #fff; }
.stage { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; }
.slide { width: min(660px, 92vw); text-align: center; animation: rise .5s ease; }
@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.kicker { text-transform: uppercase; letter-spacing: 2px; font-size: 12px; color: rgba(255,255,255,.6); margin: 0 0 14px; }
h1 { font-size: clamp(30px, 6vw, 52px); line-height: 1.08; margin: 0; font-weight: 750; }
.cap { text-transform: capitalize; }
h2 { font-size: clamp(24px, 4vw, 34px); margin: 0 0 18px; font-weight: 700; }
.sub { font-size: 16px; color: rgba(255,255,255,.8); margin: 14px 0 0; line-height: 1.5; }
.small { font-size: 13px; }
.off-paths { text-align: left; max-width: 540px; margin: 22px auto 26px; padding-left: 22px; display: flex; flex-direction: column; gap: 14px; }
.off-paths li { font-size: 15px; line-height: 1.55; color: rgba(255,255,255,.84); }
.off-paths strong { color: #fff; }
.tag { white-space: nowrap; font-size: 13px; padding: 1px 7px; border-radius: 6px; background: rgba(124,92,255,.22); border: 1px solid rgba(124,92,255,.5); }
.go { margin-top: 4px; }
.reason { margin-top: 18px; font-style: italic; color: rgba(255,255,255,.78); max-width: 540px; margin-inline: auto; line-height: 1.55; }
.huge { font-size: clamp(64px, 16vw, 150px); font-weight: 800; margin: 6px 0; line-height: 1; background: linear-gradient(90deg,#fff,#b9a8ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tap { margin-top: 40px; font-size: 12px; color: rgba(255,255,255,.4); }
.big-list { list-style: none; padding: 0; margin: 0; text-align: left; }
.big-list li { display: flex; justify-content: space-between; align-items: baseline; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.12); font-size: clamp(18px,3vw,26px); font-weight: 650; }
.big-list b { color: rgba(255,255,255,.6); font-size: 16px; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 10px 16px; justify-content: center; align-items: baseline; line-height: 1.1; }
.chip { font-weight: 700; color: #cdbcff; }
.tagline { color: #fff; }
.avd { margin-top: 24px; display: flex; flex-direction: column; gap: 14px; }
.ar { display: flex; align-items: center; gap: 12px; }
.al { width: 70px; text-align: right; font-size: 13px; font-weight: 600; }
.tk { flex: 1; height: 12px; background: rgba(255,255,255,.12); border-radius: 8px; overflow: hidden; }
.fl { height: 100%; border-radius: 8px; transition: width .6s; }
.an { width: 40px; font-variant-numeric: tabular-nums; color: rgba(255,255,255,.7); }
.open-scale { display: grid; grid-template-columns: 100px 1fr 100px; align-items: center; gap: 12px; margin: 26px auto 0; max-width: 460px; }
.pole { font-size: 12px; color: rgba(255,255,255,.6); }
.pole.lo { text-align: right; } .pole.hi { text-align: left; }
.line { position: relative; height: 4px; background: rgba(255,255,255,.16); border-radius: 4px; }
.dot { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px rgba(124,92,255,.9); transition: left .6s; }
.traitchips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 22px; }
.tchip { background: rgba(124,92,255,.22); border: 1px solid rgba(124,92,255,.5); border-radius: 20px; padding: 6px 14px; font-size: 14px; font-weight: 600; }
.wow-list { display: flex; flex-direction: column; gap: 12px; text-align: left; }
.wow-card { background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 14px 16px; }
.wt { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
.wd { font-size: 14px; color: rgba(255,255,255,.8); line-height: 1.5; }
.vals { margin: 10px 0 22px; }
.chip.val { background: rgba(255,255,255,.1); border-radius: 20px; padding: 6px 16px; font-size: 18px; color: #fff; text-transform: capitalize; }
.vibe { font-size: clamp(18px,3vw,26px); font-weight: 650; font-style: italic; line-height: 1.4; max-width: 560px; margin: 0 auto; }
.shift { background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.12); border-radius: 16px; padding: 18px 20px; margin-top: 4px; }
.shift-mood { display: flex; flex-direction: column; gap: 9px; }
.srow { display: grid; grid-template-columns: 80px 50px 30px 50px; align-items: center; gap: 8px; justify-content: center; margin: 0 auto; }
.srow .al { width: auto; }
.sv { font-variant-numeric: tabular-nums; color: rgba(255,255,255,.85); }
.sarr { font-size: 14px; }
.shift-genre { margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.12); display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; font-size: 15px; }
.gset { color: rgba(255,255,255,.6); } .gset.hi { color: #fff; font-weight: 600; }
.garr { color: var(--accent); font-size: 20px; }
.prep { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; cursor: default; }
.prep-inner { width: min(560px, 92vw); text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; animation: rise .5s ease; }
.prep-inner h2 { margin-top: 10px; }
.btn.stop { margin-top: 30px; background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.3); font-size: 14px; padding: 11px 22px; border-radius: 12px; cursor: pointer; }
.btn.stop:hover { background: rgba(255,255,255,.2); }
.spinner.big { width: 46px; height: 46px; margin-bottom: 12px; }
.ai-load { display: flex; flex-direction: column; align-items: center; gap: 18px; }
.spinner { width: 34px; height: 34px; border: 3px solid rgba(255,255,255,.2); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.btn.explore { margin-top: 28px; background: #fff; color: #14101f; font-size: 16px; padding: 13px 26px; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; }
.btn.explore:hover { filter: brightness(.95); }
.nav { position: absolute; top: 50%; transform: translateY(-50%); background: none; border: none; color: rgba(255,255,255,.45); font-size: 40px; cursor: pointer; padding: 0 14px; }
.nav:hover { color: #fff; }
.nav.prev { left: 4px; } .nav.next { right: 4px; }
.muted { color: rgba(255,255,255,.55); }
</style>
