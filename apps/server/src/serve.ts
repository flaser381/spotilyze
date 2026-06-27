import {
  analyze,
  buildCardsPrompt,
  buildLLMReport,
  buildReportData,
  compareListeners,
  computeInsights,
  computeWidgets,
  outgrownEntries,
  parseCards,
  computeSignals,
  detectLifePhases,
  listenerProfile,
  parsePlays,
  phaseDefiningTracks,
  phaseNarrative,
  podcastProfile,
  type Boundary,
  type GenreAVDTable,
  type Persona,
  type Phase,
  type Play,
  type PodcastPlay,
  type ProfileCards,
  type RawPlay,
  type SignalVector,
  type SkipEvent,
} from "@spotilyze/core";
import { unzipSync } from "fflate";
import * as os from "node:os";
import { statfsSync } from "node:fs";
import { openAvdDb, resolveAvd } from "./avddb";
import { loadGenreAvd } from "./genredb";
import { openTagsDb, tagsFor, tagsReady } from "./tagsdb";
import type { ArtistGenreMap, ArtistGenres } from "@spotilyze/core";
import { buildExportHtml } from "./export";
import { llmChat, llmConfig, type LLMSettings } from "./llm";
import { getSettings, loadSettings, saveSettings } from "./settings";

const ROOT = process.cwd(); // run from repo root
const PORT = Number(Bun.env.PORT ?? 3001);
const WEB = `${ROOT}/apps/web/dist`;

// One shipped DB holds everything the app needs: artist→genres, artist→measured AVD,
// and genre→AVD. No other table or JSON is loaded at runtime.
const DB = `${ROOT}/data/spotilyze.sqlite3`;
const table: GenreAVDTable = loadGenreAvd(DB); // genre→AVD lookup
await loadSettings(); // overlay config/settings.json (UI-managed) over env defaults

// measured artist-tier AVD (primary AVD source; genre derivation is the fallback)
const avdReady = openAvdDb(DB);

// baked artist→genre tags — the SOLE genre source. No per-user key, no live resolution:
// artists not in the baked set stay untagged (validated ~0% Last.fm yield on the long
// tail, 87% play-weighted coverage). tagsFor returns a bare WeightedGenre[]; downstream
// expects ArtistGenres ({ genres }), so wrap it.
const tagsLoaded = openTagsDb(DB);
// Wrapper memo: return the SAME ArtistGenres object per artist across accesses, so a
// timeframe/k recompute over 100k+ plays does O(1) map hits instead of re-wrapping
// (tagsFor itself is memoized too). `null` marks a known miss → undefined to the caller.
const amapCache = new Map<string, ArtistGenres | null>();
const genreAmap: ArtistGenreMap = new Proxy({} as ArtistGenreMap, {
  get: (_t, k) => {
    if (typeof k !== "string") return undefined;
    let v = amapCache.get(k);
    if (v === undefined) {
      const tg = tagsFor(k);
      amapCache.set(k, (v = tg ? { genres: tg } : null));
    }
    return v ?? undefined;
  },
});

// single-user session state (local-first): the resolved plays of the last upload
let sessionPlays: Play[] = [];
let sessionSignals: SignalVector[] = []; // all-time weekly signals — k-independent, so cache for fast k re-tuning
let sessionSkips: SkipEvent[] = []; // fast forward-button skips (for the outgrown detector)
let sessionPodcasts: PodcastPlay[] = []; // podcast/audiobook episodes
let sessionUsePodcasts = false; // user opt-in: feed podcasts into Wrapped + LLM report
let sessionCards: ProfileCards | null = null; // cached wrapped cards — generated once per upload

