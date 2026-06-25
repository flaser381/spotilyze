import {
  analyze,
  computeInsights,
  computeSignals,
  detectLifePhases,
  outgrownEntries,
  type AnalysisResult,
  type ArtistGenreMap,
  type GenreAVDTable,
  type Play,
  type PodcastProfile,
  type ProfileCards,
  type ReportData,
  type SkipEvent,
} from "@spotilyze/core";
import { defineStore } from "pinia";
import { analyzePhases, analyzeRange, analyzeUploadStream, fetchCards, fetchInsights, getConfig, type InsightsResp } from "../api";

export interface ProgressLine {
  stage: string;
  msg: string;
  pct?: number; // present on the live genre-resolution line
}

// raw recompute inputs for the offline (exported single-file) build — kept OUT of
// pinia state so the 100k+ play objects aren't wrapped in reactive proxies.
let OFFLINE_SRC: { plays: Play[]; skips: SkipEvent[]; amap: ArtistGenreMap; table: GenreAVDTable } | null = null;

/** Shape embedded in the exported HTML as window.__SPOTILYZE__ (compact columns). */
export interface OfflineData {
  k: number;
  full: AnalysisResult;
  insights: InsightsResp;
  podcasts: PodcastProfile | null;
  usePodcasts: boolean;
  cards: ProfileCards | null;
  reportData: ReportData | null;
  table: GenreAVDTable;
  amap: ArtistGenreMap;
  artists: string[];
  tracks: string[];
  P: { ts: number[]; a: number[]; t: number[]; m: number[]; av?: number[] };
  S: { ts: number[]; a: number[]; t: number[]; m: number[] };
}

interface State {
  full: AnalysisResult | null; // all-time — drives the life-phase graph + timeframe slider (never filtered)
  result: AnalysisResult | null; // current timeframe view — drives the widgets below
  timeframe: [number, number] | null;
  k: number; // life-phase detection sensitivity (lower = more phases)
  wrapped: boolean; // show the wrapped recap before the dashboard
  insights: InsightsResp | null; // obsessions / rediscoveries / circadian — all-time
  podcasts: PodcastProfile | null; // podcast/spoken-word profile (all-time)
  usePodcasts: boolean; // did the user opt to feed podcasts into Wrapped + LLM?
  cards: ProfileCards | null; // wrapped LLM cards — generated once, cached for replays
  reportData: ReportData | null; // monthly genres + emergence — for the copy-paste LLM prompt
  cardsState: "idle" | "loading" | "ready" | "off" | "error";
  cardsError: string;
  llmReady: boolean; // a working LLM provider is currently configured (server-side)
  progress: ProgressLine[]; // live analyze/genre-resolution log
  offline: boolean; // running inside an exported single-file HTML (no server)
  loading: boolean;
  rangeLoading: boolean;
  phasesLoading: boolean;
  error: string;
}

