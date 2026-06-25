import type { LLMSettings } from "./llm";

export interface Settings {
  llm: LLMSettings;
  onboarded: boolean; // has the user completed the first-run setup wizard?
}

const FILE = `${process.cwd()}/config/settings.json`;

const fromEnv = (): Settings => ({
  llm: {
    provider: (Bun.env.LLM_PROVIDER ?? "openai").toLowerCase(),
    model: (Bun.env.LLM_MODEL ?? "").trim(),
    apiKey: (Bun.env.LLM_API_KEY ?? "").trim(),
    baseUrl: (Bun.env.LLM_BASE_URL ?? "").trim(),
  },
  onboarded: false,
});

// in-memory effective config (env defaults, overlaid by the saved settings file)
let settings: Settings = fromEnv();

export function getSettings(): Settings {
  return settings;
}

/** Load config/settings.json over the env defaults (call once at startup). */
export async function loadSettings(): Promise<void> {
  const f = Bun.file(FILE);
  if (!(await f.exists())) return;
  try {
    const saved = (await f.json()) as Partial<Settings>;
    settings = {
      llm: { ...settings.llm, ...(saved.llm ?? {}) },
      onboarded: saved.onboarded ?? settings.onboarded,
    };
  } catch {
    /* corrupt file → keep env defaults */
  }
}

/** Merge a patch, persist to disk, return the updated settings. */
export async function saveSettings(patch: { llm?: Partial<LLMSettings>; onboarded?: boolean }): Promise<Settings> {
  if (patch.onboarded !== undefined) settings.onboarded = patch.onboarded;
  if (patch.llm) {
    settings.llm = {
      provider: (patch.llm.provider ?? settings.llm.provider).toLowerCase(),
      model: (patch.llm.model ?? settings.llm.model).trim(),
      apiKey: (patch.llm.apiKey ?? settings.llm.apiKey).trim(),
      baseUrl: (patch.llm.baseUrl ?? settings.llm.baseUrl).trim(),
    };
  }
  await Bun.write(FILE, JSON.stringify(settings, null, 2));
  return settings;
}