const JSON_HEADERS = { "content-type": "application/json", "access-control-allow-origin": "*" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

/** Pick k so ~0.8 detected events per listening year are shown; returns the tuned detection. */
function autoTuneK(plays: Play[], signals: Parameters<typeof detectLifePhases>[1]) {
  const years = Math.max(1, (plays.at(-1)!.ts - plays[0]!.ts) / (365.25 * 864e5));
  const target = 0.8 * years;
  let best = { k: 2, diff: Infinity, phases: [] as Phase[], boundaries: [] as Boundary[] };
  for (let k = 1.2; k <= 3.205; k += 0.1) {
    const kk = +k.toFixed(1);
    const { phases, boundaries } = detectLifePhases(plays, signals, genreAmap, table, { k: kk });
    const diff = Math.abs(boundaries.length - target);
    // closest to target; ties → higher k (fewer, cleaner phases)
    if (diff < best.diff - 1e-9 || (Math.abs(diff - best.diff) < 1e-9 && kk > best.k)) best = { k: kk, diff, phases, boundaries };
  }
  return best;
}


// ── connectivity checks for the setup screen ────────────────────────────────
// We hit the SAME endpoints the app uses later, so a green check means the
// params (key, model, base URL, auth headers) are all handled correctly.

/** Live LLM check: a real, tiny completion (≤16 tokens) through the same client. */
async function testLlm(s: LLMSettings): Promise<{ ok: boolean; error?: string }> {
  const cfg = llmConfig(s);
  if (!cfg) return { ok: false, error: "Model name (and an API key for hosted providers) is required." };
  try {
    await llmChat(cfg, "Connectivity test.", "Reply with the single word: ok", { maxTokens: 16 });
    return { ok: true }; // HTTP 2xx = params accepted; empty content is fine for a tiny ping
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Merge a test patch over current saved settings (blank fields = keep saved). */
function mergeForTest(body: { llm?: Partial<LLMSettings> }): { llm: LLMSettings } {
  const cur = getSettings();
  return {
    llm: {
      provider: (body.llm?.provider ?? cur.llm.provider).toLowerCase(),
      model: body.llm?.model?.trim() || cur.llm.model,
      apiKey: body.llm?.apiKey?.trim() || cur.llm.apiKey,
      baseUrl: (body.llm?.baseUrl ?? cur.llm.baseUrl).trim(),
    },
  };
}

async function rawFromUpload(req: Request): Promise<{ rows: RawPlay[]; usePodcasts: boolean }> {
  const form = await req.formData();
  const usePodcasts = form.get("usePodcasts") !== "false"; // default on
  const rows: RawPlay[] = [];
  const addJson = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) rows.push(...(data as RawPlay[]));
    } catch {
      /* skip non-array / non-JSON */
    }
  };
  for (const value of form.values()) {
    if (!(value instanceof File)) continue;
    if (value.name.toLowerCase().endsWith(".zip")) {
      // real Spotify exports ship as a .zip — pull music + podcast history out of it
      const buf = new Uint8Array(await value.arrayBuffer());
      // Extended export: Streaming_History_Audio_*.json · standard Account Data export: StreamingHistory_music/podcast_*.json
      const files = unzipSync(buf, { filter: (f) => /(Streaming_History_(Audio|Video)|StreamingHistory_(music|podcast)).*\.json$/i.test(f.name) });
      const dec = new TextDecoder();
      for (const name in files) addJson(dec.decode(files[name]!));
    } else if (value.name.toLowerCase().endsWith(".json")) {
      addJson(await value.text());
    }
  }
  return { rows, usePodcasts };
}

// ── shared /api/config payload (GET + POST return the same shape) ───────────
const configPayload = (s: ReturnType<typeof getSettings>) => ({
  configured: tagsReady(), // app is usable as soon as the baked genre tags are present
  onboarded: s.onboarded, // has the first-run wizard been completed?
  genresBaked: tagsReady(), // baked genre tags present (sole genre source, no key needed)
  localLlm: { available: false }, // built-in local inference provider not wired yet (wizard gates on this)
  llm: { provider: s.llm.provider, model: s.llm.model, baseUrl: s.llm.baseUrl, keySet: !!s.llm.apiKey, ready: !!llmConfig(s.llm) },
});

