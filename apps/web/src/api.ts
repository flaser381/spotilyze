import type { AnalysisResult, Compatibility, DefiningTrack, Insights, Outgrown, PodcastProfile, ProfileCards, ReportData } from "@spotilyze/core";

export interface AnalyzeResp {
  result?: AnalysisResult;
  podcasts?: PodcastProfile;
  usePodcasts?: boolean;
  stats?: { rawRows: number; validPlays: number };
  error?: string;
}

export type AnalyzeEvent =
  | { type: "log"; stage: string; msg: string }
  | { type: "progress"; stage: string; done: number; total: number; pct: number; msg: string }
  | { type: "done"; result: AnalysisResult; podcasts?: PodcastProfile; usePodcasts?: boolean; k?: number }
  | { type: "error"; error: string };

/** POST the upload and stream NDJSON progress events; calls `onEvent` per line. */
export async function analyzeUploadStream(body: FormData, onEvent: (e: AnalyzeEvent) => void): Promise<void> {
  const res = await fetch("/api/analyze", { method: "POST", body });
  if (!res.body) {
    // non-streaming fallback (error responses are plain JSON)
    const j = (await res.json()) as { error?: string };
    onEvent({ type: "error", error: j.error ?? "upload failed" });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const flush = (line: string) => {
    const s = line.trim();
    if (s) onEvent(JSON.parse(s) as AnalyzeEvent);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      flush(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  flush(buf);
}

export async function analyzeRange(from: number, to: number): Promise<AnalyzeResp> {
  const res = await fetch(`/api/analyze?from=${from}&to=${to}`);
  return (await res.json()) as AnalyzeResp;
}

export interface PhasesResp {
  phases?: AnalysisResult["phases"];
  boundaries?: AnalysisResult["boundaries"];
  k?: number; // the chosen sensitivity when auto-tuning
  error?: string;
}
/** auto=true → server picks k for ~0.8 events/year and returns it alongside phases. */
export async function analyzePhases(k: number, auto = false): Promise<PhasesResp> {
  const res = await fetch(`/api/phases?${auto ? "auto=1" : `k=${k}`}`);
  return (await res.json()) as PhasesResp;
}

export interface ConfigStatus {
  configured: boolean;
  onboarded: boolean;
  genresBaked: boolean; // baked genre tags present (sole genre source, no key needed)
  localLlm: { available: boolean }; // built-in local inference provider wired yet?
  llm: { provider: string; model: string; baseUrl: string; keySet: boolean; ready: boolean };
}
export async function getConfig(): Promise<ConfigStatus> {
  return (await (await fetch("/api/config")).json()) as ConfigStatus;
}

export interface SystemCheck {
  cpu: { cores: number; model: string; arch: string };
  ram: { totalGB: number; freeGB: number };
  gpu: { type: "cuda" | "metal" | "none"; vramGB: number };
  disk: { freeGB: number };
  verdict: { runnable: boolean; tier: "gpu" | "fast-cpu" | "slow-cpu"; note: string };
}
export async function systemCheck(): Promise<SystemCheck> {
  return (await (await fetch("/api/system-check")).json()) as SystemCheck;
}

export async function saveConfig(body: {
  llm?: { provider?: string; model?: string; apiKey?: string; baseUrl?: string };
  onboarded?: boolean;
}): Promise<ConfigStatus> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ConfigStatus;
}

export interface TestConfigResult {
  llm: { ok: boolean; error?: string; skipped?: boolean };
}
/** Live connectivity check (real minimal API call) for the setup screen. */
export async function testConfig(body: {
  llmEnabled?: boolean;
  llm?: { provider?: string; model?: string; apiKey?: string; baseUrl?: string };
}): Promise<TestConfigResult> {
  const res = await fetch("/api/test-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TestConfigResult;
}

export async function fetchReportData(): Promise<ReportData | null> {
  const res = await fetch("/api/report-data");
  const j = (await res.json()) as ReportData | { error: string };
  return "monthlyGenres" in j ? j : null;
}

export type InsightsResp = Insights & {
  phaseExtras: { definingTracks: DefiningTrack[]; narrative: string }[];
  outgrown: Outgrown[];
};
export async function fetchInsights(k: number, from?: number, to?: number): Promise<InsightsResp | null> {
  const q = new URLSearchParams({ k: String(k) });
  if (from != null) q.set("from", String(from));
  if (to != null) q.set("to", String(to));
  const res = await fetch(`/api/insights?${q.toString()}`);
  const j = (await res.json()) as InsightsResp | { error: string };
  return "obsessions" in j ? j : null;
}

export interface ProfileResp {
  configured: boolean;
  profile?: string;
  model?: string;
  persona?: string;
  error?: string;
}
export async function fetchProfile(persona = "analyst"): Promise<ProfileResp> {
  const res = await fetch(`/api/profile?persona=${persona}`);
  return (await res.json()) as ProfileResp;
}

export interface CardsResp {
  configured: boolean;
  cards?: ProfileCards;
  error?: string;
}
export async function fetchCards(refresh = false): Promise<CardsResp> {
  const res = await fetch(`/api/cards${refresh ? "?refresh=1" : ""}`);
  return (await res.json()) as CardsResp;
}

export interface PodcastsResp {
  profile?: PodcastProfile;
  usePodcasts?: boolean;
  error?: string;
}
export async function fetchPodcasts(): Promise<PodcastsResp> {
  const res = await fetch("/api/podcasts");
  return (await res.json()) as PodcastsResp;
}

export interface CompareResp {
  compat?: Compatibility;
  error?: string;
}
export async function compareUpload(body: FormData): Promise<CompareResp> {
  const res = await fetch("/api/compare", { method: "POST", body });
  return (await res.json()) as CompareResp;
}
