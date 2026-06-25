<script setup lang="ts">
defineEmits<{ continue: [] }>();

const svg = (p: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const icons = {
  shield: svg('<path d="M12 3l7 3v5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>'),
  code: svg('<path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="15" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flask: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>'),
  spark: svg('<path d="M12 2 14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z"/>'),
  check: svg('<path d="M5 12l4 4 10-11"/>'),
  github: svg('<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.5 11.5 0 0 0-6 0C8.3 2.1 7.3 2.4 7.3 2.4a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 6 8.8c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
};
const pillars = [
  { icon: "eye", title: "Reclaim the lens", body: "The same profiling tools Big Tech runs on you, quietly, for ads — pointed at your own data, by you, on your own machine." },
  { icon: "spark", title: "Make the invisible visible", body: "Innocuous data reveals far more than you'd expect. See for yourself what your listening history can infer about you." },
  { icon: "clock", title: "A mirror for your story", body: "Your phases, turning points and growth over the years — a way to look back at who you were and how you changed." },
  { icon: "flask", title: "An open question, not a claim", body: "We're openly exploring whether this long-term signal could one day aid mental-health self-reflection or research — transparently, never as a diagnosis." },
];
</script>

<template>
  <div class="land">
    <div class="inner">
      <!-- hero -->
      <header class="hero">
        <div class="logo">◈</div>
        <h1>Spotilyze</h1>
        <p class="tag">
          Big platforms profile you from data you'd never expect to be revealing. Spotilyze lets you run that same lens on
          <strong>your own</strong> listening history — privately, on your own machine, with the code fully open.
        </p>
        <div class="cta">
          <button class="btn" @click="$emit('continue')">Get started</button>
          <a class="btn ghost" href="https://github.com" target="_blank" rel="noreferrer"><span class="ico" v-html="icons.github" /> Source (AGPL)</a>
        </div>
        <p class="micro">Free · open-source · runs locally · no account</p>
      </header>

      <!-- why this exists -->
      <section class="why">
        <h2>Why this exists</h2>
        <p class="wlead">
          Profiling people from passive data isn't science fiction. It's the quiet core of the ad economy, done <em>on</em> you,
          <em>for</em> advertisers, behind closed doors. That power shouldn't belong only to big companies. Spotilyze flips it:
          you point it at yourself and see exactly what's inferable.
        </p>
        <div class="grid">
          <div v-for="p in pillars" :key="p.title" class="why-card">
            <span class="ico lg accent" v-html="icons[p.icon as keyof typeof icons]" />
            <h3>{{ p.title }}</h3>
            <p>{{ p.body }}</p>
          </div>
        </div>
      </section>

      <!-- how: trust pillars -->
      <section class="pillars">
        <div class="pill">
          <span class="ico accent" v-html="icons.shield" />
          <div><strong>Private by default</strong><span>Processed on this device. Nothing leaves it unless you choose a cloud AI.</span></div>
        </div>
        <div class="pill">
          <span class="ico accent" v-html="icons.code" />
          <div><strong>Open-source (AGPL-3.0)</strong><span>Read exactly what it does with your data, and copyleft keeps every version open. No hidden telemetry.</span></div>
        </div>
        <div class="pill">
          <span class="ico accent" v-html="icons.sliders" />
          <div><strong>Your choice of AI</strong><span>None at all, a model on your machine, or your own cloud key. You decide.</span></div>
        </div>
      </section>

      <!-- vision + privacy stance -->
      <section class="vision">
        <h2>Where this is heading</h2>
        <p class="vlead">
          Our goal is an open-source model that can read a listening history and describe the person behind it. We're building it
          without taking your data:
        </p>
        <ul class="promises">
          <li><span class="ico mini" v-html="icons.check" /> We collect nothing. No account, no tracking, no upload endpoint.</li>
          <li><span class="ico mini" v-html="icons.check" /> Everything stays on your machine. The only exception is the listening summary sent to an external AI provider, and only if you choose one.</li>
          <li><span class="ico mini" v-html="icons.check" /> Open-source (AGPL-3.0), so you can verify all of this in the code yourself — and it stays open.</li>
        </ul>
      </section>

      <footer class="foot">
        <span class="micro">Privacy-first · AGPL-3.0 · everything local</span>
        <button class="btn" @click="$emit('continue')">Get started</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.land { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 36px 20px; }
.inner { width: min(780px, 96vw); display: flex; flex-direction: column; gap: 34px; }

.ico { display: inline-flex; width: 20px; height: 20px; vertical-align: middle; }
.ico :deep(svg) { width: 100%; height: 100%; }
.ico.mini { width: 15px; height: 15px; flex: 0 0 auto; }
.ico.lg { width: 28px; height: 28px; }
.ico.accent { color: var(--accent); }

.hero { text-align: center; }
.logo { color: var(--accent); font-size: 40px; }
.hero h1 { font-size: 40px; letter-spacing: -0.5px; margin-top: 4px; }
.tag { max-width: 560px; margin: 14px auto 0; line-height: 1.6; color: var(--muted); font-size: 15px; }
.tag strong { color: var(--text); }
.cta { display: flex; gap: 12px; justify-content: center; margin-top: 22px; flex-wrap: wrap; }
.cta .btn { padding: 11px 22px; }
.cta .ghost { display: inline-flex; align-items: center; gap: 7px; text-decoration: none; }
.micro { font-size: 12px; color: var(--muted); margin-top: 14px; }

.why h2, .vision h2 { font-size: 22px; margin-bottom: 10px; }
.wlead, .vlead { font-size: 14px; color: var(--text); line-height: 1.6; margin-bottom: 18px; }
.wlead em, .vlead em { color: var(--text); font-style: italic; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
.why-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.why-card h3 { font-size: 15px; margin: 10px 0 6px; }
.why-card p { font-size: 12.5px; color: var(--muted); line-height: 1.5; }

.pillars { display: flex; flex-direction: column; gap: 10px; }
.pill { display: flex; align-items: flex-start; gap: 12px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.pill .ico { margin-top: 2px; flex: 0 0 auto; }
.pill div { display: flex; flex-direction: column; gap: 3px; }
.pill strong { font-size: 14px; }
.pill span { font-size: 12.5px; color: var(--muted); line-height: 1.45; }

.vision { background: linear-gradient(180deg, var(--card) 0%, var(--bg2) 100%); border: 1px solid var(--border); border-radius: 16px; padding: 24px; }
.promises { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.promises li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--muted); line-height: 1.5; }
.promises .ico { color: #1ed793; margin-top: 1px; }

.foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.foot .btn { padding: 11px 22px; }
</style>