// ── system-spec / runnability check for the built-in local model ────────────
const MODEL_RAM_GB = 4; // working-set headroom for the candidate small local model
const MODEL_DISK_GB = 3; // download size headroom

function detectGpu(): { type: "cuda" | "metal" | "none"; vramGB: number } {
  // Apple Silicon shares system RAM as unified memory — no dedicated VRAM figure
  if (process.platform === "darwin" && process.arch === "arm64") return { type: "metal", vramGB: 0 };
  try {
    const r = Bun.spawnSync(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"]);
    if (r.exitCode === 0) {
      const mb = parseInt(r.stdout.toString().trim().split("\n")[0] ?? "", 10); // first GPU
      if (!Number.isNaN(mb) && mb > 0) return { type: "cuda", vramGB: +(mb / 1024).toFixed(1) };
    }
  } catch {
    /* nvidia-smi not present */
  }
  return { type: "none", vramGB: 0 };
}

function systemCheck() {
  const cpus = os.cpus();
  const cores = cpus.length;
  const ramTotal = os.totalmem() / 2 ** 30;
  const ramFree = os.freemem() / 2 ** 30;
  const gpu = detectGpu();
  let diskFree = 0;
  try {
    const st = statfsSync(process.cwd());
    diskFree = (Number(st.bavail) * Number(st.bsize)) / 2 ** 30;
  } catch {
    /* statfs unsupported → leave 0 */
  }
  const tier: "gpu" | "fast-cpu" | "slow-cpu" = gpu.type !== "none" ? "gpu" : cores >= 8 && ramTotal >= 16 ? "fast-cpu" : "slow-cpu";
  const runnable = ramTotal >= MODEL_RAM_GB && diskFree >= MODEL_DISK_GB;
  const note = !runnable
    ? ramTotal < MODEL_RAM_GB
      ? `Not enough RAM. Needs about ${MODEL_RAM_GB} GB (you have ${ramTotal.toFixed(1)} GB).`
      : `Not enough free disk. Needs about ${MODEL_DISK_GB} GB for the model download.`
    : tier === "gpu"
      ? `${gpu.type.toUpperCase()} GPU detected. Profiles generate in seconds.`
      : tier === "fast-cpu"
        ? "Solid CPU. Expect a few minutes per profile."
        : "Runs on CPU but slowly. Minutes to possibly hours per profile.";
  return {
    cpu: { cores, model: cpus[0]?.model?.trim() ?? "unknown", arch: process.arch },
    ram: { totalGB: +ramTotal.toFixed(1), freeGB: +ramFree.toFixed(1) },
    gpu: { type: gpu.type, vramGB: gpu.vramGB },
    disk: { freeGB: +diskFree.toFixed(1) },
    verdict: { runnable, tier, note },
  };
}

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });

    if (url.pathname === "/api/analyze" && req.method === "POST") {
      const { rows, usePodcasts } = await rawFromUpload(req);
      if (rows.length === 0) return json({ error: "no audio rows found in upload" }, 400);

      // stream a live progress log as NDJSON (parse → genre resolution → AVD → phases)
      let streamClosed = false;
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          // Enqueue, then yield a macrotask so the runtime flushes this chunk to the
          // socket before the next (often CPU-bound, blocking) step runs. Without the
          // yield every send() in a synchronous run buffers and arrives in one burst.
          const tick = () => new Promise<void>((r) => setTimeout(r, 0));
          const send = async (o: unknown) => {
            if (streamClosed) return; // client disconnected → stop emitting (avoid enqueue-on-closed crash)
            try {
              controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
            } catch {
              streamClosed = true; // controller already closed
              return;
            }
            await tick();
          };
          const fmt = (n: number) => n.toLocaleString("en");
          try {
            await send({ type: "log", stage: "parse", msg: `Reading ${fmt(rows.length)} rows from your export…` });
            const { plays, skips, podcasts } = parsePlays(rows);
            if (plays.length === 0) {
              await send({ type: "error", error: "no valid plays (need ms_played ≥ 30s + artist)" });
              return controller.close();
            }
            await send({ type: "log", stage: "parse", msg: `${fmt(plays.length)} music plays · ${fmt(podcasts.length)} podcast episodes · ${fmt(skips.length)} fast-skips` });

            const artists = [...new Set(plays.map((p) => p.artist))];
            const tagged = artists.filter((a) => tagsFor(a)).length;
            await send({ type: "log", stage: "genres", msg: `Genres from baked tags — ${fmt(tagged)}/${fmt(artists.length)} artists tagged (the rest are untagged long-tail)` });

            if (avdReady) {
              const cov = resolveAvd(plays); // measured Spotify AVD (artist tier); rest falls to genre
              const pct = (n: number) => Math.round((n / (cov.total || 1)) * 100);
              await send({ type: "log", stage: "avd", msg: `Matched ${fmt(cov.artist)} plays to the Spotify AVD dataset — ${pct(cov.artist)}% by artist (rest via genre)` });
            }
            await send({ type: "log", stage: "avd", msg: "Building your Arousal·Valence·Depth sound-profile…" });
            const result = analyze(plays, genreAmap, table, { skips });
            const tuned = autoTuneK(plays, result.signals); // pick k for ~0.8 events/yr up front
            result.phases = tuned.phases;
            result.boundaries = tuned.boundaries;
            await send({ type: "log", stage: "phases", msg: `Detected ${result.phases.length} life-phases across ${result.boundaries.length} behavioural shifts (auto k=${tuned.k})` });

            sessionPlays = plays;
            sessionSignals = result.signals; // cache all-time signals (k-independent) for fast phase re-tuning
            sessionSkips = skips;
            sessionPodcasts = podcasts;
            sessionUsePodcasts = usePodcasts;
            sessionCards = null; // new data → invalidate the cached wrapped cards
            await send({ type: "log", stage: "done", msg: "Done — opening your Wrapped." });
            await send({ type: "done", result, podcasts: podcastProfile(podcasts), usePodcasts, k: tuned.k });
          } catch (e) {
            await send({ type: "error", error: String(e) });
          } finally {
            streamClosed = true;
            try { controller.close(); } catch { /* already closed */ }
          }
        },
        cancel() {
          streamClosed = true; // client aborted the request → stop work + emits
        },
      });
      return new Response(stream, { headers: { "content-type": "application/x-ndjson", "access-control-allow-origin": "*" } });
    }

    if (url.pathname === "/api/analyze" && req.method === "GET") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload first" }, 409);
      const from = Number(url.searchParams.get("from")) || Number.NEGATIVE_INFINITY;
      const to = Number(url.searchParams.get("to")) || Number.POSITIVE_INFINITY;
      const slice = sessionPlays.filter((p) => p.ts >= from && p.ts <= to);
      const skipSlice = sessionSkips.filter((s) => s.ts >= from && s.ts <= to);
      return json({ result: analyze(slice, genreAmap, table, { skips: skipSlice }) });
    }

    // re-run life-phase detection at a given sensitivity k (lower = more phases).
    // auto=1 → sweep k and pick the one yielding ~0.8 detected events per listening year.
    if (url.pathname === "/api/phases" && req.method === "GET") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload first" }, 409);
      // signals are k-independent → reuse the cached all-time set (recompute only if missing)
      const signals = sessionSignals.length ? sessionSignals : computeSignals(sessionPlays, genreAmap, table);
      if (url.searchParams.get("auto")) {
        const best = autoTuneK(sessionPlays, signals);
        return json({ k: best.k, phases: best.phases, boundaries: best.boundaries });
      }
      const k = Number(url.searchParams.get("k"));
      const { phases, boundaries } = detectLifePhases(sessionPlays, signals, genreAmap, table, Number.isFinite(k) ? { k } : {});
      return json({ phases, boundaries });
    }

    // rich monthly genre data for the LLM report (top genres/month + emergence)
    if (url.pathname === "/api/report-data" && req.method === "GET") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload first" }, 409);
      return json(buildReportData(sessionPlays, genreAmap, table, { skips: sessionSkips }));
    }

    // obsessions, rediscoveries, circadian + cycle mood, per-phase defining tracks.
    // honours the global timeframe (from/to) so the insight widgets track the slider.
    if (url.pathname === "/api/insights" && req.method === "GET") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload first" }, 409);
      const k = Number(url.searchParams.get("k"));
      const from = Number(url.searchParams.get("from")) || Number.NEGATIVE_INFINITY;
      const to = Number(url.searchParams.get("to")) || Number.POSITIVE_INFINITY;
      const ps = sessionPlays.filter((p) => p.ts >= from && p.ts <= to);
      const sk = sessionSkips.filter((s) => s.ts >= from && s.ts <= to);
      if (ps.length === 0) return json({ obsessions: [], rediscoveries: [], circadian: [], cycle: [], phaseExtras: [], outgrown: [] });
      const signals = computeSignals(ps, genreAmap, table);
      const { phases } = detectLifePhases(ps, signals, genreAmap, table, Number.isFinite(k) ? { k } : {});
      const defs = phaseDefiningTracks(ps, phases);
      const phaseExtras = phases.map((ph, i) => ({ definingTracks: defs[i] ?? [], narrative: phaseNarrative(ph, defs[i] ?? []) }));
      const outgrown = outgrownEntries(ps, sk, phases);
      return json({ ...computeInsights(ps, genreAmap, table), phaseExtras, outgrown });
    }

    // self-contained single-file HTML: the REAL dashboard bundle inlined + the analysis
    // data embedded, so it looks identical and the timeframe slider recomputes offline.
    if (url.pathname === "/api/export" && req.method === "GET") {
      if (sessionPlays.length === 0) return new Response("no session; upload first", { status: 409 });
      const full = analyze(sessionPlays, genreAmap, table, { skips: sessionSkips });
      const ins = computeInsights(sessionPlays, genreAmap, table);
      const signals = computeSignals(sessionPlays, genreAmap, table);
      const { phases } = detectLifePhases(sessionPlays, signals, genreAmap, table);
      const outgrown = outgrownEntries(sessionPlays, sessionSkips, phases);

      // intern artist/track strings → compact parallel columns for plays + skips
      const aIx = new Map<string, number>();
      const tIx = new Map<string, number>();
      const artists: string[] = [];
      const tracks: string[] = [];
      const ai = (s: string) => { let i = aIx.get(s); if (i === undefined) { i = artists.length; artists.push(s); aIx.set(s, i); } return i; };
      const ti = (s: string) => { let i = tIx.get(s); if (i === undefined) { i = tracks.length; tracks.push(s); tIx.set(s, i); } return i; };
      // av = packed per-play AVD (a,v,d → 3-decimal ints in one number; -1 = none → genre fallback)
      const packAvd = (p: Play): number => (p.avd ? Math.round(p.avd.a * 1000) * 1e6 + Math.round(p.avd.v * 1000) * 1e3 + Math.round(p.avd.d * 1000) : -1);
      // intern reason_start/reason_end into a tiny shared vocab so every reason-based
      // metric (restlessness, rewind obsessions) recomputes correctly offline. -1 = null.
      const rIx = new Map<string, number>();
      const reasons: string[] = [];
      const ri = (s: string | null | undefined): number => { if (s == null) return -1; let i = rIx.get(s); if (i === undefined) { i = reasons.length; reasons.push(s); rIx.set(s, i); } return i; };
      const P = { ts: [] as number[], a: [] as number[], t: [] as number[], m: [] as number[], av: [] as number[], rs: [] as number[], re: [] as number[] };
      for (const p of sessionPlays) { P.ts.push(p.ts); P.a.push(ai(p.artist)); P.t.push(ti(p.track)); P.m.push(p.msPlayed); P.av.push(packAvd(p)); P.rs.push(ri(p.reasonStart)); P.re.push(ri(p.reasonEnd)); }
      const S = { ts: [] as number[], a: [] as number[], t: [] as number[], m: [] as number[] };
      for (const s of sessionSkips) { S.ts.push(s.ts); S.a.push(ai(s.artist)); S.t.push(ti(s.track)); S.m.push(s.msPlayed); }
      const amap: Record<string, unknown> = {};
      for (const name of artists) { const g = genreAmap[name]; if (g) amap[name] = g; } // baked tags → offline parity

      const data = {
        k: 2,
        full,
        insights: { ...ins, phaseExtras: [], outgrown },
        podcasts: sessionPodcasts.length ? podcastProfile(sessionPodcasts) : null,
        usePodcasts: sessionUsePodcasts,
        cards: sessionCards,
        reportData: buildReportData(sessionPlays, genreAmap, table, { skips: sessionSkips, phases }),
        table,
        amap,
        artists,
        tracks,
        reasons,
        P,
        S,
      };
      const html = await buildExportHtml(data);
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `attachment; filename="spotilyze-profile.html"`,
          "access-control-allow-origin": "*",
        },
      });
    }

    // podcast / spoken-word profile (top shows, hours, yearly timeline) + opt-in state
    if (url.pathname === "/api/podcasts" && req.method === "GET") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload first" }, 409);
      return json({ profile: podcastProfile(sessionPodcasts), usePodcasts: sessionUsePodcasts });
    }

    // compare a second listener (ephemeral upload) against the current session
    if (url.pathname === "/api/compare" && req.method === "POST") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload your own history first" }, 409);
      const { rows } = await rawFromUpload(req);
      if (rows.length === 0) return json({ error: "no audio rows found in the friend's upload" }, 400);
      const { plays } = parsePlays(rows);
      if (plays.length === 0) return json({ error: "no valid plays in the friend's upload" }, 400);
      if (avdReady) resolveAvd(plays); // measured AVD for the friend's plays too (genres come from baked tags)
      // uncapped widgets (topN huge) so the full artist/genre distributions are compared —
      // the default top-15 widgets make overlap look far weaker than it is.
      const me = listenerProfile(computeWidgets(sessionPlays, genreAmap, table, { topN: 1e6 }));
      const them = listenerProfile(computeWidgets(plays, genreAmap, table, { topN: 1e6 }));
      return json({ compat: compareListeners(me, them) });
    }

    // live connectivity check for the setup screen — a real (minimal) API call so
    // the user can only continue once the LLM (if enabled) actually works.
    if (url.pathname === "/api/test-config" && req.method === "POST") {
      const body = (await req.json()) as { llmEnabled?: boolean; llm?: Partial<LLMSettings> };
      const merged = mergeForTest(body);
      const llm = body.llmEnabled ? await testLlm(merged.llm) : { ok: true, skipped: true as const };
      return json({ llm });
    }

    // ── hardware check for the built-in local model (wizard) ────────────────
    if (url.pathname === "/api/system-check") return json(systemCheck());

    // ── runtime config (managed by the in-UI setup wizard) ──────────────────
    if (url.pathname === "/api/config" && req.method === "GET") {
      return json(configPayload(getSettings()));
    }
    if (url.pathname === "/api/config" && req.method === "POST") {
      const body = (await req.json()) as { llm?: Partial<ReturnType<typeof getSettings>["llm"]>; onboarded?: boolean };
      const s = await saveSettings(body);
      return json(configPayload(s));
    }

    // structured "wow" cards for the wrapped recap (JSON-mode LLM call).
    // cached per upload so re-watching a Wrapped never regenerates (?refresh=1 forces).
    if (url.pathname === "/api/cards") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload first" }, 409);
      if (sessionCards && url.searchParams.get("refresh") !== "1") return json({ configured: true, cards: sessionCards, cached: true });
      const cfg = llmConfig(getSettings().llm);
      if (!cfg) return json({ configured: false, error: "LLM not configured" });
      const full = analyze(sessionPlays, genreAmap, table, { skips: sessionSkips });
      const rd = buildReportData(sessionPlays, genreAmap, table, { skips: sessionSkips, phases: full.phases });
      const pods = sessionUsePodcasts && sessionPodcasts.length ? podcastProfile(sessionPodcasts) : null;
      try {
        const raw = await llmChat(cfg, "You output ONLY a single valid JSON object. No prose, no markdown fences.", buildCardsPrompt(full, rd, pods), { json: true });
        const cards = parseCards(raw);
        if (!cards) return json({ configured: true, error: "could not parse the model's JSON — try again, or use a stronger model" }, 502);
        sessionCards = cards; // cache for replays + export
        return json({ configured: true, cards });
      } catch (e) {
        return json({ configured: true, error: String(e) }, 502);
      }
    }

    // is a background LLM configured? (frontend shows/hides the profile feature)
    if (url.pathname === "/api/llm-status") {
      const cfg = llmConfig(getSettings().llm);
      return json({ configured: !!cfg, provider: cfg?.provider ?? null, model: cfg?.model ?? null });
    }

    // background LLM personality profile (used by the wrapped recap + report personas)
    if (url.pathname === "/api/profile") {
      if (sessionPlays.length === 0) return json({ error: "no session; upload first" }, 409);
      const cfg = llmConfig(getSettings().llm);
      if (!cfg) return json({ configured: false, error: "LLM not configured — set LLM_MODEL / LLM_API_KEY (and LLM_PROVIDER) in .env" });
      const persona = (url.searchParams.get("persona") ?? "analyst") as Persona;
      const full = analyze(sessionPlays, genreAmap, table, { skips: sessionSkips });
      const rd = buildReportData(sessionPlays, genreAmap, table, { skips: sessionSkips, phases: full.phases });
      const pods = sessionUsePodcasts && sessionPodcasts.length ? podcastProfile(sessionPodcasts) : null;
      const prompt = buildLLMReport(full, rd, { persona, podcasts: pods }); // full prompt — Ollama gets a raised num_ctx
      try {
        const profile = await llmChat(
          cfg,
          "You are a sharp, honest analyst. Output only the finished piece itself, as Markdown prose — no preamble, no outline or planning notes, no disclaimers.",
          prompt,
          { maxTokens: 8000 },
        );
        if (!profile.trim())
          return json(
            { configured: true, error: "the model returned nothing — its context window may be too small for the prompt; try a larger-context or hosted model" },
            502,
          );
        return json({ configured: true, persona, model: cfg.model, profile });
      } catch (e) {
        return json({ configured: true, error: String(e) }, 502);
      }
    }

    if (url.pathname === "/api/health") return json({ ok: true, session: sessionPlays.length, genres: Object.keys(table).length });

    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    let file = Bun.file(WEB + path);
    if (!(await file.exists())) file = Bun.file(`${WEB}/index.html`); // SPA fallback
    return (await file.exists()) ? new Response(file) : new Response("build the frontend: bun run build:web", { status: 404 });
  },
});

console.log(`spotilyze server → http://localhost:${PORT}  (${Object.keys(table).length} genres, AVD dataset ${avdReady ? "loaded" : "absent → genre-only"}, baked genre tags ${tagsLoaded ? "loaded (sole genre source, no key needed)" : "ABSENT — genres unavailable"})`);
