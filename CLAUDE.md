# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Spotilyze turns a Spotify *Extended Streaming History* export into a sound-profile, a timeline of taste shifts (life-phases), and an optional LLM write-up. It runs **entirely locally** — privacy is a hard design constraint, not a feature. Everything it shows is **inference, not measurement**; keep that framing in any user-facing copy.

## Commands

Bun is the runtime, package manager, and bundler. There is no separate build step for `core`/`server` (TS is run directly).

```bash
bun install          # install workspace deps
bun run server       # API only, :3001 (apps/server/src/serve.ts)
bun run web          # Vite dev server :5173, proxies /api → :3001
bun run app          # build web bundle + serve production-style on :3001
bun run build:web    # build the Vue bundle only
bun test             # Bun's test runner (no test files exist yet — README's "core unit tests" is aspirational)
```

Docker: `docker compose up -d --build` → http://localhost:3001. `config/` and `cache/` are bind-mounted for persistence.

The `apps/server` package also has `bun run --cwd apps/server dev` (watch mode).

## Architecture

Three workspaces (`packages/*`, `apps/*`), wired through **one shipped SQLite DB**.

- **`packages/core`** — pure TypeScript analysis library. No I/O, no server deps. Everything is re-exported through `src/index.ts` (a barrel). The whole analysis is deterministic functions over `Play[]`. Keep this package pure: it's imported by the server *and* bundled into the Vue frontend (the exported single-file HTML re-runs analysis offline in the browser).
- **`apps/server`** — Bun HTTP server (`Bun.serve` in `src/serve.ts`). `src/index.ts` is a deliberate no-op barrel — importing it must **not** start the server; only `serve.ts` does. The server owns all data access (the SQLite readers) and the LLM client; it calls into `core` for analysis.
- **`apps/web`** — Vue 3 + Pinia + ECharts dashboard. `stores/analysis.ts` is the central store; `api.ts` is the only place that talks to the server.

### The data pipeline (core)

```
RawPlay[] (Spotify export rows)
  → parsePlays            engagement filter (ms_played ≥ 30s + artist), drops IP/episode fields
  → genres                artist → baked genre tags (ArtistGenreMap)
  → avd                   per-play Arousal·Valence·Depth (measured wins, genre-derived fallback)
  → computeSignals        weekly signal matrix (AVD, volume, replay, entropy, novelty, …)
  → detectLifePhases      sliding-window change-point detection → boundaries + characterized phases
  → computeWidgets/insights → dashboard data
analyze() in core/src/analyze.ts ties parse→signals→phases→widgets together.
```

### AVD (the core abstraction)

**AVD = Arousal · Valence · Depth** (three musical-attribute dimensions, Greenberg et al. 2016). `D` is always **Depth** (party/danceable ↔ sophisticated/complex), *never* Dominance — even though the MuSe source dataset carries Dominance. Valence here is sonic brightness/groove, not emotion.

Two AVD sources, used for different purposes:
- **Measured** (`artist_avd` table, `avddb.ts`) — per-artist from Spotify audio analysis. Used for the *displayed* sound-profile. Wins when present (`Play.avd`).
- **Genre-derived** (`genre_avd` table, `genredb.ts` → `GenreAVDTable`) — A/V from MuSe, Depth hand-mapped, sub-genres inherit from parents. Used for **life-phase detection** because it's smoother week-to-week. The detector and phase centroids both use genre-derived AVD so they stay coherent.

### The single DB

`data/spotilyze.sqlite3` is the **only** runtime data source. Three tables: `artist` genre tags (`tagsdb.ts`), measured `artist_avd` (`avddb.ts`), `genre_avd` (`genredb.ts`). Loaded read-only once at startup. There is **no live external API** — baked genre tags (derived offline from Last.fm) are the sole genre source; untagged long-tail artists stay untagged (~87% play-weighted coverage). Do not add runtime network calls for genre/AVD resolution.

### Server session model

Single-user, local-first: the server holds the last upload in **module-level mutable state** (`sessionPlays`, `sessionSkips`, `sessionPodcasts`, `sessionCards`). There is no DB write, no multi-user, no auth. `POST /api/analyze` streams NDJSON progress and sets the session; subsequent `GET` endpoints (`/api/analyze?from&to`, `/api/phases`, `/api/insights`, `/api/export`, …) re-slice/recompute from that session. The export endpoint inlines the real dashboard bundle + interned play columns into one offline HTML file.

Phase sensitivity `k` is auto-tuned (`autoTuneK` in `serve.ts`) to ~0.8 detected events per listening year; the UI can also re-request at a chosen `k`.

### LLM (optional)

`apps/server/src/llm.ts` — provider-agnostic, configured by env or the in-app onboarding wizard (`LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` / `LLM_BASE_URL`). Supports any OpenAI-compatible endpoint, Ollama, or Anthropic's native messages API. Disabled cleanly if no model/key — every non-LLM feature must keep working without it. Inside Docker, `localhost` base URLs are rewritten to `host.docker.internal`.

## `scripts/` is offline tooling, not runtime

The `scripts/` dir builds the shipped DB and data files (resolve artists→genres via Last.fm, build the genre→AVD table, synthesize the example dataset, audits/ablations). These are run by hand during data curation and are **not** part of the running app. `scripts/_io.ts` has shared dataset-loading helpers. Some still reference JSON intermediates (`data/genre-avd.json`, `cache/artist-genres.json`) that feed the final SQLite build.

## Conventions

- Code comments in this repo are dense and explain *why* (the non-obvious tradeoff), not *what*. Match that style.
- `core` stays dependency-light and pure so it can run in both Bun and the browser bundle.