export const useAnalysis = defineStore("analysis", {
  state: (): State => ({
    full: null,
    result: null,
    timeframe: null,
    k: 2,
    wrapped: false,
    insights: null,
    podcasts: null,
    usePodcasts: true,
    cards: null,
    reportData: null,
    cardsState: "idle",
    cardsError: "",
    llmReady: false,
    progress: [],
    offline: false,
    loading: false,
    rangeLoading: false,
    phasesLoading: false,
    error: "",
  }),
  getters: {
    hasData: (s) => !!s.full,
    // widgets / metrics → timeframe-filtered view
    widgets: (s) => s.result?.widgets ?? null,
    signals: (s) => s.result?.signals ?? [],
    meta: (s) => s.result?.meta ?? null,
    // life-phase graph + slider → always all-time
    fullSpan: (s) => s.full?.meta.span ?? null,
    phases: (s) => s.full?.phases ?? [],
    boundaries: (s) => s.full?.boundaries ?? [],
    fullSignals: (s) => s.full?.signals ?? [],
  },
  actions: {
    // boot from data embedded in an exported single-file HTML (no server round-trips)
    hydrateOffline(d: OfflineData) {
      const A = d.artists, T = d.tracks;
      const av = d.P.av; // packed per-play AVD (3-decimal ints); -1 = none → genre fallback
      const unpack = (n: number | undefined): Play["avd"] =>
        n == null || n < 0 ? null : { a: Math.floor(n / 1e6) / 1000, v: (Math.floor(n / 1e3) % 1000) / 1000, d: (n % 1000) / 1000 };
      const plays: Play[] = d.P.ts.map((ts, i) => ({
        ts, artist: A[d.P.a[i]!]!, track: T[d.P.t[i]!]!, album: "", uri: null,
        msPlayed: d.P.m[i]!, skipped: false, shuffle: false, country: null, hourLocal: new Date(ts).getUTCHours(),
        avd: unpack(av?.[i]),
      }));
      const skips: SkipEvent[] = d.S.ts.map((ts, i) => ({ ts, artist: A[d.S.a[i]!]!, track: T[d.S.t[i]!]!, uri: null, msPlayed: d.S.m[i]! }));
      OFFLINE_SRC = { plays, skips, amap: d.amap, table: d.table };
      this.offline = true;
      this.full = d.full;
      this.result = d.full;
      this.insights = d.insights;
      this.podcasts = d.podcasts;
      this.usePodcasts = d.usePodcasts;
      this.cards = d.cards;
      this.reportData = d.reportData;
      this.cardsState = d.cards ? "ready" : "off";
      this.k = d.k;
      this.timeframe = [...d.full.meta.span] as [number, number];
    },
    async upload(body: FormData) {
      this.loading = true;
      this.error = "";
      this.progress = [];
      this.cards = null;
      this.cardsState = "idle";
      try {
        await analyzeUploadStream(body, (e) => {
          if (e.type === "error") {
            this.error = e.error;
          } else if (e.type === "log") {
            this.progress.push({ stage: e.stage, msg: e.msg });
          } else if (e.type === "progress") {
            // collapse consecutive genre-progress lines into one live, updating line
            const last = this.progress[this.progress.length - 1];
            if (last && last.stage === e.stage && last.pct != null) {
              last.msg = e.msg;
              last.pct = e.pct;
            } else {
              this.progress.push({ stage: e.stage, msg: e.msg, pct: e.pct });
            }
          } else if (e.type === "done") {
            this.full = e.result;
            this.result = e.result;
            this.podcasts = e.podcasts ?? null;
            this.usePodcasts = e.usePodcasts ?? true;
            if (typeof e.k === "number") this.k = e.k; // server auto-tuned k (~0.8 events/yr)
            this.timeframe = [...e.result.meta.span] as [number, number];
          }
        });
        if (this.error || !this.full) {
          this.error ||= "analysis failed";
          return;
        }
        this.wrapped = true; // play the recap after a fresh upload
        void this.loadInsights(); // obsessions/rediscoveries/circadian for the dashboard widgets
        void this.prepareWrapped(); // kick off the LLM cards; Wrapped waits on cardsState
      } catch (e) {
        this.error = String(e);
      } finally {
        this.loading = false;
      }
    },
    // generate the wrapped LLM cards once; cached server-side + here so replays never regenerate.
    // `force` re-runs the model (used after AI is enabled later, or to re-roll).
    async prepareWrapped(force = false) {
      if (!this.full || this.cardsState === "loading") return;
      if (this.cards && !force) {
        this.cardsState = "ready";
        return;
      }
      if (force) this.cards = null;
      this.cardsState = "loading";
      this.cardsError = "";
      try {
        const r = await fetchCards(force);
        this.llmReady = !!r.configured; // server confirms whether a working provider exists
        if (r.cards) {
          this.cards = r.cards;
          this.cardsState = "ready";
        } else if (!r.configured) {
          this.cardsState = "off";
        } else {
          this.cardsState = "error";
          this.cardsError = r.error ?? "generation failed";
        }
      } catch (e) {
        this.cardsState = "error";
        this.cardsError = String(e);
      }
    },
    // insights (obsessions / rediscoveries / circadian / outgrown) over the current
    // timeframe — reloaded whenever the slider or sensitivity changes.
    async loadInsights() {
      if (!this.full) return;
      const [from, to] = this.timeframe ?? this.full.meta.span;
      if (this.offline && OFFLINE_SRC) {
        const ps = OFFLINE_SRC.plays.filter((p) => p.ts >= from && p.ts <= to);
        const sk = OFFLINE_SRC.skips.filter((s) => s.ts >= from && s.ts <= to);
        const ins = computeInsights(ps, OFFLINE_SRC.amap, OFFLINE_SRC.table);
        const outgrown = outgrownEntries(ps, sk, this.full.phases);
        this.insights = { ...ins, phaseExtras: [], outgrown };
        return;
      }
      this.insights = await fetchInsights(this.k, from, to);
    },
    async setTimeframe(from: number, to: number) {
      if (!this.full) return;
      this.timeframe = [from, to];
      void this.loadInsights(); // keep the insight widgets in sync with the range
      // full-span selection → just reuse the all-time result (no recompute)
      const [s0, s1] = this.full.meta.span;
      if (from <= s0 && to >= s1) {
        this.result = this.full;
        return;
      }
      if (this.offline && OFFLINE_SRC) {
        const ps = OFFLINE_SRC.plays.filter((p) => p.ts >= from && p.ts <= to);
        this.result = analyze(ps, OFFLINE_SRC.amap, OFFLINE_SRC.table);
        return;
      }
      this.rangeLoading = true;
      try {
        const r = await analyzeRange(from, to);
        if (r.result) this.result = r.result;
      } finally {
        this.rangeLoading = false;
      }
    },
    async setSensitivity(k: number) {
      this.k = k;
      if (!this.full) return;
      if (this.offline && OFFLINE_SRC) {
        const signals = computeSignals(OFFLINE_SRC.plays, OFFLINE_SRC.amap, OFFLINE_SRC.table);
        const { phases, boundaries } = detectLifePhases(OFFLINE_SRC.plays, signals, OFFLINE_SRC.amap, OFFLINE_SRC.table, { k });
        this.full = { ...this.full, phases, boundaries };
        void this.loadInsights();
        return;
      }
      void this.loadInsights(); // phase-derived insights depend on k
      this.phasesLoading = true;
      try {
        const r = await analyzePhases(k);
        if (r.phases && this.full) this.full = { ...this.full, phases: r.phases, boundaries: r.boundaries ?? [] };
      } finally {
        this.phasesLoading = false;
      }
    },
    // auto-pick k so ~0.8 detected events per listening year are shown (runs on fresh upload)
    async autoSensitivity() {
      if (!this.full) return;
      const [s, e] = this.full.meta.span;
      const target = 0.8 * Math.max(1, (e - s) / (365.25 * 864e5));
      this.phasesLoading = true;
      try {
        if (this.offline && OFFLINE_SRC) {
          const signals = computeSignals(OFFLINE_SRC.plays, OFFLINE_SRC.amap, OFFLINE_SRC.table);
          let best = { k: this.k, diff: Infinity, phases: this.full.phases, boundaries: this.full.boundaries };
          for (let k = 1.2; k <= 3.205; k += 0.1) {
            const kk = +k.toFixed(1);
            const { phases, boundaries } = detectLifePhases(OFFLINE_SRC.plays, signals, OFFLINE_SRC.amap, OFFLINE_SRC.table, { k: kk });
            const diff = Math.abs(boundaries.length - target);
            if (diff < best.diff - 1e-9 || (Math.abs(diff - best.diff) < 1e-9 && kk > best.k)) best = { k: kk, diff, phases, boundaries };
          }
          this.k = best.k;
          this.full = { ...this.full, phases: best.phases, boundaries: best.boundaries };
        } else {
          const r = await analyzePhases(this.k, true);
          if (r.phases && this.full) {
            this.full = { ...this.full, phases: r.phases, boundaries: r.boundaries ?? [] };
            if (typeof r.k === "number") this.k = r.k;
          }
        }
        void this.loadInsights();
      } finally {
        this.phasesLoading = false;
      }
    },
    dismissWrapped() {
      this.wrapped = false;
    },
    replayWrapped() {
      this.wrapped = true;
    },
    // poll server config for whether a working LLM provider is set (drives the
    // "Generate AI Wrapped" button — it only appears once AI is actually available).
    async refreshLlmStatus() {
      if (this.offline) return;
      try {
        this.llmReady = (await getConfig()).llm.ready;
      } catch {
        /* unreachable → leave as-is */
      }
    },
    // re-run the LLM cards (e.g. AI was enabled after upload) and play the recap.
    // The wrapped shows its loading slide while it regenerates; off/error fall through
    // to the existing "AI is off / couldn't generate" slide.
    async regenerateWrapped() {
      if (this.offline) return; // exported build has no server to regenerate against
      this.wrapped = true;
      await this.prepareWrapped(true);
    },
    reset() {
      this.$reset();
    },
  },
});
